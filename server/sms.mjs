/**
 * SMS opcional via Twilio (HTTPS nativo, sem npm).
 * Se TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_FROM_NUMBER estiverem definidos,
 * envia o código; caso contrário o fluxo continua só com OTP em store + terminal.
 */
import https from 'node:https';
import { URLSearchParams } from 'node:url';

function e164Br(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return `+55${d.slice(-11)}`;
}

/**
 * @returns {{ sent: boolean, error?: string }}
 */
export function sendTwilioOtpSms(phoneDigits, code) {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) {
    return { sent: false };
  }

  const to = e164Br(phoneDigits);
  if (!to) {
    return { sent: false, error: 'Número inválido para Twilio' };
  }

  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: `Guia-me Service: o seu código é ${code}. Não partilhe.`,
  }).toString();

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.twilio.com',
        port: 443,
        method: 'POST',
        path: `/2010-04-01/Accounts/${sid}/Messages.json`,
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ sent: true });
          } else {
            resolve({ sent: false, error: `Twilio HTTP ${res.statusCode}: ${data.slice(0, 200)}` });
          }
        });
      }
    );
    req.on('error', (e) => {
      resolve({ sent: false, error: String(e?.message || e) });
    });
    req.write(body);
    req.end();
  });
}
