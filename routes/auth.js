const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController.js");
router.post('/signup', authController.postSignup);
router.post('/login', authController.postLogin);
router.post("/logout", authController.logout);
module.exports = router;