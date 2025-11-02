const User = require('../model/user');
const bcrypt = require('bcrypt');
const db = require('../util/database');
const Teacher = require('../model/teacher.js');

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

    // 1. Check if user exists
    const [rows] = await User.findEmail(email);
    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = rows[0];
    console.log(user);//just for debug purpose

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // 🔑 Session establishment
    req.session.isLoggedIn = true;
    // It's best practice to store data necessary for the app, like the user ID/name.
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };

    // 3. Save the session and respond *only within the callback*
    req.session.save(err => {
      if (err) {
        console.error("Session save error:", err);
        // Return 500 status on session save failure
        return res.status(500).json({ message: "Could not establish session" });
      }

      // 4. Success: Send the response here, after the session is saved.
      return res.status(200).json({
        message: "Login successful",
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      });
    });

    // IMPORTANT: Do NOT place any 'return res.status' here.
    // The return must be inside req.session.save() to ensure the cookie is sent.

  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};