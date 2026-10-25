import { database, ensureSchema, listPolls, sendError } from './_db.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const id = String(req.query.id || '');
    const option = String(req.body?.option || '');
    if (!id || !option) return res.status(400).json({ error: 'Poll id and option are required.' });
    const sql = database();
    await ensureSchema(sql);
    const poll = (await listPolls(sql, id))[0];
    if (!poll) return res.status(404).json({ error: 'Poll not found.' });
    if (!poll.active) return res.status(409).json({ error: 'Voting is closed for this poll.' });
    if (!poll.options.includes(option)) return res.status(400).json({ error: 'That option is not part of this poll.' });
    await sql`INSERT INTO food_poll_votes (poll_id, option_text) VALUES (${id}, ${option})`;
    return res.status(201).json((await listPolls(sql, id))[0]);
  } catch (error) { return sendError(res, error); }
}
