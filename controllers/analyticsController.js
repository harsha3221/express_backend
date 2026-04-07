const db = require("../config/database");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize once outside the handler
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.getAIAnalytics = async (req, res, next) => {
    try {
        const { quizId } = req.params;

        // DEBUG LOG: See what ID is being requested in Render
        console.log(`[AI-ANALYTICS] Processing request for Quiz ID: ${quizId}`);

        // 1. Fetch Quiz Context & Question Statistics
        const [stats] = await db.execute(`
            SELECT 
                COALESCE(s.name, 'General Subject') AS subject_name,
                qz.title AS quiz_title,
                q.id AS question_id,
                q.question_text,
                q.marks,
                (SELECT COUNT(*) FROM student_quiz_attempts WHERE quiz_id = qz.id) AS total_students_count,
                COUNT(DISTINCT sqa.student_id) AS times_answered,
                SUM(CASE WHEN o.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count
            FROM quizzes qz
            LEFT JOIN subjects s ON qz.subject_id = s.id
            LEFT JOIN questions q ON qz.id = q.quiz_id
            LEFT JOIN student_quiz_answers sqa ON q.id = sqa.question_id
            LEFT JOIN options o ON sqa.option_id = o.id AND o.is_correct = 1
            WHERE qz.id = ?
            GROUP BY q.id, qz.id, s.id
        `, [quizId]);

        // 2. ENHANCED VALIDATION & DEBUGGING
        console.log(`[AI-ANALYTICS] DB Query returned ${stats.length} rows.`);

        if (stats.length === 0 || !stats[0].quiz_title) {
            console.error(`[AI-ANALYTICS] 404 Error: Quiz ${quizId} not found.`);
            return res.status(404).json({
                message: "Quiz not found. Please ensure this quiz exists in the production database.",
                debug_quiz_id: quizId
            });
        }

        const totalAttempts = stats[0].total_students_count || 0;

        if (totalAttempts === 0) {
            return res.status(200).json({
                summary: "No student attempts recorded yet. AI analysis requires at least one submission.",
                topicsToImprove: [],
                knowledgeVoids: [],
                hardQuestions: [],
                suggestions: "Wait for students to complete the quiz before running AI analysis."
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

        // 4. Call Gemini - Updated Model naming for latest SDK
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
            Return ONLY a valid JSON object. No preamble, no markdown code blocks.
            {
                "summary": "...",
                "topicsToImprove": ["..."],
                "knowledgeVoids": ["..."],
                "hardQuestions": [{"question": "...", "reason": "..."}],
                "suggestions": "..."
            }
        `;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.5,
            },
        });

        const response = await result.response;
        let responseText = response.text();

        // Clean up any potential markdown formatting
        responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

        try {
            const parsedData = JSON.parse(responseText);
            res.json(parsedData);
        } catch (parseErr) {
            console.error("JSON Parse Error on AI output:", responseText);
            throw new Error("AI returned invalid JSON format.");
        }

    } catch (err) {
        console.error("❌ AI ERROR:", err);
        // Better error messages for the UI
        const errorMessage = err.status === 404
            ? "The AI model version is currently unavailable. Ensure the SDK is updated."
            : "AI Analysis failed. Check server logs.";

        res.status(err.status || 500).json({
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};