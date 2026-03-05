const User = require('../model/user');
const bcrypt = require('bcrypt');
const db = require('../util/database');
const Teacher = require('../model/teacher.js');
const Student = require('../model/student');
const crypto = require('crypto');
const emailService = require('../services/emailService');

/* =========================================================
   SIGNUP
========================================================= */
exports.postSignup = async (req, res) => {
  try {
    const { name, email, password, confirmPassword, role, department, year } = req.body;

    if (!role || !["teacher", "student"].includes(role)) {
      return res.status(400).json({ message: "Invalid role selected" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const [existing] = await User.findEmail(email);
    if (existing.length > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    const expiryMinutes = Number(process.env.TOKEN_EXPIRY_MINUTES) || 15;
    const expiryDate = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // ✅ PASS DATE DIRECTLY (NO toISOString)
    const user = new User(
      name,
      email,
      hashedPassword,
      role,
      false,
      hashedToken,
      expiryDate
    );

    const [result] = await user.insert();
    const userId = result.insertId;

    if (role === "teacher") {
      const teacher = new Teacher(userId, department);
      await teacher.insert();
    } else {
      await db.execute(
        "INSERT INTO students (user_id, roll_number, year) VALUES (?, ?, ?)",
        [userId, null, year]
      );
    }

    const verificationLink = `${process.env.BASE_URL}/verify?token=${rawToken}`;
    await emailService.sendVerificationEmail(email, verificationLink);

    return res.status(201).json({
      message: "Registration successful. Please check your email to verify your account."
    });

  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


/* =========================================================
   VERIFY EMAIL (TIMEZONE SAFE)
========================================================= */
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.redirect(`${process.env.FRONTEND_URL}/verification-failed`);
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const [rows] = await db.execute(
      `SELECT id, verification_token_expiry 
       FROM users 
       WHERE verification_token = ?`,
      [hashedToken]
    );

    if (rows.length === 0) {
      return res.redirect(`${process.env.FRONTEND_URL}/verification-failed`);
    }

    const expiryTime = new Date(rows[0].verification_token_expiry);

    // ✅ Compare in Node instead of MySQL NOW()
    if (expiryTime < new Date()) {
      return res.redirect(`${process.env.FRONTEND_URL}/verification-failed`);
    }

    await db.execute(
      `UPDATE users
       SET is_verified = TRUE,
           verification_token = NULL,
           verification_token_expiry = NULL
       WHERE id = ?`,
      [rows[0].id]
    );

    return res.redirect(`${process.env.FRONTEND_URL}/verification-success`);

  } catch (err) {
    console.error("Verify email error:", err);
    return res.redirect(`${process.env.FRONTEND_URL}/verification-failed`);
  }
};


/* =========================================================
   RESEND VERIFICATION (FIXED TIMEZONE)
========================================================= */
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const [rows] = await User.findEmail(email);

    if (rows.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }

    const user = rows[0];

    if (user.is_verified) {
      return res.status(400).json({ message: "Account already verified" });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    const expiryMinutes = Number(process.env.TOKEN_EXPIRY_MINUTES) || 15;
    const expiryDate = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // ✅ Pass Date directly
    await db.execute(
      `UPDATE users
       SET verification_token = ?,
           verification_token_expiry = ?
       WHERE id = ?`,
      [hashedToken, expiryDate, user.id]
    );

    const verificationLink = `${process.env.BASE_URL}/verify?token=${rawToken}`;
    await emailService.sendVerificationEmail(email, verificationLink);

    return res.status(200).json({
      message: "Verification email resent successfully."
    });

  } catch (err) {
    console.error("Resend verification error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


/* =========================================================
   LOGIN
========================================================= */
exports.postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await User.findEmail(email);
    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = rows[0];

    if (!user.is_verified) {
      return res.status(403).json({
        message: "Email not verified",
        needsVerification: true,
        email: user.email
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    req.session.isLoggedIn = true;

    if (user.role === "teacher") {
      const [teacherRows] = await Teacher.findByUserId(user.id);
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teacher_id: teacherRows[0].teacher_id
      };
    } else {
      const [studentRows] = await Student.findByUserId(user.id);
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        student_id: studentRows[0].student_id
      };
    }

    req.session.save(() => {
      return res.status(200).json({
        message: "Login successful",
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      });
    });

  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
};


/* =========================================================
   LOGOUT
========================================================= */
exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.status(200).json({ message: "Logged out successfully" });
  });
};