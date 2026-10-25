import { database, ensureSchema, normalizePersonName, sendError, upsertPerson } from '../_db.js';
import { requireAdmin } from '../_admin.js';

const meals = new Set(['Breakfast', 'Lunch', 'Dinner', 'Snack']);

export default async function handler(req, res) {
  if (!['PATCH', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  if (!requireAdmin(req, res)) return;
  const { type, id } = req.body || {};
  if (!['people', 'meals', 'feedback', 'votes', 'polls'].includes(type) || !id) {
    return res.status(400).json({ error: 'A valid record type and id are required.' });
  }
  try {
    const sql = database();
    await ensureSchema(sql);
    if (req.method === 'DELETE') {
      if (type === 'feedback') await sql`DELETE FROM meal_feedback WHERE id = ${id}`;
      else if (type === 'votes') await sql`DELETE FROM food_poll_votes WHERE id = ${id}`;
      else if (type === 'meals') {
        await sql`DELETE FROM meal_feedback WHERE meal_id = ${id}`;
        await sql`DELETE FROM food_meals WHERE id = ${id}`;
      } else if (type === 'polls') await sql`DELETE FROM food_polls WHERE id = ${id}`;
      else {
        const person = String(id);
        await sql`DELETE FROM food_poll_votes WHERE voter_key = ${person}`;
        const legacyVotes = await sql`SELECT id, voter_name FROM food_poll_votes WHERE voter_key IS NULL AND voter_name IS NOT NULL`;
        for (const vote of legacyVotes) {
          if (normalizePersonName(vote.voter_name) === person) await sql`DELETE FROM food_poll_votes WHERE id = ${vote.id}`;
        }
        await sql`DELETE FROM meal_feedback WHERE person_key = ${person}`;
        await sql`DELETE FROM food_polls WHERE created_by_key = ${person}`;
        await sql`DELETE FROM food_people WHERE person_key = ${person}`;
      }
      return res.status(200).json({ deleted: true });
    }

    const body = req.body || {};
    if (type === 'people') {
      const name = String(body.name || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
      if (!name || name.length > 100) return res.status(400).json({ error: 'Name must be 1–100 characters.' });
      const legacyVotes = await sql`SELECT id, voter_name FROM food_poll_votes WHERE voter_key IS NULL AND voter_name IS NOT NULL`;
      const [person] = await sql`UPDATE food_people SET display_name = ${name} WHERE person_key = ${id} RETURNING person_key`;
      if (!person) return res.status(404).json({ error: 'Person not found.' });
      await sql`UPDATE meal_feedback SET name = ${name} WHERE person_key = ${id}`;
      await sql`UPDATE food_poll_votes SET voter_name = ${name} WHERE voter_key = ${id}`;
      for (const vote of legacyVotes) {
        if (normalizePersonName(vote.voter_name) === String(id)) await sql`UPDATE food_poll_votes SET voter_name = ${name} WHERE id = ${vote.id}`;
      }
    } else if (type === 'meals') {
      const name = String(body.name || '').trim();
      if (!name || name.length > 160) return res.status(400).json({ error: 'Meal name must be 1–160 characters.' });
      const [row] = await sql`UPDATE food_meals SET name = ${name} WHERE id = ${id} RETURNING id`;
      if (!row) return res.status(404).json({ error: 'Meal not found.' });
    } else if (type === 'feedback') {
      const name = String(body.name || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
      const mealId = String(body.mealId || '').trim();
      const calories = Number(body.calories), rating = Number(body.rating), cost = Number(body.cost);
      const meal = String(body.meal || ''), recommend = String(body.recommend || '');
      if (!name || name.length > 100 || !mealId || !meals.has(meal) || !Number.isInteger(calories) || calories < 1 || calories > 10 ||
        !Number.isInteger(rating) || rating < 1 || rating > 10 || !['Yes', 'No'].includes(recommend) || !Number.isFinite(cost) || cost < 0) {
        return res.status(400).json({ error: 'Feedback values are invalid.' });
      }
      const [mealRow] = await sql`SELECT id FROM food_meals WHERE id = ${mealId}`;
      if (!mealRow) return res.status(400).json({ error: 'Select an existing meal.' });
      const person = await upsertPerson(sql, name);
      const [row] = await sql`UPDATE meal_feedback SET meal_id = ${mealId}, person_key = ${person.person_key}, name = ${person.display_name},
        calories = ${calories}, meal = ${meal}, rating = ${rating}, recommend = ${recommend}, cost = ${cost}
        WHERE id = ${id} RETURNING id`;
      if (!row) return res.status(404).json({ error: 'Feedback entry not found.' });
    } else if (type === 'votes') {
      const option = String(body.option || '').trim();
      const name = String(body.name || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
      const [vote] = await sql`SELECT poll_id FROM food_poll_votes WHERE id = ${id}`;
      if (!vote) return res.status(404).json({ error: 'Vote not found.' });
      const [poll] = await sql`SELECT options FROM food_polls WHERE id = ${vote.poll_id}`;
      if (!option || !poll.options.includes(option) || !name || name.length > 100) return res.status(400).json({ error: 'Choose a valid poll option and voter name.' });
      const person = await upsertPerson(sql, name);
      await sql`UPDATE food_poll_votes SET option_text = ${option}, voter_key = ${person.person_key}, voter_name = ${person.display_name} WHERE id = ${id}`;
    } else if (type === 'polls') {
      const title = String(body.title || '').trim(), description = String(body.description || '').trim();
      const options = Array.isArray(body.options) ? [...new Set(body.options.map((value) => String(value).trim()).filter(Boolean))] : [];
      const participants = Array.isArray(body.participants) ? body.participants.map((value) => String(value).trim()).filter(Boolean) : [];
      if (!title || title.length > 200 || description.length > 500 || options.length < 2 || options.length > 12 ||
        options.some((option) => option.length > 160) || participants.length > 200 || participants.some((name) => name.length > 100) || typeof body.active !== 'boolean') {
        return res.status(400).json({ error: 'Poll question, description, 2–12 options, and status are required.' });
      }
      const [previous] = await sql`SELECT options FROM food_polls WHERE id = ${id}`;
      if (!previous) return res.status(404).json({ error: 'Poll not found.' });
      const removedOptionsWithVotes = previous.options.filter((option) => !options.includes(option));
      if (removedOptionsWithVotes.length) {
        const recorded = await sql`SELECT DISTINCT option_text FROM food_poll_votes WHERE poll_id = ${id}`;
        if (recorded.some((vote) => removedOptionsWithVotes.includes(vote.option_text))) return res.status(409).json({ error: 'Delete votes for removed options first, then edit the poll.' });
      }
      const [row] = await sql`UPDATE food_polls SET title = ${title}, description = ${description}, options = ${JSON.stringify(options)}::jsonb,
        participants = ${JSON.stringify(participants)}::jsonb, active = ${body.active} WHERE id = ${id} RETURNING id`;
      if (!row) return res.status(404).json({ error: 'Poll not found.' });
    }
    return res.status(200).json({ updated: true });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'That person has already voted in this poll.' });
    return sendError(res, error);
  }
}
