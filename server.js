require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");

// Ensure app.js exports: module.exports = { app, sessionMiddleware };
const { app, sessionMiddleware } = require("./app");
const server = http.createServer(app);

const allowedOrigins = process.env.frontend_url ? process.env.frontend_url.split(',') : [];

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        credentials: true,
    },
});

// 1. Attach session middleware to Socket.io engine
io.engine.use(sessionMiddleware);

// 2. Make io accessible globally for your controllers (like reportCheating)
global.io = io;

io.on("connection", (socket) => {
    // Access the session user
    const user = socket.request.session?.user;

    if (!user) {
        console.log(`⚠️ Anonymous connection rejected: ${socket.id}`);
        return socket.disconnect(true);
    }

    console.log(`✨ Connected: ${user.name} (Role: ${user.role})`);

    // 3. Teacher joins a persistent room based on their teacher_id
    if (user.role === "teacher" && user.teacher_id) {
        const teacherRoom = `teacher_${user.teacher_id}`;
        socket.join(teacherRoom);
        console.log(`👨‍🏫 Monitoring Active: ${user.name} joined room ${teacherRoom}`);
    }

    // 4. Student joins a room based on their student_id (useful for targeted alerts)
    if (user.role === "student" && user.student_id) {
        const studentRoom = `student_${user.student_id}`;
        socket.join(studentRoom);
        console.log(`🎓 Student Active: ${user.name} in room ${studentRoom}`);
    }

    socket.on("disconnect", () => {
        console.log(`🔌 ${user.name} disconnected.`);
    });
});

// Catch potential socket engine errors (like session store connection issues)
io.engine.on("connection_error", (err) => {
    console.error("❌ Socket Connection Error:", err.message);
});

const port = process.env.port || 3000;
server.listen(port, () => {
    console.log(`🚀 Server + Socket running on port ${port}`);
});