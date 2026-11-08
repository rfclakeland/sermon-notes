-- Preview-only schema for Restoration Notes. Not the church rfc-church database.
CREATE TABLE IF NOT EXISTS sermons (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sermons_date ON sermons (date DESC);
