// ONIX — klaviaturalar

const { Markup } = require('telegraf');
const f = require('./format');
const MONTHS_LONG = f.MONTHS;

// ================= Asosiy menyu (doimiy tugmalar) =================

const MENU = {
  income:   '💰 Kirim',
  expense:  '💸 Chiqim',
  podotchet:'👛 Hodimga pul berish',
  transfer: '🔄 O\'tkazma / Konvertatsiya',
  myExpense:'💸 Xarajat kiritish',
  myBalance:'👛 Qo\'limdagi qoldiq',
  myOps:    '📋 Mening operatsiyalarim',
  myReport: '📊 Mening hisobotim',
  reports:  '📊 Hisobotlar',
  settings: '⚙️ Sozlamalar',
};

const LAYOUT = {
  admin: [
    [MENU.income, MENU.expense],
    [MENU.podotchet, MENU.transfer],
    [MENU.reports, MENU.settings],
  ],
  cashier: [
    [MENU.income, MENU.expense],
    [MENU.podotchet, MENU.transfer],
  ],
  staff: [
    [MENU.myExpense],
    [MENU.myReport, MENU.myBalance],
    [MENU.myOps],
  ],
  manager: [
    [MENU.reports],
  ],
};

// Hisobotlar bo'limi — rolga qarab qaysilari ochiq
const REPORTS = [
  { key: 'cf',    label: '💹 Pul oqimi' },
  { key: 'pl',    label: '📈 Foyda-zarar' },
  { key: 'staff', label: '👤 Hodimlar' },
  { key: 'bal',   label: "📊 Kassa qoldig'i" },
  { key: 'book',  label: '📋 Kassa daftari' },
];

const reportsMenu = () =>
  Markup.inlineKeyboard(REPORTS.map(r => [Markup.button.callback(r.label, `rep:${r.key}`)]));

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

// Emoji bo'lsa oldiga qo'shadi, bo'lmasa nomni yolg'iz qoldiradi
const label = (row) => (row.emoji ? `${row.emoji} ${row.name}` : row.name);

// Guruhlar (1-daraja) — bittadan, nomlari uzun bo'lishi mumkin
function groups(rows) {
  const buttons = rows.map(g => [Markup.button.callback(label(g), `grp:${g.id}`)]);
  return Markup.inlineKeyboard([...buttons, CANCEL]);
}

// Kategoriyalar (2-daraja)
function categories(rows) {
  const buttons = rows.map(c => [Markup.button.callback(label(c), `cat:${c.id}`)]);
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
  [Markup.button.callback('Bugun', `${prefix}:today`), Markup.button.callback('Kecha', `${prefix}:yesterday`)],
  [Markup.button.callback('Bu hafta', `${prefix}:week`), Markup.button.callback('Bu oy', `${prefix}:month`)],
  [Markup.button.callback("O'tgan oy", `${prefix}:prevmonth`)],
  [Markup.button.callback('📅 Kun tanlash', `${prefix}:day`),
   Markup.button.callback('📅 Oy tanlash', `${prefix}:pick`)],
  CANCEL,
]);

// Hodim tanlash — hammasi yoki bittasi
function staffPicker(rows) {
  const buttons = [[Markup.button.callback('👥 Hammasi', 'rstaff:all')]];
  for (const u of rows) buttons.push([Markup.button.callback(`👤 ${u.full_name}`, `rstaff:${u.tg_id}`)]);
  return Markup.inlineKeyboard([...buttons, CANCEL]);
}

// Faqat kun kerak bo'lganda (hodimlar hisoboti)
const dayPreset = (prefix) => Markup.inlineKeyboard([
  [Markup.button.callback('Bugun', `${prefix}:today`), Markup.button.callback('Kecha', `${prefix}:yesterday`)],
  [Markup.button.callback('📅 Kun tanlash', `${prefix}:day`)],
  CANCEL,
]);

// Kun kalendari — istalgan sanani tanlash
function calendar(year, month /* 1-12 */) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');
  const key = (y, m) => `${y}-${pad(m)}`;

  const prev = month === 1 ? [year - 1, 12] : [year, month - 1];
  const next = month === 12 ? [year + 1, 1] : [year, month + 1];

  const rows = [[
    Markup.button.callback('‹', `calm:${key(...prev)}`),
    Markup.button.callback(`${MONTHS_LONG[month - 1]} ${year}`, 'noop'),
    Markup.button.callback('›', `calm:${key(...next)}`),
  ]];

  for (let d = 1; d <= daysInMonth; d += 7) {
    const row = [];
    for (let i = d; i < d + 7 && i <= daysInMonth; i++) {
      row.push(Markup.button.callback(String(i), `cald:${year}-${pad(month)}-${pad(i)}`));
    }
    rows.push(row);
  }
  rows.push(CANCEL);
  return Markup.inlineKeyboard(rows);
}

// Daftar sahifalash.
// O'chirish tugmasi ataylab yo'q: bir bosishda yozuv yo'qolishi xavfli,
// shuning uchun bekor qilish faqat /del buyrug'i orqali — sabab yozib.
function bookKeyboard(ops, { page = 0, total = 0, perPage = 8, prefix = 'book' } = {}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages < 2) return Markup.inlineKeyboard([]);
  const nav = [];
  if (page > 0)         nav.push(Markup.button.callback('⬅️', `${prefix}:${page - 1}`));
  nav.push(Markup.button.callback(`${page + 1}/${pages}`, 'noop'));
  if (page < pages - 1) nav.push(Markup.button.callback('➡️', `${prefix}:${page + 1}`));
  return Markup.inlineKeyboard([nav]);
}

module.exports = {
  MENU, mainMenu, accounts, groups, categories, subCategories,
  payDate, period, monthGrid, skipNote, confirm, currencies,
  reportsMenu, rangePreset, dayPreset, calendar, staffPicker,
  bookKeyboard,
};
