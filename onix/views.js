// ONIX — hisobotlarni matn ko'rinishida chizish

const f = require('./format');

const W = 38;              // <pre> blok kengligi
const LINE = '─'.repeat(W);
const DLINE = '═'.repeat(W);

// "Nomi ..........  1 234 so'm" — summani o'ngga tekislaydi
function row(label, amount, currency, { indent = 0, dots = false } = {}) {
  const value = typeof amount === 'string' ? amount : f.money(amount, currency);
  const pad = ' '.repeat(indent);
  let name = pad + label;
  const space = W - value.length - 1;
  if (name.length > space) name = name.slice(0, Math.max(0, space - 1)) + '…';
  const gap = W - name.length - value.length;
  return name + (dots ? '.'.repeat(Math.max(1, gap)) : ' '.repeat(Math.max(1, gap))) + value;
}

const curLabel = (c) => (c === 'UZS' ? "🇺🇿 so'm" : '💵 dollar');

// ================= Pul oqimi =================

function cashFlow(cf) {
  const c = cf.currency;
  const L = [];
  L.push(row("Boshlang'ich qoldiq", cf.opening, c));
  L.push('');

  L.push('📥 KIRIM');
  if (!cf.income.length) L.push('   —');
  for (const g of cf.income) L.push(row(`${g.emoji || '•'} ${g.name}`, g.total, c, { indent: 1 }));
  L.push(LINE);
  L.push(row('Jami kirim', f.signed(cf.incomeTotal, c), c));
  L.push('');

  L.push('📤 CHIQIM');
  if (!cf.expense.length) L.push('   —');
  for (const g of cf.expense) L.push(row(`${g.emoji || '•'} ${g.name}`, g.total, c, { indent: 1 }));
  L.push(LINE);
  L.push(row('Jami chiqim', f.signed(-cf.expenseTotal, c), c));

  if (cf.convIn || cf.convOut) {
    L.push('');
    L.push('🔄 VALYUTA KONVERTATSIYASI');
    if (cf.convIn)  L.push(row('Kirdi',  f.signed(cf.convIn, c), c, { indent: 1 }));
    if (cf.convOut) L.push(row('Chiqdi', f.signed(-cf.convOut, c), c, { indent: 1 }));
  }

  L.push('');
  L.push(DLINE);
  L.push(row('SOF OQIM', f.signed(cf.net, c), c));
  L.push(row('Yakuniy qoldiq', cf.closing, c));
  L.push(DLINE);

  if (cf.accounts.length) {
    L.push('');
    L.push('💼 KASSA QOLDIQLARI');
    for (const a of cf.accounts) {
      L.push(row(`${a.emoji || '•'} ${a.name}`, Number(a.balance), c, { indent: 1 }));
    }
  }

  return `<b>💹 PUL OQIMI</b>\n` +
         `📅 ${f.d(cf.from)} — ${f.d(cf.to)} · ${curLabel(c)}\n` +
         `<i>to'lov sanasi bo'yicha</i>\n\n` +
         `<pre>${f.esc(L.join('\n'))}</pre>`;
}

// ================= Foyda-zarar =================

function profitLoss(pl, prev) {
  const c = pl.currency;
  const L = [];

  L.push('📥 DAROMAD');
  if (!pl.income.length) L.push('   —');
  for (const g of pl.income) {
    L.push(row(`${g.emoji || '•'} ${g.name}`, g.total, c, { indent: 1 }));
    for (const s of g.subs) L.push(row(`· ${s.name}`, s.total, c, { indent: 4 }));
  }
  L.push(LINE);
  L.push(row('Jami daromad', pl.revenue, c));
  L.push('');

  L.push('📤 XARAJAT');
  if (!pl.expense.length) L.push('   —');
  for (const g of pl.expense) {
    L.push(row(`${g.emoji || '•'} ${g.name}`, g.total, c, { indent: 1 }));
    for (const s of g.subs) L.push(row(`· ${s.name}`, s.total, c, { indent: 4 }));
  }
  L.push(LINE);
  L.push(row('Jami xarajat', pl.costs, c));

  L.push('');
  L.push(DLINE);
  L.push(row(pl.profit >= 0 ? 'FOYDA' : 'ZARAR', pl.profit, c));
  if (pl.margin !== null) L.push(row('Rentabellik', `${pl.margin.toFixed(1)} %`, c));
  L.push(DLINE);

  if (prev) {
    L.push('');
    L.push(`📊 ${f.periodShort(prev.period)} bilan solishtirish`);
    L.push(row('Daromad', delta(pl.revenue, prev.revenue), c, { indent: 1 }));
    L.push(row('Xarajat', delta(pl.costs,   prev.costs),   c, { indent: 1 }));
    L.push(row('Foyda',   delta(pl.profit,  prev.profit),  c, { indent: 1 }));
  }

  const icon = pl.profit > 0 ? '✅' : pl.profit < 0 ? '🔻' : '➖';
  return `<b>📈 FOYDA-ZARAR</b>\n` +
         `📅 ${f.periodLabel(pl.period)} · ${curLabel(c)}  ${icon}\n` +
         `<i>xarajat tegishli bo'lgan davr bo'yicha</i>\n\n` +
         `<pre>${f.esc(L.join('\n'))}</pre>`;
}

function delta(now, before) {
  if (!before) return now ? 'yangi' : '—';
  const pct = ((now - before) / Math.abs(before)) * 100;
  const arrow = pct > 0.5 ? '▲' : pct < -0.5 ? '▼' : '=';
  return `${arrow} ${pct > 0 ? '+' : ''}${pct.toFixed(0)} %`;
}

// ================= Qoldiqlar =================

function balances(rows, title = '💼 KASSA QOLDIG\'I') {
  const byCur = { UZS: [], USD: [] };
  for (const a of rows) (byCur[a.currency] || (byCur[a.currency] = [])).push(a);

  const parts = [];
  for (const [cur, list] of Object.entries(byCur)) {
    if (!list.length) continue;
    const L = list.map(a => row(`${a.emoji || '•'} ${a.name}`, Number(a.balance), cur));
    L.push(LINE);
    L.push(row('JAMI', list.reduce((s, a) => s + Number(a.balance), 0), cur));
    parts.push(`${curLabel(cur)}\n<pre>${f.esc(L.join('\n'))}</pre>`);
  }
  return `<b>${title}</b>\n\n` + (parts.join('\n') || '<i>Hisoblar yo\'q</i>');
}

// ================= Podotchyot =================

function podotchet(rows, currency, from, to) {
  if (!rows.length) return '<i>Podotchyot hisoblari yo\'q</i>';
  const L = [];
  for (const s of rows) {
    L.push(f.shortName(s.full_name));
    L.push(row('olgan',     s.received, currency, { indent: 3 }));
    L.push(row('sarflagan', s.spent,    currency, { indent: 3 }));
    if (s.returned) L.push(row('qaytargan', s.returned, currency, { indent: 3 }));
    L.push(row("qo'lidagi qoldiq", s.balance, currency, { indent: 3 }));
    L.push('');
  }
  L.push(LINE);
  L.push(row('JAMI QO\'LDA', rows.reduce((a, s) => a + s.balance, 0), currency));

  return `<b>👛 PODOTCHYOT — hisobdor pul</b>\n` +
         `📅 ${f.d(from)} — ${f.d(to)} · ${curLabel(currency)}\n\n` +
         `<pre>${f.esc(L.join('\n'))}</pre>`;
}

// ================= Kassa daftari =================

const TYPE_ICON = { income: '📥', expense: '📤', transfer: '🔄' };

function operationLine(o) {
  const icon = TYPE_ICON[o.type];
  const what = o.type === 'transfer'
    ? `${o.account_name} → ${o.to_account_name}`
    : `${o.parent_name ? o.parent_name + ' · ' : ''}${o.category_name}`;
  const amount = o.type === 'expense' ? -Number(o.amount) : Number(o.amount);

  let line = `${icon} <b>${f.money(amount, o.currency)}</b> — ${f.esc(what)}\n` +
             `   <code>#${o.id}</code> ${f.d(o.paid_at)}`;
  if (f.iso(o.period).slice(0, 7) !== f.iso(o.paid_at).slice(0, 7)) {
    line += ` → P&amp;L: <b>${f.periodShort(o.period)}</b>`;
  }
  line += ` · ${f.esc(o.account_name)}`;
  if (o.author_name) line += ` · ${f.esc(f.shortName(o.author_name))}`;
  if (o.note) line += `\n   💬 <i>${f.esc(o.note)}</i>`;
  return line;
}

function book(ops, { from, to, page = 0, total = 0 } = {}) {
  const head = `<b>📋 KASSA DAFTARI</b>\n📅 ${f.d(from)} — ${f.d(to)} · ${total} ta yozuv\n\n`;
  if (!ops.length) return head + '<i>Bu davrda operatsiya yo\'q</i>';
  return head + ops.map(operationLine).join('\n\n');
}

// ================= Operatsiyani tasdiqlash =================

function draft(d) {
  const L = [];
  const title = { income: '📥 KIRIM', expense: '📤 CHIQIM', transfer: '🔄 O\'TKAZMA' }[d.type];

  L.push(row('Summa', d.amount, d.currency));
  if (d.type === 'transfer') {
    L.push(row('Qayerdan', d.accountName, d.currency));
    L.push(row('Qayerga',  d.toAccountName, d.currency));
    if (d.toAmount) L.push(row('Olinadi', f.money(d.toAmount, d.toCurrency), d.currency));
  } else {
    L.push(row('Hisob',      d.accountName, d.currency));
    L.push(row('Kategoriya', d.rootName, d.currency));
    L.push(row('',           d.categoryName, d.currency, { indent: 2 }));
  }
  L.push(row("To'lov sanasi", f.d(d.paidAt), d.currency));
  L.push(row('P&L davri',     f.periodLabel(d.period), d.currency));
  if (d.note) L.push(row('Izoh', d.note, d.currency));

  const warn = f.iso(d.period).slice(0, 7) !== f.iso(d.paidAt).slice(0, 7)
    ? `\n⚠️ <i>Pul ${f.periodShort(d.paidAt)} oyida harakat qiladi, ` +
      `lekin foyda-zararga ${f.periodLabel(d.period)} oyida tushadi.</i>\n`
    : '';

  return `<b>${title} — tasdiqlang</b>\n\n<pre>${f.esc(L.join('\n'))}</pre>${warn}`;
}

module.exports = {
  row, cashFlow, profitLoss, balances, podotchet, book, operationLine, draft, curLabel,
};
