import { database, ensureSchema, listPolls, sendError } from './_db.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const id = String(req.query.id || '');
    const option = String(req.body?.option || '');
    const voterName = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
    if (!id || !option || !voterName) return res.status(400).json({ error: 'Poll id, your name, and an option are required.' });
    if (voterName.length > 100) return res.status(400).json({ error: 'Name must be 100 characters or fewer.' });
    const sql = database();
    await ensureSchema(sql);
    const poll = (await listPolls(sql, id))[0];
    if (!poll) return res.status(404).json({ error: 'Poll not found.' });
    if (!poll.active) return res.status(409).json({ error: 'Voting is closed for this poll.' });
    if (!poll.options.includes(option)) return res.status(400).json({ error: 'That option is not part of this poll.' });
    const voterKey = voterName.toLocaleLowerCase();
    const inserted = await sql`INSERT INTO food_poll_votes (poll_id, option_text, voter_name, voter_key)
      VALUES (${id}, ${option}, ${voterName}, ${voterKey})
      ON CONFLICT (poll_id, voter_key) WHERE voter_key IS NOT NULL DO NOTHING
      RETURNING id`;
    if (!inserted.length) return res.status(409).json({ error: 'That name has already voted in this poll.' });
    return res.status(201).json((await listPolls(sql, id))[0]);
  } catch (error) { return sendError(res, error); }
}
