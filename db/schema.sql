-- =========================
-- DATABASE
-- =========================
CREATE DATABASE IF NOT EXISTS some_app;
USE some_app;

-- =========================
-- USERS
-- =========================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('teacher', 'student') NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    verification_token_expiry DATETIME NULL DEFAULT NULL
);

-- =========================
-- TEACHERS
-- =========================
CREATE TABLE teachers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNIQUE,
  department VARCHAR(100),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================
-- STUDENTS
-- =========================
CREATE TABLE students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNIQUE,
  roll_number VARCHAR(50),
  year INT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================
-- SUBJECTS
-- =========================
CREATE TABLE subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(10) NOT NULL,
  description TEXT,
  semester INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT unique_teacher_code UNIQUE (teacher_id, code)
);

-- =========================
-- STUDENT-SUBJECT MAPPING
-- =========================
CREATE TABLE student_subject (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT,
  subject_id INT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE (student_id, subject_id)
);

-- =========================
-- QUIZZES
-- =========================
CREATE TABLE quizzes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id INT NOT NULL,
  teacher_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL,
  start_time DATETIME,
  end_time DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  results_published BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

-- =========================
-- QUESTIONS
-- =========================
CREATE TABLE questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NOT NULL,
  question_text TEXT NOT NULL,
  image_url VARCHAR(255),
  marks INT DEFAULT 1,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

-- =========================
-- OPTIONS
-- =========================
CREATE TABLE options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  option_text TEXT,
  image_url VARCHAR(255),
  is_correct BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- =========================
-- STUDENT QUIZ ATTEMPTS
-- =========================
CREATE TABLE student_quiz_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  quiz_id INT NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  submitted BOOLEAN DEFAULT FALSE,
  submitted_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  UNIQUE (student_id, quiz_id)
);

-- =========================
-- STUDENT QUIZ ANSWERS
-- =========================
CREATE TABLE student_quiz_answers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  quiz_id INT NOT NULL,
  question_id INT NOT NULL,
  option_id INT,
  answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE SET NULL
);

-- =========================
-- QUIZ RESULTS
-- =========================
CREATE TABLE quiz_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  quiz_id INT NOT NULL,
  total_marks INT DEFAULT 0,
  obtained_marks INT DEFAULT 0,
  evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

-- =========================
-- INDEXES (PERFORMANCE)
-- =========================
CREATE INDEX idx_subject_teacher ON subjects (teacher_id);

CREATE INDEX idx_questions_quiz ON questions (quiz_id);

CREATE INDEX idx_options_question ON options (question_id);

CREATE INDEX idx_quizzes_teacher ON quizzes (teacher_id);

CREATE INDEX idx_quizzes_subject ON quizzes (subject_id);

CREATE INDEX idx_quizzes_time ON quizzes (start_time, end_time);

CREATE INDEX idx_sqa_student_quiz_question 
ON student_quiz_answers (student_id, quiz_id, question_id);

CREATE INDEX idx_sqa_quiz_submitted 
ON student_quiz_attempts (quiz_id, submitted);

CREATE INDEX idx_quiz_results_student_quiz 
ON quiz_results (student_id, quiz_id);