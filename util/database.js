const mysql=require('mysql2');
const db=mysql.createPool({
    host:'localhost',
    user:'root',
    password:'Loyola@3221',
    database:'some_app',
    connectionLimit:15,
    queueLimit:15
});
module.exports=db.promise();
module.exports.db=db;
