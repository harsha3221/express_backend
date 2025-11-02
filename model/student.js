const db = require('../util/database.js');

class Student {
  constructor(user_id, roll_number, year) {
    this.user_id = user_id;
    this.roll_number = roll_number;
    this.year = year;
  }

  insert() {
    const query = `
      INSERT INTO students (user_id, roll_number, year)
      VALUES (?, ?, ?)
    `;
    return db.execute(query, [this.user_id, this.roll_number, this.year]);
  }

  static findByUserId(userId) {
    const query = `
      SELECT s.id AS student_id, s.roll_number, s.year
      FROM students s
      WHERE s.user_id = ?;
    `;
    return db.execute(query, [userId]);
  }

  static joinSubject(studentId, subjectId) {
    const query = `
      INSERT INTO student_subject (student_id, subject_id)
      VALUES (?, ?)
    `;
    return db.execute(query, [studentId, subjectId]);
  }

  static getJoinedSubjects(studentId) {
    const query = `
      SELECT 
        s.id, s.name, s.code, s.semester, s.description,
        u.name AS teacher_name, t.department, ss.joined_at
      FROM student_subject ss
      JOIN subjects s ON ss.subject_id = s.id
      JOIN teachers t ON s.teacher_id = t.id
      JOIN users u ON t.user_id = u.id
      WHERE ss.student_id = ?;
    `;
    return db.execute(query, [studentId]);
  }

  static isAlreadyJoined(studentId, subjectId) {
    const query = `
      SELECT * FROM student_subject
      WHERE student_id = ? AND subject_id = ?
    `;
    return db.execute(query, [studentId, subjectId]);
  }
}

module.exports = Student;
