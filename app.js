const express = require('express');
const app = express();
const db = require('./util/database.js');
const authRoute = require('./routes/auth.js');
const teacherRoute = require('./routes/teacher.js');
const studentRoutes = require('./routes/student.js');
const session = require("express-session");
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const csrf = require("csurf");
app.use(cors({
  origin: "http://localhost:3001",
  credentials: true
}));



app.use(express.json()); // parse application/json
app.use(express.urlencoded({ extended: true })); // parse application/x-www-form-urlencoded
// --- MySQL session store setup ---
const sessionStore = new MySQLStore(
  {
    clearExpired: true,
    checkExpirationInterval: 1000 * 60 * 60, // clean expired sessions every hour
    expiration: 1000 * 60 * 60 * 24, // sessions last 1 day
    createDatabaseTable: true, // auto-create table if not exists
    schema: {
      tableName: 'sessions',
      columnNames: {
        session_id: 'session_id',
        expires: 'expires',
        data: 'data'
      }
    }
  },
  db.db // <-- use the actual pool object, see below how to fix this
);
app.use(session({
  secret: "my secret",
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    maxAge: 1000 * 60 * 60
  }
}));

// app.use((req, res, next) => {
//     console.log('--- Session Debug ---');
//     console.log('Session ID:', req.sessionID);
//     console.log('Session Data:', req.session);
//     console.log('---------------------\n');
//     next(); // important! pass control to the next middleware/route
// });
// --- CSRF protection middleware ---
const csrfProtection = csrf({ cookie: false }); // using session
app.use(authRoute);
app.use(csrfProtection);

// Route to send CSRF token to React
app.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});


app.use(teacherRoute);

app.use(studentRoutes);

db.getConnection().then(result => {

  app.listen(3000, () => {
    console.log("database connection successfull")
    console.log("server running on port 3000");
  });
}).catch(err => console.log("connection to the database failed", err));
