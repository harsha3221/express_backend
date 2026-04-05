const express = require("express");
const router = express.Router();
const cheatingController = require("../controllers/cheatingController");


router.get("/cheating/logs/:quizId", cheatingController.getCheatingLogs);
router.post("/report-cheating", cheatingController.reportCheating);
router.post('/cheating/assign-zero', cheatingController.assignZero);
module.exports = router;