const Quiz = require('../model/quiz');
const Teacher = require('../model/teacher');
const Question = require("../model/question");
const { uploadToCloudinary, deleteFromCloudinary } = require("../services/imageService");
const fs = require("fs");
const path = require("path");
const db = require('../config/database');
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
exports.getQuizQuestions = async (req, res, next) => {
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
                    image_url: row.option_image || null,
                });
            }
        }

        const questions = Array.from(questionsMap.values());

        res.status(200).json({ questions });
    } catch (err) {
        next(err);
    }
};

exports.addQuizQuestion = async (req, res, next) => {
    try {
        if (!req.session.user || req.session.user.role !== "teacher") {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const quizId = req.params.quizId;
        const userId = req.session.user.id;

        await ensureQuizBelongsToTeacher(quizId, userId);

        const { question_text, marks } = req.body;

        let options = [];
        try {
            options = JSON.parse(req.body.options || "[]");
        } catch {
            return res.status(400).json({ message: "Invalid options format" });
        }

        if (!question_text || options.length === 0) {
            return res.status(400).json({
                message: "Question text and options required",
            });
        }

        const m = Number(marks) || 1;

        let questionImageUrl = null;
        const optionImageMap = {};

        if (req.files && req.files.length > 0) {

            // 🔥 Upload all images in parallel
            const uploadPromises = req.files.map(async (file) => {
                const folder = file.fieldname === "image"
                    ? "quiz_questions"
                    : "quiz_options";

                const url = await uploadToCloudinary(file.path, folder);

                return {
                    fieldname: file.fieldname,
                    url,
                };
            });

            const uploadedFiles = await Promise.all(uploadPromises);

            // 🔥 Map results
            uploadedFiles.forEach(({ fieldname, url }) => {
                if (fieldname === "image") {
                    questionImageUrl = url;
                } else if (fieldname.startsWith("option_image_")) {
                    const index = fieldname.split("_").pop();
                    optionImageMap[index] = url;
                }
            });
        }

        /* 🔥 ATTACH IMAGES TO OPTIONS */
        options = options.map((opt, index) => ({
            ...opt,
            image_url: optionImageMap[index] || null,
        }));

        const { questionId } = await Question.createWithOptions(
            quizId,
            question_text,
            m,
            options,
            questionImageUrl
        );

        res.status(201).json({
            message: "Question created successfully",
            question_id: questionId,
        });

    } catch (err) {
        next(err);
    }
};

exports.createQuiz = async (req, res, next) => {
    try {
        /* ---------------- AUTH CHECK ---------------- */
        if (!req.session.user || req.session.user.role !== 'teacher') {
            return res.status(403).json({ message: 'Unauthorized access' });
        }

        const { subject_id, title, description, duration_minutes, start_time, end_time } = req.body;

        /* ---------------- BASIC VALIDATION ---------------- */
        if (!subject_id || !title || !duration_minutes || !start_time || !end_time) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const start = new Date(start_time);
        const end = new Date(end_time);
        const now = new Date();

        /* ---------------- DATE VALIDATION ---------------- */
        if (isNaN(start) || isNaN(end)) {
            return res.status(400).json({ message: 'Invalid date format' });
        }

        if (start < now) {
            return res.status(400).json({ message: 'Start time cannot be in the past' });
        }

        if (end <= start) {
            return res.status(400).json({ message: 'End time must be after start time' });
        }

        /* ---------------- DURATION VALIDATION ---------------- */
        const duration = Number(duration_minutes);

        if (!duration || duration <= 0) {
            return res.status(400).json({ message: 'Duration must be greater than 0' });
        }

        /* ---------------- GET TEACHER ---------------- */
        const userId = req.session.user.id;
        const [teacherRows] = await Teacher.findByUserId(userId);

        if (teacherRows.length === 0) {
            return res.status(404).json({ message: 'Teacher not found' });
        }

        const teacherId = teacherRows[0].teacher_id;

        /* ---------------- OVERLAP CHECK ---------------- */
        const overlappingQuizzes = await Quiz.checkOverlap(
            subject_id,
            teacherId,
            start_time,
            end_time
        );

        if (overlappingQuizzes) {
            return res.status(400).json({
                message: 'Another quiz overlaps with this time period.',
            });
        }

        /* ---------------- CREATE QUIZ ---------------- */
        const result = await Quiz.createQuiz(
            subject_id,
            teacherId,
            title,
            description || '',
            duration,
            start_time,
            end_time
        );

        res.status(201).json({
            message: 'Quiz created successfully (status: draft)',
            quiz_id: result.insertId,
        });

    } catch (err) {
        next(err);
    }
};
// ✅ Get all quizzes for the logged-in teacher
exports.getTeacherQuizzes = async (req, res, next) => {
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
        next(err);
    }
};
exports.getQuizzesBySubjectForTeacher = async (req, res, next) => {
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
        next(err);
    }
};

// ✅ Get single quiz details
exports.getQuizById = async (req, res, next) => {
    try {
        const quizId = req.params.id;
        const [quizRows] = await Quiz.findById(quizId);

        if (quizRows.length === 0) {
            return res.status(404).json({ message: 'Quiz not found' });
        }

        res.status(200).json({ quiz: quizRows[0] });
    } catch (err) {
        next(err);
    }
};

// ✅ Update quiz status (e.g., activate or complete quiz)
exports.updateQuizStatus = async (req, res, next) => {
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
        next(err);
    }
};

// ✅ Delete a quiz
exports.deleteQuizQuestion = async (req, res, next) => {
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

        // 2️⃣ Delete files safely from Cloudinary
        for (const imgUrl of imagePaths) {
            await deleteFromCloudinary(imgUrl);
        }

        // 3️⃣ Delete from DB
        await Question.deleteById(questionId);

        res.status(200).json({ message: "Question deleted successfully" });
    } catch (err) {
        next(err);
    }
};
exports.updateQuestion = async (req, res, next) => {
    try {
        if (!req.session.user || req.session.user.role !== "teacher") {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { quizId, questionId } = req.params;
        const { question_text, marks } = req.body;

        let options = [];
        try {
            options = JSON.parse(req.body.options || "[]");
        } catch {
            return res.status(400).json({ message: "Invalid options format" });
        }

        let questionImageUrl = null;
        const optionImageMap = {};

        if (req.files && req.files.length > 0) {

            // 🔥 Upload all images in parallel
            const uploadPromises = req.files.map(async (file) => {
                const folder = file.fieldname === "image"
                    ? "quiz_questions"
                    : "quiz_options";

                const url = await uploadToCloudinary(file.path, folder);

                return {
                    fieldname: file.fieldname,
                    url,
                };
            });

            const uploadedFiles = await Promise.all(uploadPromises);

            // 🔥 Map results
            uploadedFiles.forEach(({ fieldname, url }) => {
                if (fieldname === "image") {
                    questionImageUrl = url;
                } else if (fieldname.startsWith("option_image_")) {
                    const index = fieldname.split("_").pop();
                    optionImageMap[index] = url;
                }
            });
        }

        /* 🔥 MERGE OPTION IMAGES */
        options = options.map((opt, index) => ({
            ...opt,
            image_url: optionImageMap[index] || opt.image_url || null,
        }));

        await Question.updateQuestion(
            quizId,
            questionId,
            question_text,
            marks,
            options,
            questionImageUrl
        );

        res.json({ message: "Question updated successfully" });

    } catch (err) {
        next(err);
    }
};
exports.deleteQuiz = async (req, res, next) => {
    try {
        if (!req.session.user || req.session.user.role !== "teacher") {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const quizId = req.params.quizId;
        const userId = req.session.user.id;

        // 🔐 Check ownership
        const { teacherId, quiz } = await ensureQuizBelongsToTeacher(quizId, userId);

        const now = new Date();

        // ❌ Only allow delete if quiz not started
        if (quiz.start_time && new Date(quiz.start_time) <= now) {
            return res.status(400).json({
                message: "Cannot delete quiz that has started or completed",
            });
        }

        // ✅ FIXED LINE
        await Quiz.deleteQuiz(quizId, teacherId);

        res.status(200).json({ message: "Quiz deleted successfully" });

    } catch (err) {
        next(err);
    }
};