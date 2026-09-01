// ONIX — kunlik hisobot
//
// Har kuni ertalab kechagi kun bo'yicha admin va rahbarlarga yuboriladi.
// Uch xil xabar, har biri alohida:
//
//   1. 📋 KASSA          — kassaga kirgan/chiqqan pul, hodimlarga berilgani
//   2. 👤 <Hodim>        — har bir hodim alohida: kun boshi → sarflagani → kun oxiri
//   3. 💼 QOLDIQLAR      — bugun kun boshiga qolgan pul
//
// Pul oqimi va foyda-zarar bu yerga kirmaydi — ular hisobotlar bo'limida,
// so'ralganda ko'riladi.

const db = require('./db');
const R = require('./reports');
const V = require('./views');
const f = require('./format');

const LIMIT = 3800;   // Telegram 4096 dan zaxira bilan
const KUNLAR = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

const sarlavha = (date) => {
  const dt = new Date(date + 'T00:00:00');
  return `${f.d(date)}, ${KUNLAR[dt.getDay()]}`;
};

// Kassa hisoblarining (hodim hamyonlaridan tashqari) berilgan sanaga qoldig'i
async function kassaBalances(currency, upTo) {
  return db.all(`
    SELECT a.name, a.emoji,
           COALESCE((
             SELECT SUM(delta) FROM (${R.MOVES_SQL} AND o.paid_at <= $2) m
             WHERE m.account_id = a.id
           ), 0) AS balance
    FROM onix_accounts a
    WHERE a.active AND a.currency = $1 AND a.kind <> 'podotchet'
    ORDER BY a.sort_order, a.id`, [currency, upTo]);
}

// ---------- 1. Kassa harakati ----------
// Hodimlarning xarajati bu yerga kirmaydi — ular o'z bo'limida ko'rsatiladi.
async function kassaSection(date, currency) {
  const rows = await db.all(`
    SELECT o.type, o.amount, o.to_amount, o.note,
           a.name AS account_name, t.name AS to_account_name, t.kind AS to_kind,
           COALESCE(g.name, p.name) AS group_name,
           CASE WHEN g.id IS NOT NULL THEN p.name ELSE n.name END AS cat_name,
           CASE WHEN g.id IS NOT NULL THEN n.name END AS sub_name,
           n.flow,
           u.full_name AS author
    FROM onix_operations o
    JOIN onix_accounts a ON a.id = o.account_id
    LEFT JOIN onix_accounts t ON t.id = o.to_account_id
    LEFT JOIN onix_categories n ON n.id = o.category_id
    LEFT JOIN onix_categories p ON p.id = n.parent_id
    LEFT JOIN onix_categories g ON g.id = p.parent_id
    LEFT JOIN onix_users u ON u.tg_id = o.created_by
    WHERE o.deleted_at IS NULL AND o.paid_at = $1 AND o.currency = $2
      AND a.kind <> 'podotchet'          -- hodim hamyonidan chiqqani bu yerda emas
    ORDER BY o.id`, [date, currency]);

  // Kun boshidagi qoldiq — kechagi kun oxiri
  const prev = new Date(date + 'T00:00:00');
  prev.setDate(prev.getDate() - 1);
  const opening = await kassaBalances(currency, f.iso(prev));
  const closing = await kassaBalances(currency, date);

  const sum = (list) => list.reduce((a, r) => a + Number(r.balance), 0);
  const hasMoney = sum(opening) !== 0 || sum(closing) !== 0;
  if (!rows.length && !hasMoney) return null;

  const income   = rows.filter(r => r.type === 'income');
  const expense  = rows.filter(r => r.type === 'expense');
  const toStaff  = rows.filter(r => r.type === 'transfer' && r.to_kind === 'podotchet');
  const other    = rows.filter(r => r.type === 'transfer' && r.to_kind !== 'podotchet');
  const openingOps = rows.filter(r => r.type === 'opening');

  const L = [];
  const total = (list, field = 'amount') => list.reduce((a, r) => a + Number(r[field]), 0);

  // Qoldiqlar jadvali — kassa daftari sahifasidek
  const balanceBlock = (title, list) => {
    const out = [title];
    for (const r of list) {
      if (Number(r.balance) === 0 && list.length > 2) continue;
      out.push(V.row(`${r.emoji || '•'} ${r.name}`, Number(r.balance), currency, { indent: 1 }));
    }
    out.push(V.row('JAMI', sum(list), currency, { indent: 1 }));
    return out;
  };

  L.push(...balanceBlock('⚖️ KUN BOSHIDA', opening));
  L.push('');

  // Summali qatorda faqat eng pastki nom — sig'masa qirqilib ketmasin.
  // To'liq yo'l va hisob pastdagi qatorlarda, qirqilmasdan turadi.
  const entry = (r) => {
    const lines = [V.row(`· ${r.sub_name || r.cat_name}`, Number(r.amount), currency, { indent: 1 })];
    const where = [r.group_name, r.sub_name ? r.cat_name : null].filter(Boolean).join(' › ');
    if (where) lines.push(`      ${where}`);
    lines.push(`      ${r.account_name}${r.note ? ` · ${r.note}` : ''}`);
    return lines;
  };

  if (income.length) {
    L.push('📥 KIRIM');
    for (const r of income) L.push(...entry(r));
    L.push(V.row('Jami kirim', f.signed(total(income), currency), currency));
    L.push('');
  }

  if (expense.length) {
    L.push('📤 CHIQIM');
    for (const r of expense) L.push(...entry(r));
    L.push(V.row('Jami chiqim', f.signed(-total(expense), currency), currency));
    L.push('');
  }

  if (toStaff.length) {
    L.push('👛 HODIMLARGA BERILDI');
    for (const r of toStaff) {
      L.push(V.row(`· ${r.to_account_name}`, Number(r.amount), currency, { indent: 1 }));
      L.push(`      ${r.account_name} dan${r.note ? ` · ${r.note}` : ''}`);
    }
    L.push(V.row('Jami berildi', f.signed(-total(toStaff), currency), currency));
    L.push('');
  }

  if (other.length) {
    L.push("🔄 O'TKAZMA / KONVERTATSIYA");
    for (const r of other) {
      L.push(V.row(`${r.account_name} → ${r.to_account_name}`, Number(r.amount), currency, { indent: 1 }));
    }
    L.push('');
  }

  if (openingOps.length) {
    L.push("⚖️ BOSHLANG'ICH QOLDIQ KIRITILDI");
    for (const r of openingOps) {
      L.push(V.row(r.account_name, Number(r.amount), currency, { indent: 1 }));
    }
    L.push('');
  }

  L.push('─'.repeat(38));
  L.push(...balanceBlock('⚖️ KUN OXIRIDA', closing));

  return `${V.curLabel(currency)}\n<pre>${f.esc(L.join('\n').trimEnd())}</pre>`;
}

// ---------- 3. Kun boshiga qoldiqlar ----------
// Hisobot kechagi kun haqida, shuning uchun kecha kun oxiridagi qoldiq =
// bugun kun boshidagi qoldiq. Rahbar ertalab shuni bilishi kerak.
async function balancesSection(date) {
  const parts = [];
  for (const currency of ['UZS', 'USD']) {
    const rows = await db.all(`
      SELECT a.name, a.emoji, a.kind,
             COALESCE((
               SELECT SUM(delta) FROM (${R.MOVES_SQL} AND o.paid_at <= $2) m
               WHERE m.account_id = a.id
             ), 0) AS balance
      FROM onix_accounts a
      WHERE a.active AND a.currency = $1
      ORDER BY a.sort_order, a.id`, [currency, date]);

    const meaningful = rows.filter(r => Number(r.balance) !== 0);
    if (!meaningful.length) continue;

    const L = meaningful.map(r =>
      V.row(`${r.emoji || '•'} ${r.name}`, Number(r.balance), currency));
    L.push('─'.repeat(38));
    L.push(V.row('JAMI', meaningful.reduce((a, r) => a + Number(r.balance), 0), currency));
    parts.push(`${V.curLabel(currency)}\n<pre>${f.esc(L.join('\n'))}</pre>`);
  }
  return parts;
}

// ---------- To'liq hisobot ----------
async function build(date) {
  const messages = [];
  const next = new Date(date + 'T00:00:00');
  next.setDate(next.getDate() + 1);

  // 1. Kassa
  const kassaParts = [];
  for (const currency of ['UZS', 'USD']) {
    const part = await kassaSection(date, currency);
    if (part) kassaParts.push(part);
  }
  messages.push(
    `<b>📋 KASSA</b>\n📅 ${sarlavha(date)}\n\n` +
    (kassaParts.length ? kassaParts.join('\n') : "<i>Bu kuni kassada harakat bo'lmagan.</i>"));

  // 2. Har bir hodim alohida
  for (const currency of ['UZS', 'USD']) {
    const rows = await R.staffDay(date, currency);
    for (const s of rows.filter(r => r.active)) {
      const text = V.staffDay([s], date, currency, s.full_name);
      messages.push(text.length > LIMIT ? text.slice(0, LIMIT) : text);
    }
  }

  // 3. Kun boshiga qoldiqlar
  const balances = await balancesSection(date);
  if (balances.length) {
    messages.push(
      `<b>💼 QOLDIQLAR — ${f.d(f.iso(next))} kun boshiga</b>\n\n${balances.join('\n')}`);
  }

  return messages;
}

// Kimlarga yuboriladi — faqat admin va rahbarlar, hodimlarga emas
async function recipients() {
  return (await db.listUsers()).filter(u => u.role === 'admin' || u.role === 'manager');
}

function yesterday(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return f.iso(d);
}

module.exports = { build, recipients, yesterday };
