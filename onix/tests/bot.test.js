process.env.PGSSL = 'off';
process.env.SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID || '1';
process.env.ONIX_BOT_TOKEN = '000:test';
const bot = require('../../onix-bot');
const db  = require('../db');
const K   = require('../keyboards');
const R   = require('../reports');

bot.botInfo = { id: 1, is_bot: true, username: 'onix_test_bot', first_name: 'ONIX' };

let sent = [], mid = 100, uid = 1000;
// Tarmoqqa chiqmaslik uchun Telegram API ni prototip darajasida almashtiramiz
const { Telegram } = require('telegraf');
let kb = null;
Telegram.prototype.callApi = async function (method, payload = {}) {
  if (payload.reply_markup && payload.reply_markup.inline_keyboard) kb = payload.reply_markup.inline_keyboard;
  sent.push({ method, text: payload.text });
  return { message_id: ++mid, date: 1, chat: { id: 1 }, text: payload.text };
};
const last = () => sent.length ? sent[sent.length - 1].text : '';

const msg = (text, from, username) => bot.handleUpdate({ update_id: ++uid, message: {
  message_id: ++mid, date: 1, chat: { id: from, type: 'private' },
  from: { id: from, is_bot: false, first_name: 'T', ...(username ? { username } : {}) }, text,
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
  await db.q('DELETE FROM onix_pending_users');
  await db.addUser(101,'Rustam Kassir','cashier',1);
  await db.addUser(201,'Ali Valiyev','staff',1);
  await db.addUser(301,'Sardor Rahbar','manager',1);

  const naqdSum = await accId('Naqd (sum)');
  const aliSum  = (await db.listAccounts({kind:'podotchet',ownerTgId:201,currency:'UZS'}))[0].id;
  // Kategoriya daraxti: GURUH → KATEGORIYA → PODKATEGORIYA
  await db.q('DELETE FROM onix_categories');
  const mk = async (parent, level, name, flow) => (await db.addCategory(parent, level, name, flow, null)).id;
  const grIn    = await mk(null,  1, 'Onix bussines center',   'income');
  const savdo   = await mk(grIn,  2, "Ijara to'lovi",          'income');
  const naqdSav = await mk(savdo, 3, 'Mijoz A',                'income');
  const grEx    = await mk(null,  1, 'Onix xarajatlar uchun',  'expense');
  const grFlat  = await mk(null,  1, 'Yangiobod',              'expense');
  const catFlat = await mk(grFlat,2, 'Soliq',                  'expense');   // podkategoriyasiz
  const xomAsh  = await mk(grEx,  2, "Komunal to'lovlar",      'expense');
  const ozOvqat = await mk(xomAsh,3, 'Elektr energiya',        'expense');

  // ═══ 1. RUXSATSIZ FOYDALANUVCHI ═══
  console.log('\n─── Ruxsat nazorati ───');
  sent = []; await msg('/start', 999);
  ok(sent.some(x => x.text && x.text.includes('ruxsat berilmagan')), 'notanish foydalanuvchi rad etildi');
  ok(sent.some(x => x.text && x.text.includes('Yangi foydalanuvchi')), 'adminga tasdiqlash so\'rovi ketdi');
  sent = []; await msg(K.MENU.income, 301);
  ok(last().includes('ochiq emas'), 'rahbar kirim kirita olmaydi');
  sent = []; await msg(K.MENU.pnl, 101);
  ok(last().includes('ochiq emas'), 'kassir foyda-zararni ko\'ra olmaydi');

  // ═══ 2. KASSIR: KIRIM ═══
  console.log('\n─── Kassir: kirim (⭐ P&L keyingi oyga) ───');
  sent = []; await msg(K.MENU.income, 101);
  ok(last().includes('qaysi kassaga'), 'hisob so\'raldi');
  await cb(`acc:${naqdSum}`, 101);
  ok(last().includes('Guruhni'), 'guruh so\'raldi');
  await cb(`grp:${grIn}`, 101);
  ok(last().includes('Kategoriyani'), 'kategoriya so\'raldi');
  await cb(`cat:${savdo}`, 101);
  ok(last().includes('Podkategoriyani'), 'podkategoriya so\'raldi');
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
  await cb(`grp:${grEx}`, 201);
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
  await cb(`grp:${grEx}`, 201);
  await cb(`cat:${xomAsh}`, 201);
  await cb(`sub:${ozOvqat}`, 201);
  sent = []; await msg('99 mln', 201);
  ok(sent.some(s => s.text && s.text.includes('Diqqat')), 'qoldiqdan oshgani ogohlantirildi');
  await cb('cancel', 201);

  // ═══ 6. NOTO'G'RI SUMMA ═══
  console.log('\n─── Xato kiritish ───');
  await msg(K.MENU.income, 101);
  await cb(`acc:${naqdSum}`, 101);
  await cb(`grp:${grIn}`, 101);
  await cb(`cat:${savdo}`, 101);
  await cb(`sub:${naqdSav}`, 101);
  sent = []; await msg('salom', 101);
  ok(last().includes('tushunmadim'), 'yaroqsiz summa rad etildi');
  sent = []; await msg('1,5 mln', 101);
  ok(last().includes("To'lov sanasi"), 'to\'g\'ri summadan keyin davom etdi');
  await cb('cancel', 101);
  eq((await db.countOperations({})).n, 3, 'bekor qilingan yozuv saqlanmadi');

  // ═══ 6b. PODKATEGORIYASIZ KATEGORIYA — QADAM O'TKAZIB YUBORILADI ═══
  console.log('\n─── Podkategoriyasiz kategoriya ───');
  await msg(K.MENU.expense, 101);
  await cb(`acc:${naqdSum}`, 101);
  await cb(`grp:${grFlat}`, 101);
  sent = []; await cb(`cat:${catFlat}`, 101);
  ok(last().includes('Summani'), 'podkategoriya so\'ralmadi — to\'g\'ri summaga o\'tdi');
  await msg('1,5 mln', 101);
  await cb('dat:2026-03-09', 101);
  await cb('per:2026-03-01', 101);
  await cb('note:skip', 101);
  await cb('save', 101);
  const opFlat = await db.getOperation(4);
  eq(opFlat.category_id, catFlat, 'kategoriyaning o\'ziga yozildi');
  eq(opFlat.cat_name, 'Soliq', 'yo\'lda kategoriya nomi');
  eq(opFlat.group_name, 'Yangiobod', 'yo\'lda guruh nomi');
  eq(opFlat.category_name, 'null', 'podkategoriya bo\'sh');

  // ═══ 6c. USERNAME BO'YICHA ULANISH ═══
  console.log('\n─── Username bo\'yicha ro\'yxatga olish ───');
  await db.addUser(1, 'Bosh admin', 'admin', 1);

  sent = []; await msg('/add_user @gulnora_s staff Gulnora Sattorova', 1);
  ok(last().includes("Kutish ro'yxatiga"), 'username kutish ro\'yxatiga yozildi');
  eq((await db.listPendingUsers()).length, 1, 'kutayotganlar: 1');

  // Hodim hali ulanmagan — kirolmaydi
  sent = []; await msg('/start', 401, 'boshqa_odam');
  ok(sent.some(x => x.text && x.text.includes('ruxsat berilmagan')), 'notanish odam kira olmadi');

  // To'g'ri username bilan /start — avtomat ulanadi
  sent = []; await msg('/start', 402, 'Gulnora_S');   // registr farq qilsa ham
  ok(sent.some(x => x.text && x.text.includes('Xush kelibsiz')), 'username bo\'yicha tanildi');
  const gul = await db.getUser(402);
  eq(gul ? gul.full_name : null, 'Gulnora Sattorova', 'ismi kutish ro\'yxatidan olindi');
  eq(gul.role, 'staff', 'roli olindi');
  eq(gul.username, 'gulnora_s', 'username kichik harfda saqlandi');
  eq((await db.listPendingUsers()).length, 0, 'kutish ro\'yxati tozalandi');
  eq((await db.listAccounts({ kind:'podotchet', ownerTgId:402 })).length, 2, 'podotchyot hisoblari ochildi');

  // Notanish odamni admin tugma bilan tasdiqlaydi
  sent = []; await cb('ok:manager:401:Yangi%20Rahbar', 1);
  const appr = await db.getUser(401);
  eq(appr ? appr.role : null, 'manager', 'tugma bilan rahbar qilib qo\'shildi');
  eq(appr.full_name, 'Yangi Rahbar', 'ismi tugmadan olindi');

  // Rahbar bo'lmagan odam tasdiqlay olmasin
  sent = []; await cb('ok:admin:403:Kimdir', 201);
  eq((await db.getUser(403)) === null, true, 'hodim tasdiqlay olmadi');

  // ═══ 6d. HODIM FAQAT O'ZINIKINI KO'RADI ═══
  console.log('\n─── Hodim uchun ma\'lumot chegarasi ───');

  // Tugma menyusida yo'q, lekin matnni qo'lda yozib ko'radi
  sent = []; await msg(K.MENU.balance, 201);
  ok(last().includes('ochiq emas'), 'hodim umumiy kassa qoldig\'ini ko\'ra olmadi');
  ok(!sent.some(x => x.text && x.text.includes('Naqd (sum)')), 'kompaniya kassalari ko\'rinmadi');

  sent = []; await msg(K.MENU.book, 201);
  ok(last().includes('ochiq emas'), 'hodim kassa daftarini ko\'ra olmadi');

  // O'z qoldig'ini esa ko'radi
  sent = []; await msg(K.MENU.myBalance, 201);
  ok(last().includes('QO\'LINGIZDAGI'), 'o\'z qoldig\'ini ko\'rdi');
  ok(!last().includes('Plastik'), 'unda kompaniya kassalari yo\'q');

  // Hisobot callback'ini qo'lda yuborsa ham hech narsa chiqmasin
  sent = []; await cb('rcur:UZS', 201);
  ok(!sent.some(x => x.text && /PUL OQIMI|FOYDA-ZARAR/.test(x.text)), 'soxta hisobot so\'rovi ish bermadi');

  // ⚠️ Soxta tugma: hodim kompaniya kassasidan xarajat yozmoqchi
  const opsBefore = (await db.countOperations({})).n;
  await msg(K.MENU.myExpense, 201);
  sent = []; await cb(`acc:${naqdSum}`, 201);          // o'ziniki emas — kompaniya kassasi
  ok(!sent.some(x => x.text && x.text.includes('Guruhni')), 'begona hisob rad etildi');
  await cb('cancel', 201);
  eq((await db.countOperations({})).n, opsBefore, 'hech narsa yozilmadi');

  // O'z hisobi bilan esa ishlaydi
  await msg(K.MENU.myExpense, 201);
  sent = []; await cb(`acc:${aliSum}`, 201);
  ok(last().includes('Guruhni'), 'o\'z hisobi qabul qilindi');
  await cb('cancel', 201);

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
  ok(sent.some(s => s.text && s.text.includes('PUL OQIMI') && s.text.includes('35 500 000')),
     'mart pul oqimi: 40 − 3 − 1,5 = 35,5 mln sof oqim');
  ok(sent.some(s => s.text && s.text.includes('Yangiobod')),
     'podkategoriyasiz guruh pul oqimida ko\'rindi');

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
  eq((await db.countOperations({})).n, 3, 'bekor qilingan yozuv hisobdan chiqdi');
  sent = []; await msg(K.MENU.myBalance, 201);
  ok(last().includes('5 000 000'), 'bekor qilingandan keyin qoldiq tiklandi');

  // ═══ 9. BOSHLANG'ICH QOLDIQ ═══
  console.log('\n─── Boshlang\'ich qoldiq ───');
  await db.addUser(1, 'Bosh admin', 'admin', 1);

  sent = []; kb = null;
  await msg(K.MENU.settings, 1);
  await cb('openbal', 1);
  const opts = (kb || []).flat().map(b => b.callback_data || '');
  ok(opts.includes(`acc:${naqdSum}`), 'kassalar ro\'yxatda');
  ok(opts.includes(`acc:${aliSum}`), 'hodim hamyoni ham ro\'yxatda');

  const balBefore = Number((await db.balances({ kind: 'podotchet', ownerTgId: 201, currency: 'UZS' }))[0].balance);
  await cb(`acc:${aliSum}`, 1);
  await msg('1,8 mln', 1);
  sent = []; await cb('dat:2026-05-01', 1);
  ok(sent.some(x => x.text && x.text.includes('daromad emas')), 'tasdiqda tushuntirish bor');
  ok(!sent.some(x => x.text && x.text.includes('P&amp;L davri')), 'P&L davri so\'ralmadi');
  sent = []; await cb('save', 1);
  ok(sent.some(x => x.text && x.text.includes('Saqlandi')), 'saqlandi');

  const opened = await db.one("SELECT * FROM onix_operations WHERE type = 'opening' ORDER BY id DESC LIMIT 1");
  eq(opened.category_id, 'null', 'kategoriyasiz');
  eq(Number((await db.balances({ kind: 'podotchet', ownerTgId: 201, currency: 'UZS' }))[0].balance),
     balBefore + 1_800_000, 'hodim qo\'lidagi qoldiqqa qo\'shildi');

  const plMay = await R.profitLoss('2026-05-01', 'UZS');
  eq(plMay.costs, 0, 'foyda-zararga xarajat bo\'lib kirmadi');
  eq(plMay.revenue, 0, 'daromad ham emas');

  // Hodim o'zi kirita olmasin
  sent = []; await cb('openbal', 201);
  ok(!sent.some(x => x.text && /qaysi hisobning qoldig/i.test(x.text)), 'hodimga ruxsat berilmadi');

  console.log(`\n${fail===0?'🎉':'⚠️'}  ${pass} o'tdi, ${fail} yiqildi`);
  await db.pool.end();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('XATO:', e); process.exit(1); });
