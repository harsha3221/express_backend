// controllers/studentController.js
const Student = require('../model/student');
const Subject = require('../model/subject');

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
exports.getAvailableCourses = async (req, res) => {
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

    // Fetch all available subjects
    const [availableSubjects] = await Subject.getAllAvailable();

    // Fetch subjects the student has already joined
    const [joinedSubjects] = await Student.getJoinedSubjects(student.student_id);

    res.status(200).json({
      availableSubjects, // Send the full list
      joinedSubjects     // Send the list of joined subjects for client-side comparison
    });
  } catch (err) {
    console.error("Available courses fetch error:", err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.joinSubject = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student') {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    const { subjectId } = req.body;
    const userId = req.session.user.id;

    const [studentRows] = await Student.findByUserId(userId);
    if (studentRows.length === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const student = studentRows[0];

    const [existing] = await Student.isAlreadyJoined(student.student_id, subjectId);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Already joined this course' });
    }

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
