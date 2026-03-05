require("dotenv").config();
const express = require("express");
const app = express();
const db = require("./util/database");
const authRoute = require("./routes/auth");
const teacherRoute = require("./routes/teacher");
const studentRoutes = require("./routes/student");
const quizRoutes = require("./routes/quiz");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const cors = require("cors");
const csrf = require("csurf");
const path = require("path");


/* ---------------- CORS ---------------- */
app.use(
  cors({
    origin: "http://localhost:3001",
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ---------------- SESSION ---------------- */
const sessionStore = new MySQLStore({}, db.db);

app.use(
  session({
    secret: "my secret",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      maxAge: 1000 * 60 * 60,
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
    user: req.session.user,      // { id, role, name, ... }
    csrfToken: req.csrfToken(),  // IMPORTANT
  });
});


/* ✅ APPLY CSRF ONLY TO MUTATING ROUTES */
app.use("/quiz", csrfProtection, quizRoutes);
app.use("/teacher", csrfProtection, teacherRoute);
app.use("/student", csrfProtection, studentRoutes);

/* ---------------- SERVER ---------------- */
db.getConnection()
  .then(() => {
    app.listen(3000, () => {
      console.log("database connection successful");
      console.log("server running on port 3000");
    });
  })
  .catch(console.error);
