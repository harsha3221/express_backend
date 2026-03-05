const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const {
    validateSignup,
    validateLogin,
} = require("../validators/authValidator");

router.post("/signup", validateSignup, authController.postSignup);
router.post("/login", validateLogin, authController.postLogin);
router.post("/logout", authController.logout);
router.get("/verify", authController.verifyEmail);
router.post("/resend-verification", authController.resendVerification);

module.exports = router;
