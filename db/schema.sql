CREATE TABLE IF NOT EXISTS food_polls (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  options jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_poll_votes (
  id bigserial PRIMARY KEY,
  poll_id text NOT NULL REFERENCES food_polls(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meal_feedback (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  calories integer NOT NULL CHECK (calories BETWEEN 1 AND 10),
  meal text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 10),
  recommend text NOT NULL CHECK (recommend IN ('Yes', 'No')),
  cost numeric(10, 2) NOT NULL CHECK (cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
