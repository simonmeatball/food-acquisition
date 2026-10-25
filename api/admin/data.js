import { database, ensureSchema, listPolls, sendError } from '../_db.js';
import { requireAdmin } from '../_admin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  if (!requireAdmin(req, res)) return;
  try {
    const sql = database();
    await ensureSchema(sql);
    const people = await sql`SELECT person_key AS id, display_name AS name, created_at AS "createdAt" FROM food_people ORDER BY display_name`;
    const meals = await sql`SELECT id, name, source_poll_id AS "sourcePollId", created_at AS "createdAt" FROM food_meals ORDER BY created_at DESC`;
    const feedback = await sql`SELECT f.id, f.meal_id AS "mealId", m.name AS "mealName", f.person_key AS "personId", f.name,
        f.calories, f.meal, f.rating, f.recommend, f.cost::float AS cost, f.created_at AS "createdAt"
      FROM meal_feedback f LEFT JOIN food_meals m ON m.id = f.meal_id ORDER BY f.created_at DESC`;
    const votes = await sql`SELECT v.id, v.poll_id AS "pollId", p.title AS "pollTitle", v.option_text AS option,
        v.voter_key AS "personId", v.voter_name AS name, v.created_at AS "createdAt"
      FROM food_poll_votes v JOIN food_polls p ON p.id = v.poll_id ORDER BY v.created_at DESC`;
    const polls = await listPolls(sql);
    return res.status(200).json({ people, meals, feedback, votes, polls });
  } catch (error) { return sendError(res, error); }
}
