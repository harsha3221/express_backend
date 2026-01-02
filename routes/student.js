const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

router.get('/student/dashboard', studentController.getRegisteredCourses);
router.get('/student/available-courses', studentController.getAvailableCourses);
router.post('/student/join-course', studentController.joinSubject);

router.get('/student/subject/:subjectId/quizzes', studentController.getSubjectQuizzes);

router.post('/student/quiz/:quizId/attempt', studentController.createQuizAttempt);
router.get('/student/quiz/:quizId/start', studentController.startQuizForStudent);
router.post('/student/quiz/:quizId/answer', studentController.saveStudentAnswer);
router.post('/student/quiz/:quizId/submit', studentController.submitStudentQuiz);
router.get('/student/quiz/:quizId/summary', studentController.getQuizSummary);
router.get(
    "/student/quiz/:quizId/result",
    studentController.getStudentQuizResult
);

module.exports = router;
