// model/studentAnswer.js
const db = require("../config/database");

class StudentAnswer {

    static async getAnswers(studentId, quizId) {
        const [rows] = await db.execute(
            `SELECT question_id, option_id
       FROM student_quiz_answers
       WHERE student_id = ? AND quiz_id = ?`,
            [studentId, quizId]
        );
        return rows;
    }
    static async deleteAnswer(studentId, quizId, questionId) {
        return db.execute(
            `DELETE FROM student_quiz_answers
       WHERE student_id = ? AND quiz_id = ? AND question_id = ?`,
            [studentId, quizId, questionId]
        );
    }

    static async insertAnswersBulk(values) {
        if (!values || values.length === 0) return;

        return db.query(
            `INSERT INTO student_quiz_answers
       (student_id, quiz_id, question_id, option_id)
       VALUES ?`,
            [values]
        );
    }

    static async replaceAnswers(studentId, quizId, questionId, optionIds) {
        await this.deleteAnswer(studentId, quizId, questionId);

        if (!optionIds || optionIds.length === 0) return;

        const values = optionIds.map(oid => [
            studentId,
            quizId,
            questionId,
            oid
        ]);

        await this.insertAnswersBulk(values);
    }

}

module.exports = StudentAnswer;
