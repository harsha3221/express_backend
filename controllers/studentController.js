// controllers/studentController.js

const Student = require('../model/student');
const Subject = require('../model/subject');
const Quiz = require('../model/quiz');
// const db = require('../config/database');
const Question = require('../model/question');
const StudentQuizAttempt = require('../model/studentQuizAttempt');
const QuizResult = require('../model/quizResult.js');
const StudentAnswer = require('../model/studentAnswer');

/* ============================================================
   Utility: Shuffle
============================================================ */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


/* ============================================================
   Helper: Ensure Enrollment
============================================================ */
async function ensureStudentAndEnrollment(studentId, quizId) {
  const quiz = await Quiz.getQuizWithSubjectAndTeacher(quizId);

  if (!quiz)
    throw { code: 404, message: "Quiz not found" };

  const enrolled = await Student.isEnrolled(studentId, quiz.subject_id);

  if (!enrolled)
    throw { code: 403, message: "Student not enrolled in this subject" };

  return { quiz };
}


/* ============================================================
   CREATE ATTEMPT
============================================================ */
exports.createQuizAttempt = async (req, res, next) => {
  try {
    if (!req.session.user || req.session.user.role !== "student")
      return res.status(403).json({ message: "Unauthorized" });

    const studentId = req.session.user.student_id;
    const quizId = req.params.quizId;

    await ensureStudentAndEnrollment(studentId, quizId);

    const attempt = await StudentQuizAttempt.createIfNotExists(
      studentId,
      quizId
    );

    res.json({ message: "Attempt created", attempt });

  } catch (err) {
    next(err);
  }
};


/* ============================================================
   DASHBOARD
============================================================ */
exports.getRegisteredCourses = async (req, res, next) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student')
      return res.status(403).json({ message: 'Unauthorized access' });

    const studentId = req.session.user.student_id;

    const [availableSubjects] = await Subject.getAllAvailable();
    const [joinedSubjects] = await Student.getJoinedSubjects(studentId);

    // fetch student profile (roll + year)
    const [studentRows] = await Student.findByUserId(req.session.user.id);

    res.status(200).json({
      student: studentRows[0],   // 👈 ADD THIS
      availableSubjects,
      joinedSubjects
    });

  } catch (err) {
    next(err);
  }
};

/* ============================================================
   AVAILABLE COURSES
============================================================ */
exports.getAvailableCourses = async (req, res, next) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student')
      return res.status(403).json({ message: 'Unauthorized access' });

    const studentId = req.session.user.student_id;

    const [availableSubjects] = await Subject.getAllAvailable();
    const [joinedSubjects] = await Student.getJoinedSubjects(studentId);

    res.status(200).json({ availableSubjects, joinedSubjects });

  } catch (err) {
    next(err);
  }
};


/* ============================================================
   JOIN SUBJECT
============================================================ */
exports.joinSubject = async (req, res, next) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student')
      return res.status(403).json({ message: 'Unauthorized access' });

    const { subjectId } = req.body;
    const studentId = req.session.user.student_id;

    const [existing] = await Student.isAlreadyJoined(studentId, subjectId);
    if (existing.length > 0)
      return res.status(400).json({ message: 'Already joined this course' });

    await Student.joinSubject(studentId, subjectId);
    const [[subjectDetails]] = await Subject.findById(subjectId);

    res.status(200).json({
      message: 'Successfully joined course',
      subject: subjectDetails
    });

  } catch (err) {
    next(err);
  }
};


/* ============================================================
   GET SUBJECT QUIZZES
============================================================ */
exports.getSubjectQuizzes = async (req, res, next) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student')
      return res.status(403).json({ message: 'Unauthorized access' });

    const studentId = req.session.user.student_id;
    const subjectId = Number(req.params.subjectId);

    const rows = await Quiz.getQuizzesForStudentSubject(
      subjectId,
      studentId
    );

    res.status(200).json({
      quizzes: rows.map(r => ({
        id: r.quiz_id,
        title: r.title,
        description: r.description,
        duration_minutes: r.duration_minutes,
        start_time: r.start_time,
        end_time: r.end_time,
        status: r.status || "draft",
        results_published: !!r.results_published,
        teacher: {
          id: r.teacher_id,
          name: r.teacher_name
        },
        created_at: r.created_at,
        attempted: !!r.attempted,
        submitted: !!r.submitted
      }))
    });

  } catch (err) {
    next(err);
  }
};

/* ============================================================
   START QUIZ
============================================================ */
exports.startQuizForStudent = async (req, res, next) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student')
      return res.status(403).json({ message: "Unauthorized" });

    const studentId = req.session.user.student_id;
    const quizId = req.params.quizId;

    const { quiz } = await ensureStudentAndEnrollment(studentId, quizId);

    const submitted = await StudentQuizAttempt.isSubmitted(studentId, quizId);
    if (submitted)
      return res.status(403).json({ message: "Quiz already submitted" });

    const attempt = await StudentQuizAttempt.createIfNotExists(
      studentId,
      quizId
    );

    const rows = await Question.getByQuizId(quizId);

    // Build question map
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.question_id)) {
        map.set(r.question_id, {
          id: r.question_id,
          question_text: r.question_text,
          image_url: r.question_image || null,
          marks: r.marks,
          options: []
        });
      }

      if (r.option_id) {
        map.get(r.question_id).options.push({
          id: r.option_id,
          option_text: r.option_text,
          image_url: r.option_image || null
        });
      }
    }

    // Shuffle
    let questions = shuffleArray(Array.from(map.values()));
    questions = questions.map(q => ({
      ...q,
      options: shuffleArray(q.options)
    }));

    // ✅ Now clean — no raw SQL
    const answers = await StudentAnswer.getAnswers(studentId, quizId);

    res.json({
      quiz,
      questions,
      existingAnswers: answers,
      attempt: {
        started_at: attempt.started_at,
        submitted: attempt.submitted
      }
    });

  } catch (err) {
    next(err);
  }
};


/* ============================================================
   SAVE ANSWER
============================================================ */
exports.saveStudentAnswer = async (req, res, next) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student')
      return res.status(403).json({ message: "Unauthorized" });

    const studentId = req.session.user.student_id;
    const quizId = req.params.quizId;
    const { question_id, option_id, option_ids } = req.body;

    const { quiz } = await ensureStudentAndEnrollment(studentId, quizId);

    const now = new Date();

    if (quiz.start_time && new Date(quiz.start_time) > now)
      return res.status(403).json({ message: "Quiz not started" });

    if (quiz.end_time && new Date(quiz.end_time) < now)
      return res.status(403).json({ message: "Quiz ended" });

    const ids = option_ids || (option_id ? [option_id] : []);

    // ✅ clean call — no SQL here
    await StudentAnswer.replaceAnswers(
      studentId,
      quizId,
      question_id,
      ids
    );

    res.json({ message: "Saved" });

  } catch (err) {
    next(err);
  }
};


/* ============================================================
   SUBMIT QUIZ
============================================================ */
exports.submitStudentQuiz = async (req, res, next) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student')
      return res.status(403).json({ message: "Unauthorized" });

    const studentId = req.session.user.student_id;
    const quizId = req.params.quizId;

    const { total, obtained } = await QuizResult.evaluateAndSubmit(studentId, quizId);

    res.json({
      message: "Submitted",
      total_marks: total,
      obtained_marks: obtained
    });

  } catch (err) {
    next(err);
  }
};

/* ============================================================
   QUIZ SUMMARY
============================================================ */
exports.getQuizSummary = async (req, res, next) => {
  try {
    if (!req.session.user || req.session.user.role !== "student")
      return res.status(403).json({ message: "Unauthorized" });

    const studentId = req.session.user.student_id;
    const quizId = req.params.quizId;

    const { quiz } = await ensureStudentAndEnrollment(studentId, quizId);

    res.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        teacher_name: quiz.teacher_name || "",
        start_time: quiz.start_time,
        end_time: quiz.end_time
      }
    });

  } catch (err) {
    next(err);
  }
};


/* ============================================================
   GET RESULT
============================================================ */
exports.getStudentQuizResult = async (req, res, next) => {
  try {
    if (!req.session.user || req.session.user.role !== "student")
      return res.status(403).json({ message: "Unauthorized" });

    const studentId = req.session.user.student_id;
    const quizId = req.params.quizId;

    await ensureStudentAndEnrollment(studentId, quizId);

    const published = await Quiz.isResultPublished(quizId);
    if (!published)
      return res.status(403).json({ message: "Results not published yet" });

    const result = await QuizResult.getStudentResult(
      studentId,
      quizId
    );

    if (!result)
      return res.status(404).json({ message: "Result not found" });

    res.json({ result });

  } catch (err) {
    next(err);
  }
};
