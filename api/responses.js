import { database, ensureSchema, sendError } from './_db.js';

export default async function handler(req, res) {
  try {
    const sql = database();
    await ensureSchema(sql);
    if (req.method === 'GET') {
      const [summary] = await sql`SELECT COUNT(*)::int AS count FROM meal_feedback`;
      return res.status(200).json({ count: summary.count });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const calories = Number(body.calories);
    const rating = Number(body.rating);
    const meal = String(body.meal || '');
    const recommend = String(body.recommend || '');
    const cost = Number(body.cost);
    if (!name || !['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(meal) ||
      !Number.isInteger(calories) || calories < 1 || calories > 10 ||
      !Number.isInteger(rating) || rating < 1 || rating > 10 ||
      !['Yes', 'No'].includes(recommend) || !Number.isFinite(cost) || cost < 0) {
      return res.status(400).json({ error: 'Please complete each meal feedback field with a valid value.' });
    }
    const [row] = await sql`INSERT INTO meal_feedback (name, calories, meal, rating, recommend, cost)
      VALUES (${name}, ${calories}, ${meal}, ${rating}, ${recommend}, ${cost})
      RETURNING id, name, calories, meal, rating, recommend, cost, created_at`;
    return res.status(201).json({ id: row.id, name: row.name, calories: row.calories, meal: row.meal,
      rating: row.rating, recommend: row.recommend, cost: Number(row.cost), createdAt: row.created_at });
  } catch (error) { return sendError(res, error); }
}
