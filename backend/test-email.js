require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
    console.log('Testing raw email sending via Nodemailer...');
    console.log(`Using Sender: ${process.env.SCHOOL_EMAIL}`);

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SCHOOL_EMAIL,
            pass: process.env.SCHOOL_EMAIL_PASSWORD,
        },
    });

    // We will ask you to change this to the email that is failing
    const targetEmail = 'insert-failing-email@gmail.com'; 

    const mailOptions = {
        from: `Test Script <${process.env.SCHOOL_EMAIL}>`,
        to: targetEmail,
        subject: `Test Delivery from Node.js`,
        text: `This is a test email. If you receive this, Nodemailer is working.`,
    };

    try {
        console.log(`Sending email to: ${targetEmail}...`);
        const info = await transporter.sendMail(mailOptions);
        console.log('\n✅ SUCCESS: Nodemailer successfully handed the email to Google!');
        console.log('Message ID:', info.messageId);
        console.log('Response from Google:', info.response);
        console.log('\nIf it says SUCCESS here but the email still does not arrive in the inbox (check Spam!), then Google is intentionally blocking the delivery because your school email account is new/unverified, NOT because of the code.');
    } catch (err) {
        console.error('\n❌ ERROR: Nodemailer failed to send the email.');
        console.error(err);
    }
}

testEmail();
