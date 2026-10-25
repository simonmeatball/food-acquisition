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
    const people = await sql`WITH feedback_rollup AS (
        SELECT person_key, COUNT(DISTINCT meal_id)::int AS meals, COUNT(*)::int AS reviews,
          SUM(calories)::int AS calorie_score, ROUND(SUM(cost), 2)::float AS spend,
          ROUND(AVG(rating), 1)::float AS average_rating
        FROM meal_feedback WHERE person_key IS NOT NULL AND meal_id IS NOT NULL GROUP BY person_key
      ), vote_rollup AS (
        SELECT voter_key AS person_key, COUNT(*)::int AS votes FROM food_poll_votes
        WHERE voter_key IS NOT NULL GROUP BY voter_key
      ), poll_rollup AS (
        SELECT created_by_key AS person_key, COUNT(*)::int AS polls_created FROM food_polls
        WHERE created_by_key IS NOT NULL GROUP BY created_by_key
      )
      SELECT p.person_key, p.display_name AS name,
        COALESCE(f.meals, 0)::int AS meals, COALESCE(f.reviews, 0)::int AS reviews,
        COALESCE(f.calorie_score, 0)::int AS calorie_score, COALESCE(f.spend, 0)::float AS spend,
        f.average_rating, COALESCE(v.votes, 0)::int AS votes,
        COALESCE(c.polls_created, 0)::int AS polls_created
      FROM food_people p
      LEFT JOIN feedback_rollup f ON f.person_key = p.person_key
      LEFT JOIN vote_rollup v ON v.person_key = p.person_key
      LEFT JOIN poll_rollup c ON c.person_key = p.person_key
      ORDER BY meals DESC, votes DESC, polls_created DESC, p.display_name`;
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
