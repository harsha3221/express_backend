const db = require("../util/database");

class StudentQuizAttempt {

    /**
     * Create attempt row if not exists
     */
    static async createIfNotExists(studentId, quizId) {
        const [result] = await db.execute(
            `
      INSERT INTO student_quiz_attempts
        (student_id, quiz_id, started_at, submitted)
      VALUES (?, ?, NOW(), 0)
      ON DUPLICATE KEY UPDATE
        student_id = student_id
      `,
            [studentId, quizId]
        );

        // fetch the attempt row
        const [[attempt]] = await db.execute(
            `
      SELECT student_id, quiz_id, started_at, submitted
      FROM student_quiz_attempts
      WHERE student_id = ? AND quiz_id = ?
      `,
            [studentId, quizId]
        );

        return attempt;
    }

    /**
     * Check if already submitted
     */
    static async isSubmitted(studentId, quizId) {
        const [[row]] = await db.execute(
            `
      SELECT submitted
      FROM student_quiz_attempts
      WHERE student_id = ? AND quiz_id = ?
      `,
            [studentId, quizId]
        );
        return row?.submitted === 1;
    }

    /**
     * Mark quiz as submitted
     */
    static async markSubmitted(studentId, quizId) {
        await db.execute(
            `
      UPDATE student_quiz_attempts
      SET submitted = 1
      WHERE student_id = ? AND quiz_id = ?
      `,
            [studentId, quizId]
        );
    }
}

module.exports = StudentQuizAttempt;
