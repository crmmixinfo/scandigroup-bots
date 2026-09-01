process.env.PGSSL = 'off';
process.env.SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID || '1';

const db = require('../db');
const R  = require('../reports');
const f  = require('../format');

let pass = 0, fail = 0;
const ok = (cond, label) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  cond ? pass++ : fail++;
};

const eq = (got, want, label) => {
  // Sonlar uchun yaqinlik, matn uchun aniq moslik
  const numeric = typeof want === 'number';
  const ok = numeric
    ? Math.abs(Number(got) - Number(want)) < 0.01
    : String(got) === String(want);
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : `  kutilgan=${want} olindi=${got}`}`);
  ok ? pass++ : fail++;
};

const catId = async (name) => (await db.one('SELECT id FROM onix_categories WHERE name=$1 AND level=3', [name])).id;

// Testlar o'z kategoriya daraxtini quradi — urug' mazmuniga bog'liq emas
async function seedTree() {
  const mk = async (parent, level, name, flow) =>
    (await db.addCategory(parent, level, name, flow, null)).id;
  const gi = await mk(null, 1, 'Test daromad guruhi', 'income');
  const ci = await mk(gi, 2, 'Savdo tushumi', 'income');
  await mk(ci, 3, 'Naqd savdo', 'income');
  const ge = await mk(null, 1, 'Test xarajat guruhi', 'expense');
  const c1 = await mk(ge, 2, 'Xom ashyo va mahsulot', 'expense');
  await mk(c1, 3, 'Oziq-ovqat', 'expense');
  const c2 = await mk(ge, 2, 'Ijara va kommunal', 'expense');
  await mk(c2, 3, 'Ijara haqi', 'expense');
  // Podkategoriyasiz kategoriya — «Yangiobod > Soliq» kabi
  await mk(await mk(null, 1, 'Yangiobod', 'expense'), 2, 'Soliq', 'expense');
}
const accId = async (name) => (await db.one('SELECT id FROM onix_accounts WHERE name=$1', [name])).id;

(async () => {
  await db.q('TRUNCATE onix_operations RESTART IDENTITY CASCADE');
  await db.q("DELETE FROM onix_accounts WHERE kind='podotchet'");
  await db.q('DELETE FROM onix_users');
  await db.q('DELETE FROM onix_pending_users');
  await db.q('DELETE FROM onix_categories');
  await seedTree();

  await db.addUser(101, 'Rustam Kassir', 'cashier', 1);
  await db.addUser(201, 'Ali Valiyev',   'staff',   1);
  await db.addUser(202, 'Vali Aliyev',   'staff',   1);

  const naqdSum  = await accId('Naqd (sum)');
  const naqdUsd  = await accId('Naqd ($)');
  const plastik  = await accId('Plastik (sum)');
  const aliSum   = (await db.listAccounts({ kind:'podotchet', ownerTgId:201, currency:'UZS' }))[0].id;

  const JAN = '2026-01-01', FEB = '2026-02-01';

  // 1) Savdo tushumi — 40 mln, yanvarda to'landi, yanvar P&L
  await db.addOperation({ type:'income', account_id:naqdSum, category_id:await catId('Naqd savdo'),
    amount:40_000_000, currency:'UZS', paid_at:'2026-01-05', period:JAN, created_by:101 });

  // 2) Kassir → Ali podotchyot 5 mln (XARAJAT EMAS, ichki o'tkazma)
  await db.addOperation({ type:'transfer', account_id:naqdSum, to_account_id:aliSum,
    amount:5_000_000, currency:'UZS', paid_at:'2026-01-10', period:JAN, created_by:101 });

  // 3) Ali podotchyot puldan xarajat qildi — 3 mln, yanvar
  await db.addOperation({ type:'expense', account_id:aliSum, category_id:await catId('Oziq-ovqat'),
    amount:3_000_000, currency:'UZS', paid_at:'2026-01-12', period:JAN, created_by:201 });

  // 4) ⭐ ASOSIY HOLAT: 25-yanvarda FEVRAL arendasi to'landi
  //    Pul oqimi → yanvar,  Foyda-zarar → FEVRAL
  await db.addOperation({ type:'expense', account_id:plastik, category_id:await catId('Ijara haqi'),
    amount:8_000_000, currency:'UZS', paid_at:'2026-01-25', period:FEB, created_by:101 });

  // 5) Valyuta konvertatsiyasi: 13 mln sum → 1000 $
  await db.addOperation({ type:'transfer', account_id:naqdSum, to_account_id:naqdUsd,
    amount:13_000_000, to_amount:1000, currency:'UZS', paid_at:'2026-01-15', period:JAN, created_by:101 });

  console.log('\n─── PUL OQIMI: yanvar, UZS ───');
  const cf = await R.cashFlow('2026-01-01', '2026-01-31', 'UZS');
  eq(cf.opening,      0,          'boshlang\'ich qoldiq');
  eq(cf.incomeTotal,  40_000_000, 'kirim');
  eq(cf.expenseTotal, 11_000_000, 'chiqim (3 mln + 8 mln — o\'tkazma kirmaydi)');
  eq(cf.convOut,      13_000_000, 'konvertatsiya chiqimi');
  eq(cf.net,          16_000_000, 'sof oqim');
  eq(cf.closing,      16_000_000, 'yakuniy qoldiq');
  eq(cf.accounts.reduce((a,x)=>a+Number(x.balance),0), 16_000_000, 'kassa qoldiqlari yig\'indisi = yakuniy qoldiq');

  console.log('\n─── PUL OQIMI: yanvar, USD ───');
  const cfu = await R.cashFlow('2026-01-01', '2026-01-31', 'USD');
  eq(cfu.convIn,  1000, 'konvertatsiyadan kirgan $');
  eq(cfu.closing, 1000, '$ yakuniy qoldiq');

  console.log('\n─── FOYDA-ZARAR: YANVAR, UZS ───');
  const pl1 = await R.profitLoss(JAN, 'UZS');
  eq(pl1.revenue, 40_000_000, 'daromad');
  eq(pl1.costs,    3_000_000, 'xarajat (arenda yanvarga KIRMAYDI)');
  eq(pl1.profit,  37_000_000, 'foyda');

  console.log('\n─── ⭐ FOYDA-ZARAR: FEVRAL, UZS (yanvarda to\'langan arenda) ───');
  const pl2 = await R.profitLoss(FEB, 'UZS');
  eq(pl2.revenue,          0, 'fevral daromadi');
  eq(pl2.costs,    8_000_000, 'fevral xarajati = yanvarda to\'langan arenda');
  eq(pl2.profit,  -8_000_000, 'fevral zarari');

  console.log('\n─── PODOTCHYOT ───');
  const p = await R.podotchetReport('2026-01-01', '2026-01-31', 'UZS');
  const ali = p.find(x => x.tg_id === '201' || x.tg_id === 201 || String(x.tg_id) === '201');
  eq(ali.received, 5_000_000, 'Ali olgan');
  eq(ali.spent,    3_000_000, 'Ali sarflagan');
  eq(ali.balance,  2_000_000, 'Ali qo\'lidagi qoldiq');

  console.log('\n─── PODKATEGORIYASIZ KATEGORIYA ───');
  const soliqId = (await db.one("SELECT id FROM onix_categories WHERE name='Soliq' AND level=2")).id;
  await db.addOperation({ type:'expense', account_id:plastik, category_id:soliqId,
    amount:1_500_000, currency:'UZS', paid_at:'2026-01-20', period:JAN, created_by:101 });

  const plS = await R.profitLoss(JAN, 'UZS');
  const yangiobod = plS.expense.find(g => g.name === 'Yangiobod');
  eq(yangiobod ? 1 : 0, 1, 'guruh hisobotda chiqdi');
  eq(yangiobod.total, 1_500_000, 'guruh jami');
  eq(yangiobod.cats.length, 1, 'bitta kategoriya');
  eq(yangiobod.cats[0].name, 'Soliq', 'kategoriya nomi');
  eq(yangiobod.cats[0].subs.length, 0, 'podkategoriya yo\'q — bo\'sh');
  eq(plS.costs, 4_500_000, 'jami xarajat 3 mln + 1.5 mln');

  const cfS = await R.cashFlow('2026-01-01', '2026-01-31', 'UZS');
  eq(cfS.expense.find(g => g.name === 'Yangiobod').total, 1_500_000, 'pul oqimida ham ko\'rindi');

  console.log('\n─── BOSHLANG\'ICH QOLDIQ ───');
  // Boshlang'ich qoldiq kassaga tushadi, lekin daromad emas —
  // aks holda birinchi oy foydasi yolg'on chiqardi.
  await db.addOperation({ type:'opening', account_id:naqdSum,
    amount:12_500_000, currency:'UZS', paid_at:'2025-12-31', period:'2025-12-01', created_by:101 });

  const plO = await R.profitLoss('2025-12-01', 'UZS');
  eq(plO.revenue, 0, 'foyda-zararda daromad EMAS');
  eq(plO.profit,  0, 'yolg\'on foyda yaratmaydi');

  const cfDec = await R.cashFlow('2025-12-01', '2025-12-31', 'UZS');
  eq(cfDec.incomeTotal,     0,          'pul oqimida kirim sifatida sanalmaydi');
  eq(cfDec.openedInPeriod,  12_500_000, 'alohida qator sifatida ko\'rinadi');
  eq(cfDec.closing,         12_500_000, 'yakuniy qoldiqqa qo\'shiladi');

  const cfJanAfter = await R.cashFlow('2026-01-01', '2026-01-31', 'UZS');
  eq(cfJanAfter.opening, 12_500_000, 'keyingi davrga boshlang\'ich qoldiq bo\'lib o\'tadi');

  console.log('\n─── KELGUSI OYGA YOZILGANLAR ───');
  const def = await R.deferred('UZS', JAN);
  eq(def.length, 1, 'bitta kelgusi davr yozuvi');
  eq(def[0].total, 8_000_000, 'kelgusi oyga yozilgan summa');

  console.log('\n─── PODOTCHYOT: qoldiq davr oxiriga ───');
  // Ali 10-yanvarda 5 mln oldi, 12-yanvarda 3 mln sarfladi
  const pod5  = await R.podotchetReport('2026-01-01', '2026-01-05', 'UZS');
  const pod11 = await R.podotchetReport('2026-01-01', '2026-01-11', 'UZS');
  const pod31 = await R.podotchetReport('2026-01-01', '2026-01-31', 'UZS');
  const ali5  = pod5.find(x => String(x.tg_id) === '201');
  const ali11 = pod11.find(x => String(x.tg_id) === '201');
  const ali31 = pod31.find(x => String(x.tg_id) === '201');
  eq(ali5.balance,  0,         '5-yanvarda hali pul olmagan');
  eq(ali11.balance, 5_000_000, '11-yanvarda 5 mln qo\'lida');
  eq(ali31.balance, 2_000_000, '31-yanvarda 2 mln qolgan');

  console.log('\n─── KUNLIK HISOBOT ───');
  const daily = require('../daily');

  const msgs = await daily.build('2026-01-12');   // Ali oziq-ovqat sotib olgan kun
  ok(msgs.length >= 2, 'bir necha alohida xabar');
  ok(msgs[0].includes('KASSA'), '1-xabar — kassa');
  ok(msgs[0].includes('12.01.2026'), 'sana to\'g\'ri');
  ok(msgs.some(m => m.includes('KUNLIK HISOBOT') && m.includes('Kun boshida')),
     'hodim alohida xabarda, batafsil');
  ok(msgs[msgs.length - 1].includes('QOLDIQLAR') &&
     msgs[msgs.length - 1].includes('kun boshiga'),
     'oxirgi xabar — kun boshiga qoldiqlar');

  // Pul oqimi va foyda-zarar bu yerga kirmasligi kerak
  const joined = msgs.join('\n');
  ok(!joined.includes('PUL OQIMI'), 'pul oqimi kirmadi');
  ok(!joined.includes('FOYDA-ZARAR'), 'foyda-zarar kirmadi');
  ok(!joined.includes('Rentabellik'), 'rentabellik kirmadi');

  // Har hodim alohida xabarda — bittasida ikkalasi bo'lmasin
  const staffMsgs = msgs.filter(m => m.includes('Kun boshida'));
  for (const m of staffMsgs) {
    const names = ['Ali Valiyev', 'Vali Aliyev'].filter(n => m.includes(n));
    ok(names.length <= 1, 'bitta xabarda bitta hodim');
  }

  // Harakatsiz kun
  const quiet = await daily.build('2026-01-02');
  ok(quiet[0].includes('KASSA'), 'harakatsiz kunda ham kassa xabari keladi');
  ok(!quiet.some(m => m.includes('Kun boshida')), 'harakatsiz kunda hodim xabari yo\'q');

  // Kimga ketadi — faqat admin va rahbar
  await db.addUser(301, 'Sardor Rahbar', 'manager', 101);
  await db.addUser(1,   'Bosh admin',    'admin',   1);
  const to = await daily.recipients();
  const roles = to.map(u => u.role).sort().join(',');
  eq(roles, 'admin,manager', 'faqat admin va rahbarlarga (kassir va hodimga emas)');

  // Yuborilgan kun eslab qolinadi — ikki marta ketmasligi uchun
  await db.setSetting('daily_report_last_sent', '2026-01-12');
  eq(await db.getSetting('daily_report_last_sent'), '2026-01-12', 'yuborilgan kun saqlandi');

  console.log(`\n${fail === 0 ? '🎉' : '⚠️'}  ${pass} o'tdi, ${fail} yiqildi`);
  await db.pool.end();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('XATO:', e.message); process.exit(1); });
