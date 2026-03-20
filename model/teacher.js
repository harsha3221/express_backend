const db = require('../config/database');
class Teacher {
    constructor(user_id, department) {
        this.user_id = user_id;
        this.department = department;
    }
    insert() {
        const query = 'insert into teachers (user_id,department) values (?,?)';
        return db.execute(query, [this.user_id, this.department]);
    }
    static findByUserId(userId) {
        const query = `
        SELECT t.id AS teacher_id, u.name, u.email, t.department
        FROM teachers t
        JOIN users u ON t.user_id = u.id
        WHERE t.user_id = ?;
        `;
        return db.execute(query, [userId]);
    }
    static getSubjects(teacherId) {
        const query = `
      SELECT id, name, code, description, semester, created_at
      FROM subjects
      WHERE teacher_id = ?;
    `;
        return db.execute(query, [teacherId]);
    }
    static createSubject(teacherId, name, code, description, semester) {
        const query = `
      INSERT INTO subjects (teacher_id, name, code, description, semester)
      VALUES (?, ?, ?, ?, ?);
    `;
        return db.execute(query, [teacherId, name, code, description, semester]);
    }
}
module.exports = Teacher;

