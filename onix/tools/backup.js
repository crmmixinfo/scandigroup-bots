#!/usr/bin/env node
// Qo'lda zaxira nusxa olish:  npm run onix:zaxira
// Boshqa papkaga:             npm run onix:zaxira -- /Users/me/Desktop

require('dotenv').config();
const backup = require('../backup');

(async () => {
  const dir = process.argv[2] || backup.backupDir();
  console.log(`📁 Papka: ${dir}`);
  const cloud = backup.cloudName(dir);
  if (cloud) console.log(`☁️  ${cloud} orqali bulutga ko'tariladi`);
  else console.log(`⚠️  Bu papka bulutda emas — nusxa faqat shu kompyuterda qoladi.`);
  console.log(`⏳ Nusxa olinmoqda…`);

  try {
    const res = await backup.run(dir);
    console.log(`\n✅ Tayyor: ${res.file}`);
    console.log(`   Hajmi: ${backup.humanSize(res.size)}`);
    console.log(`   Saqlanayotgan: ${res.days} kunlik, ${res.total} ta fayl (chegara ${backup.KEEP} kun)`);
    if (res.removed) console.log(`   Eskisi o'chirildi: ${res.removed} ta`);
    console.log(`\n   Tiklash uchun:`);
    console.log(`   gunzip -c "${res.file}" | psql "$DATABASE_URL"`);
  } catch (err) {
    console.error(`\n❌ Zaxira olinmadi: ${err.message}`);
    if (/pg_dump topilmadi/.test(err.message)) {
      console.error(`   PostgreSQL o'rnatilgan bo'lsa, yo'lini .env ga yozing:`);
      console.error(`   ONIX_PG_DUMP=/Library/PostgreSQL/16/bin/pg_dump`);
    }
    process.exit(1);
  }
  process.exit(0);
})();
