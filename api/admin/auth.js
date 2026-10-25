import { adminConfigured, clearAdminSession, hasAdminSession, issueAdminSession, verifyAdminPassword } from '../_admin.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    return res.status(200).json({ configured: adminConfigured(), authenticated: hasAdminSession(req) });
  }
  if (req.method === 'POST') {
    if (!adminConfigured()) return res.status(503).json({ error: 'Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in Vercel project settings.' });
    if (!verifyAdminPassword(req.body?.password)) return res.status(401).json({ error: 'Incorrect admin password.' });
    issueAdminSession(res, req);
    return res.status(200).json({ authenticated: true });
  }
  if (req.method === 'DELETE') {
    clearAdminSession(res, req);
    return res.status(200).json({ authenticated: false });
  }
  return res.status(405).json({ error: 'Method not allowed.' });
}
