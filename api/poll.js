import { database, ensureSchema, listPolls, sendError } from './_db.js';

export default async function handler(req, res) {
  try {
    const id = String(req.query.id || '');
    if (!id) return res.status(400).json({ error: 'Poll id is required.' });
    const sql = database();
    await ensureSchema(sql);
    if (req.method === 'GET') {
      const poll = (await listPolls(sql, id))[0];
      return poll ? res.status(200).json(poll) : res.status(404).json({ error: 'Poll not found.' });
    }
    if (req.method === 'PATCH') {
      const active = req.body?.active;
      if (typeof active !== 'boolean') return res.status(400).json({ error: 'Active must be true or false.' });
      const result = await sql`UPDATE food_polls SET active = ${active} WHERE id = ${id} RETURNING id`;
      if (!result.length) return res.status(404).json({ error: 'Poll not found.' });
      return res.status(200).json((await listPolls(sql, id))[0]);
    }
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) { return sendError(res, error); }
}
