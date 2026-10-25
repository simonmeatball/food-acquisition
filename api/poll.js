import { database, ensureSchema, listPolls, normalizePersonName, sendError } from './_db.js';

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
    if (req.method === 'PATCH' || req.method === 'DELETE') {
      const poll = (await listPolls(sql, id))[0];
      if (!poll) return res.status(404).json({ error: 'Poll not found.' });
      const ownerKey = normalizePersonName(req.body?.ownerName);
      if (!poll.createdByKey) return res.status(403).json({ error: 'This older poll has no recorded creator and cannot be managed.' });
      if (!ownerKey || ownerKey !== poll.createdByKey) return res.status(403).json({ error: 'Only the poll creator name can manage this poll.' });

      if (req.method === 'DELETE') {
        await sql`DELETE FROM food_polls WHERE id = ${id}`;
        return res.status(200).json({ deleted: true, id });
      }

      const body = req.body || {};
      const hasActive = typeof body.active === 'boolean';
      const hasTitle = typeof body.title === 'string';
      const hasDescription = typeof body.description === 'string';
      const hasOptions = Array.isArray(body.options);
      const hasParticipants = Array.isArray(body.participants);
      const title = hasTitle ? body.title.trim() : poll.title;
      const description = hasDescription ? body.description.trim() : poll.description;
      const options = hasOptions ? [...new Set(body.options.map((value) => String(value).trim()).filter(Boolean))] : poll.options;
      const participants = hasParticipants
        ? [...new Map(body.participants.map((name) => String(name).normalize('NFKC').trim().replace(/\s+/g, ' ')).filter(Boolean).map((name) => [normalizePersonName(name), name])).values()]
        : poll.participants;
      if (!title || options.length < 2 || options.length > 12) {
        return res.status(400).json({ error: 'A question and between 2 and 12 distinct options are required.' });
      }
      if (participants.length > 200 || participants.some((name) => name.length > 100)) {
        return res.status(400).json({ error: 'Provide no more than 200 expected voters; names must be 100 characters or fewer.' });
      }
      if (hasOptions && poll.options.some((option) => (poll.votes[option] || 0) > 0 && !options.includes(option))) {
        return res.status(409).json({ error: 'An option with recorded votes cannot be removed. Keep it or create a new poll.' });
      }
      const active = hasActive ? body.active : poll.active;
      await sql`UPDATE food_polls SET title = ${title}, description = ${description},
        options = ${JSON.stringify(options)}::jsonb, participants = ${JSON.stringify(participants)}::jsonb,
        active = ${active} WHERE id = ${id}`;
      return res.status(200).json((await listPolls(sql, id))[0]);
    }
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) { return sendError(res, error); }
}
