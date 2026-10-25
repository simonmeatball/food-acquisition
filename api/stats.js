import { database, ensureSchema, sendError } from './_db.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
    const sql = database();
    await ensureSchema(sql);
    const [totals] = await sql`SELECT
      (SELECT COUNT(*)::int FROM food_meals) AS meals,
      (SELECT COUNT(*)::int FROM meal_feedback WHERE meal_id IS NOT NULL) AS reviews,
      (SELECT COUNT(*)::int FROM food_poll_votes) AS votes,
      COALESCE((SELECT SUM(calories)::int FROM meal_feedback WHERE meal_id IS NOT NULL), 0) AS calorie_score,
      COALESCE((SELECT ROUND(SUM(cost), 2)::float FROM meal_feedback WHERE meal_id IS NOT NULL), 0) AS spend,
      (SELECT ROUND(AVG(rating), 1)::float FROM meal_feedback WHERE meal_id IS NOT NULL) AS average_rating`;
    const people = await sql`SELECT name,
      COUNT(DISTINCT meal_id)::int AS meals,
      COUNT(*)::int AS reviews,
      SUM(calories)::int AS calorie_score,
      ROUND(SUM(cost), 2)::float AS spend,
      ROUND(AVG(rating), 1)::float AS average_rating
      FROM meal_feedback WHERE meal_id IS NOT NULL GROUP BY name ORDER BY meals DESC, calorie_score DESC`;
    const meals = await sql`SELECT m.id, m.name, m.source_poll_id, m.created_at,
      COUNT(f.id)::int AS reviews,
      COUNT(DISTINCT f.name)::int AS people,
      COALESCE(SUM(f.calories)::int, 0) AS calorie_score,
      COALESCE(ROUND(SUM(f.cost), 2)::float, 0) AS spend,
      ROUND(AVG(f.rating), 1)::float AS average_rating
      FROM food_meals m LEFT JOIN meal_feedback f ON f.meal_id = m.id
      GROUP BY m.id ORDER BY m.created_at DESC`;
    return res.status(200).json({
      totals,
      people: people.map((person) => ({ ...person, spend: Number(person.spend || 0) })),
      meals: meals.map((meal) => ({ ...meal, spend: Number(meal.spend || 0) })),
    });
  } catch (error) { return sendError(res, error); }
}
