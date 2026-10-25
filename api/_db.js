import { neon } from '@neondatabase/serverless';

let schemaReady;

export function database() {
  if (!process.env.DATABASE_URL) {
    const error = new Error('DATABASE_URL is not configured.');
    error.statusCode = 503;
    throw error;
  }
  return neon(process.env.DATABASE_URL);
}

export async function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS food_polls (
        id text PRIMARY KEY,
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        options jsonb NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS food_poll_votes (
        id bigserial PRIMARY KEY,
        poll_id text NOT NULL REFERENCES food_polls(id) ON DELETE CASCADE,
        option_text text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS meal_feedback (
        id bigserial PRIMARY KEY,
        name text NOT NULL,
        calories integer NOT NULL CHECK (calories BETWEEN 1 AND 10),
        meal text NOT NULL,
        rating integer NOT NULL CHECK (rating BETWEEN 1 AND 10),
        recommend text NOT NULL CHECK (recommend IN ('Yes', 'No')),
        cost numeric(10, 2) NOT NULL CHECK (cost >= 0),
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

export async function listPolls(sql, id) {
  const rows = id
    ? await sql`SELECT p.id, p.title, p.description, p.options, p.active, p.created_at,
          COALESCE(json_object_agg(v.option_text, v.vote_count) FILTER (WHERE v.option_text IS NOT NULL), '{}'::json) AS votes
        FROM food_polls p
        LEFT JOIN (SELECT poll_id, option_text, COUNT(*)::int AS vote_count FROM food_poll_votes GROUP BY poll_id, option_text) v ON v.poll_id = p.id
        WHERE p.id = ${id} GROUP BY p.id`
    : await sql`SELECT p.id, p.title, p.description, p.options, p.active, p.created_at,
          COALESCE(json_object_agg(v.option_text, v.vote_count) FILTER (WHERE v.option_text IS NOT NULL), '{}'::json) AS votes
        FROM food_polls p
        LEFT JOIN (SELECT poll_id, option_text, COUNT(*)::int AS vote_count FROM food_poll_votes GROUP BY poll_id, option_text) v ON v.poll_id = p.id
        GROUP BY p.id ORDER BY p.created_at DESC`;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    options: row.options,
    active: row.active,
    createdAt: row.created_at,
    votes: row.votes,
  }));
}

export function sendError(res, error) {
  console.error(error);
  const status = error.statusCode || 500;
  res.status(status).json({ error: status === 503 ? error.message : 'The request could not be completed.' });
}
