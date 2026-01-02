const db = require("../util/database");

class Quiz {
    /**
     * Creates a new quiz.
     * Default status: 'draft'
     */
    static async createQuiz(subjectId, teacherId, title, description, duration, startTime, endTime) {
        const [result] = await db.query(
            `INSERT INTO quizzes 
        (subject_id, teacher_id, title, description, duration_minutes, start_time, end_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
            [subjectId, teacherId, title, description, duration, startTime, endTime]
        );
        return result;
    }

    /**
     * Checks whether a new quiz overlaps in time with an existing quiz of same subject & teacher.
     * Rejects if overlapping quiz exists in 'active' or 'draft' state.
     */
    static async checkOverlap(subjectId, teacherId, startTime, endTime) {
        const [rows] = await db.query(
            `SELECT * FROM quizzes
       WHERE subject_id = ? 
         AND teacher_id = ?
         AND status IN ('draft', 'active')
         AND (
              (start_time <= ? AND end_time >= ?) OR
              (start_time <= ? AND end_time >= ?) OR
              (? <= start_time AND ? >= end_time)
         )`,
            [subjectId, teacherId, startTime, startTime, endTime, endTime, startTime, endTime]
        );
        return rows;
    }

    /**
     * Fetches all quizzes created by a particular teacher, joined with subject details.
     */
    static async getQuizzesByTeacher(teacherId) {
        const [rows] = await db.query(
            `SELECT q.*, s.name AS subject_name
       FROM quizzes q
       JOIN subjects s ON q.subject_id = s.id
       WHERE q.teacher_id = ?
       ORDER BY q.created_at DESC`,
            [teacherId]
        );
        return rows;
    }

    /**
     * Gets quizzes of a specific subject.
     */
    static async getQuizzesBySubject(subjectId) {
        const [rows] = await db.query(
            `SELECT * FROM quizzes 
       WHERE subject_id = ?
       ORDER BY created_at DESC`,
            [subjectId]
        );
        return rows;
    }

    /**
     * Updates quiz status (e.g., 'draft' → 'active', 'active' → 'completed')
     */
    static async updateStatus(quizId, newStatus) {
        const [result] = await db.query(
            `UPDATE quizzes SET status = ? WHERE id = ?`,
            [newStatus, quizId]
        );
        return result;
    }

    /**
     * Get single quiz details by ID
     */
    static async findById(quizId) {
        return await db.query(
            `SELECT q.*, s.name AS subject_name
       FROM quizzes q
       JOIN subjects s ON q.subject_id = s.id
       WHERE q.id = ?`,
            [quizId]
        );

    }

    /**
     * Delete a quiz
     */
    static async deleteQuiz(quizId, teacherId) {
        const [result] = await db.query(
            `DELETE FROM quizzes WHERE id = ? AND teacher_id = ?`,
            [quizId, teacherId]
        );
        return result;
    }
    static async getQuizzesBySubjectAndTeacher(subjectId, teacherId) {
        const [rows] = await db.query(
            `SELECT q.*, s.name AS subject_name
                FROM quizzes q
                JOIN subjects s ON q.subject_id = s.id
                WHERE q.subject_id = ? AND q.teacher_id = ?
                ORDER BY q.created_at DESC`,
            [subjectId, teacherId]
        );
        return rows;
    }
    static async getQuizzesForStudentSubject(subjectId, studentId) {
        const query = `
      SELECT q.id AS quiz_id,
             q.title,
             q.description,
             q.duration_minutes,
             q.start_time,
             q.end_time,
             q.status,
             q.results_published,
             q.created_at,
             t.id AS teacher_id,
             u.name AS teacher_name
      FROM quizzes q
      JOIN subjects s ON q.subject_id = s.id
      JOIN teachers t ON q.teacher_id = t.id
      JOIN users u ON t.user_id = u.id
      -- ensure student is enrolled in subject
      JOIN student_subject ss ON ss.subject_id = s.id
      WHERE s.id = ? AND ss.student_id = ?
      ORDER BY q.start_time DESC, q.created_at DESC
    `;

        return db.execute(query, [subjectId, studentId]);
    }
    static async belongsToTeacher(quizId, teacherUserId) {
        const [[row]] = await db.execute(
            `SELECT q.id
     FROM quizzes q
     JOIN teachers t ON q.teacher_id = t.id
     WHERE q.id = ? AND t.user_id = ?`,
            [quizId, teacherUserId]
        );
        return !!row;
    }
    // Check publish status
    static async isResultPublished(quizId) {
        const [[row]] = await db.execute(
            `SELECT results_published FROM quizzes WHERE id = ?`,
            [quizId]
        );
        return row?.results_published === 1;
    }

    // Publish results
    static async publishResults(quizId) {
        return db.execute(
            `UPDATE quizzes SET results_published = 1 WHERE id = ?`,
            [quizId]
        );
    }

}



module.exports = Quiz;
