import { neon } from '@neondatabase/serverless';

let schemaReady;

export function database() {
  const connectionString = process.env.DATABASE_URL ||
    process.env.FOOD_ACQUISITION_DB_POSTGRES_URL ||
    process.env.FOOD_ACQUISITION_DB_POSTGRES_PRISMA_URL ||
    process.env.FOOD_ACQUISITION_DB_POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString) {
    const error = new Error('Set DATABASE_URL or a supported Postgres connection variable.');
    error.statusCode = 503;
    throw error;
  }
  return neon(connectionString);
}

export async function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS food_polls (
        id text PRIMARY KEY,
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        options jsonb NOT NULL,
        participants jsonb NOT NULL DEFAULT '[]'::jsonb,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`ALTER TABLE food_polls ADD COLUMN IF NOT EXISTS participants jsonb NOT NULL DEFAULT '[]'::jsonb`;
      await sql`CREATE TABLE IF NOT EXISTS food_poll_votes (
        id bigserial PRIMARY KEY,
        poll_id text NOT NULL REFERENCES food_polls(id) ON DELETE CASCADE,
        option_text text NOT NULL,
        voter_name text,
        voter_key text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`ALTER TABLE food_poll_votes ADD COLUMN IF NOT EXISTS voter_name text`;
      await sql`ALTER TABLE food_poll_votes ADD COLUMN IF NOT EXISTS voter_key text`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS food_poll_votes_one_per_voter ON food_poll_votes (poll_id, voter_key) WHERE voter_key IS NOT NULL`;
      await sql`CREATE TABLE IF NOT EXISTS food_meals (
        id text PRIMARY KEY,
        name text NOT NULL,
        source_poll_id text UNIQUE REFERENCES food_polls(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS meal_feedback (
        id bigserial PRIMARY KEY,
        meal_id text REFERENCES food_meals(id) ON DELETE RESTRICT,
        name text NOT NULL,
        calories integer NOT NULL CHECK (calories BETWEEN 1 AND 10),
        meal text NOT NULL,
        rating integer NOT NULL CHECK (rating BETWEEN 1 AND 10),
        recommend text NOT NULL CHECK (recommend IN ('Yes', 'No')),
        cost numeric(10, 2) NOT NULL CHECK (cost >= 0),
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`ALTER TABLE meal_feedback ADD COLUMN IF NOT EXISTS meal_id text REFERENCES food_meals(id) ON DELETE RESTRICT`;
      await sql`INSERT INTO food_meals (id, name)
        SELECT 'legacy-feedback', 'Older feedback (before meal tracking)'
        WHERE EXISTS (SELECT 1 FROM meal_feedback WHERE meal_id IS NULL)
        ON CONFLICT (id) DO NOTHING`;
      await sql`UPDATE meal_feedback SET meal_id = 'legacy-feedback' WHERE meal_id IS NULL`;
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

export async function listPolls(sql, id) {
  const rows = id
    ? await sql`SELECT p.id, p.title, p.description, p.options, p.participants, p.active, p.created_at, m.id AS meal_id,
          COALESCE((SELECT json_object_agg(t.option_text, t.vote_count) FROM (
            SELECT option_text, COUNT(*)::int AS vote_count FROM food_poll_votes WHERE poll_id = p.id GROUP BY option_text
          ) t), '{}'::json) AS votes,
          COALESCE((SELECT json_agg(DISTINCT voter_name) FROM food_poll_votes WHERE poll_id = p.id AND voter_name IS NOT NULL), '[]'::json) AS voters
        FROM food_polls p LEFT JOIN food_meals m ON m.source_poll_id = p.id WHERE p.id = ${id}`
    : await sql`SELECT p.id, p.title, p.description, p.options, p.participants, p.active, p.created_at, m.id AS meal_id,
          COALESCE((SELECT json_object_agg(t.option_text, t.vote_count) FROM (
            SELECT option_text, COUNT(*)::int AS vote_count FROM food_poll_votes WHERE poll_id = p.id GROUP BY option_text
          ) t), '{}'::json) AS votes,
          COALESCE((SELECT json_agg(DISTINCT voter_name) FROM food_poll_votes WHERE poll_id = p.id AND voter_name IS NOT NULL), '[]'::json) AS voters
        FROM food_polls p LEFT JOIN food_meals m ON m.source_poll_id = p.id ORDER BY p.created_at DESC`;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    options: row.options,
    participants: row.participants || [],
    active: row.active,
    createdAt: row.created_at,
    votes: row.votes,
    voters: row.voters || [],
    mealId: row.meal_id || null,
  }));
}

export function sendError(res, error) {
  console.error(error);
  const status = error.statusCode || 500;
  res.status(status).json({ error: status === 503 ? error.message : 'The request could not be completed.' });
}
