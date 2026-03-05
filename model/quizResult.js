const db = require("../util/database");

class QuizResult {
    static async getSubmittedStudents(quizId) {
        const [rows] = await db.execute(
            `SELECT student_id
       FROM student_quiz_attempts
       WHERE quiz_id = ? AND submitted = 1`,
            [quizId]
        );
        return rows;
    }

    static async exists(studentId, quizId) {
        const [[row]] = await db.execute(
            `SELECT id FROM quiz_results
       WHERE student_id = ? AND quiz_id = ?`,
            [studentId, quizId]
        );
        return !!row;
    }

    static async getEvaluationData(studentId, quizId) {
        const [rows] = await db.execute(
            `SELECT q.id AS question_id,
              q.marks,
              o.id AS option_id,
              o.is_correct,
              a.option_id AS answered_option
       FROM questions q
       JOIN options o ON o.question_id = q.id
       LEFT JOIN student_quiz_answers a
              ON a.question_id = q.id
             AND a.student_id = ?
       WHERE q.quiz_id = ?`,
            [studentId, quizId]
        );
        return rows;
    }

    static async insert(studentId, quizId, total, obtained) {
        return db.execute(
            `INSERT INTO quiz_results
       (student_id, quiz_id, total_marks, obtained_marks)
       VALUES (?, ?, ?, ?)`,
            [studentId, quizId, total, obtained]
        );
    }

    static async getResultsForQuiz(quizId) {
        const [rows] = await db.execute(
            `SELECT u.name AS student_name,
              r.total_marks,
              r.obtained_marks,
              r.evaluated_at
       FROM quiz_results r
       JOIN students s ON r.student_id = s.id
       JOIN users u ON s.user_id = u.id
       WHERE r.quiz_id = ?
       ORDER BY u.name`,
            [quizId]
        );
        return rows;
    }
    static async upsertResultWithTransaction(conn, studentId, quizId, total, obtained) {

        const [existing] = await conn.execute(
            `SELECT id FROM quiz_results 
     WHERE student_id = ? AND quiz_id = ?`,
            [studentId, quizId]
        );

        if (existing.length > 0) {
            await conn.execute(
                `UPDATE quiz_results 
       SET total_marks=?, obtained_marks=?, evaluated_at=NOW()
       WHERE id=?`,
                [total, obtained, existing[0].id]
            );
        } else {
            await conn.execute(
                `INSERT INTO quiz_results 
       (student_id, quiz_id, total_marks, obtained_marks) 
       VALUES (?, ?, ?, ?)`,
                [studentId, quizId, total, obtained]
            );
        }
    }
    static async getStudentResult(studentId, quizId) {
        const [rows] = await db.execute(
            `SELECT obtained_marks, total_marks, evaluated_at
     FROM quiz_results
     WHERE student_id = ? AND quiz_id = ?`,
            [studentId, quizId]
        );

        return rows[0];
    }
}

module.exports = QuizResult;
