#!/usr/bin/env node
// ONIX — jamoani matn faylidan yuklash
//
// Fayl ko'rinishi (bir qator = bir odam):
//
//   Saidaziz Saidiy       @saidazizsaidiy   Admin
//   Asadbek Abduqahhorov  @kuchimala70      Hodim
//   Rustam Karimov        123456789         Kassir
//
// @username berilsa odam kutish ro'yxatiga tushadi va botga /start bosganda
// avtomat ulanadi. Raqamli ID berilsa darhol qo'shiladi.
//
// Ishlatish:
//   node onix/tools/import-users.js onix/jamoa.txt          — bazaga yozadi
//   node onix/tools/import-users.js onix/jamoa.txt --dry    — faqat ko'rsatadi

require('dotenv').config();
const fs = require('fs');
const db = require('../db');

const ROLES = {
  admin: 'admin', administrator: 'admin',
  kassir: 'cashier', cashier: 'cashier',
  hodim: 'staff', xodim: 'staff', staff: 'staff',
  rahbar: 'manager', manager: 'manager', boshliq: 'manager',
};

const ROLE_LABEL = { admin: '👑 Admin', cashier: '💼 Kassir', staff: '🧾 Hodim', manager: '👁 Rahbar' };

function parse(text) {
  const rows = [], problems = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) return;

    // Oxirgi so'z — rol, undan oldingi — @username yoki raqamli ID, qolgani — ism
    const parts = line.split(/\s+/);
    if (parts.length < 3) {
      problems.push(`${i + 1}-qator: «Ism  @username  Rol» kerak — «${line}»`);
      return;
    }

    const role = ROLES[parts.pop().toLowerCase()];
    const handle = parts.pop();
    const fullName = parts.join(' ');

    if (!role)      return problems.push(`${i + 1}-qator: rol noma'lum — «${line}»`);
    if (!fullName)  return problems.push(`${i + 1}-qator: ism yo'q — «${line}»`);

    if (/^\d+$/.test(handle)) {
      rows.push({ fullName, role, tgId: parseInt(handle, 10) });
    } else {
      const username = db.normUsername(handle);
      if (!username || !/^[a-z0-9_]{4,32}$/.test(username)) {
        return problems.push(`${i + 1}-qator: username noto'g'ri — «${handle}»`);
      }
      rows.push({ fullName, role, username });
    }
  });

  return { rows, problems };
}

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    console.error('Foydalanish: node onix/tools/import-users.js <fayl.txt> [--dry]');
    process.exit(1);
  }
  const dry = flags.includes('--dry');
  const { rows, problems } = parse(fs.readFileSync(file, 'utf8'));

  if (problems.length) {
    console.error("⚠️  Tushunilmagan qatorlar:");
    problems.forEach(p => console.error('   ' + p));
    console.error('');
  }
  if (!rows.length) { console.error('❌ Yuklanadigan qator topilmadi.'); process.exit(1); }

  const admin = rows.find(r => r.role === 'admin');
  const addedBy = admin && admin.tgId ? admin.tgId : (parseInt(process.env.SUPER_ADMIN_ID, 10) || null);
  let direct = 0, waiting = 0;

  for (const r of rows) {
    const label = `${ROLE_LABEL[r.role]}  ${r.fullName}`;
    if (dry) { console.log(`   ${label}  ${r.tgId ? r.tgId : '@' + r.username}`); continue; }

    if (r.tgId) {
      await db.addUser(r.tgId, r.fullName, r.role, addedBy);
      direct++;
      console.log(`   ✅ ${label}  —  qo'shildi (${r.tgId})`);
    } else {
      const exists = await db.one('SELECT * FROM onix_users WHERE username = $1 AND active', [r.username]);
      if (exists) {
        console.log(`   ℹ️  ${label}  —  allaqachon tizimda (${exists.tg_id})`);
        continue;
      }
      await db.addPendingUser(r.username, r.fullName, r.role, addedBy);
      waiting++;
      console.log(`   ⏳ ${label}  —  @${r.username} /start kutilmoqda`);
    }
  }

  if (dry) {
    console.log('\n🔍 --dry: bazaga hech narsa yozilmadi.');
  } else {
    console.log(`\n✅ Darhol qo'shildi: ${direct}.  Kutish ro'yxatida: ${waiting}.`);
    if (waiting) console.log('   Ular botga /start bossa avtomat ulanadi.');
  }

  await db.pool.end();
}

main().catch(e => { console.error('❌ Xato:', e.message); process.exit(1); });
