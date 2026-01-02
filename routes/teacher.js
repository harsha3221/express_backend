const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController.js');
router.get('/teacher/dashboard', teacherController.getDashboard);
router.post('/teacher/create-subject', teacherController.createSubject);

router.get(
    "/teacher/quiz/:quizId/results",
    teacherController.viewQuizResults
);
router.post(
    "/teacher/quiz/:quizId/publish-results",
    teacherController.publishQuizResults
);

module.exports = router;
