const User = require('../model/user');
const bcrypt = require('bcrypt');
const db = require('../util/database');
const Teacher = require('../model/teacher.js');
const Student = require('../model/student');
exports.postSignup = async (req, res, next) => {
  try {
    const { name, email, password, confirmPassword, role, department, year } = req.body; // add role

    if (!role || !['teacher', 'student'].includes(role)) {
      return res.status(400).json({ message: "Invalid role selected" });
    }//this can be removed in the production

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const [existing] = await User.findEmail(email);
    if (existing.length > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User(name, email, hashedPassword, role);
    const [result] = await user.insert();

    const userId = result.insertId;

    // Role-specific insertion
    if (role === 'teacher') {
      const teacher = new Teacher(userId, department);
      await teacher.insert();


    } else {
      await db.execute('INSERT INTO students (user_id, roll_number, year) VALUES (?, ?, ?)', [userId, null, year]);
    }//do not forget to change when student module comes

    console.log("User inserted successfully:", userId, "Role:", role);
    return res.status(201).json({ message: "User registered successfully" });

  } catch (err) {
    console.error("Signup error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
};


exports.postLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ Find user
    const [rows] = await User.findEmail(email);
    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = rows[0];

    // 2️⃣ Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    req.session.isLoggedIn = true;

    // 3️⃣ Role-based identity attachment
    if (user.role === "teacher") {

      const [teacherRows] = await Teacher.findByUserId(user.id);

      if (teacherRows.length === 0) {
        return res.status(500).json({ message: "Teacher record not found" });
      }

      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teacher_id: teacherRows[0].teacher_id
      };

    } else if (user.role === "student") {

      const [studentRows] = await Student.findByUserId(user.id);

      if (studentRows.length === 0) {
        return res.status(500).json({ message: "Student record not found" });
      }

      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        student_id: studentRows[0].student_id
      };
    }

    // 4️⃣ Save session
    req.session.save(err => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ message: "Could not establish session" });
      }

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
// controllers/authController.js

exports.logout = (req, res) => {
  try {
    if (!req.session) {
      return res.status(200).json({ message: "Logged out" });
    }

    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }

      // Clear cookie (IMPORTANT)
      res.clearCookie("connect.sid"); // default express-session cookie name

      return res.status(200).json({ message: "Logged out successfully" });
    });
  } catch (err) {
    console.error("Logout exception:", err);
    res.status(500).json({ message: "Server error" });
  }
};
