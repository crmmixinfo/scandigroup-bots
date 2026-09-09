const { Pool } = require('pg');

// Serverless'da (Vercel) har so'rov o'z nusxasida ishlaydi va har nusxa o'z
// hovuzini ochadi — 20 tadan bo'lsa baza ulanish limiti bir necha o'nlab
// parallel so'rovdayoq tugaydi. Shuning uchun u yerda hovuz 1 ta ulanish.
const SERVERLESS = Boolean(process.env.VERCEL);

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX || (SERVERLESS ? 1 : 20)),
  idleTimeoutMillis: 30000,
  // Hovuz tugaganda so'rov cheksiz kutmasin — xato bergani ma'qul
  connectionTimeoutMillis: 10000,
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
//
// MUHIM: tranzaksiya ichidan chaqirilsa o'sha tranzaksiyaning `client` ini
// uzating. Aks holda funksiya hovuzdan YANGI ulanish so'raydi va bir nechta
// xodim bir vaqtda ishlaganda hovuz tugab, tizim qotib qoladi:
// ulanishni ushlab turgan so'rov audit uchun ulanish kutadi, u esa hech
// qachon bo'shamaydi.
async function audit(req, { module, action, entity, entity_id, payload }, client = db) {
  await client.query(
    `INSERT INTO audit_log (worker_id, module, action, entity, entity_id, payload, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [req.user?.id || null, module, action, entity || null,
     entity_id ? String(entity_id) : null, payload || null,
     req.headers['x-forwarded-for'] || req.socket.remoteAddress || null]);
}

module.exports = { db, wrap, today, daysAgo, audit };
