import { database, ensureSchema, listPolls, sendError } from './_db.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
    const sql = database();
    await ensureSchema(sql);

    const [polls, meals, responseRows] = await Promise.all([
      listPolls(sql),
      sql`SELECT id, name, source_poll_id, created_at
        FROM food_meals ORDER BY created_at DESC`,
      sql`SELECT COUNT(*)::int AS count FROM meal_feedback`,
    ]);

    return res.status(200).json({
      polls,
      meals: meals.map((row) => ({
        id: row.id,
        name: row.name,
        sourcePollId: row.source_poll_id,
        createdAt: row.created_at,
      })),
      responseCount: responseRows[0]?.count || 0,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
