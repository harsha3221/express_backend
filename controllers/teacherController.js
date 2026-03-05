const Teacher = require('../model/teacher');
const Quiz = require("../model/quiz");
const QuizResult = require('../model/quizResult.js');

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

        // 1️⃣ Get publish status
        const quiz = await Quiz.getPublishStatus(quizId);

        // 2️⃣ Get students whose results are not yet evaluated
        const pendingStudents = await Quiz.getPendingStudents(quizId);

        if (pendingStudents.length > 0) {
            const studentIds = pendingStudents.map(s => s.student_id);

            // 3️⃣ Get evaluation rows
            const rows = await Quiz.getBulkEvaluationRows(quizId, studentIds);

            // 4️⃣ Compute results
            const insertValues = Quiz.computeBulkResults(rows, quizId);

            // 5️⃣ Insert results
            await Quiz.insertBulkResults(insertValues);
        }

        // 6️⃣ Fetch final results
        const results = await QuizResult.getResultsForQuiz(quizId);

        res.json({
            results,
            results_published: !!quiz?.results_published
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

        await Quiz.publishResults(quizId);

        res.json({ message: "Results published successfully" });

    } catch (err) {
        console.error("Publish results error:", err);
        res.status(500).json({ message: "Server error" });
    }
};