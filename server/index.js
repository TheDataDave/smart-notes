import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { openDb, NOW } from './db.js';

export function startServer({ port = 4000, dbPath, staticDir, onReminder } = {}) {
  const db = openDb(dbPath);
  const app = express();
  app.use(express.json());

  // ---------- helpers ----------

  // SQLite can't store true/false or undefined, so convert before binding
  const clean = (data, keys) =>
    Object.fromEntries(
      keys.map((k) => [k, typeof data[k] === 'boolean' ? Number(data[k]) : data[k]])
    );

  // Builds the four standard routes for a table
  function crud(route, table, fields) {
    const hasPosition = fields.includes('position');
    const getOne = (id) => db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);

    app.get(`/api/${route}`, (req, res) => {
      const order = hasPosition ? 'position, id' : 'id';
      res.json(db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all());
    });

    app.post(`/api/${route}`, (req, res) => {
      const data = { ...req.body };
      if (hasPosition && data.position === undefined) {
        data.position = db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS p FROM ${table}`).get().p;
      }
      const keys = fields.filter((k) => data[k] !== undefined);
      const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((k) => '@' + k).join(', ')})`;
      const { lastInsertRowid } = db.prepare(sql).run(clean(data, keys));
      res.status(201).json(getOne(Number(lastInsertRowid)));
    });

    app.patch(`/api/${route}/:id`, (req, res) => {
      const keys = fields.filter((k) => req.body[k] !== undefined);
      if (keys.length) {
        const sets = keys.map((k) => `${k} = @${k}`).join(', ');
        const { changes } = db
          .prepare(`UPDATE ${table} SET ${sets}, updated_at = ${NOW} WHERE id = @id`)
          .run({ ...clean(req.body, keys), id: Number(req.params.id) });
        if (!changes) return res.status(404).json({ error: 'Not found' });
      }
      const row = getOne(Number(req.params.id));
      row ? res.json(row) : res.status(404).json({ error: 'Not found' });
    });

    app.delete(`/api/${route}/:id`, (req, res) => {
      const { changes } = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(req.params.id));
      changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
    });
  }

  // ---------- routes ----------

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  crud('groups', 'groups', ['name', 'color', 'position']);
  crud('notes', 'notes', ['title', 'body', 'kind', 'group_id', 'position', 'due_at', 'completed']);
  crud('reminders', 'reminders', ['note_id', 'remind_at', 'repeat', 'fired']);

  // Toggle done/not done. Used by the confetti button.
  app.post('/api/notes/:id/complete', (req, res) => {
    const id = Number(req.params.id);
    const { changes } = db
      .prepare(
        `UPDATE notes
         SET completed    = 1 - completed,
             completed_at = CASE WHEN completed = 0 THEN ${NOW} ELSE NULL END,
             updated_at   = ${NOW}
         WHERE id = ?`
      )
      .run(id);
    if (!changes) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(id));
  });

  // ---------- links ----------

  const label = (type, id) => {
    if (type === 'note') {
      return db.prepare('SELECT title FROM notes WHERE id = ?').get(id)?.title || 'Untitled';
    }
    const r = db
      .prepare('SELECT n.title, r.remind_at FROM reminders r JOIN notes n ON n.id = r.note_id WHERE r.id = ?')
      .get(id);
    return r ? `Reminder: ${r.title || 'Untitled'} (${r.remind_at})` : 'Missing reminder';
  };

  // GET /api/links?type=note&id=3 -> everything connected to note 3, either direction
  app.get('/api/links', (req, res) => {
    const { type, id } = req.query;
    const rows = db
      .prepare(
        `SELECT * FROM links
         WHERE (from_type = @type AND from_id = @id) OR (to_type = @type AND to_id = @id)`
      )
      .all({ type, id: Number(id) });

    res.json(
      rows.map((l) => {
        const outgoing = l.from_type === type && l.from_id === Number(id);
        const other = outgoing ? { type: l.to_type, id: l.to_id } : { type: l.from_type, id: l.from_id };
        return { id: l.id, other: { ...other, label: label(other.type, other.id) } };
      })
    );
  });

  app.post('/api/links', (req, res) => {
    const { from_type, from_id, to_type, to_id } = req.body;
    if (from_type === to_type && from_id === to_id) {
      return res.status(400).json({ error: 'Cannot link an item to itself' });
    }
    db.prepare(
      `INSERT OR IGNORE INTO links (from_type, from_id, to_type, to_id)
       VALUES (@from_type, @from_id, @to_type, @to_id)`
    ).run({ from_type, from_id, to_type, to_id });
    res.status(201).json({ ok: true });
  });

  app.delete('/api/links/:id', (req, res) => {
    db.prepare('DELETE FROM links WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

    // Every note-to-note link, so the UI can build backlinks
  app.get('/api/note-links', (req, res) => {
    res.json(
      db.prepare(
        `SELECT from_id, to_id FROM links WHERE from_type = 'note' AND to_type = 'note'`
      ).all()
    );
  });

  // Replace a note's outgoing links with the @mentions found in its body
  app.put('/api/notes/:id/mentions', (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT 1 FROM notes WHERE id = ?').get(id)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const ids = [...new Set((req.body.ids || []).map(Number))].filter(
      (n) => Number.isInteger(n) && n !== id
    );

    db.exec('BEGIN');
    try {
      db.prepare(`DELETE FROM links WHERE from_type = 'note' AND from_id = ? AND to_type = 'note'`).run(id);
      const insert = db.prepare(
        `INSERT OR IGNORE INTO links (from_type, from_id, to_type, to_id)
         SELECT 'note', @src, 'note', id FROM notes WHERE id = @dst`
      );
      for (const dst of ids) insert.run({ src: id, dst });
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.json({ ok: true });
  });

  // ---------- errors + static files ----------

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.use((req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // Four arguments is how Express recognizes an error handler
  app.use((err, req, res, next) => {
    res.status(400).json({ error: err.message });
  });

  // ---------- reminder scheduler ----------

  // Move a repeating reminder forward until it is in the future
  function nextOccurrence(iso, repeat) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error('Invalid reminder date');
    do {
      if (repeat === 'daily') d.setDate(d.getDate() + 1);
      else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
      else d.setMonth(d.getMonth() + 1);
    } while (d.getTime() <= Date.now());
    return d.toISOString();
  }

  function checkReminders() {
    const due = db
      .prepare(
        `SELECT r.id, r.note_id, r.remind_at, r.repeat, n.title, n.body
        FROM reminders r JOIN notes n ON n.id = r.note_id
        WHERE r.fired = 0 AND r.remind_at <= ?
        ORDER BY r.remind_at`
      )
      .all(new Date().toISOString());

    for (const r of due) {
      try {
        if (r.repeat === 'none') {
          db.prepare(`UPDATE reminders SET fired = 1, updated_at = ${NOW} WHERE id = ?`).run(r.id);
        } else {
          db.prepare(`UPDATE reminders SET remind_at = ?, updated_at = ${NOW} WHERE id = ?`)
            .run(nextOccurrence(r.remind_at, r.repeat), r.id);
        }
        onReminder?.(r);
      } catch (err) {
        console.error('Reminder failed:', err);
        db.prepare('UPDATE reminders SET fired = 1 WHERE id = ?').run(r.id);
      }
    }
  }

  // The first check waits a few seconds so the window exists to show catch-up popups
  const firstCheck = setTimeout(checkReminders, 4000);
  const ticker = setInterval(checkReminders, 15000);

  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => resolve(server));
    server.on('close', () => {
      clearTimeout(firstCheck);
      clearInterval(ticker);
      db.close();
    });
  });
}