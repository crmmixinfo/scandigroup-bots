#!/usr/bin/env node
// ONIX — ishga tushirishdan oldingi tekshiruv
//
//   npm run onix:check
//
// Sozlamalar, baza, sxema, kategoriyalar, jamoa va Telegram tokenini
// birma-bir tekshiradi va nima yetishmayotganini aytadi.

require('dotenv').config();
const https = require('https');

const C = { ok: '\x1b[32m', bad: '\x1b[31m', warn: '\x1b[33m', dim: '\x1b[2m', off: '\x1b[0m', b: '\x1b[1m' };
let failed = 0, warned = 0;

const ok   = (t, note) => console.log(`${C.ok}✅${C.off} ${t}${note ? `  ${C.dim}${note}${C.off}` : ''}`);
const bad  = (t, fix)  => { failed++; console.log(`${C.bad}❌${C.off} ${t}`); if (fix) console.log(`   ${C.dim}→ ${fix}${C.off}`); };
const warn = (t, fix)  => { warned++; console.log(`${C.warn}⚠️${C.off}  ${t}`); if (fix) console.log(`   ${C.dim}→ ${fix}${C.off}`); };
const head = (t) => console.log(`\n${C.b}${t}${C.off}`);

// Telegram tokenini tekshirish.
// Tarmoq muammosini token muammosidan ajratish muhim: firewall yoki proksi
// JSON emas, HTML/matn qaytaradi — buni "token noto'g'ri" deb ko'rsatish
// odamni noto'g'ri yo'lga soladi.
function getMe(token) {
  return new Promise((resolve) => {
    const req = https.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch { /* JSON emas */ }

        // Telegram har doim JSON qaytaradi. JSON kelmasa — oradagi to'siq.
        if (!json) {
          return resolve({ ok: false, network: true,
            description: `javob JSON emas (HTTP ${res.statusCode})` +
                         (body ? ` — «${body.trim().slice(0, 60).replace(/\s+/g, ' ')}…»` : '') });
        }
        resolve(json);
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, network: true, description: 'vaqt tugadi (15s)' }); });
    req.on('error', (e) => resolve({ ok: false, network: true, description: e.message }));
  });
}

async function main() {
  console.log(`${C.b}ONIX — tayyorlik tekshiruvi${C.off}`);

  // ---------- 1. Sozlamalar ----------
  head('1. Sozlamalar (.env)');

  const token = process.env.ONIX_BOT_TOKEN;
  if (!token) bad('ONIX_BOT_TOKEN yo\'q', '@BotFather dan token oling va .env ga yozing');
  else if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) bad('ONIX_BOT_TOKEN ko\'rinishi noto\'g\'ri', 'namuna: 1234567890:AAF...');
  else ok('ONIX_BOT_TOKEN bor', `bot id ${token.split(':')[0]}`);

  const hasDbUrl = !!process.env.DATABASE_URL;
  const hasPgEnv = !!(process.env.PGHOST || process.env.PGDATABASE);
  if (!hasDbUrl && !hasPgEnv) bad('DATABASE_URL yo\'q', 'postgresql://user:parol@host:5432/dbname');
  else ok('Baza manzili berilgan', hasDbUrl ? 'DATABASE_URL' : 'PG* o\'zgaruvchilari');

  const admin = parseInt(process.env.SUPER_ADMIN_ID, 10);
  if (!admin) console.log(`${C.dim}·  SUPER_ADMIN_ID berilmagan — admin oldindan yozilgan bo'lsa shart emas${C.off}`);
  else ok('SUPER_ADMIN_ID bor', String(admin));

  // ---------- 2. Baza ----------
  head('2. Baza');
  let db;
  try {
    db = require('../db');
    await db.q('SELECT 1');
    ok('Bazaga ulanish ishlayapti');
  } catch (e) {
    bad(`Bazaga ulanib bo'lmadi: ${e.message}`, 'DATABASE_URL ni tekshiring; SSL kerak bo\'lmasa PGSSL=off');
    return finish();
  }

  const tables = ['onix_users', 'onix_accounts', 'onix_categories', 'onix_operations', 'onix_pending_users'];
  const found = (await db.all(
    `SELECT table_name FROM information_schema.tables WHERE table_name = ANY($1)`, [tables]
  )).map(r => r.table_name);
  const missing = tables.filter(t => !found.includes(t));
  if (missing.length) bad(`Sxema to'liq emas: ${missing.join(', ')}`, 'npm run onix:schema');
  else ok('Sxema o\'rnatilgan', `${tables.length} ta jadval`);

  if (missing.length) return finish(db);

  // ---------- 3. Ma'lumotlar ----------
  head('3. Ma\'lumotlar');

  const acc = await db.one("SELECT COUNT(*)::int AS n FROM onix_accounts WHERE kind <> 'podotchet' AND active");
  acc.n ? ok('Kassalar bor', `${acc.n} ta`) : bad('Kassa yo\'q', 'npm run onix:schema');

  const cat = await db.one('SELECT COUNT(*)::int AS n FROM onix_categories WHERE active');
  const leaf = await db.one(`SELECT COUNT(*)::int AS n FROM onix_categories c WHERE c.active AND c.level > 1
                             AND NOT EXISTS (SELECT 1 FROM onix_categories k WHERE k.parent_id = c.id AND k.active)`);
  if (!cat.n) bad('Kategoriyalar yuklanmagan', 'npm run onix:categories');
  else ok('Kategoriyalar yuklangan', `${cat.n} ta, shundan ${leaf.n} tasiga yozish mumkin`);

  const users = await db.all("SELECT role, COUNT(*)::int AS n FROM onix_users WHERE active GROUP BY role");
  const pending = await db.one('SELECT COUNT(*)::int AS n FROM onix_pending_users');
  const total = users.reduce((a, r) => a + r.n, 0);
  if (!total && !pending.n) {
    bad('Jamoa yo\'q', 'onix/jamoa.txt ni to\'ldiring va npm run onix:users');
  } else {
    ok('Jamoa', users.map(r => `${r.role}: ${r.n}`).join(', ') || 'hali hech kim ulanmagan');
    if (pending.n) console.log(`   ${C.dim}⏳ ${pending.n} ta odam /start bosishini kutmoqda${C.off}`);
  }

  // Kutish ro'yxatidagi admin ham hisobga olinadi — u /start bosganda admin bo'ladi
  const pendingAdmins = await db.one("SELECT COUNT(*)::int AS n FROM onix_pending_users WHERE role = 'admin'");
  const hasAdmin = users.some(r => r.role === 'admin');

  if (hasAdmin) {
    ok('Administrator bor');
  } else if (pendingAdmins.n) {
    ok('Administrator kutilmoqda', `${pendingAdmins.n} ta — /start bosganda ulanadi`);
  } else if (admin) {
    ok('Administrator', 'SUPER_ADMIN_ID orqali');
  } else {
    bad('Administrator yo\'q va SUPER_ADMIN_ID ham berilmagan', 'aks holda tizimga kira olmaysiz');
  }
  if (!users.some(r => r.role === 'cashier') && !pending.n) {
    warn('Kassir yo\'q', 'kirim/chiqim kiritadigan odam kerak (admin ham qila oladi)');
  }

  // ---------- 4. Telegram ----------
  head('4. Telegram');
  if (!token) {
    bad('Token yo\'qligi uchun tekshirilmadi');
  } else {
    const me = await getMe(token);
    if (me.ok) {
      ok(`Token ishlayapti`, `@${me.result.username} — ${me.result.first_name}`);
    } else if (me.network) {
      bad(`api.telegram.org ga chiqib bo'lmadi — ${me.description}`,
          'Bu tokenning muammosi EMAS. Internet, firewall yoki proksini tekshiring; ' +
          'ba\'zi tarmoqlarda Telegram bloklangan bo\'ladi.');
    } else {
      bad(`Token qabul qilinmadi: ${me.description || 'nomaʼlum'}`,
          '@BotFather → /mybots → API Token. Token almashtirilgan bo\'lsa .env ni yangilang.');
    }
  }

  return finish(db);
}

async function finish(db) {
  console.log('');
  if (failed) {
    console.log(`${C.bad}${C.b}❌ ${failed} ta muammo bor${C.off}${warned ? ` ${C.dim}(+${warned} ogohlantirish)${C.off}` : ''}`);
    console.log(`${C.dim}   Yuqoridagilarni to'g'rilab, qayta ishga tushiring.${C.off}`);
  } else if (warned) {
    console.log(`${C.warn}${C.b}⚠️  ${warned} ta ogohlantirish${C.off} ${C.dim}— ishga tushsa bo'ladi: npm run onix${C.off}`);
  } else {
    console.log(`${C.ok}${C.b}✅ Hammasi tayyor${C.off} ${C.dim}— npm run onix${C.off}`);
  }
  if (db) await db.pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('❌ Xato:', e.message); process.exit(1); });
