const db = require('../util/database.js');
class user {
    constructor(name, email, password, role) {
        this.name = name;
        this.email = email;
        this.password = password;
        this.role = role;
    }
    insert() {
        const query = 'insert into users (name,email,password,role) values (?,?,?,?)';
        return db.execute(query, [this.name, this.email, this.password, this.role]);

    }
    static findEmail(email) {
        const query = 'select  id,name,email,password,role from users where email=?';
        return db.execute(query, [email]);
    }
}
module.exports = user;