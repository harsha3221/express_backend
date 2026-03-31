const db = require("../config/database");

exports.reportCheating = async (req, res, next) => {
    try {
        if (!req.session.user || req.session.user.role !== "student") {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const studentId = req.session.user.student_id;
        const { quizId, event_type } = req.body;

        // 1. Save in DB
        await db.execute(
            "INSERT INTO cheating_logs (student_id, quiz_id, event_type) VALUES (?, ?, ?)",
            [studentId, quizId, event_type]
        );

        // 2. Get student + teacher info
        const [[data]] = await db.execute(`
      SELECT u.name, u.email, q.teacher_id
      FROM users u
      JOIN students s ON s.user_id = u.id
      JOIN quizzes q ON q.id = ?
      WHERE s.id = ?
    `, [quizId, studentId]);

        // 3. Emit to teacher
        global.io.to(`teacher_${data.teacher_id}`).emit("cheating_alert", {
            studentName: data.name,
            studentEmail: data.email,
            quizId,
            event_type,
            time: new Date(),
        });

        res.json({ message: "Cheating reported" });

    } catch (err) {
        next(err);
    }
};

exports.getCheatingLogs = async (req, res, next) => {
    try {
        const { quizId } = req.params;

        // Destructure to get ONLY the rows (the first element)
        const [rows] = await db.execute(`
            SELECT 
                cl.event_type, 
                cl.created_at AS time, 
                u.name AS studentName, 
                u.email AS studentEmail,
                cl.quiz_id AS quizId
            FROM cheating_logs cl
            JOIN students s ON cl.student_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE cl.quiz_id = ?
            ORDER BY cl.created_at DESC
        `, [quizId]);

        // Explicitly log this to your NODE terminal to see what's being sent
        console.log(`Sending ${rows.length} logs for Quiz ${quizId}`);

        res.json(rows); // Send the array of objects directly
    } catch (err) {
        console.error("Controller Error:", err);
        next(err);
    }
};