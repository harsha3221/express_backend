const Teacher = require('../model/teacher');
const Quiz = require("../model/quiz");
const QuizResult = require('../model/quizResult.js');
const db = require('../util/database.js');

/* ============================================================
   GET TEACHER DASHBOARD
============================================================ */
exports.getDashboard = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'teacher') {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const teacherId = req.session.user.teacher_id;

        const [subjects] = await Teacher.getSubjects(teacherId);

        return res.status(200).json({
            teacher: {
                name: req.session.user.name,
                email: req.session.user.email
            },
            subjects
        });

    } catch (err) {
        console.error("Dashboard error:", err.message);
        res.status(500).json({ message: 'Server error' });
    }
};


/* ============================================================
   CREATE SUBJECT
============================================================ */
exports.createSubject = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'teacher') {
            return res.status(403).json({ message: 'Unauthorized access' });
        }

        const { name, code, description, semester } = req.body;

        if (!name || !code || !semester) {
            return res.status(400).json({
                message: 'Name, code, and semester are required'
            });
        }

        const teacherId = req.session.user.teacher_id;

        const [result] = await Teacher.createSubject(
            teacherId,
            name,
            code,
            description || '',
            semester
        );

        return res.status(201).json({
            message: 'Subject created successfully',
            subject: {
                id: result.insertId,
                name,
                code,
                description,
                semester
            }
        });

    } catch (err) {
        console.error('Create subject error:', err.message);

        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'You have already created a subject with this code.'
            });
        }

        return res.status(500).json({ message: 'Server error' });
    }
};


/* ============================================================
   VIEW QUIZ RESULTS
============================================================ */
exports.viewQuizResults = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== "teacher") {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const quizId = req.params.quizId;
        const teacherUserId = req.session.user.id;

        const owns = await Quiz.belongsToTeacher(quizId, teacherUserId);
        if (!owns) {
            return res.status(404).json({ message: "Quiz not found" });
        }

        // Get publish status
        const [[quiz]] = await db.execute(
            `SELECT results_published FROM quizzes WHERE id = ?`,
            [quizId]
        );

        // Find students needing evaluation
        const [pendingStudents] = await db.execute(
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

        if (pendingStudents.length > 0) {
            const studentIds = pendingStudents.map(s => s.student_id);

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

            if (insertValues.length > 0) {
                await db.query(
                    `INSERT INTO quiz_results 
                     (student_id, quiz_id, total_marks, obtained_marks, evaluated_at) 
                     VALUES ?`,
                    [insertValues]
                );
            }
        }

        const results = await QuizResult.getResultsForQuiz(quizId);

        res.json({
            results,
            results_published: !!quiz.results_published
        });

    } catch (err) {
        console.error("View results error:", err);
        res.status(500).json({ message: "Server error" });
    }
};


/* ============================================================
   PUBLISH QUIZ RESULTS
============================================================ */
exports.publishQuizResults = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== "teacher") {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const quizId = req.params.quizId;
        const teacherUserId = req.session.user.id;

        const owns = await Quiz.belongsToTeacher(quizId, teacherUserId);
        if (!owns) {
            return res.status(404).json({ message: "Quiz not found" });
        }

        await db.execute(
            `UPDATE quizzes SET results_published = 1 WHERE id = ?`,
            [quizId]
        );

        res.json({ message: "Results published successfully" });

    } catch (err) {
        console.error("Publish results error:", err);
        res.status(500).json({ message: "Server error" });
    }
};