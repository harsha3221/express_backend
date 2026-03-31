const mysql = require('mysql2');

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    },
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 15,
    queueLimit: Number(process.env.DB_QUEUE_LIMIT) || 15
});

module.exports = db.promise();
module.exports.db = db;
