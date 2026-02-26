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

module.exports = router;
