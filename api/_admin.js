import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'faq_admin_session';
const SESSION_SECONDS = 60 * 60 * 12;

function configured() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
}

function signature(payload) {
  return createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
}

function cookieValue(req) {
  const header = String(req.headers.cookie || '');
  const entry = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  return entry ? entry.slice(COOKIE.length + 1) : '';
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminConfigured() {
  return configured();
}

export function issueAdminSession(res, req) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = String(expires);
  const token = `${payload}.${signature(payload)}`;
  const secure = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`);
}

export function clearAdminSession(res, req) {
  const secure = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`);
}

export function verifyAdminPassword(value) {
  return configured() && safeEqual(value, process.env.ADMIN_PASSWORD);
}

export function hasAdminSession(req) {
  if (!configured()) return false;
  const token = cookieValue(req);
  const [expires, suppliedSignature, extra] = token.split('.');
  if (!expires || !suppliedSignature || extra || !/^\d+$/.test(expires) || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(suppliedSignature, signature(expires));
}

export function requireAdmin(req, res) {
  if (!configured()) {
    res.status(503).json({ error: 'Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET to enable the admin console.' });
    return false;
  }
  if (!hasAdminSession(req)) {
    res.status(401).json({ error: 'Admin login required.' });
    return false;
  }
  res.setHeader('Cache-Control', 'no-store');
  return true;
}
