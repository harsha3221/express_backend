const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

router.get('/student/dashboard', studentController.getRegisteredCourses);
router.get('/student/available-courses', studentController.getAvailableCourses);
router.post('/student/join-course', studentController.joinSubject);

module.exports = router;
