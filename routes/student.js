const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

router.get('/dashboard', studentController.getRegisteredCourses);
router.get('/available-courses', studentController.getAvailableCourses);
router.post('/join-course', studentController.joinSubject);

router.get('/subject/:subjectId/quizzes', studentController.getSubjectQuizzes);

router.post('/quiz/:quizId/attempt', studentController.createQuizAttempt);
router.get('/quiz/:quizId/start', studentController.startQuizForStudent);
router.post('/quiz/:quizId/answer', studentController.saveStudentAnswer);
router.post('/quiz/:quizId/submit', studentController.submitStudentQuiz);
router.get('/quiz/:quizId/summary', studentController.getQuizSummary);
router.get(
    "/quiz/:quizId/result",
    studentController.getStudentQuizResult
);

module.exports = router;
