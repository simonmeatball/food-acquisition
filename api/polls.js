import { database, ensureSchema, listPolls, sendError } from './_db.js';

export default async function handler(req, res) {
  try {
    const sql = database();
    await ensureSchema(sql);
    if (req.method === 'GET') return res.status(200).json(await listPolls(sql));
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const { id, title, description = '', options } = req.body || {};
    const cleanOptions = Array.isArray(options) ? [...new Set(options.map((value) => String(value).trim()).filter(Boolean))] : [];
    if (!id || !String(title || '').trim() || cleanOptions.length < 2 || cleanOptions.length > 12) {
      return res.status(400).json({ error: 'Provide a question and between 2 and 12 distinct options.' });
    }
    const participants = Array.isArray(req.body?.participants)
      ? [...new Map(req.body.participants.map((name) => String(name).trim()).filter(Boolean).map((name) => [name.toLocaleLowerCase(), name])).values()]
      : [];
    if (participants.length > 200 || participants.some((name) => name.length > 100)) {
      return res.status(400).json({ error: 'Provide no more than 200 expected voters; names must be 100 characters or fewer.' });
    }
    await sql`INSERT INTO food_polls (id, title, description, options, participants)
      VALUES (${String(id)}, ${String(title).trim()}, ${String(description).trim()}, ${JSON.stringify(cleanOptions)}::jsonb, ${JSON.stringify(participants)}::jsonb)`;
    return res.status(201).json((await listPolls(sql, String(id)))[0]);
  } catch (error) { return sendError(res, error); }
}
