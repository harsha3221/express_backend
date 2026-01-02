const Teacher = require('../model/teacher');
const Quiz = require("../model/quiz");
const QuizResult = require('../model/quizResult.js');
const db = require('../util/database.js');
exports.getDashboard = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !==
            'teacher'
        ) {
            return res.status(403).json({ message: 'unauthorized' });
        }// remove this later this is just for debugging purpose
        const userId = req.session.user.id;
        const [teacherRows] = await Teacher.findByUserId(userId);
        if (teacherRows.length === 0) {
            return res.status(404).json({ message: 'teacher not found' });//this is for debug purpose can be removed later

        }
        const teacher = teacherRows[0];
        console.log(teacher);
        const [subjects] = await Teacher.getSubjects(teacher.teacher_id);
        return res.status(200).json({ teacher, subjects });
    } catch (err) {
        console.error("dashboard error", err.message);
        res.status(500).json({ message: 'server error', error: err.message });
    }
};


// ✅ CREATE SUBJECT CONTROLLER
exports.createSubject = async (req, res) => {
    try {
        // 1️⃣ Check if logged in and role is teacher
        if (!req.session.user || req.session.user.role !== 'teacher') {
            return res.status(403).json({ message: 'Unauthorized access' });
        }

        // 2️⃣ Extract subject data
        const { name, code, description, semester } = req.body;
        if (!name || !code || !semester) {
            return res.status(400).json({ message: 'Name, code, and semester are required' });
        }

        // 3️⃣ Get teacher_id
        const userId = req.session.user.id;
        const [teacherRows] = await Teacher.findByUserId(userId);
        if (teacherRows.length === 0) {
            return res.status(404).json({ message: 'Teacher not found' });
        }

        const teacherId = teacherRows[0].teacher_id;

        // 4️⃣ Insert new subject
        const [result] = await Teacher.createSubject(
            teacherId,
            name,
            code,
            description || '',
            semester
        );

        // 5️⃣ Prepare response subject
        const subject = {
            id: result.insertId,
            name,
            code,
            description,
            semester,
        };

        return res.status(201).json({ message: 'Subject created successfully', subject });
    } catch (err) {
        console.error('Error creating subject:', err.message);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};
exports.viewQuizResults = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== "teacher")
            return res.status(403).json({ message: "Unauthorized" });

        const quizId = req.params.quizId;
        const teacherUserId = req.session.user.id;

        const owns = await Quiz.belongsToTeacher(quizId, teacherUserId);
        if (!owns) return res.status(404).json({ message: "Quiz not found" });

        // 🔹 Get publish status
        const [[quiz]] = await db.execute(
            `SELECT results_published FROM quizzes WHERE id = ?`,
            [quizId]
        );

        // 🔹 Evaluate results if needed (your existing logic)
        const attempts = await QuizResult.getSubmittedStudents(quizId);

        for (const { student_id } of attempts) {
            const already = await QuizResult.exists(student_id, quizId);
            if (already) continue;

            const rows = await QuizResult.getEvaluationData(student_id, quizId);

            const byQuestion = {};
            rows.forEach(r => {
                if (!byQuestion[r.question_id]) {
                    byQuestion[r.question_id] = {
                        marks: r.marks,
                        correct: new Set(),
                        selected: new Set()
                    };
                }
                if (r.is_correct) byQuestion[r.question_id].correct.add(r.option_id);
                if (r.answered_option)
                    byQuestion[r.question_id].selected.add(r.answered_option);
            });

            let total = 0, obtained = 0;
            Object.values(byQuestion).forEach(q => {
                total += q.marks;
                const c = [...q.correct].sort();
                const s = [...q.selected].sort();
                if (c.length === s.length && c.every((v, i) => v === s[i])) {
                    obtained += q.marks;
                }
            });

            await QuizResult.insert(student_id, quizId, total, obtained);
        }

        // 🔹 Final results
        const results = await QuizResult.getResultsForQuiz(quizId);

        res.json({
            results,
            results_published: !!quiz.results_published // ⭐ IMPORTANT
        });

    } catch (err) {
        console.error("View results error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

exports.publishQuizResults = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== "teacher")
            return res.status(403).json({ message: "Unauthorized" });

        const quizId = req.params.quizId;
        const teacherUserId = req.session.user.id;

        const owns = await Quiz.belongsToTeacher(quizId, teacherUserId);
        if (!owns) return res.status(404).json({ message: "Quiz not found" });

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
