import { database, ensureSchema, listPolls, normalizePersonName, sendError, upsertPerson } from './_db.js';

export default async function handler(req, res) {
  try {
    const sql = database();
    await ensureSchema(sql);
    if (req.method === 'GET') return res.status(200).json(await listPolls(sql));
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const { id, title, description = '', options, creatorName } = req.body || {};
    const cleanOptions = Array.isArray(options) ? [...new Set(options.map((value) => String(value).trim()).filter(Boolean))] : [];
    if (!id || !String(title || '').trim() || !String(creatorName || '').trim() || String(creatorName).trim().length > 100 || cleanOptions.length < 2 || cleanOptions.length > 12) {
      return res.status(400).json({ error: 'Provide a poll creator, question, and between 2 and 12 distinct options.' });
    }
    const participants = Array.isArray(req.body?.participants)
      ? [...new Map(req.body.participants.map((name) => String(name).normalize('NFKC').trim().replace(/\s+/g, ' ')).filter(Boolean).map((name) => [normalizePersonName(name), name])).values()]
      : [];
    if (participants.length > 200 || participants.some((name) => name.length > 100)) {
      return res.status(400).json({ error: 'Provide no more than 200 expected voters; names must be 100 characters or fewer.' });
    }
    const person = await upsertPerson(sql, creatorName);
    await sql`INSERT INTO food_polls (id, title, description, options, participants, created_by_key)
      VALUES (${String(id)}, ${String(title).trim()}, ${String(description).trim()}, ${JSON.stringify(cleanOptions)}::jsonb, ${JSON.stringify(participants)}::jsonb, ${person.person_key})`;
    return res.status(201).json((await listPolls(sql, String(id)))[0]);
  } catch (error) { return sendError(res, error); }
}
