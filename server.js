require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const db = require("./config/database");
const server = http.createServer(app);


const io = new Server(server, {
    cors: {
        origin: process.env.frontend_url,
        credentials: true,
    },
});

global.io = io;


io.on("connection", (socket) => {
    const user = socket.request.session?.user;

    if (!user) {
        console.log(`⚠️ Anonymous connection rejected: ${socket.id}`);
        return socket.disconnect(true);
    }

    console.log(`✨ Connected: ${user.name} (Role: ${user.role})`);

    // Automatic Secure Room Joining
    if (user.role === "teacher" && user.teacher_id) {
        socket.join(`teacher_${user.teacher_id}`);
    }

    if (user.role === "student" && user.student_id) {
        socket.join(`student_${user.student_id}`);
    }

    socket.on("disconnect", () => {
        console.log(`🔌 ${user.name} disconnected.`);
    });
});
const port = process.env.port || 3000
server.listen(port, () => {
    console.log("🚀 Server + Socket running on port 3000");
});