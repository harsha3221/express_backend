const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController.js');
router.get('/teacher/dashboard', teacherController.getDashboard);
router.post('/teacher/create-subject', teacherController.createSubject);
module.exports = router;
