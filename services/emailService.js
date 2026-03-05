const { BrevoClient } = require("@getbrevo/brevo");

// Create Brevo client instance
const brevo = new BrevoClient({
    apiKey: process.env.BREVO_API_KEY,
});

const sendVerificationEmail = async (toEmail, verificationLink) => {
    return brevo.transactionalEmails.sendTransacEmail({
        sender: {
            email: process.env.EMAIL_FROM,
            name: "Quiz App",
        },
        to: [{ email: toEmail }],
        subject: "Verify Your Email",
        htmlContent: `
      <h2>Email Verification</h2>
      <p>Click the link below to verify your account:</p>
      <a href="${verificationLink}">${verificationLink}</a>
      <p>This link expires in ${process.env.TOKEN_EXPIRY_MINUTES} minutes.</p>
    `,
    });
};

module.exports = { sendVerificationEmail };