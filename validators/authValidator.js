// validators/authValidator.js

const EMAIL_DOMAIN = "@iiitdwd.ac.in";

/* ---------------- HELPER FUNCTIONS ---------------- */

function isStrongPassword(password) {
    // At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
    const regex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    return regex.test(password);
}

/* ---------------- SIGNUP VALIDATION ---------------- */

exports.validateSignup = (req, res, next) => {
    const {
        name,
        email,
        password,
        confirmPassword,
        role,
        department,
        year,
    } = req.body;

    // Name
    if (!name || name.trim().length < 2) {
        return res.status(400).json({
            message: "Name must be at least 2 characters long",
        });
    }

    // Email
    if (!email || !email.endsWith(EMAIL_DOMAIN)) {
        return res.status(400).json({
            message: `Only ${EMAIL_DOMAIN} email addresses are allowed`,
        });
    }

    // Password
    if (!password || !isStrongPassword(password)) {
        return res.status(400).json({
            message:
                "Password must be at least 8 characters and include uppercase, lowercase, number, and special character",
        });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({
            message: "Passwords do not match",
        });
    }

    // Role
    if (!role || !["teacher", "student"].includes(role)) {
        return res.status(400).json({
            message: "Role must be either teacher or student",
        });
    }

    // Role-specific fields
    if (role === "teacher" && !department) {
        return res.status(400).json({
            message: "Department is required for teachers",
        });
    }

    if (role === "student" && !year) {
        return res.status(400).json({
            message: "Year is required for students",
        });
    }

    next(); // ✅ validation passed
};

/* ---------------- LOGIN VALIDATION ---------------- */

exports.validateLogin = (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !email.endsWith(EMAIL_DOMAIN)) {
        return res.status(400).json({
            message: `Only ${EMAIL_DOMAIN} email addresses are allowed`,
        });
    }

    if (!password) {
        return res.status(400).json({
            message: "Password is required",
        });
    }

    next(); // ✅ validation passed
};
