const db = require("../config/database");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// We will initialize the model inside or sanitize the key to be safe
exports.getAIAnalytics = async (req, res, next) => {
    try {
        const { quizId } = req.params;

        // 1. SANITIZE API KEY
        // This removes hidden spaces or newlines that often happen when pasting in Render
        const rawKey = process.env.GEMINI_API_KEY || "";
        const sanitizedKey = rawKey.trim().replace(/[\n\r]/g, "");

        if (!sanitizedKey) {
            throw new Error("GEMINI_API_KEY is missing in environment variables.");
        }

        const genAI = new GoogleGenerativeAI(sanitizedKey);

        // DEBUG LOG: See what ID is being requested in Render
        console.log(`[AI-ANALYTICS] Processing request for Quiz ID: ${quizId}`);

        // 2. Fetch Quiz Context & Question Statistics
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

        // 3. ENHANCED VALIDATION
        console.log(`[AI-ANALYTICS] DB Query returned ${stats.length} rows.`);

        if (stats.length === 0 || !stats[0].quiz_title) {
            return res.status(404).json({
                message: "Quiz not found or has no questions. Check production DB.",
                debug_quiz_id: quizId
            });
        }

        const totalAttempts = stats[0].total_students_count || 0;

        if (totalAttempts === 0) {
            return res.status(200).json({
                summary: "No student attempts recorded yet.",
                topicsToImprove: [],
                knowledgeVoids: [],
                hardQuestions: [],
                suggestions: "Wait for students to complete the quiz."
            });
        }

        // 4. Format data for AI
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
                        wrong: answered - correct,
                        correct,
                        successRate: totalAttempts > 0 ? ((correct / totalAttempts) * 100).toFixed(2) + '%' : '0%'
                    }
                };
            });

        // 5. Call Gemini - Using 'gemini-1.5-flash-latest' to ensure we bypass versioning issues
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash-latest"
        });

        const prompt = `
            Analyze quiz results for "${subjectName}" - "${quizTitle}".
            DATA: ${JSON.stringify(processedStats)}
            RESPONSE FORMAT (Strict JSON):
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
                temperature: 0.4,
            },
        });

        const response = await result.response;
        let responseText = response.text();

        // Clean up markdown if AI includes it
        responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

        try {
            res.json(JSON.parse(responseText));
        } catch (parseErr) {
            console.error("AI Output parsing failed:", responseText);
            throw new Error("AI output was not valid JSON.");
        }

    } catch (err) {
        console.error("❌ AI ERROR:", err);

        // Final fallback error logic
        let userMessage = "AI Analysis failed. Please check server logs.";
        if (err.message.includes("404") || err.message.includes("version")) {
            userMessage = "AI model configuration error. Please ensure the API key is valid and SDK is updated.";
        } else if (err.message.includes("API_KEY_INVALID")) {
            userMessage = "Invalid API Key. Check Render environment variables.";
        }

        res.status(err.status || 500).json({
            message: userMessage,
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};