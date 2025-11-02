const Teacher = require('../model/teacher');
exports.getDashboard = async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !==
            'teacher'
        ) {
            return res.status(403).json({ message: 'unauthorized' });
        }// remove this later this is just for debugging purpose
        const userId = req.session.user.id;
        const [teacherRows] = await Teacher.findByUserId(userId);
        if (teacherRows.length === 0) {
            return res.status(404).json({ message: 'teacher not found' });//this is for debug purpose can be removed later

        }
        const teacher = teacherRows[0];
        console.log(teacher);
        const [subjects] = await Teacher.getSubjects(teacher.teacher_id);
        return res.status(200).json({ teacher, subjects });
    } catch (err) {
        console.error("dashboard error", err.message);
        res.status(500).json({ message: 'server error', error: err.message });
    }
};


// ✅ CREATE SUBJECT CONTROLLER
exports.createSubject = async (req, res) => {
    try {
        // 1️⃣ Check if logged in and role is teacher
        if (!req.session.user || req.session.user.role !== 'teacher') {
            return res.status(403).json({ message: 'Unauthorized access' });
        }

        // 2️⃣ Extract subject data
        const { name, code, description, semester } = req.body;
        if (!name || !code || !semester) {
            return res.status(400).json({ message: 'Name, code, and semester are required' });
        }

        // 3️⃣ Get teacher_id
        const userId = req.session.user.id;
        const [teacherRows] = await Teacher.findByUserId(userId);
        if (teacherRows.length === 0) {
            return res.status(404).json({ message: 'Teacher not found' });
        }

        const teacherId = teacherRows[0].teacher_id;

        // 4️⃣ Insert new subject
        const [result] = await Teacher.createSubject(
            teacherId,
            name,
            code,
            description || '',
            semester
        );

        // 5️⃣ Prepare response subject
        const subject = {
            id: result.insertId,
            name,
            code,
            description,
            semester,
        };

        return res.status(201).json({ message: 'Subject created successfully', subject });
    } catch (err) {
        console.error('Error creating subject:', err.message);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};
