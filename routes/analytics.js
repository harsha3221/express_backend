const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");

// This defines the path AFTER /analytics
router.get("/test", (req, res) => res.send("Analytics Route is LIVE"));
router.get("/ai-report/:quizId", analyticsController.getAIAnalytics);

module.exports = router;