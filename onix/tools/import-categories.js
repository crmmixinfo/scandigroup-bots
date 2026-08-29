#!/usr/bin/env node
// ONIX — kategoriyalar daraxtini oddiy matn faylidan yuklash
//
// Fayl ko'rinishi:
//
//   KIRIM
//   Onix bussines center > Ijara to'lovi > Mijoz A, Mijoz B, Mijoz C
//   Ta'sischidan > Humoyun aka > Kirim
//
//   CHIQIM
//   Onix xarajatlar uchun > Asosiy vositalar > Ta'mirlash, Usta haqqi
//   Onix xarajatlar uchun > Kommunal to'lovlar > Elektr energiya, Suv, Gaz
//
//   GURUH > KATEGORIYA > podkategoriyalar (vergul bilan)
//
// Uchinchi pog'ona shart emas — podkategoriyasiz ham bo'ladi:
//
//   Yangiobod > Soliq, Marketing
//   Strong Well > Xujjatlar uchun
//
// Bunda operatsiya kategoriyaning o'ziga yoziladi.
//
// Ishlatish:
//   node onix/tools/import-categories.js kategoriyalar.txt          — bazaga yozadi
//   node onix/tools/import-categories.js kategoriyalar.txt --dry    — faqat ko'rsatadi
//
// Qayta ishga tushirish xavfsiz: mavjud yozuvlar takrorlanmaydi.

require('dotenv').config();
const fs = require('fs');
const db = require('../db');

const SECTIONS = {
  kirim: 'income',   daromad: 'income',  income: 'income',
  chiqim: 'expense', xarajat: 'expense', expense: 'expense',
};

function parse(text) {
  const out = [];
  let flow = null;
  const problems = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) return;

    const section = SECTIONS[line.toLowerCase().replace(/[:：]/g, '').trim()];
    if (section) { flow = section; return; }

    if (!flow) { problems.push(`${i + 1}-qator: KIRIM yoki CHIQIM sarlavhasidan oldin — «${line}»`); return; }

    const parts = line.split('>').map(x => x.trim()).filter(Boolean);
    if (parts.length < 2) {
      problems.push(`${i + 1}-qator: kamida «guruh > kategoriya» kerak — «${line}»`);
      return;
    }

    const list = (text) => text.split(',').map(x => x.trim()).filter(Boolean);

    if (parts.length === 2) {
      // GURUH > kat1, kat2 — podkategoriyasiz, operatsiya kategoriyaning o'ziga yoziladi
      const [group, cats] = parts;
      for (const cat of list(cats)) out.push({ flow, group, cat, subs: [] });
    } else {
      // GURUH > KATEGORIYA > sub1, sub2
      const [group, cat, ...rest] = parts;
      out.push({ flow, group, cat, subs: list(rest.join(' > ')) });
    }
  });

  return { rows: out, problems };
}

// Bir xil nomni ikki marta yaratmaslik uchun keshlangan qidiruv/yaratish
async function findOrCreate(parentId, level, name, flow) {
  const existing = await db.one(
    parentId === null
      ? 'SELECT * FROM onix_categories WHERE level = 1 AND flow = $2 AND lower(name) = lower($1)'
      : 'SELECT * FROM onix_categories WHERE parent_id = $3 AND lower(name) = lower($1) AND flow = $2',
    parentId === null ? [name, flow] : [name, flow, parentId]);

  if (existing) {
    if (!existing.active) await db.q('UPDATE onix_categories SET active = true WHERE id = $1', [existing.id]);
    return { row: existing, created: false };
  }
  return { row: await db.addCategory(parentId, level, name, flow, null), created: true };
}

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    console.error('Foydalanish: node onix/tools/import-categories.js <fayl.txt> [--dry]');
    process.exit(1);
  }
  const dry = flags.includes('--dry');
  const { rows, problems } = parse(fs.readFileSync(file, 'utf8'));

  if (problems.length) {
    console.error('⚠️  Tushunilmagan qatorlar:');
    problems.forEach(p => console.error('   ' + p));
    console.error('');
  }
  if (!rows.length) { console.error('❌ Yuklanadigan qator topilmadi.'); process.exit(1); }

  const stats = { groups: 0, cats: 0, subs: 0, skipped: 0 };

  for (const flow of ['income', 'expense']) {
    const forFlow = rows.filter(r => r.flow === flow);
    if (!forFlow.length) continue;
    console.log(`\n${flow === 'income' ? '📥 KIRIM' : '📤 CHIQIM'}`);

    for (const r of forFlow) {
      if (dry) {
        console.log(`   ${r.group} › ${r.cat}`);
        r.subs.forEach(sn => console.log(`      · ${sn}`));
        continue;
      }
      const g = await findOrCreate(null, 1, r.group, flow);
      if (g.created) { stats.groups++; console.log(`   ＋ ${r.group}`); }

      const c = await findOrCreate(g.row.id, 2, r.cat, flow);
      if (c.created) stats.cats++;
      console.log(`   ${c.created ? '＋' : '  '} ${r.group} › ${r.cat}`);

      for (const sn of r.subs) {
        const sres = await findOrCreate(c.row.id, 3, sn, flow);
        if (sres.created) { stats.subs++; console.log(`        ＋ ${sn}`); }
        else stats.skipped++;
      }
    }
  }

  if (dry) console.log('\n🔍 --dry: bazaga hech narsa yozilmadi.');
  else console.log(`\n✅ Yangi: ${stats.groups} guruh, ${stats.cats} kategoriya, ` +
                   `${stats.subs} podkategoriya. Mavjud edi: ${stats.skipped}.`);

  await db.pool.end();
}

main().catch(e => { console.error('❌ Xato:', e.message); process.exit(1); });
