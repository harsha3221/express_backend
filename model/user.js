const db=require('../util/database.js');
class user{
    constructor(name,email,password){
        this.name=name;
        this.email=email;
        this.password=password;
    }
    insert(){
        const query='insert into users (name,email,password) values (?,?,?)';
        return db.execute(query,[this.name,this.email,this.password]);
        
    }
    static findEmail(email){
        const query='select  * from users where email=?';
        return db.execute(query,[email]);
    }
}
module.exports=user;