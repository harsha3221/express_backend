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
        const [[row]] = await db.execute(
            `SELECT 1
     FROM quizzes
     WHERE subject_id = ?
       AND teacher_id = ?
       AND status IN ('draft', 'active')
       AND start_time < ?
       AND end_time > ?
     LIMIT 1`,
            [subjectId, teacherId, endTime, startTime]
        );

        return !!row;
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
        const [rows] = await db.execute(
            `
    SELECT 
      q.id AS quiz_id,
      q.title,
      q.description,
      q.duration_minutes,
      q.start_time,
      q.end_time,
      q.status,
      q.results_published,
      q.created_at,
      t.id AS teacher_id,
      u.name AS teacher_name,
      a.submitted IS NOT NULL AS attempted,
      COALESCE(a.submitted, 0) AS submitted
    FROM quizzes q
    JOIN subjects s ON q.subject_id = s.id
    JOIN teachers t ON q.teacher_id = t.id
    JOIN users u ON t.user_id = u.id
    JOIN student_subject ss ON ss.subject_id = s.id
    LEFT JOIN student_quiz_attempts a
        ON a.quiz_id = q.id AND a.student_id = ?
    WHERE s.id = ? AND ss.student_id = ?
    ORDER BY q.start_time DESC, q.created_at DESC
    `,
            [studentId, subjectId, studentId]
        );

        return rows;
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
    static async getEvaluationData(conn, studentId, quizId) {
        const [rows] = await conn.execute(
            `SELECT q.id AS question_id, q.marks, 
            o.id AS option_id, o.is_correct,
            a.option_id AS answered_option
     FROM questions q
     LEFT JOIN options o ON q.id = o.question_id
     LEFT JOIN student_quiz_answers a 
            ON a.question_id = q.id AND a.student_id = ?
     WHERE q.quiz_id = ?`,
            [studentId, quizId]
        );
        return rows;
    }
    static async getQuizWithSubjectAndTeacher(quizId) {
        const [rows] = await db.execute(
            `SELECT q.*, s.id AS subject_id, u.name AS teacher_name
     FROM quizzes q
     JOIN subjects s ON q.subject_id = s.id
     JOIN teachers t ON q.teacher_id = t.id
     JOIN users u ON t.user_id = u.id
     WHERE q.id = ?`,
            [quizId]
        );
        return rows[0];
    }
    static async getPublishStatus(quizId) {
        const [[row]] = await db.execute(
            `SELECT results_published FROM quizzes WHERE id = ?`,
            [quizId]
        );
        return row;
    }
    static async getPendingStudents(quizId) {
        const [rows] = await db.execute(
            `SELECT a.student_id
         FROM student_quiz_attempts a
         LEFT JOIN quiz_results r
           ON a.student_id = r.student_id
          AND a.quiz_id = r.quiz_id
         WHERE a.quiz_id = ?
           AND a.submitted = 1
           AND r.id IS NULL`,
            [quizId]
        );
        return rows;
    }
    static async getBulkEvaluationRows(quizId, studentIds) {
        if (!studentIds.length) return [];

        const [rows] = await db.query(
            `SELECT 
            sqa.student_id,
            q.id AS question_id,
            q.marks,
            o.id AS option_id,
            o.is_correct,
            sqa.option_id AS answered_option
         FROM questions q
         JOIN options o ON q.id = o.question_id
         JOIN student_quiz_answers sqa
           ON q.id = sqa.question_id
         WHERE q.quiz_id = ?
           AND sqa.student_id IN (?)`,
            [quizId, studentIds]
        );

        return rows;
    }
    static computeBulkResults(rows, quizId) {

        const evaluationMap = new Map();

        rows.forEach(r => {
            if (!evaluationMap.has(r.student_id)) {
                evaluationMap.set(r.student_id, new Map());
            }

            const studentMap = evaluationMap.get(r.student_id);

            if (!studentMap.has(r.question_id)) {
                studentMap.set(r.question_id, {
                    marks: r.marks,
                    correct: new Set(),
                    selected: new Set()
                });
            }

            const qData = studentMap.get(r.question_id);

            if (r.is_correct) qData.correct.add(r.option_id);
            if (r.answered_option) qData.selected.add(r.answered_option);
        });

        const insertValues = [];

        evaluationMap.forEach((questions, studentId) => {
            let totalMarks = 0;
            let obtainedMarks = 0;

            questions.forEach(q => {
                totalMarks += q.marks;

                const isCorrect =
                    q.correct.size === q.selected.size &&
                    [...q.correct].every(id => q.selected.has(id));

                if (isCorrect) obtainedMarks += q.marks;
            });

            insertValues.push([
                studentId,
                quizId,
                totalMarks,
                obtainedMarks,
                new Date()
            ]);
        });

        return insertValues;
    }
    static computeBulkResults(rows, quizId) {

        const evaluationMap = new Map();

        rows.forEach(r => {
            if (!evaluationMap.has(r.student_id)) {
                evaluationMap.set(r.student_id, new Map());
            }

            const studentMap = evaluationMap.get(r.student_id);

            if (!studentMap.has(r.question_id)) {
                studentMap.set(r.question_id, {
                    marks: r.marks,
                    correct: new Set(),
                    selected: new Set()
                });
            }

            const qData = studentMap.get(r.question_id);

            if (r.is_correct) qData.correct.add(r.option_id);
            if (r.answered_option) qData.selected.add(r.answered_option);
        });

        const insertValues = [];

        evaluationMap.forEach((questions, studentId) => {
            let totalMarks = 0;
            let obtainedMarks = 0;

            questions.forEach(q => {
                totalMarks += q.marks;

                const isCorrect =
                    q.correct.size === q.selected.size &&
                    [...q.correct].every(id => q.selected.has(id));

                if (isCorrect) obtainedMarks += q.marks;
            });

            insertValues.push([
                studentId,
                quizId,
                totalMarks,
                obtainedMarks,
                new Date()
            ]);
        });

        return insertValues;
    }

}



module.exports = Quiz;
