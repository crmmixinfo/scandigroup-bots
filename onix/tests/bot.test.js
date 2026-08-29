process.env.PGSSL = 'off';
process.env.SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID || '1';
process.env.ONIX_BOT_TOKEN = '000:test';
const bot = require('../../onix-bot');
const db  = require('../db');
const K   = require('../keyboards');

bot.botInfo = { id: 1, is_bot: true, username: 'onix_test_bot', first_name: 'ONIX' };

let sent = [], mid = 100, uid = 1000;
// Tarmoqqa chiqmaslik uchun Telegram API ni prototip darajasida almashtiramiz
const { Telegram } = require('telegraf');
Telegram.prototype.callApi = async function (method, payload = {}) {
  sent.push({ method, text: payload.text });
  return { message_id: ++mid, date: 1, chat: { id: 1 }, text: payload.text };
};
const last = () => sent.length ? sent[sent.length - 1].text : '';

const msg = (text, from) => bot.handleUpdate({ update_id: ++uid, message: {
  message_id: ++mid, date: 1, chat: { id: from, type: 'private' },
  from: { id: from, is_bot: false, first_name: 'T' }, text,
  // Telegram buyruqlarni entity bilan belgilaydi — bot.command() shunga tayanadi
  ...(text.startsWith('/') ? { entities: [{ offset: 0, length: text.split(' ')[0].length, type: 'bot_command' }] } : {}) } });

const cb = (data, from) => bot.handleUpdate({ update_id: ++uid, callback_query: {
  id: String(++uid), chat_instance: '1', data,
  from: { id: from, is_bot: false, first_name: 'T' },
  message: { message_id: ++mid, date: 1, chat: { id: from, type: 'private' }, text: '—' } } });

let pass = 0, fail = 0;
const ok = (cond, label) => { console.log(`${cond?'✅':'❌'} ${label}`); cond ? pass++ : fail++; };
const eq = (got, want, label) => ok(String(got) === String(want), `${label}${String(got)===String(want)?'':`  kutilgan=${want} olindi=${got}`}`);

const accId = async (n) => (await db.one('SELECT id FROM onix_accounts WHERE name=$1',[n])).id;

(async () => {
  await db.q('TRUNCATE onix_operations RESTART IDENTITY CASCADE');
  await db.q("DELETE FROM onix_accounts WHERE kind='podotchet'");
  await db.q('DELETE FROM onix_users');
  await db.addUser(101,'Rustam Kassir','cashier',1);
  await db.addUser(201,'Ali Valiyev','staff',1);
  await db.addUser(301,'Sardor Rahbar','manager',1);

  const naqdSum = await accId('Naqd (sum)');
  const aliSum  = (await db.listAccounts({kind:'podotchet',ownerTgId:201,currency:'UZS'}))[0].id;
  const savdo   = (await db.one("SELECT id FROM onix_categories WHERE name='Savdo tushumi'")).id;
  const naqdSav = (await db.one("SELECT id FROM onix_categories WHERE name='Naqd savdo'")).id;
  const xomAsh  = (await db.one("SELECT id FROM onix_categories WHERE name='Xom ashyo va mahsulot'")).id;
  const ozOvqat = (await db.one("SELECT id FROM onix_categories WHERE name='Oziq-ovqat'")).id;

  // ═══ 1. RUXSATSIZ FOYDALANUVCHI ═══
  console.log('\n─── Ruxsat nazorati ───');
  sent = []; await msg('/start', 999);
  ok(last().includes('ruxsat berilmagan'), 'notanish foydalanuvchi rad etildi');
  sent = []; await msg(K.MENU.income, 301);
  ok(last().includes('ochiq emas'), 'rahbar kirim kirita olmaydi');
  sent = []; await msg(K.MENU.pnl, 101);
  ok(last().includes('ochiq emas'), 'kassir foyda-zararni ko\'ra olmaydi');

  // ═══ 2. KASSIR: KIRIM ═══
  console.log('\n─── Kassir: kirim (⭐ P&L keyingi oyga) ───');
  sent = []; await msg(K.MENU.income, 101);
  ok(last().includes('qaysi kassaga'), 'hisob so\'raldi');
  await cb(`acc:${naqdSum}`, 101);
  ok(last().includes('bo\'limini'), 'kategoriya bo\'limi so\'raldi');
  await cb(`cat:${savdo}`, 101);
  ok(last().includes('podkategoriya'), 'podkategoriya so\'raldi');
  await cb(`sub:${naqdSav}`, 101);
  ok(last().includes('Summani'), 'summa so\'raldi');
  sent = []; await msg('40 mln', 101);
  ok(last().includes("To'lov sanasi"), 'sana so\'raldi');
  await cb('dat:2026-03-05', 101);
  ok(last().includes('Foyda-zarar davri'), 'P&L davri so\'raldi');
  await cb('per:2026-04-01', 101);
  ok(last().includes('Izoh'), 'izoh so\'raldi');
  await cb('note:skip', 101);
  ok(last().includes('tasdiqlang') && last().includes('Aprel 2026'), 'tasdiq ekrani + ogohlantirish');
  await cb('save', 101);

  const op1 = await db.getOperation(1);
  eq(op1.amount, '40000000.00', 'summa saqlandi');
  eq(op1.paid_at.toISOString().slice(0,10), '2026-03-05', "to'lov sanasi (pul oqimi)");
  eq(op1.period.toISOString().slice(0,10),  '2026-04-01', 'P&L davri (foyda-zarar)');
  eq(op1.created_by, '101', 'muallif');

  // ═══ 3. KASSIR: PODOTCHYOT BERISH ═══
  console.log('\n─── Kassir: hodimga pul berish ───');
  sent = []; await msg(K.MENU.podotchet, 101);
  await cb(`acc:${naqdSum}`, 101);
  ok(last().includes('Kimga'), 'hodim so\'raldi');
  await cb(`to:${aliSum}`, 101);
  await msg('5 mln', 101);
  await cb('dat:2026-03-06', 101);
  ok(last().includes('Izoh'), 'o\'tkazmada P&L davri so\'ralmadi (to\'g\'ri)');
  await cb('note:skip', 101);
  await cb('save', 101);
  const op2 = await db.getOperation(2);
  eq(op2.type, 'transfer', 'tur = transfer');
  eq(op2.category_id, 'null', 'kategoriyasiz (P&L ga tushmaydi)');

  // ═══ 4. HODIM: PODOTCHYOT PULDAN XARAJAT ═══
  console.log('\n─── Hodim: o\'z pulidan xarajat ───');
  sent = []; await msg(K.MENU.myExpense, 201);
  ok(last().includes('Qaysi puldan'), 'hodimga o\'z hisobi ko\'rsatildi');
  await cb(`acc:${aliSum}`, 201);
  await cb(`cat:${xomAsh}`, 201);
  await cb(`sub:${ozOvqat}`, 201);
  await msg('3 mln', 201);
  await cb('dat:2026-03-07', 201);
  await cb('per:2026-03-01', 201);
  sent = []; await msg('Bozordan sabzavot', 201);
  await cb('save', 201);
  const op3 = await db.getOperation(3);
  eq(op3.type, 'expense', 'xarajat');
  eq(op3.account_id, aliSum, 'hodim podotchyotidan');
  eq(op3.note, 'Bozordan sabzavot', 'izoh saqlandi');

  sent = []; await msg(K.MENU.myBalance, 201);
  ok(last().includes('2 000 000'), 'hodim qoldig\'i 5−3 = 2 mln');

  // ═══ 5. QOLDIQDAN OSHIQ XARAJAT — OGOHLANTIRISH ═══
  console.log('\n─── Qoldiqdan oshiq xarajat ───');
  await msg(K.MENU.myExpense, 201);
  await cb(`acc:${aliSum}`, 201);
  await cb(`cat:${xomAsh}`, 201);
  await cb(`sub:${ozOvqat}`, 201);
  sent = []; await msg('99 mln', 201);
  ok(sent.some(s => s.text && s.text.includes('Diqqat')), 'qoldiqdan oshgani ogohlantirildi');
  await cb('cancel', 201);

  // ═══ 6. NOTO'G'RI SUMMA ═══
  console.log('\n─── Xato kiritish ───');
  await msg(K.MENU.income, 101);
  await cb(`acc:${naqdSum}`, 101);
  await cb(`cat:${savdo}`, 101);
  await cb(`sub:${naqdSav}`, 101);
  sent = []; await msg('salom', 101);
  ok(last().includes('tushunmadim'), 'yaroqsiz summa rad etildi');
  sent = []; await msg('1,5 mln', 101);
  ok(last().includes("To'lov sanasi"), 'to\'g\'ri summadan keyin davom etdi');
  await cb('cancel', 101);
  eq((await db.countOperations({})).n, 3, 'bekor qilingan yozuv saqlanmadi');

  // ═══ 7. RAHBAR: HISOBOTLAR ═══
  console.log('\n─── Rahbar: hisobotlar ───');
  sent = []; await msg(K.MENU.pnl, 301);
  await cb('rcur:UZS', 301);
  await cb('rmon:2026-04-01', 301);
  ok(sent.some(s => s.text && s.text.includes('FOYDA-ZARAR') && s.text.includes('40 000 000')),
     'aprel P&L da martda tushgan 40 mln ko\'rindi');

  sent = []; await msg(K.MENU.cashflow, 301);
  await cb('rcur:UZS', 301);
  await cb('rng:pick', 301);
  await cb('rrange:2026-03-01', 301);
  ok(sent.some(s => s.text && s.text.includes('PUL OQIMI') && s.text.includes('37 000 000')),
     'mart pul oqimi: 40−3 = 37 mln sof oqim');

  sent = []; await msg(K.MENU.podReport, 301);
  await cb('rcur:UZS', 301);
  await cb('rng:month', 301);
  ok(sent.some(s => s.text && s.text.includes('PODOTCHYOT')), 'podotchyot hisoboti chiqdi');

  // ═══ 8. YOZUVNI BEKOR QILISH ═══
  console.log('\n─── Yozuvni bekor qilish ───');
  sent = []; await msg('/del 1 xato', 201);
  ok(last().includes('faqat') || last().includes('Faqat'), 'begona yozuvni bekor qila olmadi');
  sent = []; await msg('/del 3 xato kiritildi', 201);
  ok(last().includes('Bekor qilindi'), 'o\'z yozuvini bekor qildi');
  eq((await db.countOperations({})).n, 2, 'bekor qilingan yozuv hisobdan chiqdi');
  sent = []; await msg(K.MENU.myBalance, 201);
  ok(last().includes('5 000 000'), 'bekor qilingandan keyin qoldiq tiklandi');

  console.log(`\n${fail===0?'🎉':'⚠️'}  ${pass} o'tdi, ${fail} yiqildi`);
  await db.pool.end();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('XATO:', e); process.exit(1); });
