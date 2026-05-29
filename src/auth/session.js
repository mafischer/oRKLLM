import crypto from 'crypto';
import { dbGetSetting, dbSetSetting } from '../db.js';

function getOrCreateCookieSecret() {
  let secret = dbGetSetting('cookie_secret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    dbSetSetting('cookie_secret', secret);
  }
  return secret;
}

const cookieSecret = getOrCreateCookieSecret();

export function signCookie(userId, username, role) {
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${userId}|${username}|${role}|${expires}`;
  const hmac = crypto.createHmac('sha256', cookieSecret).update(payload).digest('hex');
  return `${payload}|${hmac}`;
}

export function verifyCookie(cookieValue) {
  if (!cookieValue) return null;
  try {
    const parts = cookieValue.split('|');
    if (parts.length === 5) {
      const [userId, username, role, expiresStr, signature] = parts;
      const expires = parseInt(expiresStr);
      if (Date.now() > expires) return null;
      const payload = `${userId}|${username}|${role}|${expires}`;
      const expected = crypto.createHmac('sha256', cookieSecret).update(payload).digest('hex');
      if (signature === expected) return { id: userId, username, role };
    } else if (parts.length === 3) {
      const [username, expiresStr, signature] = parts;
      const expires = parseInt(expiresStr);
      if (Date.now() > expires) return null;
      const payload = `${username}|${expires}`;
      const expected = crypto.createHmac('sha256', cookieSecret).update(payload).digest('hex');
      if (signature === expected) return { id: 'local-admin', username, role: 'admin' };
    }
  } catch (e) {}
  return null;
}

export function issueSessionCookie(reply, user) {
  const cookie = signCookie(user.id, user.username, user.role);
  reply.setCookie('orkllm_session', cookie, {
    path: '/', httpOnly: true, secure: false, sameSite: 'lax', maxAge: 24 * 60 * 60,
  });
}
