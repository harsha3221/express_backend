const db = require('../util/database.js');

class Subject {
  constructor(teacher_id, name, code, description, semester) {
    this.teacher_id = teacher_id;
    this.name = name;
    this.code = code;
    this.description = description;
    this.semester = semester;
  }

  insert() {
    const query = `
      INSERT INTO subjects (teacher_id, name, code, description, semester)
      VALUES (?, ?, ?, ?, ?)
    `;
    return db.execute(query, [
      this.teacher_id,
      this.name,
      this.code,
      this.description,
      this.semester
    ]);
  }

  static getAllAvailable() {
    const query = `
      SELECT 
        s.id, s.name, s.code, s.semester, s.description,
        u.name AS teacher_name, t.department
      FROM subjects s
      JOIN teachers t ON s.teacher_id = t.id
      JOIN users u ON t.user_id = u.id
      ORDER BY s.semester;
    `;
    return db.execute(query);
  }

  static findById(subjectId) {
    const query = `
      SELECT 
        s.*, u.name AS teacher_name, t.department
      FROM subjects s
      JOIN teachers t ON s.teacher_id = t.id
      JOIN users u ON t.user_id = u.id
      WHERE s.id = ?;
    `;
    return db.execute(query, [subjectId]);
  }
}

module.exports = Subject;
