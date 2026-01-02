const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');
const uploadQuestionImage = require("../middleware/upload.js");

/* QUIZ CREATION + FETCHING                               */

// Create a quiz
router.post('/create', quizController.createQuiz);

// Fetch quizzes of a subject for this teacher
router.get('/subject/:subjectId', quizController.getQuizzesBySubjectForTeacher);

// Fetch ALL quizzes for teacher (optional, we kept disabled earlier)
// router.get('/all', quizController.getTeacherQuizzes);


/* ------------------------------------------------------ */
/* QUESTION MANAGEMENT (VERY IMPORTANT ORDER!)            */
/* ------------------------------------------------------ */

// Get all questions of a quiz
router.get('/:quizId/questions', quizController.getQuizQuestions);

// Add a new question + options
router.post('/:quizId/questions', uploadQuestionImage.single("image"), quizController.addQuizQuestion);


/* ------------------------------------------------------ */
/* QUIZ DETAILS / UPDATE / DELETE                         */
/* ------------------------------------------------------ */

// Get single quiz details
router.get('/:id', quizController.getQuizById);

// Update quiz status
// router.put('/update-status', quizController.updateQuizStatus);
router.put(
    "/:quizId/questions/:questionId",
    uploadQuestionImage.single("image"),
    quizController.updateQuestion
);//for editing individual questions

// Delete quiz
router.delete('/:quizId/questions/:questionId', quizController.deleteQuizQuestion);



module.exports = router;
