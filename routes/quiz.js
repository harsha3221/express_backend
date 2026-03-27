const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');




// Create a quiz
router.post('/create', quizController.createQuiz);

// Fetch quizzes of a subject for this teacher
router.get('/subject/:subjectId', quizController.getQuizzesBySubjectForTeacher);


router.get('/:quizId/questions', quizController.getQuizQuestions);


router.post('/:quizId/questions', quizController.addQuizQuestion);


router.get('/:id', quizController.getQuizById);

router.put(
    "/:quizId/questions/:questionId",
    quizController.updateQuestion
);


router.delete('/:quizId/questions/:questionId', quizController.deleteQuizQuestion);

router.delete('/:quizId', quizController.deleteQuiz);


router.get('/:quizId/upload-signature', quizController.getUploadSignature);

module.exports = router;