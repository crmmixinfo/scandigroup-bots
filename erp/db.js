const { Pool } = require('pg');

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false },
});

// Har modul shu yordamchilarni ishlatadi — xatolikni bir joyda ushlash uchun.
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: e.message });
  });

const today   = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// Pul va ombor tegadigan har amal audit jurnaliga tushadi.
async function audit(req, { module, action, entity, entity_id, payload }) {
  await db.query(
    `INSERT INTO audit_log (worker_id, module, action, entity, entity_id, payload, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [req.user?.id || null, module, action, entity || null,
     entity_id ? String(entity_id) : null, payload || null,
     req.headers['x-forwarded-for'] || req.socket.remoteAddress || null]);
}

module.exports = { db, wrap, today, daysAgo, audit };
