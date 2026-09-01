// ONIX — kunlik hisobot
//
// Har kuni ertalab kechagi kun bo'yicha yuboriladi:
//   • kun yakuni — kirim, chiqim, sof oqim, kassa qoldiqlari
//   • o'sha kuni kiritilgan operatsiyalar ro'yxati
//   • hodimlar qo'lidagi qoldiqlar
//
// Telegram bitta xabarda 4096 belgidan ko'pini ko'tarmaydi, shuning uchun
// natija bir nechta xabarga bo'linadi.

const db = require('./db');
const R = require('./reports');
const V = require('./views');
const f = require('./format');

const LIMIT = 3800;   // 4096 dan zaxira bilan
const KUNLAR = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

// Bir kunlik yakun — valyuta kesimida
async function daySummary(date, currency) {
  const cf = await R.cashFlow(date, date, currency);
  const hasMovement = cf.incomeTotal || cf.expenseTotal || cf.convIn || cf.convOut || cf.openedInPeriod;
  const hasMoney = cf.accounts.some(a => Number(a.balance) !== 0);
  if (!hasMovement && !hasMoney) return null;

  const L = [];
  L.push(V.row('Kirim',  f.signed(cf.incomeTotal, currency), currency));
  L.push(V.row('Chiqim', f.signed(-cf.expenseTotal, currency), currency));
  if (cf.convIn || cf.convOut) {
    L.push(V.row('Konvertatsiya', f.signed(cf.convIn - cf.convOut, currency), currency));
  }
  if (cf.openedInPeriod) {
    L.push(V.row("Boshlang'ich", f.signed(cf.openedInPeriod, currency), currency));
  }
  L.push('─'.repeat(38));
  L.push(V.row('SOF OQIM', f.signed(cf.net, currency), currency));
  L.push('');
  L.push('Kun oxiridagi qoldiqlar:');
  for (const a of cf.accounts) {
    if (Number(a.balance) === 0 && !hasMovement) continue;
    L.push(V.row(`${a.emoji || '•'} ${a.name}`, Number(a.balance), currency, { indent: 1 }));
  }
  L.push('');
  L.push(V.row('JAMI', cf.closing, currency));

  return { currency, lines: L, movement: !!hasMovement };
}

// To'liq kunlik hisobot — xabarlar massivi
async function build(date) {
  const dt = new Date(date + 'T00:00:00');
  const head = `<b>📅 KUNLIK HISOBOT</b>\n${f.d(date)}, ${KUNLAR[dt.getDay()]}\n`;

  const messages = [];
  let anyMovement = false;

  // ---------- 1. Kun yakuni ----------
  const parts = [head];
  for (const currency of ['UZS', 'USD']) {
    const s = await daySummary(date, currency);
    if (!s) continue;
    anyMovement = anyMovement || s.movement;
    parts.push(`\n${V.curLabel(currency)}\n<pre>${f.esc(s.lines.join('\n'))}</pre>`);
  }
  if (parts.length === 1) parts.push('\n<i>Bu kuni harakat bo\'lmagan.</i>');
  messages.push(parts.join(''));

  // ---------- 2. O'sha kungi operatsiyalar ----------
  const ops = await db.listOperations({ from: date, to: date, limit: 200 });
  if (ops.length) {
    let buf = `<b>📋 Operatsiyalar — ${ops.length} ta</b>\n\n`;
    for (const op of ops) {
      const line = V.operationLine(op) + '\n\n';
      if (buf.length + line.length > LIMIT) { messages.push(buf); buf = ''; }
      buf += line;
    }
    if (buf.trim()) messages.push(buf);
  }

  // ---------- 3. Hodimlar bo'yicha batafsil ----------
  // Qisqa jamlanma o'rniga to'liq manzara: kun boshida qancha bor edi,
  // kimdan qancha oldi, nimaga sarfladi, kun oxirida qancha qoldi.
  for (const currency of ['UZS', 'USD']) {
    const rows = await R.staffDay(date, currency);
    if (!rows.some(r => r.active)) continue;
    const text = V.staffDay(rows, date, currency);
    if (text.length <= LIMIT) { messages.push(text); continue; }
    // Uzun bo'lsa hodimlarga bo'lib yuboramiz
    for (const s of rows.filter(r => r.active)) {
      messages.push(V.staffDay([s], date, currency));
    }
  }

  return messages;
}

// Kimlarga yuboriladi — admin va rahbarlar
async function recipients() {
  return (await db.listUsers()).filter(u => u.role === 'admin' || u.role === 'manager');
}

// Kechagi sana (mahalliy vaqt bo'yicha)
function yesterday(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return f.iso(d);
}

module.exports = { build, recipients, yesterday };
