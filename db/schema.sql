CREATE TABLE IF NOT EXISTS food_people (
  person_key text PRIMARY KEY,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_polls (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  options jsonb NOT NULL,
  participants jsonb NOT NULL DEFAULT '[]',
  created_by_key text REFERENCES food_people(person_key),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE food_polls ADD COLUMN IF NOT EXISTS participants jsonb NOT NULL DEFAULT '[]';
ALTER TABLE food_polls ADD COLUMN IF NOT EXISTS created_by_key text REFERENCES food_people(person_key);

CREATE TABLE IF NOT EXISTS food_poll_votes (
  id bigserial PRIMARY KEY,
  poll_id text NOT NULL REFERENCES food_polls(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  voter_name text,
  voter_key text REFERENCES food_people(person_key),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE food_poll_votes ADD COLUMN IF NOT EXISTS voter_name text;
ALTER TABLE food_poll_votes ADD COLUMN IF NOT EXISTS voter_key text;
INSERT INTO food_people (person_key, display_name)
  SELECT voter_key, MIN(voter_name) FROM food_poll_votes
  WHERE voter_key IS NOT NULL AND voter_name IS NOT NULL GROUP BY voter_key
  ON CONFLICT (person_key) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS food_poll_votes_one_per_voter
  ON food_poll_votes (poll_id, voter_key) WHERE voter_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS food_meals (
  id text PRIMARY KEY,
  name text NOT NULL,
  source_poll_id text UNIQUE REFERENCES food_polls(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meal_feedback (
  id bigserial PRIMARY KEY,
  meal_id text REFERENCES food_meals(id) ON DELETE RESTRICT,
  person_key text REFERENCES food_people(person_key),
  name text NOT NULL,
  calories integer NOT NULL CHECK (calories BETWEEN 1 AND 10),
  meal text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 10),
  recommend text NOT NULL CHECK (recommend IN ('Yes', 'No')),
  cost numeric(10, 2) NOT NULL CHECK (cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE meal_feedback ADD COLUMN IF NOT EXISTS meal_id text REFERENCES food_meals(id) ON DELETE RESTRICT;
ALTER TABLE meal_feedback ADD COLUMN IF NOT EXISTS person_key text REFERENCES food_people(person_key);
INSERT INTO food_meals (id, name)
  SELECT 'legacy-feedback', 'Older feedback (before meal tracking)'
  WHERE EXISTS (SELECT 1 FROM meal_feedback WHERE meal_id IS NULL)
  ON CONFLICT (id) DO NOTHING;
UPDATE meal_feedback SET meal_id = 'legacy-feedback' WHERE meal_id IS NULL;
INSERT INTO food_people (person_key, display_name)
  SELECT lower(regexp_replace(trim(name), '\s+', ' ', 'g')), MIN(trim(name))
  FROM meal_feedback WHERE name IS NOT NULL AND trim(name) <> ''
  GROUP BY lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
  ON CONFLICT (person_key) DO NOTHING;
UPDATE meal_feedback SET person_key = lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
  WHERE person_key IS NULL AND name IS NOT NULL AND trim(name) <> '';
