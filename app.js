require("dotenv").config();
const express = require("express");
const app = express();

const db = require("./config/database");
const authRoute = require("./routes/auth");
const teacherRoute = require("./routes/teacher");
const studentRoutes = require("./routes/student");
const quizRoutes = require("./routes/quiz");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const cors = require("cors");
const csrf = require("csurf");
const path = require("path");
const cheatingRoutes = require('./routes/cheating.js');


/* ---------------- CORS ---------------- */
app.use(
  cors({
    origin: process.env.frontend_url,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));

/* ---------------- SESSION ---------------- */
const sessionStore = new MySQLStore({}, db.db);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback_secret_do_not_use_in_prod",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      maxAge: 1000 * 60 * 60,
      httpOnly: true,
      sameSite: 'lax', // ✅ FIXED
      secure: false,   // ✅ for localhost (IMPORTANT)
    },
  })
);

/* ---------------- CSRF ---------------- */
const csrfProtection = csrf({ cookie: false });

/* ---------------- ROUTES ---------------- */
app.use(authRoute);


app.get("/csrf-token", csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
app.get("/me", csrfProtection, (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  res.json({
    user: req.session.user,
    csrfToken: req.csrfToken(), // ✅ NOW VALID
  });
});


/* ✅ APPLY CSRF ONLY TO MUTATING ROUTES */
app.use("/quiz", csrfProtection, quizRoutes);
app.use("/teacher", csrfProtection, teacherRoute);
app.use("/student", csrfProtection, studentRoutes);
app.use("/api", csrfProtection, cheatingRoutes);

/* -------------- ERROR HANDLER ------------- */
const errorHandler = require("./middlewares/errorHandler");
app.use(errorHandler);

/* ---------------- SERVER ---------------- */
// db.getConnection()
//   .then(() => {
//     app.listen(3000, () => {
//       console.log("database connection successful");
//       console.log("server running on port 3000");
//     });
//   })
//   .catch(console.error);
module.exports = app;