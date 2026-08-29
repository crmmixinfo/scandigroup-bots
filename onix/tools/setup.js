#!/usr/bin/env node
// ONIX — bir buyruq bilan to'liq o'rnatish
//
//   npm run onix:setup
//
// Ketma-ket bajaradi:
//   1. Baza sxemasini o'rnatadi        (onix-schema.sql)
//   2. Kategoriyalarni yuklaydi        (onix/kategoriyalar.txt)
//   3. Jamoani yuklaydi                (onix/jamoa.txt)
//   4. Hammasini tekshiradi
//
// Qayta ishga tushirish xavfsiz — mavjud ma'lumot o'chmaydi, yangisi qo'shiladi.
// psql dasturi KERAK EMAS — hammasi Node orqali bajariladi.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const C = { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[2m', off: '\x1b[0m', b: '\x1b[1m' };
const step = (n, t) => console.log(`\n${C.b}${n}. ${t}${C.off}`);

async function loadSchema() {
  const db = require('../db');
  const sql = fs.readFileSync(path.join(ROOT, 'onix-schema.sql'), 'utf8');
  // Bitta so'rov sifatida yuboriladi: fayl ichida $$ bloklar bor,
  // ularni qo'lda bo'laklashga urinish xato beradi.
  await db.q(sql);
  const n = await db.one("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name LIKE 'onix_%'");
  await db.pool.end();
  return n.n;
}

function run(script, args = []) {
  execFileSync(process.execPath, [path.join(__dirname, script), ...args], {
    stdio: 'inherit', cwd: ROOT,
  });
}

async function main() {
  console.log(`${C.b}ONIX — o'rnatish${C.off}`);

  if (!process.env.DATABASE_URL && !process.env.PGHOST && !process.env.PGDATABASE) {
    console.error(`\n${C.bad}❌ Baza manzili berilmagan.${C.off}`);
    console.error(`   .env faylida DATABASE_URL yozilgan bo'lishi kerak.`);
    console.error(`   Namuna uchun .env.example faylini ko'ring.\n`);
    process.exit(1);
  }

  step(1, 'Baza sxemasi');
  try {
    const tables = await loadSchema();
    console.log(`   ${C.ok}✅ ${tables} ta jadval tayyor${C.off}`);
  } catch (e) {
    console.error(`   ${C.bad}❌ ${e.message}${C.off}`);
    console.error(`   ${C.dim}→ .env dagi DATABASE_URL ni tekshiring.${C.off}`);
    console.error(`   ${C.dim}  Mahalliy bazada SSL kerak bo'lmasa .env ga qo'shing: PGSSL=off${C.off}\n`);
    process.exit(1);
  }

  step(2, 'Kategoriyalar');
  run('import-categories.js', [path.join(ROOT, 'onix', 'kategoriyalar.txt')]);

  step(3, 'Jamoa');
  run('import-users.js', [path.join(ROOT, 'onix', 'jamoa.txt')]);

  step(4, 'Tekshiruv');
  try {
    run('check.js');
  } catch {
    process.exit(1);   // check.js o'zi sababini yozadi
  }
}

main().catch(e => { console.error(`${C.bad}❌ ${e.message}${C.off}`); process.exit(1); });
