#!/usr/bin/env node
/* Bazani yaratadi va yangilaydi. Qayta-qayta ishga tushirish xavfsiz —
   barcha fayllar IF NOT EXISTS / ON CONFLICT bilan yozilgan.
     npm run erp:migrate                 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { db } = require('./db');

const FILES = [
  'core.sql',            // xodim, rol, huquq, sessiya, audit, bildirishnoma
  'core-seed.sql',       // huquqlar va rollar
  'production.sql',      // ishlab chiqarish jadvallari va view'lari
  'production-seed.sql', // tsexlar, bo'limlar, marshrutlar
  'production-sku.sql',  // fason va SKU katalogi
];

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL kiritilmagan (.env faylini tekshiring)');
    process.exit(1);
  }
  for (const f of FILES) {
    const sql = fs.readFileSync(path.join(__dirname, 'sql', f), 'utf8');
    process.stdout.write(`  ${f.padEnd(22)}`);
    await db.query(sql);
    console.log('OK');
  }
  const { rows } = await db.query(
    `SELECT (SELECT COUNT(*) FROM shops)    AS tsexlar,
            (SELECT COUNT(*) FROM sections) AS bolimlar,
            (SELECT COUNT(*) FROM products) AS sku,
            (SELECT COUNT(*) FROM workers)  AS xodimlar`);
  console.log('\nBaza tayyor:', rows[0]);
  await db.end();
})().catch((e) => { console.error('\nXATO:', e.message); process.exit(1); });
