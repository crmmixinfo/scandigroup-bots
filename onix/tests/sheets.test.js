// Google Sheets ga chiqarish testlari.
//
// Haqiqiy Google ga chiqmaydi — o'rniga shu yerda kichik HTTP server
// ko'tariladi va Apps Script bilan bir xil shartnomani bajaradi.
// Shunda qatorlar tuzilishi, bo'laklarga bo'linishi, maxfiy so'z va
// xatolarni ushlash — hammasi haqiqiy so'rov orqali tekshiriladi.

process.env.PGSSL = 'off';
process.env.SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID || '1';
process.env.ONIX_SHEETS_SECRET = 'sinov-maxfiy-soz';

const http = require('http');

let pass = 0, fail = 0;
const ok = (cond, label) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  cond ? pass++ : fail++;
};
const eq = (got, want, label) => {
  const same = String(got) === String(want);
  console.log(`${same ? '✅' : '❌'} ${label}${same ? '' : `  kutilgan=${want} olindi=${got}`}`);
  same ? pass++ : fail++;
};

// ---------- Soxta Apps Script ----------

// Server kutayotgan maxfiy so'z bir marta olinadi: keyin muhit o'zgarsa
// ham server o'z so'zida qoladi — aks holda tekshiruv ma'nosini yo'qotadi.
const EXPECTED_SECRET = process.env.ONIX_SHEETS_SECRET;

const book = new Map();      // varaq nomi -> qatorlar
const received = [];         // kelgan so'rovlar
let behaviour = 'ok';        // xatolarni sinash uchun

function startServer() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };

      if (behaviour === 'html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<html>Google kirish sahifasi</html>');
      }
      if (behaviour === '500') return send(500, { ok: false, error: 'ichki xato' });

      let data;
      try { data = JSON.parse(body); } catch { return send(200, { ok: false, error: 'buzuq json' }); }

      received.push(data);
      if (data.secret !== EXPECTED_SECRET) {
        return send(200, { ok: false, error: 'Maxfiy so\'z to\'g\'ri kelmadi' });
      }

      if (data.reset) book.set(data.sheet, data.header ? [data.header] : []);
      const sheet = book.get(data.sheet) || [];
      sheet.push(...(data.rows || []));
      book.set(data.sheet, sheet);

      send(200, { ok: true, sheet: data.sheet, rows: (data.rows || []).length });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---------- Ma'lumot ----------

async function seed(db) {
  // Boshqa test fayllaridan qolgan ma'lumot aralashmasin: jadval butun
  // bazani ko'chiradi, shuning uchun toza boshlash shart.
  await db.q('TRUNCATE onix_operations RESTART IDENTITY CASCADE');
  await db.q("DELETE FROM onix_accounts WHERE kind='podotchet'");
  await db.q('DELETE FROM onix_categories');
  await db.q('DELETE FROM onix_users');

  const admin = 999101, hodim = 999102;
  await db.q(`INSERT INTO onix_users (tg_id, full_name, role) VALUES
                ($1,'Sheets admin','admin'), ($2,'Sheets hodim','staff')
              ON CONFLICT (tg_id) DO NOTHING`, [admin, hodim]);

  const acc = (await db.q("SELECT id FROM onix_accounts WHERE kind='cash' AND currency='UZS' LIMIT 1")).rows[0].id;
  await db.ensurePodotchet(hodim, 'Sheets hodim');
  const pod = (await db.q(
    "SELECT id FROM onix_accounts WHERE kind='podotchet' AND owner_tg_id=$1 AND currency='UZS'", [hodim])).rows[0];

  const mk = async (parent, level, name, flow) => (await db.addCategory(parent, level, name, flow, null)).id;
  const gi  = await mk(null, 1, 'Sheets kirim guruhi', 'income');
  const ci  = await mk(gi, 2, 'Ijara', 'income');
  const ge  = await mk(null, 1, 'Sheets chiqim guruhi', 'expense');
  const ce  = await mk(ge, 2, 'Kommunal', 'expense');
  const se  = await mk(ce, 3, "Elektr — o'lchov", 'expense');

  const op = (type, account, cat, amount, paid, period, note, by) =>
    db.q(`INSERT INTO onix_operations (type, account_id, category_id, amount, currency, paid_at, period, note, created_by)
          VALUES ($1,$2,$3,$4,'UZS',$5,$6,$7,$8) RETURNING id`,
         [type, account, cat, amount, paid, period, note, by]);

  await op('income',  acc, ci, 5000000, '2026-08-05', '2026-08-01', 'avgust ijara', admin);
  // Ikki sana: avgustda to'langan, sentyabr davriga tegishli
  await op('expense', acc, se, 1200000, '2026-08-30', '2026-09-01', 'sentyabr elektri', admin);
  await op('expense', pod.id, se, 300000, '2026-09-01', '2026-09-01', 'hodim xarajati', hodim);

  const del = await op('expense', acc, se, 999999, '2026-09-01', '2026-09-01', 'xato yozuv', admin);
  await db.softDelete(del.rows[0].id, admin, 'sinov uchun bekor qilindi');

  // Kassadan hodim podotchyotiga pul berildi — bu xarajat emas, o'tkazma
  await db.q(`INSERT INTO onix_operations (type, account_id, to_account_id, amount, currency, paid_at, period, created_by)
              VALUES ('transfer',$1,$2,700000,'UZS','2026-09-01','2026-09-01',$3)`, [acc, pod.id, admin]);

  return { admin, hodim, acc, pod: pod.id };
}

// ---------- Testlar ----------

(async () => {
  const server = await startServer();
  process.env.ONIX_SHEETS_URL = `http://127.0.0.1:${server.address().port}/`;

  const db = require('../db');
  const sheets = require('../sheets');

  try {
    await seed(db);

    console.log('\n— Operatsiyalar varag\'i —');
    const ops = await sheets.operations();
    eq(sheets.OPERATIONS_HEADER.length, 16, 'sarlavhada 16 ustun');
    ok(ops.every(r => r.length === 16), 'har bir qator sarlavha bilan bir xil kenglikda');
    ok(ops.length >= 5, `hamma yozuv chiqdi (${ops.length} ta)`);

    const elektr = ops.find(r => r[11] === 'sentyabr elektri');
    ok(elektr, 'yozuv topildi');
    eq(elektr[1], '2026-08-30', 'to\'lov sanasi o\'z ustunida');
    eq(elektr[2], '2026-09-01', 'P&L davri alohida ustunda — ikki sana ajratilgan');
    eq(elektr[3], 'Chiqim', 'tur o\'zbekcha yozildi');
    eq(elektr[5], 1200000, 'summa son bo\'lib ketdi, matn emas');
    ok(typeof elektr[5] === 'number', 'Sheets uni son deb qabul qiladi');
    eq(elektr[8], 'Sheets chiqim guruhi', 'guruh');
    eq(elektr[9], 'Kommunal', 'kategoriya');
    eq(elektr[10], 'Elektr — o\'lchov', 'podkategoriya');
    eq(elektr[12], 'Sheets admin', 'kim kiritgani');

    const bekor = ops.find(r => r[11] === 'xato yozuv');
    eq(bekor[14], 'ha', 'bekor qilingan yozuv belgilangan');
    eq(bekor[15], 'sinov uchun bekor qilindi', 'bekor qilish sababi ham bor');

    const otkazma = ops.find(r => r[3] === 'O\'tkazma');
    ok(otkazma, 'o\'tkazma ham jadvalga tushdi');
    ok(otkazma[7], 'o\'tkazmada qabul qiluvchi hisob ko\'rsatilgan');
    eq(otkazma[9], '', 'o\'tkazmada kategoriya yo\'q');

    console.log('\n— Qoldiqlar varag\'i —');
    const bal = await sheets.balances();
    ok(bal.length >= 4, `hisoblar chiqdi (${bal.length} ta)`);
    const podqator = bal.find(r => r[1] === 'Podotchyot');
    ok(podqator, 'podotchyot hisobi bor');
    eq(podqator[2], 'Sheets hodim', 'podotchyot egasi ko\'rsatilgan');
    ok(typeof podqator[4] === 'number', 'qoldiq son');

    console.log('\n— Foyda-zarar (period bo\'yicha) —');
    const pl = await sheets.byMonth('period');
    ok(pl.header.includes('2026-08') && pl.header.includes('2026-09'), 'oylar ustun bo\'ldi');
    const plSep = pl.header.indexOf('2026-09');
    const plAug = pl.header.indexOf('2026-08');
    const plElektr = pl.body.find(r => r[4] === 'Elektr — o\'lchov');
    eq(plElektr[plSep], 1500000, 'avgustda to\'langan xarajat SENTYABR foyda-zararida');
    eq(plElektr[plAug], 0, 'avgust foyda-zararida u yo\'q');
    ok(!pl.body.some(r => r.includes(999999)), 'bekor qilingan yozuv hisobga olinmadi');

    const plFoyda = pl.body.find(r => r[2] === 'FOYDA / ZARAR');
    eq(plFoyda[plAug], 5000000, 'avgust foydasi — faqat ijara');
    eq(plFoyda[plSep], -1500000, 'sentyabr zarari — faqat elektr');

    console.log('\n— Pul oqimi (to\'lov sanasi bo\'yicha) —');
    const cf = await sheets.byMonth('paid_at');
    const cfAug = cf.header.indexOf('2026-08');
    const cfSep = cf.header.indexOf('2026-09');
    const cfElektr = cf.body.find(r => r[4] === 'Elektr — o\'lchov');
    eq(cfElektr[cfAug], 1200000, 'pul avgustda chiqqani avgustda turibdi');
    eq(cfElektr[cfSep], 300000, 'sentyabrda chiqqani sentyabrda');
    ok(cfElektr[cfAug] !== plElektr[plAug], 'pul oqimi va foyda-zarar bir xil emas — model shuning uchun');

    console.log('\n— Yuborish —');
    received.length = 0; book.clear();
    const res = await sheets.sync();
    eq(Object.keys(res).length, 4, 'to\'rtta varaq yuborildi');
    ok(book.has('Operatsiyalar') && book.has('Qoldiqlar') &&
       book.has('Foyda-zarar') && book.has('Pul oqimi'), 'varaqlar nomi to\'g\'ri');
    eq(book.get('Operatsiyalar').length, ops.length + 1, 'sarlavha + hamma qator yetib bordi');
    eq(book.get('Operatsiyalar')[0][1], 'To\'lov sanasi', 'birinchi qator — sarlavha');
    ok(received.every(r => r.secret === EXPECTED_SECRET), 'har so\'rovda maxfiy so\'z bor');
    ok(received.filter(r => r.sheet === 'Operatsiyalar')[0].reset === true, 'birinchi bo\'lak varaqni tozalaydi');
    ok(received.filter(r => r.sheet === 'Operatsiyalar').pop().done === true, 'oxirgi bo\'lak yakun deb belgilanadi');

    console.log('\n— Katta hajm bo\'laklarga bo\'linadi —');
    received.length = 0;
    const many = Array.from({ length: sheets.CHUNK * 2 + 7 }, (_, i) => [i, 'qator']);
    await sheets.sendSheet('Katta', ['A', 'B'], many);
    const parts = received.filter(r => r.sheet === 'Katta');
    eq(parts.length, 3, 'uch bo\'lakka bo\'lindi');
    eq(parts[0].rows.length, sheets.CHUNK, 'birinchi bo\'lak to\'la');
    eq(parts[2].rows.length, 7, 'oxirgi bo\'lakda qoldig\'i');
    eq(book.get('Katta').length, many.length + 1, 'hammasi yetib bordi');
    ok(parts.slice(1).every(p => !p.reset), 'keyingi bo\'laklar varaqni tozalamaydi');
    ok(parts.filter(p => p.done).length === 1, 'yakun bir marta belgilanadi');

    console.log('\n— Bo\'sh jadval —');
    received.length = 0;
    await sheets.sendSheet('Bosh', ['A'], []);
    eq(received.filter(r => r.sheet === 'Bosh').length, 1, 'bo\'sh bo\'lsa ham sarlavha yuboriladi');
    eq(book.get('Bosh').length, 1, 'varaqda faqat sarlavha qoldi');

    console.log('\n— Xatolar —');
    let msg = '';
    try {
      await sheets.post({ sheet: 'X', rows: [] });
    } catch (err) { msg = err.message; }
    ok(msg === '', 'to\'g\'ri maxfiy so\'z bilan o\'tadi');

    // Havola sirdan chiqib ketsa ham begona yozolmasin
    const rows0 = (book.get('Operatsiyalar') || []).length;
    delete require.cache[require.resolve('../sheets')];
    process.env.ONIX_SHEETS_SECRET = 'begona-soz';
    const chet = require('../sheets');
    msg = '';
    try { await chet.sendSheet('Operatsiyalar', ['A'], [['buzg\'unchi']]); } catch (err) { msg = err.message; }
    ok(/Maxfiy so'z/.test(msg), `noto'g'ri maxfiy so'z rad etildi: "${msg}"`);
    eq((book.get('Operatsiyalar') || []).length, rows0, 'rad etilgan so\'rov jadvalga tegmadi');

    delete require.cache[require.resolve('../sheets')];
    process.env.ONIX_SHEETS_SECRET = 'sinov-maxfiy-soz';

    behaviour = 'html';
    msg = '';
    try { await sheets.sendSheet('X', ['A'], [['1']]); } catch (err) { msg = err.message; }
    ok(/tushunarsiz javob/.test(msg), `Google kirish sahifasi qaytsa tushunarli xato: "${msg.slice(0, 60)}…"`);

    behaviour = '500';
    msg = '';
    try { await sheets.sendSheet('X', ['A'], [['1']]); } catch (err) { msg = err.message; }
    ok(/500/.test(msg), 'server xatosi ham ushlanadi');
    behaviour = 'ok';

    console.log('\n— O\'zgarish izi —');
    const fp1 = await sheets.fingerprint();
    eq(await sheets.fingerprint(), fp1, 'daftar tegilmasa iz o\'zgarmaydi');
    await db.q(`INSERT INTO onix_operations (type, account_id, amount, currency, paid_at, period, created_by)
                VALUES ('opening',(SELECT id FROM onix_accounts WHERE kind='cash' AND currency='UZS' LIMIT 1),
                        1,'UZS','2026-09-02','2026-09-01',999101)`);
    ok(await sheets.fingerprint() !== fp1, 'yangi yozuvdan keyin iz o\'zgardi');

  } catch (err) {
    console.error('\n💥 Test to\'xtadi:', err.stack);
    fail++;
  }

  server.close();
  await db.q('DELETE FROM onix_operations WHERE created_by IN (999101, 999102)');
  await db.q('DELETE FROM onix_accounts WHERE owner_tg_id IN (999101, 999102)');
  await db.q('DELETE FROM onix_users WHERE tg_id IN (999101, 999102)');

  console.log(`\n${fail ? '❌' : '✅'} Sheets: ${pass} ta o'tdi, ${fail} ta yiqildi`);
  process.exit(fail ? 1 : 0);
})();
