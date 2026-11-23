const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
    if (!transporter) {
        if (process.env.SCHOOL_EMAIL && process.env.SCHOOL_EMAIL_PASSWORD) {
            transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.SCHOOL_EMAIL,
                    pass: process.env.SCHOOL_EMAIL_PASSWORD
                }
            });
        }
    }
    return transporter;
}

/**
 * Sends an email notification to the Admin.
 */
async function sendAdminNotification({ subject, title, details = {}, actionUrl, actionText }) {
    const adminEmail = process.env.SCHOOL_EMAIL;
    if (!adminEmail) return;

    const t = getTransporter();
    if (!t) {
        console.warn('[EmailService] SMTP credentials not configured. Notification email skipped.');
        return;
    }

    const detailRows = Object.entries(details).map(([key, value]) => `
        <tr>
            <td style="padding: 8px 12px; font-weight: 600; width: 140px; color: #64748b; border-bottom: 1px solid #f1f5f9;">${key}</td>
            <td style="padding: 8px 12px; font-weight: bold; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${value || 'N/A'}</td>
        </tr>
    `).join('');

    const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <div style="border-bottom: 2px solid #e67e22; padding-bottom: 16px; margin-bottom: 24px;">
                <h2 style="color: #1a3a5c; margin: 0; font-size: 20px;">Sri Bhuvanendra School &bull; Admin Alert</h2>
                <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">New Request Requiring Administrator Review</p>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #e67e22; padding: 18px; border-radius: 8px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px; color: #1e293b; font-size: 16px;">${title}</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    ${detailRows}
                </table>
            </div>
            ${actionUrl ? `
                <div style="text-align: center; margin-top: 24px;">
                    <a href="${actionUrl}" style="background: linear-gradient(135deg, #1a3a5c, #2a5298); color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
                        ${actionText || 'Open Admin Dashboard'}
                    </a>
                </div>
            ` : ''}
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 16px;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">This is an automated notification from Sri Bhuvanendra School Portal.</p>
        </div>
    `;

    try {
        await t.sendMail({
            from: `"SBS Portal Alerts" <${adminEmail}>`,
            to: adminEmail,
            subject: `[Admin Alert] ${subject}`,
            html
        });
        console.log(`[Admin Alert] Notification email delivered to ${adminEmail}: ${subject}`);
    } catch (err) {
        console.error('[Admin Alert Error] Failed to send notification email:', err.message);
    }
}

module.exports = {
    getTransporter,
    sendAdminNotification
};
