// model/question.js
const db = require("../config/database");

class Question {
    // Create one question + its options
    static async createWithOptions(quizId, questionText, marks, options, imageUrl = null) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Insert question
            const [qResult] = await conn.query(
                `INSERT INTO questions (quiz_id, question_text, image_url, marks)
         VALUES (?, ?, ?, ?)`,
                [quizId, questionText, imageUrl, marks]
            );
            const questionId = qResult.insertId;

            // Insert options (multiple correct allowed)
            if (options && options.length > 0) {
                const values = options.map((opt) => [
                    questionId,
                    opt.option_text || "",
                    opt.image_url || null,     // 👈 from payload (optional)
                    opt.is_correct ? 1 : 0,
                ]);

                await conn.query(
                    `INSERT INTO options (question_id, option_text, image_url, is_correct)
           VALUES ?`,
                    [values]
                );
            }

            await conn.commit();
            return { questionId };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async getByQuizId(quizId) {
        const [rows] = await db.query(
            `SELECT 
         q.id        AS question_id,
         q.question_text,
         q.image_url AS question_image,
         q.marks,
         o.id        AS option_id,
         o.option_text,
         o.image_url AS option_image,
         o.is_correct
       FROM questions q
       LEFT JOIN options o ON q.id = o.question_id
       WHERE q.quiz_id = ?
       ORDER BY q.id ASC, o.id ASC`,
            [quizId]
        );
        return rows;
    }

    static async deleteById(questionId) {
        return db.query(`DELETE FROM questions WHERE id = ?`, [questionId]);
    }
    static async getImagesById(questionId) {
        const [rows] = await db.query(
            `SELECT 
        q.image_url AS question_image,
        o.image_url AS option_image
     FROM questions q
     LEFT JOIN options o ON q.id = o.question_id
     WHERE q.id = ?`,
            [questionId]
        );
        return rows;
    }

    static async updateQuestion(quizId, questionId, questionText, marks, options, imageUrl) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // 1️⃣ Update question
            await conn.execute(
                `UPDATE questions
           SET question_text = ?, 
               marks = ?, 
               image_url = COALESCE(?, image_url)
           WHERE id = ? AND quiz_id = ?`,
                [questionText, marks, imageUrl, questionId, quizId]
            );

            // 2️⃣ Delete old options
            await conn.execute(
                `DELETE FROM options WHERE question_id = ?`,
                [questionId]
            );

            // 3️⃣ Insert new options (Bulk Insert)
            if (options && options.length > 0) {
                const values = options.map(opt => [
                    questionId,
                    opt.option_text,
                    opt.is_correct ? 1 : 0
                ]);

                await conn.query(
                    `INSERT INTO options (question_id, option_text, is_correct)
             VALUES ?`,
                    [values]
                );
            }

            await conn.commit();
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    }

}

module.exports = Question;
