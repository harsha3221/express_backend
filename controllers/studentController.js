// controllers/studentController.js
const Student = require('../model/student');
const Subject = require('../model/subject');
const Quiz = require('../model/quiz');
const db = require('../util/database');
const Question = require('../model/question');
const StudentQuizAttempt = require('../model/studentQuizAttempt'); // NEW

/**
 * Get registered courses + joined subjects for student dashboard
 */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
exports.createQuizAttempt = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "student") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const quizId = req.params.quizId;
    const userId = req.session.user.id;

    const { student } = await ensureStudentAndEnrollment(userId, quizId);

    const attempt = await StudentQuizAttempt.createIfNotExists(
      student.student_id,
      quizId
    );

    res.json({ message: "Attempt created", attempt });
  } catch (err) {
    console.error("createQuizAttempt error:", err);
    res.status(500).json({ message: err.message });
  }
};

exports.getRegisteredCourses = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student') {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    const userId = req.session.user.id;
    const [studentRows] = await Student.findByUserId(userId);

    if (studentRows.length === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const student = studentRows[0];

    const [availableSubjects] = await Subject.getAllAvailable();
    const [joinedSubjects] = await Student.getJoinedSubjects(student.student_id);

    res.status(200).json({
      student,
      availableSubjects,
      joinedSubjects
    });
  } catch (err) {
    console.error("Dashboard fetch error:", err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/** Get all available courses */
exports.getAvailableCourses = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student') {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    const userId = req.session.user.id;
    const [studentRows] = await Student.findByUserId(userId);
    if (studentRows.length === 0)
      return res.status(404).json({ message: 'Student not found' });

    const [availableSubjects] = await Subject.getAllAvailable();
    const [joinedSubjects] = await Student.getJoinedSubjects(studentRows[0].student_id);

    res.status(200).json({ availableSubjects, joinedSubjects });
  } catch (err) {
    console.error("Available courses fetch error:", err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/** Join a subject */
exports.joinSubject = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student') {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    const { subjectId } = req.body;
    const userId = req.session.user.id;

    const [studentRows] = await Student.findByUserId(userId);
    if (studentRows.length === 0)
      return res.status(404).json({ message: 'Student not found' });

    const student = studentRows[0];

    const [existing] = await Student.isAlreadyJoined(student.student_id, subjectId);
    if (existing.length > 0)
      return res.status(400).json({ message: 'Already joined this course' });

    await Student.joinSubject(student.student_id, subjectId);
    const [[subjectDetails]] = await Subject.findById(subjectId);

    res.status(200).json({
      message: 'Successfully joined course',
      subject: subjectDetails
    });
  } catch (err) {
    console.error("Join subject error:", err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * Get quizzes for a subject — NOW RETURNS attempted + submitted flags
 */
exports.getSubjectQuizzes = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student')
      return res.status(403).json({ message: 'Unauthorized access' });

    const userId = req.session.user.id;
    const subjectId = Number(req.params.subjectId);

    const [studentRows] = await Student.findByUserId(userId);
    if (studentRows.length === 0)
      return res.status(404).json({ message: 'Student not found' });

    const studentId = studentRows[0].student_id;

    // ★ LEFT JOIN student_quiz_attempts to show attempted/submitted
    const query = `
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
        COALESCE(a.submitted,0) AS submitted
      FROM quizzes q
      JOIN subjects s ON q.subject_id = s.id
      JOIN teachers t ON q.teacher_id = t.id
      JOIN users u ON t.user_id = u.id
      JOIN student_subject ss ON ss.subject_id = s.id
      LEFT JOIN student_quiz_attempts a 
          ON a.quiz_id = q.id AND a.student_id = ?
      WHERE s.id = ? AND ss.student_id = ?
      ORDER BY q.start_time DESC
    `;

    const [rows] = await db.execute(query, [studentId, subjectId, studentId]);

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
        teacher: { id: r.teacher_id, name: r.teacher_name },
        created_at: r.created_at,
        attempted: !!r.attempted,
        submitted: !!r.submitted
      }))
    });
  } catch (err) {
    console.error("Error fetching quizzes:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};

/** Helper to ensure student is enrolled in the correct subject */
async function ensureStudentAndEnrollment(userId, quizId) {
  const [studentRows] = await Student.findByUserId(userId);
  if (studentRows.length === 0) throw { code: 404, message: "Student not found" };
  const student = studentRows[0];

  const [quizRows] = await db.execute(
    `SELECT q.*, s.id AS subject_id, u.name AS teacher_name
     FROM quizzes q
     JOIN subjects s ON q.subject_id = s.id
     JOIN teachers t ON q.teacher_id = t.id
     JOIN users u ON t.user_id = u.id
     WHERE q.id = ?`,
    [quizId]
  );

  if (quizRows.length === 0) throw { code: 404, message: "Quiz not found" };
  const quiz = quizRows[0];

  const [enrolledRows] = await db.execute(
    `SELECT 1 FROM student_subject WHERE student_id = ? AND subject_id = ?`,
    [student.student_id, quiz.subject_id]
  );

  if (enrolledRows.length === 0)
    throw { code: 403, message: "Student not enrolled in this subject" };

  return { student, quiz };
}

/**
 * START QUIZ — creates attempt row (attempted = true)
 */
exports.startQuizForStudent = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student')
      return res.status(403).json({ message: "Unauthorized" });

    const userId = req.session.user.id;
    const quizId = req.params.quizId;

    const { student, quiz } = await ensureStudentAndEnrollment(userId, quizId);

    // ⛔ block if already submitted
    const submitted = await StudentQuizAttempt.isSubmitted(student.student_id, quizId);
    if (submitted)
      return res.status(403).json({ message: "Quiz already submitted" });

    // ✅ create / fetch attempt
    const attempt = await StudentQuizAttempt.createIfNotExists(
      student.student_id,
      quizId
    );

    // fetch questions + options
    const rows = await Question.getByQuizId(quizId);

    // build question map
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

    // 🔀 RANDOMIZE
    let questions = shuffleArray(Array.from(map.values()));
    questions = questions.map(q => ({
      ...q,
      options: shuffleArray(q.options)
    }));

    // existing answers
    const [answers] = await db.execute(
      `SELECT question_id, option_id
       FROM student_quiz_answers
       WHERE student_id = ? AND quiz_id = ?`,
      [student.student_id, quizId]
    );

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
    console.error("startQuizForStudent:", err);
    res.status(err.code || 500).json({ message: err.message });
  }
};
/**
 * AUTOSAVE ANSWER
 */
exports.saveStudentAnswer = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student')
      return res.status(403).json({ message: "Unauthorized" });

    const userId = req.session.user.id;
    const quizId = req.params.quizId;
    const { question_id, option_id, option_ids } = req.body;

    const { student, quiz } = await ensureStudentAndEnrollment(userId, quizId);

    const now = new Date();
    if (quiz.start_time && new Date(quiz.start_time) > now)
      return res.status(403).json({ message: "Quiz not started" });

    if (quiz.end_time && new Date(quiz.end_time) < now)
      return res.status(403).json({ message: "Quiz ended" });

    // 🔁 remove old answers for this question
    await db.execute(
      `DELETE FROM student_quiz_answers
       WHERE student_id=? AND quiz_id=? AND question_id=?`,
      [student.student_id, quizId, question_id]
    );

    // ✅ insert new answers (single or multiple)
    const ids = option_ids || (option_id ? [option_id] : []);

    for (const oid of ids) {
      await db.execute(
        `INSERT INTO student_quiz_answers
         (student_id, quiz_id, question_id, option_id)
         VALUES (?, ?, ?, ?)`,
        [student.student_id, quizId, question_id, oid]
      );
    }

    res.json({ message: "Saved" });

  } catch (err) {
    console.error("saveStudentAnswer:", err);
    res.status(err.code || 500).json({ message: err.message });
  }
};


/**
 * SUBMIT QUIZ — mark submitted + compute score
 */
exports.submitStudentQuiz = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student')
      return res.status(403).json({ message: "Unauthorized" });

    const userId = req.session.user.id;
    const quizId = req.params.quizId;

    const { student, quiz } = await ensureStudentAndEnrollment(userId, quizId);

    // compute score (same logic you already had)
    const [answers] = await db.execute(
      `SELECT q.id AS question_id, q.marks, 
              o.id AS option_id, o.is_correct,
              a.option_id AS answered_option
       FROM questions q
       LEFT JOIN options o ON q.id = o.question_id
       LEFT JOIN student_quiz_answers a 
              ON a.question_id = q.id AND a.student_id = ?
       WHERE q.quiz_id = ?`,
      [student.student_id, quizId]
    );

    const byQuestion = {};
    answers.forEach(r => {
      if (!byQuestion[r.question_id])
        byQuestion[r.question_id] = { marks: r.marks || 0, correct: new Set(), ans: r.answered_option };

      if (r.is_correct)
        byQuestion[r.question_id].correct.add(r.option_id);
    });

    let total = 0, obtained = 0;
    for (let qid of Object.keys(byQuestion)) {
      const q = byQuestion[qid];
      total += q.marks;
      if (q.ans && q.correct.has(q.ans)) obtained += q.marks;
    }

    // store result in quiz_results
    const [existing] = await db.execute(
      `SELECT id FROM quiz_results WHERE student_id = ? AND quiz_id = ?`,
      [student.student_id, quizId]
    );

    if (existing.length > 0) {
      await db.execute(
        `UPDATE quiz_results SET total_marks=?, obtained_marks=?, evaluated_at=NOW() WHERE id=?`,
        [total, obtained, existing[0].id]
      );
    } else {
      await db.execute(
        `INSERT INTO quiz_results (student_id, quiz_id, total_marks, obtained_marks) 
         VALUES (?, ?, ?, ?)`,
        [student.student_id, quizId, total, obtained]
      );
    }

    // ★ Mark student_quiz_attempts as submitted
    await StudentQuizAttempt.markSubmitted(student.student_id, quizId);

    res.json({ message: "Submitted", total_marks: total, obtained_marks: obtained });
  } catch (err) {
    console.error("submitStudentQuiz error:", err);
    res.status(err.code || 500).json({ message: err.message });
  }
};

exports.getQuizSummary = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "student")
      return res.status(403).json({ message: "Unauthorized" });

    const quizId = req.params.quizId;
    const userId = req.session.user.id;

    const { quiz } = await ensureStudentAndEnrollment(userId, quizId);

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
    console.error("getQuizSummary error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.getStudentQuizResult = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "student") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const quizId = req.params.quizId;
    const userId = req.session.user.id;

    const { student } = await ensureStudentAndEnrollment(userId, quizId);

    const published = await Quiz.isResultPublished(quizId);
    if (!published) {
      return res.status(403).json({ message: "Results not published yet" });
    }

    const [[result]] = await db.execute(
      `SELECT obtained_marks, total_marks, evaluated_at
             FROM quiz_results
             WHERE student_id = ? AND quiz_id = ?`,
      [student.student_id, quizId]
    );

    if (!result) {
      return res.status(404).json({ message: "Result not found" });
    }

    res.json({ result });
  } catch (err) {
    console.error("Student result error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

