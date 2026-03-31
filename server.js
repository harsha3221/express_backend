require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const db = require("./config/database");

/* ---------------- CREATE HTTP SERVER ---------------- */
const server = http.createServer(app);

/* ---------------- SOCKET.IO ---------------- */
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3001",
        credentials: true,
    },
});

global.io = io;

/* ---------------- SOCKET EVENTS ---------------- */
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Teacher joins their room
    socket.on("joinTeacherRoom", (teacherId) => {
        socket.join(`teacher_${teacherId}`);
        console.log(`Teacher joined room teacher_${teacherId}`);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

/* ---------------- START SERVER ---------------- */
db.getConnection()
    .then(() => {
        server.listen(3000, () => {
            console.log("✅ DB connected");
            console.log("🚀 Server + Socket running on port 3000");
        });
    })
    .catch(console.error);