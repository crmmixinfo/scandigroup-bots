process.env.PGSSL = 'off';
process.env.SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID || '1';

const db = require('../db');
const R  = require('../reports');
const f  = require('../format');

let pass = 0, fail = 0;
const eq = (got, want, label) => {
  const ok = Math.abs(Number(got) - Number(want)) < 0.01;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : `  kutilgan=${want} olindi=${got}`}`);
  ok ? pass++ : fail++;
};

const catId = async (name) => (await db.one('SELECT id FROM onix_categories WHERE name=$1 AND parent_id IS NOT NULL', [name])).id;
const accId = async (name) => (await db.one('SELECT id FROM onix_accounts WHERE name=$1', [name])).id;

(async () => {
  await db.q('TRUNCATE onix_operations RESTART IDENTITY CASCADE');
  await db.q("DELETE FROM onix_accounts WHERE kind='podotchet'");
  await db.q('DELETE FROM onix_users');

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

  console.log('\n─── KELGUSI OYGA YOZILGANLAR ───');
  const def = await R.deferred('UZS', JAN);
  eq(def.length, 1, 'bitta kelgusi davr yozuvi');
  eq(def[0].total, 8_000_000, 'kelgusi oyga yozilgan summa');

  console.log(`\n${fail === 0 ? '🎉' : '⚠️'}  ${pass} o'tdi, ${fail} yiqildi`);
  await db.pool.end();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('XATO:', e.message); process.exit(1); });
