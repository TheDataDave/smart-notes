import { DatabaseSync } from 'node:sqlite';

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

const MIGRATIONS = [
  `
  CREATE TABLE groups (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#6f42c1',
    position   REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (${NOW}),
    updated_at TEXT NOT NULL DEFAULT (${NOW})
  );

  CREATE TABLE notes (
    id           INTEGER PRIMARY KEY,
    title        TEXT NOT NULL DEFAULT '',
    body         TEXT NOT NULL DEFAULT '',
    kind         TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note','task','event')),
    group_id     INTEGER REFERENCES groups(id) ON DELETE SET NULL,
    position     REAL NOT NULL DEFAULT 0,
    due_at       TEXT,
    completed    INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at   TEXT NOT NULL DEFAULT (${NOW}),
    updated_at   TEXT NOT NULL DEFAULT (${NOW})
  );

  CREATE TABLE reminders (
    id         INTEGER PRIMARY KEY,
    note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    remind_at  TEXT NOT NULL,
    repeat     TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none','daily','weekly','monthly')),
    fired      INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (${NOW}),
    updated_at TEXT NOT NULL DEFAULT (${NOW})
  );

  CREATE TABLE links (
    id         INTEGER PRIMARY KEY,
    from_type  TEXT NOT NULL CHECK (from_type IN ('note','reminder')),
    from_id    INTEGER NOT NULL,
    to_type    TEXT NOT NULL CHECK (to_type IN ('note','reminder')),
    to_id      INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (${NOW}),
    UNIQUE (from_type, from_id, to_type, to_id)
  );

  CREATE INDEX idx_notes_group ON notes(group_id);
  CREATE INDEX idx_reminders_due ON reminders(remind_at) WHERE fired = 0;

  CREATE TRIGGER notes_delete_links AFTER DELETE ON notes BEGIN
    DELETE FROM links WHERE (from_type = 'note' AND from_id = OLD.id)
                         OR (to_type   = 'note' AND to_id   = OLD.id);
  END;

  CREATE TRIGGER reminders_delete_links AFTER DELETE ON reminders BEGIN
    DELETE FROM links WHERE (from_type = 'reminder' AND from_id = OLD.id)
                         OR (to_type   = 'reminder' AND to_id   = OLD.id);
  END;
  `,
  `
  ALTER TABLE reminders ADD COLUMN label TEXT NOT NULL DEFAULT '';
  `,
];

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(db) {
  const { user_version } = db.prepare('PRAGMA user_version').get();
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export { NOW };