// Zaxira moduli testlari — haqiqiy baza va haqiqiy pg_dump bilan.
// Nusxa olinadimi, undan tiklanadimi, eskisi tozalanadimi.

process.env.PGSSL = 'off';
process.env.SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID || '1';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'onix-zaxira-'));
process.env.ONIX_BACKUP_DIR = DIR;

const db = require('../db');
const backup = require('../backup');

let pass = 0, fail = 0;
const ok = (cond, label) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  cond ? pass++ : fail++;
};
const eq = (got, want, label) =>
  ok(String(got) === String(want), `${label}${String(got) === String(want) ? '' : `  kutilgan=${want} olindi=${got}`}`);

// ---------- Sof funksiyalar ----------

function testPure() {
  console.log('\n— Nom va vaqt —');

  eq(backup.fileName(new Date(2026, 8, 3, 3, 0)), 'onix-2026-09-03-0300.sql.gz', 'fayl nomi sana va soatdan');
  eq(backup.fileName(new Date(2026, 0, 9, 23, 5)), 'onix-2026-01-09-2305.sql.gz', 'bir xonali son oldiga nol qo\'yiladi');
  ok(backup.fileName(new Date()) < backup.fileName(new Date(Date.now() + 864e5)),
     'nomlar alifbo bo\'yicha ham vaqt bo\'yicha tartiblanadi');

  eq(backup.today(new Date(2026, 8, 3)), '2026-09-03', 'bugungi kun kaliti');

  console.log('\n— Papka —');
  eq(backup.backupDir(), DIR, 'ONIX_BACKUP_DIR birinchi o\'rinda turadi');
  const cloudCases = [
    ['/Users/a/Library/CloudStorage/GoogleDrive-x@gmail.com/My Drive/ONIX zaxira', 'Google Drive'],
    ['/Users/a/Google Drive/ONIX zaxira',                        'Google Drive'],
    ['/Users/a/Library/CloudStorage/OneDrive-Personal/ONIX',     'OneDrive'],
    ['/Users/a/Library/CloudStorage/OneDrive-Scandi Group/ONIX', 'OneDrive'],
    ['/Users/a/OneDrive - Scandi Group/ONIX',                    'OneDrive'],
    ['C:\\Users\\a\\OneDrive\\ONIX',                             'OneDrive'],
    ['/Users/a/Library/Mobile Documents/com~apple~CloudDocs/ONIX', 'iCloud Drive'],
    ['/Users/a/Dropbox/ONIX zaxira',                             'Dropbox'],
    ['/Users/a/Yandex.Disk/ONIX',                                'Yandex.Disk'],
  ];
  for (const [dir, name] of cloudCases) eq(backup.cloudName(dir), name, `${name} tanildi`);
  ok(!backup.inCloud('/Users/a/Documents/zaxira'), 'oddiy papka bulut deb hisoblanmaydi');
  ok(backup.cloudName('/Users/a/Documents/zaxira') === null, 'bulut bo\'lmasa nom qaytmaydi');

  console.log('\n— Parol —');
  const env = backup.pgEnv('postgresql://onix:maxfiy%40parol@srv:5433/onixdb');
  eq(env.PGUSER, 'onix', 'foydalanuvchi ajratildi');
  eq(env.PGPASSWORD, 'maxfiy@parol', 'parol ajratildi va kodlashdan chiqarildi');
  eq(env.PGHOST, 'srv', 'host ajratildi');
  eq(env.PGPORT, '5433', 'port ajratildi');
  eq(env.PGDATABASE, 'onixdb', 'baza nomi ajratildi');
  ok(backup.pgEnv('bu-url-emas') === null, 'noto\'g\'ri URL da null qaytadi');
}

// ---------- Tozalash ----------

function testPrune() {
  console.log('\n— Eskilarini tozalash —');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onix-prune-'));

  for (let d = 1; d <= 10; d++) {
    fs.writeFileSync(path.join(dir, `onix-2026-09-${String(d).padStart(2, '0')}-0300.sql.gz`), 'x');
  }
  fs.writeFileSync(path.join(dir, 'boshqa-fayl.txt'), 'x');
  fs.writeFileSync(path.join(dir, 'onix-yarim.sql.gz.part'), 'x');

  eq(backup.list(dir).length, 10, 'faqat zaxira fayllari sanaladi');
  eq(backup.list(dir)[0], 'onix-2026-09-10-0300.sql.gz', 'eng yangisi birinchi turadi');

  eq(backup.prune(dir, 3), 7, 'chegaradan ortiqchasi o\'chirildi');
  eq(backup.list(dir).length, 3, 'belgilangan miqdor qoldi');
  eq(backup.list(dir)[2], 'onix-2026-09-08-0300.sql.gz', 'eng eskisi emas, eng yangilari qoldi');

  // Chegara kun bo'yicha: bir kunda bir necha marta nusxa olingan bo'lsa,
  // o'sha kun bitta hisoblanadi — «oxirgi 3 kun» 3 kunligicha qoladi
  for (const t of ['0900', '1400', '2100']) {
    fs.writeFileSync(path.join(dir, `onix-2026-09-10-${t}.sql.gz`), 'x');
  }
  eq(backup.prune(dir, 3), 0, 'bir kundagi qo\'shimcha nusxalar chegarani yemaydi');
  eq(new Set(backup.list(dir).map(backup.dayOf)).size, 3, 'baribir 3 kunlik nusxa turibdi');
  eq(backup.list(dir).length, 6, 'o\'sha kunning hamma nusxasi saqlanib qoldi');

  ok(fs.existsSync(path.join(dir, 'boshqa-fayl.txt')), 'begona fayl tegilmadi');
  ok(fs.existsSync(path.join(dir, 'onix-yarim.sql.gz.part')), 'tugallanmagan fayl tegilmadi');

  eq(backup.prune(dir, 30), 0, 'chegaradan kam bo\'lsa hech narsa o\'chmaydi');
  eq(backup.list('/bunday/papka/yo\'q').length, 0, 'yo\'q papkada xato bermaydi');

  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- Haqiqiy nusxa va tiklash ----------

async function testRoundTrip() {
  console.log('\n— Nusxa olish —');

  const marker = `sinov-${Date.now()}`;
  const user = 999001;
  await db.q("INSERT INTO onix_users (tg_id, full_name, role) VALUES ($1,'Zaxira testi','admin') ON CONFLICT (tg_id) DO NOTHING", [user]);
  const acc = (await db.q("SELECT id FROM onix_accounts WHERE kind='cash' AND currency='UZS' LIMIT 1")).rows[0].id;
  const cat = (await db.q(`SELECT id FROM onix_categories p WHERE p.level > 1 AND p.active
     AND NOT EXISTS (SELECT 1 FROM onix_categories c WHERE c.parent_id = p.id AND c.active) LIMIT 1`)).rows[0].id;
  await db.q(`INSERT INTO onix_operations (type, account_id, category_id, amount, currency, paid_at, period, note, created_by)
              VALUES ('expense',$1,$2,7654321.55,'UZS','2026-08-30','2026-09-01',$3,$4)`, [acc, cat, marker, user]);

  const before = (await db.q('SELECT count(*)::int n FROM onix_operations')).rows[0].n;

  const res = await backup.run();
  ok(fs.existsSync(res.file), 'fayl yaratildi');
  ok(res.size > 500, `fayl bo'sh emas (${backup.humanSize(res.size)})`);
  ok(/\.sql\.gz$/.test(res.file), 'siqilgan .sql.gz kengaytmasi');
  ok(!fs.existsSync(`${res.file}.part`), 'yarim fayl qolmadi');
  eq(path.dirname(res.file), DIR, 'belgilangan papkaga yozildi');

  console.log('\n— Ichida nima bor —');
  const sql = execFileSync('gunzip', ['-c', res.file], { maxBuffer: 64 * 1024 * 1024 }).toString();
  ok(sql.includes('onix_operations'), 'operatsiyalar jadvali ichida');
  ok(sql.includes('onix_categories'), 'kategoriyalar jadvali ichida');
  ok(sql.includes('onix_users'), 'foydalanuvchilar jadvali ichida');
  ok(sql.includes(marker), 'sinov yozuvi nusxaga tushdi');
  ok(sql.includes('7654321.55'), 'summa aynan saqlandi — yaxlitlanmadi');
  ok(sql.includes('2026-08-30') && sql.includes('2026-09-01'), 'ikkala sana ham saqlandi');
  ok(/DROP TABLE IF EXISTS/.test(sql), 'tiklashda eski jadvallar tozalanadi');
  ok(/setval/.test(sql), 'ID hisoblagichlari ham saqlandi');

  console.log('\n— Tozalash chegarasi —');
  const r2 = await backup.run();
  eq(r2.days, 1, 'bugungi nusxa bitta kun deb sanaladi');
  ok(r2.total >= 1, 'nusxa joyida turibdi');

  // Kechagi «eski» nusxani qo'lda qo'yamiz va chegarani sinaymiz
  const kecha = new Date(Date.now() - 864e5);
  fs.writeFileSync(path.join(DIR, backup.fileName(kecha)), 'x');
  eq(new Set(backup.list(DIR).map(backup.dayOf)).size, 2, 'ikki kunlik nusxa bor');
  ok(backup.prune(DIR, 1) >= 1, 'chegara 1 kun bo\'lganda eskisi o\'chdi');
  eq(new Set(backup.list(DIR).map(backup.dayOf)).size, 1, 'faqat bugungi kun qoldi');

  return before;
}

// ---------- Xatolar ----------

async function testErrors() {
  console.log('\n— Xatolar —');

  const saved = process.env.ONIX_PG_DUMP;
  process.env.ONIX_PG_DUMP = '/bunday/dastur/yo_q/pg_dump';
  let msg = '';
  try { await backup.dump(DIR); } catch (err) { msg = err.message; }
  ok(/pg_dump topilmadi/.test(msg), `pg_dump yo'q bo'lsa tushunarli xato: "${msg}"`);
  ok(backup.list(DIR).every(n => !n.endsWith('.part')), 'xatodan keyin yarim fayl qolmaydi');
  process.env.ONIX_PG_DUMP = saved || '';
  if (!saved) delete process.env.ONIX_PG_DUMP;

  const url = process.env.DATABASE_URL;
  process.env.DATABASE_URL = '';
  msg = '';
  try { await backup.dump(DIR); } catch (err) { msg = err.message; }
  ok(/DATABASE_URL/.test(msg), 'DATABASE_URL yo\'q bo\'lsa aniq aytadi');
  process.env.DATABASE_URL = url;
}

(async () => {
  try {
    testPure();
    testPrune();
    await testRoundTrip();
    await testErrors();
  } catch (err) {
    console.error('\n💥 Test to\'xtadi:', err.message);
    fail++;
  }

  fs.rmSync(DIR, { recursive: true, force: true });
  await db.q('DELETE FROM onix_operations WHERE created_by = 999001');
  await db.q('DELETE FROM onix_users WHERE tg_id = 999001');

  console.log(`\n${fail ? '❌' : '✅'} Zaxira: ${pass} ta o'tdi, ${fail} ta yiqildi`);
  process.exit(fail ? 1 : 0);
})();
