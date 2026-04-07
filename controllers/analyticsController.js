const db = require("../config/database");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize once outside the handler
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.getAIAnalytics = async (req, res, next) => {
    try {
        const { quizId } = req.params;

        // 1. Fetch Quiz Context & Question Statistics
        const [stats] = await db.execute(`
            SELECT 
                s.name AS subject_name,
                qz.title AS quiz_title,
                q.id AS question_id,
                q.question_text,
                q.marks,
                (SELECT COUNT(*) FROM student_quiz_attempts WHERE quiz_id = qz.id) AS total_students_count,
                COUNT(DISTINCT sqa.student_id) AS times_answered,
                SUM(CASE WHEN o.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count
            FROM quizzes qz
            JOIN subjects s ON qz.subject_id = s.id
            LEFT JOIN questions q ON qz.id = q.quiz_id
            LEFT JOIN student_quiz_answers sqa ON q.id = sqa.question_id
            LEFT JOIN options o ON sqa.option_id = o.id AND o.is_correct = 1
            WHERE qz.id = ?
            GROUP BY q.id, qz.id, s.id
        `, [quizId]);

        // 2. Validation
        if (stats.length === 0 || !stats[0].quiz_title) {
            return res.status(404).json({ message: "Quiz not found or no data available." });
        }

        const totalAttempts = stats[0].total_students_count || 0;
        if (totalAttempts === 0) {
            return res.status(200).json({
                summary: "No students have attempted this quiz yet. Analysis will appear once students submit.",
                topicsToImprove: [],
                knowledgeVoids: [],
                hardQuestions: [],
                suggestions: "Wait for student submissions to generate AI insights."
            });
        }

        // 3. Format data for AI
        const subjectName = stats[0].subject_name;
        const quizTitle = stats[0].quiz_title;

        const processedStats = stats
            .filter(row => row.question_id !== null)
            .map(row => {
                const answered = row.times_answered || 0;
                const correct = row.correct_count || 0;
                return {
                    question: row.question_text,
                    stats: {
                        totalStudents: totalAttempts,
                        answered,
                        skipped: totalAttempts - answered,
                        wrong: answered - correct,
                        correct,
                        successRate: totalAttempts > 0 ? ((correct / totalAttempts) * 100).toFixed(2) + '%' : '0%'
                    }
                };
            });

        // 4. Call Gemini with explicit structure
        // 'gemini-1.5-flash' is the stable recommended model name
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash"
        });

        const prompt = `
            You are an Academic Data Analyst. Analyze these quiz results for "${subjectName}" - "${quizTitle}".
            
            DATA:
            ${JSON.stringify(processedStats)}

            TASK:
            1. Infer sub-topics for each question.
            2. Identify "Concept Gaps" (high wrong counts).
            3. Identify "Knowledge Voids" (high skip counts).
            4. Identify "Critical Questions" (success < 40%).
            5. Provide a "Reteaching Strategy".

            RESPONSE FORMAT:
            Return ONLY a valid JSON object:
            {
                "summary": "...",
                "topicsToImprove": ["..."],
                "knowledgeVoids": ["..."],
                "hardQuestions": [{"question": "...", "reason": "..."}],
                "suggestions": "..."
            }
        `;

        // Use the explicit generationConfig here
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.7,
                maxOutputTokens: 1000,
            },
        });

        const responseText = result.response.text();

        // Final safety check: if responseText is empty or not JSON
        if (!responseText) {
            throw new Error("Empty response from AI model");
        }

        res.json(JSON.parse(responseText));

    } catch (err) {
        // Log the full error to Render's console so you can see it in logs
        console.error("❌ AI ERROR:", err);

        // Standardize the error response
        const statusCode = err.status || 500;
        let errorMessage = "AI Analysis failed. Please try again later.";

        if (err.message?.includes("API key")) {
            errorMessage = "Invalid API Configuration. Check environment variables.";
        } else if (err.message?.includes("quota")) {
            errorMessage = "AI rate limit exceeded. Please wait a moment.";
        }

        res.status(statusCode).json({
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};