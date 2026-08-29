// ONIX — klaviaturalar

const { Markup } = require('telegraf');
const f = require('./format');

// ================= Asosiy menyu (doimiy tugmalar) =================

const MENU = {
  income:   '💰 Kirim',
  expense:  '💸 Chiqim',
  podotchet:'👛 Hodimga pul berish',
  transfer: '🔄 O\'tkazma / Konvertatsiya',
  myExpense:'💸 Xarajat kiritish',
  myBalance:'👛 Qo\'limdagi qoldiq',
  myOps:    '📋 Mening operatsiyalarim',
  balance:  '📊 Kassa qoldig\'i',
  book:     '📋 Kassa daftari',
  cashflow: '💹 Pul oqimi',
  pnl:      '📈 Foyda-zarar',
  podReport:'👛 Podotchyot qoldiqlar',
  settings: '⚙️ Sozlamalar',
};

const LAYOUT = {
  admin: [
    [MENU.income, MENU.expense],
    [MENU.podotchet, MENU.transfer],
    [MENU.cashflow, MENU.pnl],
    [MENU.balance, MENU.podReport],
    [MENU.book, MENU.settings],
  ],
  cashier: [
    [MENU.income, MENU.expense],
    [MENU.podotchet, MENU.transfer],
    [MENU.balance, MENU.book],
  ],
  staff: [
    [MENU.myExpense],
    [MENU.myBalance, MENU.myOps],
  ],
  manager: [
    [MENU.cashflow, MENU.pnl],
    [MENU.balance, MENU.podReport],
    [MENU.book],
  ],
};

const mainMenu = (role) =>
  Markup.keyboard(LAYOUT[role] || LAYOUT.manager).resize();

// ================= Tanlash klaviaturalari =================

const CANCEL = [Markup.button.callback('✖️ Bekor qilish', 'cancel')];

// Hisoblar — nomi, emoji va joriy qoldiq bilan
function accounts(rows, prefix = 'acc', { showBalance = false } = {}) {
  const buttons = rows.map(a => {
    const bal = showBalance && a.balance !== undefined ? ` — ${f.money(a.balance, a.currency)}` : '';
    return [Markup.button.callback(`${a.emoji || '•'} ${a.name}${bal}`, `${prefix}:${a.account_id || a.id}`)];
  });
  return Markup.inlineKeyboard([...buttons, CANCEL]);
}

// Guruhlar (1-daraja) — bittadan, nomlari uzun bo'lishi mumkin
function groups(rows) {
  const buttons = rows.map(g => [Markup.button.callback(`${g.emoji || '•'} ${g.name}`, `grp:${g.id}`)]);
  return Markup.inlineKeyboard([...buttons, CANCEL]);
}

// Kategoriyalar (2-daraja)
function categories(rows) {
  const buttons = rows.map(c => [Markup.button.callback(`${c.emoji || '•'} ${c.name}`, `cat:${c.id}`)]);
  buttons.push([Markup.button.callback('⬅️ Guruhlarga', 'back:grp')]);
  return Markup.inlineKeyboard([...buttons, CANCEL]);
}

// Podkategoriyalar (3-daraja)
function subCategories(rows) {
  const buttons = rows.map(c => [Markup.button.callback(c.name, `sub:${c.id}`)]);
  buttons.push([Markup.button.callback('⬅️ Kategoriyalarga', 'back:cat')]);
  return Markup.inlineKeyboard([...buttons, CANCEL]);
}

// To'lov sanasi
function payDate(today = new Date()) {
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const before    = new Date(today); before.setDate(today.getDate() - 2);
  return Markup.inlineKeyboard([
    [Markup.button.callback(`📅 Bugun (${f.d(today)})`, `dat:${f.iso(today)}`)],
    [Markup.button.callback(`Kecha (${f.d(yesterday)})`, `dat:${f.iso(yesterday)}`),
     Markup.button.callback(f.d(before), `dat:${f.iso(before)}`)],
    [Markup.button.callback('✏️ Boshqa sana', 'dat:manual')],
    CANCEL,
  ]);
}

// Foyda-zarar davri — har safar so'raladi
function period(paidAt) {
  const base = new Date(String(paidAt).slice(0, 10) + 'T00:00:00');
  const shift = (n) => {
    const dt = new Date(base.getFullYear(), base.getMonth() + n, 1);
    return { key: f.iso(dt), label: f.periodShort(dt) };
  };
  const prev = shift(-1), cur = shift(0), next = shift(1), next2 = shift(2);
  return Markup.inlineKeyboard([
    [Markup.button.callback(`✅ ${cur.label} (to'lov oyi)`, `per:${cur.key}`)],
    [Markup.button.callback(`➡️ ${next.label}`,  `per:${next.key}`),
     Markup.button.callback(`➡️ ${next2.label}`, `per:${next2.key}`)],
    [Markup.button.callback(`⬅️ ${prev.label}`,  `per:${prev.key}`)],
    [Markup.button.callback('✏️ Boshqa oy', 'per:manual')],
    CANCEL,
  ]);
}

// Oy tanlash to'ri (hisobotlar va "boshqa oy" uchun)
function monthGrid(year, prefix = 'per') {
  const rows = [];
  for (let i = 0; i < 12; i += 3) {
    rows.push(f.MONTHS_SHORT.slice(i, i + 3).map((m, j) =>
      Markup.button.callback(m, `${prefix}:${f.firstDay(year, i + j + 1)}`)));
  }
  rows.push([
    Markup.button.callback(`◀️ ${year - 1}`, `yr:${prefix}:${year - 1}`),
    Markup.button.callback(String(year), 'noop'),
    Markup.button.callback(`${year + 1} ▶️`, `yr:${prefix}:${year + 1}`),
  ]);
  rows.push(CANCEL);
  return Markup.inlineKeyboard(rows);
}

const skipNote = () => Markup.inlineKeyboard([
  [Markup.button.callback('⏭ Izohsiz davom etish', 'note:skip')],
  CANCEL,
]);

const confirm = () => Markup.inlineKeyboard([
  [Markup.button.callback('✅ Saqlash', 'save'), Markup.button.callback('✖️ Bekor', 'cancel')],
]);

const currencies = (prefix) => Markup.inlineKeyboard([
  [Markup.button.callback("🇺🇿 So'm", `${prefix}:UZS`),
   Markup.button.callback('💵 Dollar', `${prefix}:USD`)],
  CANCEL,
]);

// Hisobot davri tez tanlash
const rangePreset = (prefix) => Markup.inlineKeyboard([
  [Markup.button.callback('Bugun', `${prefix}:today`), Markup.button.callback('Bu hafta', `${prefix}:week`)],
  [Markup.button.callback('Bu oy', `${prefix}:month`), Markup.button.callback('O\'tgan oy', `${prefix}:prevmonth`)],
  [Markup.button.callback('📅 Oy tanlash', `${prefix}:pick`)],
  CANCEL,
]);

// Daftar sahifalash
function pager(page, total, perPage, prefix = 'book') {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages < 2) return Markup.inlineKeyboard([]);
  const row = [];
  if (page > 0)         row.push(Markup.button.callback('⬅️', `${prefix}:${page - 1}`));
  row.push(Markup.button.callback(`${page + 1}/${pages}`, 'noop'));
  if (page < pages - 1) row.push(Markup.button.callback('➡️', `${prefix}:${page + 1}`));
  return Markup.inlineKeyboard([row]);
}

module.exports = {
  MENU, mainMenu, accounts, groups, categories, subCategories,
  payDate, period, monthGrid, skipNote, confirm, currencies, rangePreset, pager,
};
