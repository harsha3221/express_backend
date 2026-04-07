const db = require("../config/database");
const { GoogleGenAI } = require("@google/genai");

exports.getAIAnalytics = async (req, res, next) => {
    try {
        const { quizId } = req.params;

        // 1. SANITIZE API KEY
        const rawKey = process.env.GEMINI_API_KEY || "";
        const sanitizedKey = rawKey.trim().replace(/[\n\r]/g, "");

        if (!sanitizedKey) {
            throw new Error("GEMINI_API_KEY is missing in environment variables.");
        }

        const ai = new GoogleGenAI({
            apiKey: sanitizedKey,
        });

        console.log(`[AI-ANALYTICS] Processing request for Quiz ID: ${quizId}`);

        // 2. Fetch Quiz Data
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

        console.log(`[AI-ANALYTICS] DB Query returned ${stats.length} rows.`);

        // 3. VALIDATION
        if (stats.length === 0 || !stats[0].quiz_title) {
            return res.status(404).json({
                message: "Quiz not found or has no questions.",
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

        // 4. Process stats
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
                        successRate:
                            totalAttempts > 0
                                ? ((correct / totalAttempts) * 100).toFixed(2) + "%"
                                : "0%"
                    }
                };
            });

        // 5. Prompt
        const prompt = `
Analyze quiz results for "${subjectName}" - "${quizTitle}".

DATA:
${JSON.stringify(processedStats)}

Return ONLY valid JSON in this format:
{
  "summary": "...",
  "topicsToImprove": ["..."],
  "knowledgeVoids": ["..."],
  "hardQuestions": [{"question": "...", "reason": "..."}],
  "suggestions": "..."
}
`;

        // 6. AI CALL (NEW SDK)
        const aiResponse = await ai.models.generateContent({
            model: "gemini-1.5-pro",
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }]
                }
            ],
        });

        let responseText = aiResponse.text;

        // Clean markdown if present
        responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

        try {
            res.json(JSON.parse(responseText));
        } catch (parseErr) {
            console.error("❌ AI JSON Parse Failed:", responseText);
            throw new Error("AI returned invalid JSON format.");
        }

    } catch (err) {
        console.error("❌ AI ERROR:", err);

        let userMessage = "AI Analysis failed.";

        if (err.message.includes("API key")) {
            userMessage = "Invalid or missing API key.";
        } else if (err.message.includes("model")) {
            userMessage = "Invalid model or API version issue.";
        }

        res.status(500).json({
            message: userMessage,
            error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
    }
};