import { connect } from 'cloudflare:sockets';

async function sendGmailSmtp({ to, otp }) {
  const user = 'srimadbhuvanendraeducationalin@gmail.com';
  const pass = 'mldxxrfwpwsijjgh'; // 16-char app password

  const socket = connect(
    { hostname: 'smtp.gmail.com', port: 465 },
    { secureTransport: 'on', allowHalfOpen: false }
  );

  await socket.opened;

  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  async function readResponse() {
    const { value, done } = await reader.read();
    if (done) return '';
    return decoder.decode(value);
  }

  async function sendCommand(cmd) {
    await writer.write(encoder.encode(cmd + '\r\n'));
    return await readResponse();
  }

  // 1. Initial greeting
  const greeting = await readResponse();
  if (!greeting.startsWith('220')) {
    throw new Error('Invalid SMTP greeting: ' + greeting);
  }

  // 2. EHLO
  await sendCommand('EHLO worker.edge');

  // 3. AUTH LOGIN
  await sendCommand('AUTH LOGIN');
  await sendCommand(btoa(user));
  const authRes = await sendCommand(btoa(pass));
  if (!authRes.startsWith('235')) {
    throw new Error('SMTP Authentication failed: ' + authRes);
  }

  // 4. MAIL FROM & RCPT TO
  await sendCommand(`MAIL FROM:<${user}>`);
  const rcptRes = await sendCommand(`RCPT TO:<${to}>`);
  if (!rcptRes.startsWith('250')) {
    throw new Error('SMTP RCPT TO rejected: ' + rcptRes);
  }

  // 5. DATA
  await sendCommand('DATA');

  const boundary = '----=_Part_' + Math.random().toString(36).substring(2);
  const subject = 'Password Reset Verification PIN - Shri Basaveshwar English Medium School';

  const textBody = `Shri Basaveshwar English Medium School (SBEI)\n\nYour Password Reset Verification PIN is: ${otp}\n\nThis PIN is valid for 15 minutes. Enter it on the password reset page to choose a new password.\n\nIf you did not request this verification code, please ignore this email or contact school administration at ${user}.`;

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 580px; margin: 0 auto; padding: 0; border: 1px solid #dbe2ea; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
        <div style="background: linear-gradient(135deg, #0f3057 0%, #1a4f8b 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">Shri Basaveshwar English Medium School</h1>
            <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9; color: #e2e8f0;">Srimad Bhuvanendra Educational Institutions (SBEI)</p>
        </div>
        <div style="padding: 32px 28px; color: #2d3748; line-height: 1.6;">
            <h2 style="color: #0f3057; margin-top: 0; font-size: 18px; border-bottom: 2px solid #edf2f7; padding-bottom: 12px;">Password Reset Request</h2>
            <p style="font-size: 15px; margin-bottom: 20px;">Dear Student / Staff Member,</p>
            <p style="font-size: 15px; margin-bottom: 24px;">We received a request to reset the password for your account. Please use the following 6-digit Verification PIN to proceed:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <div style="display: inline-block; background: #f0f4f9; border: 2px dashed #0f3057; border-radius: 10px; padding: 16px 36px;">
                    <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f3057; font-family: monospace;">${otp}</span>
                </div>
                <p style="color: #718096; font-size: 13px; margin-top: 10px;">Valid for 15 minutes</p>
            </div>
            
            <div style="background-color: #f7fafc; border-left: 4px solid #0f3057; padding: 14px 18px; border-radius: 4px; margin: 24px 0;">
                <p style="margin: 0; font-size: 13px; color: #4a5568;">
                    <strong>Important Security Notice:</strong> Never share this PIN with anyone. School staff will never ask for your verification code or password.
                </p>
            </div>
            
            <p style="font-size: 14px; color: #4a5568;">If you did not request this password reset, you can safely ignore this email. Your current password will remain unchanged.</p>
        </div>
        <div style="background-color: #edf2f7; padding: 18px 24px; text-align: center; font-size: 12px; color: #718096; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0 0 4px;"><strong>Shri Basaveshwar English Medium School</strong></p>
            <p style="margin: 0 0 6px;">Official Portal: <a href="https://school-webpage.yuvarajkhot2005.workers.dev" style="color: #0f3057; text-decoration: none; font-weight: 600;">school-webpage.yuvarajkhot2005.workers.dev</a></p>
            <p style="margin: 0;">For assistance, contact: <a href="mailto:${user}" style="color: #0f3057;">${user}</a></p>
        </div>
    </div>
  `;

  const rawMessage = [
    `From: "Shri Basaveshwar English Medium School" <${user}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    textBody,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    htmlBody,
    ``,
    `--${boundary}--`,
    `.`
  ].join('\r\n');

  const sendResult = await sendCommand(rawMessage);
  await sendCommand('QUIT');

  try { writer.releaseLock(); } catch (_) {}
  try { reader.releaseLock(); } catch (_) {}
  try { await socket.close(); } catch (_) {}

  return sendResult;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Internal Email Dispatch Bridge via Cloudflare Sockets (TLS Port 465)
    if (url.pathname === '/api/worker-send-email' && request.method === 'POST') {
      const authKey = request.headers.get('X-Worker-Email-Key');
      if (authKey !== 'sbei-secure-email-key-2026') {
        return new Response(JSON.stringify({ error: 'Unauthorized email bridge request' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        const body = await request.json();
        const { to, otp } = body;
        if (!to || !otp) {
          return new Response(JSON.stringify({ error: 'Missing to or otp parameters' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const result = await sendGmailSmtp({ to, otp });
        return new Response(JSON.stringify({ success: true, result }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Proxy API and uploads to the live backend server
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
      const backendUrl = 'https://school-webpage-1uky.onrender.com' + url.pathname + url.search;
      const headers = new Headers();

      // Forward client headers, stripping Cloudflare internal headers that trigger Render WAF
      for (const [key, value] of request.headers.entries()) {
        const lower = key.toLowerCase();
        if (!lower.startsWith('cf-') && lower !== 'cdn-loop') {
          headers.set(key, value);
        }
      }

      headers.set('host', 'school-webpage-1uky.onrender.com');

      const proxyReq = new Request(backendUrl, {
        method: request.method,
        headers: headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow',
        duplex: 'half'
      });

      return fetch(proxyReq);
    }

    // Serve static frontend assets (HTML, CSS, JS, images)
    return env.ASSETS.fetch(request);
  }
};
