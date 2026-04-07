const db = require("../config/database");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Update the constructor to explicitly use the stable v1 API version
// This prevents the 404 error where the SDK tries to find models on v1beta
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

        console.log(`[AI Analytics] Query results for Quiz ${quizId}:`, stats.length, "rows");

        // 2. Validation
        if (stats.length === 0 || !stats[0].quiz_title) {
            return res.status(404).json({ message: "Quiz not found or no questions available for analysis." });
        }

        const totalAttempts = stats[0].total_students_count;
        if (totalAttempts === 0) {
            return res.status(200).json({
                summary: "No students have attempted this quiz yet. AI analysis will be available once submissions start coming in.",
                topicsToImprove: [],
                knowledgeVoids: [],
                hardQuestions: [],
                suggestions: "Wait for students to complete the quiz to see insights."
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
                const skipped = totalAttempts - answered;
                const wrong = answered - correct;
                const successRate = totalAttempts > 0 ? ((correct / totalAttempts) * 100).toFixed(2) : 0;

                return {
                    question: row.question_text,
                    stats: {
                        totalStudents: totalAttempts,
                        answered,
                        skipped,
                        wrong,
                        correct,
                        successRate: `${successRate}%`
                    }
                };
            });

        // 4. Prepare the AI Prompt
        const prompt = `
            You are an Academic Data Analyst. Analyze the following quiz results for the subject "${subjectName}" and quiz "${quizTitle}".
            
            RAW DATA:
            ${JSON.stringify(processedStats)}

            TASK:
            1. Infer the specific sub-topics for each question based on text.
            2. Identify "Concept Gaps": Topics with high "wrong" counts.
            3. Identify "Knowledge Voids": Topics with high "skipped" counts.
            4. Identify "Critical Questions": Success rate below 40%.
            5. Provide a "Reteaching Strategy" for the next lecture.

            RESPONSE FORMAT:
            You MUST return a valid JSON object ONLY.
            {
                "summary": "Overview of performance",
                "topicsToImprove": ["Topic A", "Topic B"],
                "knowledgeVoids": ["Unattempted Topic"],
                "hardQuestions": [{"question": "...", "reason": "..."}],
                "suggestions": "Advice"
            }
        `;

        // 5. Call Gemini with explicit model name and versioning fix
        // Using "gemini-1.5-flash-latest" or "gemini-1.5-flash" specifically
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        res.json(JSON.parse(responseText));

    } catch (err) {
        // Detailed logging for Render console
        console.error("❌ AI Analytics Error Detail:", err);

        // If it's a specific Google error, send that back
        const errorMessage = err.response?.data?.error?.message || err.message;

        res.status(500).json({
            message: "AI Analysis failed",
            error: errorMessage
        });
    }
};