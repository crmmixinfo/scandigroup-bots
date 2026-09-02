#!/usr/bin/env node
// Google Sheets jadvalini qo'lda yangilash:  npm run onix:sheets

require('dotenv').config();
const sheets = require('../sheets');

(async () => {
  if (!sheets.URL) {
    console.error(`❌ ONIX_SHEETS_URL sozlanmagan (.env)`);
    console.error(`   Yo'riqnoma: onix/tools/apps-script.gs`);
    process.exit(1);
  }

  console.log(`📊 Jadval: ${sheets.URL.slice(0, 60)}…`);
  console.log(`⏳ Yuborilmoqda…\n`);

  try {
    const res = await sheets.sync();
    for (const [name, n] of Object.entries(res)) console.log(`   ✅ ${name} — ${n} qator`);
    console.log(`\n✅ Tayyor.`);
  } catch (err) {
    console.error(`\n❌ Yangilanmadi: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
})();
