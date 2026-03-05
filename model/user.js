const db = require('../util/database.js');
class user {
    constructor(name, email, password, role, isVerified, token, expiry) {
        this.name = name;
        this.email = email;
        this.password = password;
        this.role = role;
        this.isVerified = isVerified;
        this.token = token;
        this.expiry = expiry;
    }
    insert() {
        const query = `
      INSERT INTO users 
      (name,email,password,role,is_verified,verification_token,verification_token_expiry) 
      VALUES (?,?,?,?,?,?,?)
    `;
        return db.execute(query, [
            this.name,
            this.email,
            this.password,
            this.role,
            this.isVerified,
            this.token,
            this.expiry
        ]);
    }
    static findEmail(email) {
        const query = `
      SELECT id,name,email,password,role,
      is_verified,verification_token,verification_token_expiry 
      FROM users WHERE email=?`;
        return db.execute(query, [email]);
    }
}
module.exports = user;
