const db = require("../config/database");

exports.reportCheating = async (req, res, next) => {
    try {
        // 1. Authorization Check
        if (!req.session.user || req.session.user.role !== "student") {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const studentId = req.session.user.student_id;
        const { quizId, event_type } = req.body;

        if (!quizId || !event_type) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // 2. Save in DB
        await db.execute(
            "INSERT INTO cheating_logs (student_id, quiz_id, event_type) VALUES (?, ?, ?)",
            [studentId, quizId, event_type]
        );


        const [results] = await db.execute(`
            SELECT u.name, u.email, q.teacher_id
            FROM users u
            JOIN students s ON s.user_id = u.id
            JOIN quizzes q ON q.id = ?
            WHERE s.id = ?
        `, [quizId, studentId]);

        const data = results[0];


        if (data && global.io) {
            const teacherRoom = `teacher_${data.teacher_id}`;

            console.log(`📢 Emitting cheating alert to ${teacherRoom}`);

            global.io.to(teacherRoom).emit("cheating_alert", {
                studentName: data.name,
                studentEmail: data.email,
                quizId: String(quizId), // Stringify for reliable frontend comparison
                event_type: event_type,
                time: new Date(),
            });
        } else {
            console.warn("⚠️ Cheating logged, but no teacher/student mapping found for real-time alert.");
        }

        res.json({ message: "Cheating reported successfully" });

    } catch (err) {
        console.error("❌ Error in reportCheating:", err);
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


        console.log(`Sending ${rows.length} logs for Quiz ${quizId}`);

        res.json(rows);
    } catch (err) {
        console.error("Controller Error:", err);
        next(err);
    }
};


exports.assignZero = async (req, res, next) => {
    // Destructure inputs and ensure they exist
    const { studentId, quizId, allAtOnce } = req.body;

    try {
        // 1. Identify which students to target
        let targetStudents = [];

        if (allAtOnce) {
            // Find all students who have logged cheating for this quiz
            const [cheaters] = await db.execute(
                "SELECT DISTINCT student_id FROM cheating_logs WHERE quiz_id = ?",
                [quizId]
            );

            // FIX: Map strictly and filter out any potential undefined values
            targetStudents = cheaters
                .map(c => c.student_id)
                .filter(id => id !== null && id !== undefined);

            console.log(`[AssignZero] Found ${targetStudents.length} cheaters for quiz ${quizId}`);
        } else {
            // Check if a single studentId was actually provided
            if (!studentId) {
                return res.status(400).json({ message: "No student selected to penalize." });
            }
            targetStudents = [studentId];
        }

        // 2. Final Guard: Stop if the array is empty or contains invalid data
        if (targetStudents.length === 0) {
            return res.status(400).json({ message: "No valid students found to penalize." });
        }

        // 3. Process each student
        for (let id of targetStudents) {
            console.log(`[AssignZero] Penalizing Student ID: ${id} for Quiz ID: ${quizId}`);

            // A. Update or Insert result as 0
            // Added NOW() to submitted_at for better record keeping
            await db.execute(`
                INSERT INTO quiz_results (student_id, quiz_id, total_marks, obtained_marks, submitted_at)
                VALUES (?, ?, (SELECT SUM(marks) FROM questions WHERE quiz_id = ?), 0, NOW())
                ON DUPLICATE KEY UPDATE obtained_marks = 0, submitted_at = NOW()
            `, [id, quizId, quizId]);

            // B. Mark the attempt as submitted so they can't continue saving answers
            await db.execute(
                "UPDATE student_quiz_attempts SET submitted = 1, submitted_at = NOW() WHERE student_id = ? AND quiz_id = ?",
                [id, quizId]
            );

            // C. WebSocket Signal: Kick the student out
            // Check both global.io and req.app fallback
            const io = global.io || req.app.get('socketio');
            if (io) {
                io.to(`student_${id}`).emit("force_logout_zero", {
                    message: "You have been disqualified by the teacher for this quiz."
                });
                console.log(`[Socket] Disqualification signal sent to room: student_${id}`);
            }
        }

        res.json({
            success: true,
            message: `Successfully assigned zero to ${targetStudents.length} student(s).`
        });

    } catch (err) {
        console.error("❌ Error in assignZero controller:", err);
        // This ensures the 500 error response is sent correctly
        next(err);
    }
};