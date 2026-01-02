const Quiz = require('../model/quiz');
const Teacher = require('../model/teacher');
const Question = require("../model/question");
const fs = require("fs");
const path = require("path");
const db = require('../util/database');
//this is the helper function to deal with the unwanted access ,can be removed 
async function ensureQuizBelongsToTeacher(quizId, userId) {
    const [teacherRows] = await Teacher.findByUserId(userId);
    if (teacherRows.length === 0) {
        throw new Error("Teacher not found");
    }
    const teacherId = teacherRows[0].teacher_id;

    const [rows] = await Quiz.findById(quizId);
    if (rows.length === 0) {
        throw new Error("Quiz not found");
    }
    const quiz = rows[0];

    if (quiz.teacher_id !== teacherId) {
        throw new Error("Quiz does not belong to this teacher");
    }

    return { teacherId, quiz };
}
exports.getQuizQuestions = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== "teacher") {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const quizId = req.params.quizId;
        const userId = req.session.user.id;

        await ensureQuizBelongsToTeacher(quizId, userId);

        const rows = await Question.getByQuizId(quizId);

        const questionsMap = new Map();

        for (const row of rows) {
            if (!questionsMap.has(row.question_id)) {
                questionsMap.set(row.question_id, {
                    id: row.question_id,
                    question_text: row.question_text,
                    marks: row.marks,
                    image_url: row.question_image || null, // 👈 expose to frontend
                    options: [],
                });
            }
            if (row.option_id) {
                questionsMap.get(row.question_id).options.push({
                    id: row.option_id,
                    option_text: row.option_text,
                    is_correct: !!row.is_correct,
                });
            }
        }

        const questions = Array.from(questionsMap.values());

        res.status(200).json({ questions });
    } catch (err) {
        console.error("Error fetching quiz questions:", err);
        res.status(500).json({ message: err.message || "Server error" });
    }
};

exports.addQuizQuestion = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== "teacher") {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const quizId = req.params.quizId;
        const userId = req.session.user.id;

        await ensureQuizBelongsToTeacher(quizId, userId);

        const { question_text, marks } = req.body;

        let options = [];
        if (req.body.options) {
            try {
                options = JSON.parse(req.body.options);
            } catch (e) {
                return res.status(400).json({ message: "Invalid options format" });
            }
        }

        if (!question_text || !Array.isArray(options) || options.length === 0) {
            return res
                .status(400)
                .json({ message: "Question text and at least one option are required" });
        }

        const m = Number(marks) || 1;

        const imageUrl = req.file
            ? `/uploads/question-images/${req.file.filename}`
            : null;

        const { questionId } = await Question.createWithOptions(
            quizId,
            question_text,
            m,
            options,
            imageUrl
        );

        res.status(201).json({
            message: "Question created successfully",
            question_id: questionId,
        });
    } catch (err) {
        console.error("Error adding quiz question:", err);
        res.status(500).json({ message: err.message || "Server error" });
    }
};


exports.createQuiz = async (req, res) => {
    try {
        // 1️⃣ Check session and role
        if (!req.session.user || req.session.user.role !== 'teacher') {
            return res.status(403).json({ message: 'Unauthorized access' });
        }

        const { subject_id, title, description, duration_minutes, start_time, end_time } = req.body;

        // 2️⃣ Validate inputs
        if (!subject_id || !title || !duration_minutes || !start_time || !end_time) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const start = new Date(start_time);
        const end = new Date(end_time);

        if (isNaN(start) || isNaN(end) || end <= start) {
            return res.status(400).json({ message: 'Invalid start or end time' });
        }

        // 3️⃣ Get teacher_id using session user
        const userId = req.session.user.id;
        const [teacherRows] = await Teacher.findByUserId(userId);
        if (teacherRows.length === 0) {
            return res.status(404).json({ message: 'Teacher not found' });
        }
        const teacherId = teacherRows[0].teacher_id;

        // 4️⃣ Check for overlapping quiz
        const overlappingQuizzes = await Quiz.checkOverlap(subject_id, teacherId, start_time, end_time);
        if (overlappingQuizzes.length > 0) {
            return res.status(400).json({
                message: 'Another quiz for this subject overlaps with the given time period.',
            });
        }

        // 5️⃣ Create new quiz (default status = draft)
        const result = await Quiz.createQuiz(
            subject_id,
            teacherId,
            title,
            description || '',
            duration_minutes,
            start_time,
            end_time
        );

        res.status(201).json({
            message: 'Quiz created successfully (status: draft)',
            quiz_id: result.insertId,
        });
    } catch (err) {
        console.error('Error creating quiz:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ✅ Get all quizzes for the logged-in teacher
exports.getTeacherQuizzes = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'teacher') {
            return res.status(403).json({ message: 'Unauthorized access' });
        }

        const userId = req.session.user.id;
        const [teacherRows] = await Teacher.findByUserId(userId);
        if (teacherRows.length === 0) {
            return res.status(404).json({ message: 'Teacher not found' });
        }

        const teacherId = teacherRows[0].teacher_id;
        const quizzes = await Quiz.getQuizzesByTeacher(teacherId);

        res.status(200).json({ quizzes });
    } catch (err) {
        console.error('Error fetching quizzes:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};
exports.getQuizzesBySubjectForTeacher = async (req, res) => {
    try {
        // 1. Ensure logged-in teacher
        if (!req.session.user || req.session.user.role !== 'teacher') {
            return res.status(403).json({ message: 'Unauthorized access' });
        }

        const userId = req.session.user.id;

        // 2. Get teacher_id from user
        const [teacherRows] = await Teacher.findByUserId(userId);
        if (teacherRows.length === 0) {
            return res.status(404).json({ message: 'Teacher not found' });
        }

        const teacherId = teacherRows[0].teacher_id;
        const subjectId = req.params.subjectId;

        // 3. Fetch quizzes for this subject + teacher
        const quizzes = await Quiz.getQuizzesBySubjectAndTeacher(subjectId, teacherId);

        // 4. Respond with JSON
        res.status(200).json({
            subjectName: quizzes[0]?.subject_name || 'Subject',
            quizzes,
        });
    } catch (err) {
        console.error('Error fetching quizzes by subject:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ✅ Get single quiz details
exports.getQuizById = async (req, res) => {
    try {
        const quizId = req.params.id;
        const [quizRows] = await Quiz.findById(quizId);

        if (quizRows.length === 0) {
            return res.status(404).json({ message: 'Quiz not found' });
        }

        res.status(200).json({ quiz: quizRows[0] });
    } catch (err) {
        console.error('Error fetching quiz:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ✅ Update quiz status (e.g., activate or complete quiz)
exports.updateQuizStatus = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'teacher') {
            return res.status(403).json({ message: 'Unauthorized access' });
        }

        const { quiz_id, status } = req.body;
        const validStatuses = ['draft', 'active', 'completed'];

        if (!quiz_id || !status || !validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid quiz_id or status' });
        }

        await Quiz.updateStatus(quiz_id, status);
        res.status(200).json({ message: `Quiz status updated to '${status}'` });
    } catch (err) {
        console.error('Error updating quiz status:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ✅ Delete a quiz
exports.deleteQuizQuestion = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== "teacher") {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { quizId, questionId } = req.params;
        const userId = req.session.user.id;

        await ensureQuizBelongsToTeacher(quizId, userId);

        // 1️⃣ Fetch image paths before deleting DB rows
        const imageRows = await Question.getImagesById(questionId);

        // Extract all unique non-null paths
        const imagePaths = new Set();

        imageRows.forEach(row => {
            if (row.question_image) imagePaths.add(row.question_image);
            if (row.option_image) imagePaths.add(row.option_image);
        });

        // 2️⃣ Delete files safely
        imagePaths.forEach((imgPath) => {
            const fullPath = path.join(__dirname, "..", imgPath.replace(/^\//, ""));
            fs.unlink(fullPath, (err) => {
                if (err) console.log("⚠️ Could not delete:", fullPath, err.message);
                else console.log("🗑 Deleted image:", fullPath);
            });
        });

        // 3️⃣ Delete from DB
        await Question.deleteById(questionId);

        res.status(200).json({ message: "Question deleted successfully" });
    } catch (err) {
        console.error("Error deleting question:", err);
        res.status(500).json({ message: err.message || "Server error" });
    }
};
exports.updateQuestion = async (req, res) => {
    try {
        const { quizId, questionId } = req.params;
        const { question_text, marks, options } = req.body;
        const parsedOptions = JSON.parse(options);

        let image_url = null;

        if (req.file) {
            image_url = "/uploads/question-images/" + req.file.filename;
        }

        // Update question
        await db.execute(
            `
      UPDATE questions
      SET question_text = ?, marks = ?, image_url = COALESCE(?, image_url)
      WHERE id = ? AND quiz_id = ?
    `,
            [question_text, marks, image_url, questionId, quizId]
        );

        // Delete old options
        await db.execute(`DELETE FROM options WHERE question_id = ?`, [
            questionId,
        ]);

        // Insert updated options
        for (let opt of parsedOptions) {
            await db.execute(
                `
        INSERT INTO options (question_id, option_text, is_correct)
        VALUES (?, ?, ?)
      `,
                [questionId, opt.option_text, opt.is_correct]
            );
        }

        res.json({ message: "Question updated successfully" });
    } catch (error) {
        console.error("Error updating question:", error);
        res.status(500).json({ message: "Failed to update question" });
    }
};
