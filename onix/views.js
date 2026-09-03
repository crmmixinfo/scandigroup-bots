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

// Emoji bo'lsa oldiga, bo'lmasa nomning o'zi
const named = (row) => (row.emoji ? `${row.emoji} ${row.name}` : row.name);

// ================= Pul oqimi =================

function cashFlow(cf) {
  const c = cf.currency;
  const L = [];
  L.push(row("Boshlang'ich qoldiq", cf.opening, c));
  L.push('');

  L.push('📥 KIRIM');
  if (!cf.income.length) L.push('   —');
  for (const g of cf.income) {
    L.push(row(named(g), g.total, c));
    for (const k of g.cats) L.push(row(`· ${k.name}`, k.total, c, { indent: 3 }));
  }
  L.push(LINE);
  L.push(row('Jami kirim', f.signed(cf.incomeTotal, c), c));
  L.push('');

  L.push('📤 CHIQIM');
  if (!cf.expense.length) L.push('   —');
  for (const g of cf.expense) {
    L.push(row(named(g), g.total, c));
    for (const k of g.cats) L.push(row(`· ${k.name}`, k.total, c, { indent: 3 }));
  }
  L.push(LINE);
  L.push(row('Jami chiqim', f.signed(-cf.expenseTotal, c), c));

  if (cf.openedInPeriod) {
    L.push('');
    L.push('⚖️ BOSHLANG\'ICH QOLDIQ');
    L.push(row('Kiritildi', f.signed(cf.openedInPeriod, c), c, { indent: 1 }));
  }

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
  for (const g of pl.income) tree(L, g, c);
  L.push(LINE);
  L.push(row('Jami daromad', pl.revenue, c));
  L.push('');

  L.push('📤 XARAJAT');
  if (!pl.expense.length) L.push('   —');
  for (const g of pl.expense) tree(L, g, c);
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

// Guruh → kategoriya → podkategoriya uch pog'onasini chizadi
function tree(L, group, currency) {
  L.push(row(named(group), group.total, currency));
  for (const cat of group.cats) {
    L.push(row(named(cat), cat.total, currency, { indent: 2 }));
    for (const sub of cat.subs) L.push(row(`· ${sub.name}`, sub.total, currency, { indent: 5 }));
  }
  L.push('');
}

function delta(now, before) {
  if (!before) return now ? 'yangi' : '—';
  const pct = ((now - before) / Math.abs(before)) * 100;
  const arrow = pct > 0.5 ? '▲' : pct < -0.5 ? '▼' : '=';
  return `${arrow} ${pct > 0 ? '+' : ''}${pct.toFixed(0)} %`;
}

// ================= Qoldiqlar =================

// Nol qoldiqli hisob ko'rsatilmaydi. Ekranda faqat haqiqatan pul turgan
// joylar qolsin: «$ hisobda 0» degan qatorni har safar o'qishning hojati yo'q.
// Butun valyuta bo'sh bo'lsa, o'sha bo'lim ham chiqmaydi.
function balances(rows, title = '💼 KASSA QOLDIG\'I') {
  const byCur = { UZS: [], USD: [] };
  for (const a of rows) (byCur[a.currency] || (byCur[a.currency] = [])).push(a);

  const parts = [];
  for (const [cur, list] of Object.entries(byCur)) {
    const bor = list.filter(a => Number(a.balance) !== 0);
    if (!bor.length) continue;

    const L = bor.map(a => row(`${a.emoji || '•'} ${a.name}`, Number(a.balance), cur));
    // Bitta hisob qolgan bo'lsa JAMI qatori shu raqamni takrorlaydi — keraksiz
    if (bor.length > 1) {
      L.push(LINE);
      L.push(row('JAMI', bor.reduce((s, a) => s + Number(a.balance), 0), cur));
    }
    parts.push(`${curLabel(cur)}\n<pre>${f.esc(L.join('\n'))}</pre>`);
  }
  if (!parts.length) return `<b>${title}</b>\n\n<i>Hamma hisob bo'sh — qoldiq yo'q.</i>`;
  return `<b>${title}</b>\n\n` + parts.join('\n');
}

// ================= Podotchyot =================

function podotchet(rows, currency, from, to) {
  // Harakati ham, qoldig'i ham nol bo'lgan hodim ro'yxatni uzaytirmaydi
  rows = rows.filter(s => s.received || s.spent || s.returned || s.balance);
  if (!rows.length) {
    return `<b>👛 PODOTCHYOT — hisobdor pul</b>\n` +
           `📅 ${f.d(from)} — ${f.d(to)} · ${curLabel(currency)}\n\n` +
           `<i>Bu davrda harakat bo'lmagan.</i>`;
  }
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

// ================= Hodimning bir kunlik hisoboti =================

function staffDay(rows, date, currency, onlyName = null) {
  const title = onlyName ? `👤 ${f.esc(onlyName).toUpperCase()}` : '👤 HODIMLAR';
  const active = rows.filter(r => r.active);
  if (!active.length) {
    return `<b>${title} — KUNLIK HISOBOT</b>\n📅 ${f.d(date)} · ${curLabel(currency)}\n\n` +
           `<i>Bu kuni harakat bo'lmagan.</i>`;
  }

  const blocks = active.map((s) => {
    const L = [];
    L.push(row('Kun boshida', s.opening, currency));

    if (s.received.length) {
      L.push('');
      L.push(row('OLINDI', f.signed(s.receivedTotal, currency), currency));
      for (const r of s.received) {
        L.push(row(`← ${r.from_name}`, Number(r.amount), currency, { indent: 2 }));
        if (r.note) L.push(`     ${r.note}`);
      }
    }

    if (s.spent.length) {
      L.push('');
      L.push(row('SARFLANDI', f.signed(-s.spentTotal, currency), currency));
      for (const e of s.spent) {
        L.push(row(`· ${e.sub_name || e.cat_name}`, Number(e.amount), currency, { indent: 2 }));
        const where = [e.group_name, e.sub_name ? e.cat_name : null].filter(Boolean).join(' › ');
        if (where) L.push(`       ${where}`);
        if (e.note) L.push(`       💬 ${e.note}`);
      }
    }

    if (s.returned.length) {
      L.push('');
      L.push(row('QAYTARDI', f.signed(-s.returnedTotal, currency), currency));
      for (const r of s.returned) L.push(row(`→ ${r.to_name}`, Number(r.amount), currency, { indent: 2 }));
    }

    L.push('─'.repeat(W));
    L.push(row('KUN OXIRIDA', s.closing, currency));

    return `<b>👤 ${f.esc(s.full_name)}</b>\n<pre>${f.esc(L.join('\n'))}</pre>`;
  });

  const total = active.reduce((a, s) => a + s.closing, 0);
  const foot = active.length > 1 ? `\n<b>Jami qo'lda: ${f.money(total, currency)}</b>` : '';
  return `<b>${title} — KUNLIK HISOBOT</b>\n📅 ${f.d(date)} · ${curLabel(currency)}\n\n` +
         blocks.join('\n') + foot;
}

// ================= Kassa daftari =================

const TYPE_ICON = { income: '📥', expense: '📤', transfer: '🔄', opening: '⚖️' };

function operationLine(o) {
  const icon = TYPE_ICON[o.type];
  const what = o.type === 'transfer' ? `${o.account_name} → ${o.to_account_name}`
             : o.type === 'opening'  ? "Boshlang'ich qoldiq"
             : [o.group_name, o.cat_name, o.category_name].filter(Boolean).join(' · ');
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

function book(ops, { from, to, page = 0, total = 0, accountName } = {}) {
  const head = `<b>📋 KASSA DAFTARI</b>\n` +
    (accountName ? `🗂 ${accountName}\n` : '') +
    `📅 ${f.d(from)} — ${f.d(to)} · ${total} ta yozuv\n\n`;
  if (!ops.length) {
    return head + (accountName
      ? '<i>Bu davrda shu hisobda operatsiya yo\'q</i>'
      : '<i>Bu davrda operatsiya yo\'q</i>');
  }
  return head + ops.map(operationLine).join('\n\n');
}

// ================= Operatsiyani tasdiqlash =================

function draft(d) {
  const L = [];
  const title = { income: '📥 KIRIM', expense: '📤 CHIQIM',
                  transfer: '🔄 O\'TKAZMA', opening: '⚖️ BOSHLANG\'ICH QOLDIQ' }[d.type];

  L.push(row('Summa', d.amount, d.currency));
  if (d.type === 'opening') {
    L.push(row('Hisob', d.accountName, d.currency));
    L.push(row('Sana',  f.d(d.paidAt), d.currency));
  } else if (d.type === 'transfer') {
    L.push(row('Qayerdan', d.accountName, d.currency));
    L.push(row('Qayerga',  d.toAccountName, d.currency));
    if (d.toAmount) L.push(row('Olinadi', f.money(d.toAmount, d.toCurrency), d.currency));
  } else {
    L.push(row('Hisob',        d.accountName, d.currency));
    L.push(row('Guruh',        d.groupName, d.currency));
    L.push(row('Kategoriya',   d.catName, d.currency));
    L.push(row('Podkategoriya', d.categoryName, d.currency));
  }
  // Boshlang'ich qoldiqda sana yuqorida ko'rsatilgan, P&L davri esa yo'q
  if (d.type !== 'opening') {
    L.push(row("To'lov sanasi", f.d(d.paidAt), d.currency));
    L.push(row('P&L davri',     f.periodLabel(d.period), d.currency));
  }
  if (d.note) L.push(row('Izoh', d.note, d.currency));

  const warn = d.type !== 'opening' && f.iso(d.period).slice(0, 7) !== f.iso(d.paidAt).slice(0, 7)
    ? `\n⚠️ <i>Pul ${f.periodShort(d.paidAt)} oyida harakat qiladi, ` +
      `lekin foyda-zararga ${f.periodLabel(d.period)} oyida tushadi.</i>\n`
    : d.type === 'opening'
      ? `\n<i>Bu daromad emas — kassa qoldig'iga qo'shiladi, ` +
        `foyda-zararga kirmaydi.</i>\n`
    : '';

  return `<b>${title} — tasdiqlang</b>\n\n<pre>${f.esc(L.join('\n'))}</pre>${warn}`;
}

module.exports = {
  row, cashFlow, profitLoss, balances, podotchet, staffDay, book, operationLine, draft, curLabel,
};
