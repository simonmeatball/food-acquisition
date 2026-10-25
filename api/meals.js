import { database, ensureSchema, sendError } from './_db.js';

export default async function handler(req, res) {
  try {
    const sql = database();
    await ensureSchema(sql);

    if (req.method === 'GET') {
      const rows = await sql`SELECT m.id, m.name, m.source_poll_id, m.created_at, p.title AS poll_title
        FROM food_meals m LEFT JOIN food_polls p ON p.id = m.source_poll_id
        ORDER BY m.created_at DESC`;
      return res.status(200).json(rows.map((row) => ({
        id: row.id, name: row.name, sourcePollId: row.source_poll_id,
        pollTitle: row.poll_title, createdAt: row.created_at,
      })));
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const id = String(req.body?.id || '').trim();
    const name = String(req.body?.name || '').trim();
    const sourcePollId = req.body?.sourcePollId ? String(req.body.sourcePollId) : null;
    if (!id || !name || name.length > 160) {
      return res.status(400).json({ error: 'A meal name of 1–160 characters is required.' });
    }
    if (sourcePollId) {
      const [existing] = await sql`SELECT id, name, source_poll_id, created_at
        FROM food_meals WHERE source_poll_id = ${sourcePollId}`;
      if (existing) return res.status(200).json({
        id: existing.id, name: existing.name, sourcePollId: existing.source_poll_id,
        createdAt: existing.created_at,
      });
      const [poll] = await sql`SELECT id FROM food_polls WHERE id = ${sourcePollId}`;
      if (!poll) return res.status(404).json({ error: 'The source poll was not found.' });
    }
    const [row] = await sql`INSERT INTO food_meals (id, name, source_poll_id)
      VALUES (${id}, ${name}, ${sourcePollId})
      RETURNING id, name, source_poll_id, created_at`;
    return res.status(201).json({
      id: row.id, name: row.name, sourcePollId: row.source_poll_id, createdAt: row.created_at,
    });
  } catch (error) { return sendError(res, error); }
}
