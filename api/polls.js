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
    await sql`INSERT INTO food_polls (id, title, description, options)
      VALUES (${String(id)}, ${String(title).trim()}, ${String(description).trim()}, ${JSON.stringify(cleanOptions)}::jsonb)`;
    return res.status(201).json((await listPolls(sql, String(id)))[0]);
  } catch (error) { return sendError(res, error); }
}
