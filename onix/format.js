// ONIX — formatlash yordamchilari

const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun',
                'Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
const MONTHS_SHORT = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'];

const CUR = {
  UZS: { sign: "so'm", decimals: 0, emoji: '🇺🇿' },
  USD: { sign: '$',    decimals: 2, emoji: '💵' },
};

// 1500000 → "1 500 000 so'm" | 1500.5 → "1 500.50 $"
function money(amount, currency) {
  const c = CUR[currency] || CUR.UZS;
  const n = Number(amount) || 0;
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(c.decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '−' : ''}${grouped}${frac ? '.' + frac : ''} ${c.sign}`;
}

// Ishorali summa — hisobotlarda + / − ko'rinishi uchun
function signed(amount, currency) {
  const n = Number(amount) || 0;
  return (n > 0 ? '+' : '') + money(n, currency);
}

// Date | 'YYYY-MM-DD' → "05.02.2026"
function d(value) {
  const dt = toDate(value);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}

// Date → "Fevral 2026"
function periodLabel(value) {
  const dt = toDate(value);
  return `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

// Date → "Fev 2026"
function periodShort(value) {
  const dt = toDate(value);
  return `${MONTHS_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
}

// Bazaga yoziladigan sana — mahalliy vaqt bo'yicha, UTC siljishisiz
function iso(value) {
  const dt = toDate(value);
  const p = (x) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

// Oyning 1-kuni (period ustuni uchun)
function firstDay(year, month /* 1-12 */) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

// Oyning oxirgi kuni
function lastDay(year, month) {
  return iso(new Date(year, month, 0));
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  return new Date(value);
}

// Foydalanuvchi yozgan summani o'qish:
// "1 500 000" | "1500000" | "1,5 mln" | "250k" | "3.5 ming" → son
function parseAmount(text) {
  if (!text) return null;
  let s = String(text).trim().toLowerCase().replace(/['’\s ]/g, '');

  let multiplier = 1;
  if (/(mln|млн|million|milion)$/.test(s)) { multiplier = 1e6; s = s.replace(/(mln|млн|million|milion)$/, ''); }
  else if (/(mlrd|млрд|milliard)$/.test(s)) { multiplier = 1e9; s = s.replace(/(mlrd|млрд|milliard)$/, ''); }
  else if (/(ming|k|тыс)$/.test(s))         { multiplier = 1e3; s = s.replace(/(ming|k|тыс)$/, ''); }

  s = s.replace(',', '.');
  if (!/^\d*\.?\d+$/.test(s)) return null;

  const n = parseFloat(s) * multiplier;
  if (!isFinite(n) || n <= 0 || n > 1e15) return null;
  return Math.round(n * 100) / 100;
}

// Foydalanuvchi yozgan sanani o'qish: "5.2.2026" | "05.02" | "2026-02-05"
function parseDate(text, today = new Date()) {
  if (!text) return null;
  const s = String(text).trim();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validDate(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?$/);
  if (m) {
    let year = m[3] ? +m[3] : today.getFullYear();
    if (year < 100) year += 2000;
    return validDate(year, +m[2], +m[1]);
  }
  return null;
}

function validDate(y, mo, day) {
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  const dt = new Date(y, mo - 1, day);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== day) return null;
  return iso(dt);
}

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// "Ismi Familiyasi" → "I. Familiyasi" (tor jadvallar uchun)
function shortName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  return parts.length < 2 ? (parts[0] || '—') : `${parts[0]} ${parts[1][0]}.`;
}

module.exports = {
  MONTHS, MONTHS_SHORT, CUR,
  money, signed, d, periodLabel, periodShort, iso, firstDay, lastDay,
  parseAmount, parseDate, esc, shortName,
};
