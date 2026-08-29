#!/usr/bin/env node
// ONIX — botni tokensiz sinab ko'rish
//
// Botni haqiqiy Telegram update'lari bilan yurgizadi, faqat tarmoqqa
// chiqmaydi: har bir ekran terminalda chiziladi. Real bot bilan bir xil
// kod ishlaydi — menyu, sehrgar, hisobotlar, ruxsatlar.
//
// Ishlatish:
//   npm run onix:demo
//
// Bo'sh PostgreSQL bazasi kerak (DATABASE_URL yoki PGHOST/PGDATABASE).
// Diqqat: demo bazadagi operatsiya, foydalanuvchi va hisoblarni tozalaydi.

require('dotenv').config();
process.env.ONIX_BOT_TOKEN = process.env.ONIX_BOT_TOKEN || '000:demo';
// Demoda super admin chetlab o'tishi ishlatilmaydi — hamma username orqali ulanadi
process.env.SUPER_ADMIN_ID = '0';

const { Telegram } = require('telegraf');
const bot = require('../../onix-bot');
const db = require('../db');

bot.botInfo = { id: 1, is_bot: true, username: 'onix_demo_bot', first_name: 'ONIX' };

// ---------- ekranni chizish ----------

const W = 62;
const box = (title, color) => ({ title, color });
const C = { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
            blue: '\x1b[34m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' };

// HTML → terminal matni
function render(html) {
  return String(html || '')
    .replace(/<pre>([\s\S]*?)<\/pre>/g, (_, x) => x)
    .replace(/<\/?(b|i|u|s|code|pre)>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Inline tugmalarni chizish
function buttons(markup) {
  if (!markup || !markup.inline_keyboard) return [];
  return markup.inline_keyboard.map(row =>
    row.map(b => `[ ${b.text} ]`).join(' '));
}

// Doimiy (reply) klaviatura
function menuKeys(markup) {
  if (!markup || !markup.keyboard) return [];
  return markup.keyboard.map(row => row.map(b => (b.text || b)).join('   '));
}

let currentActor = '';
function screen(text, markup) {
  const lines = render(text).split('\n');
  console.log(`${C.dim}┌─ 🤖 bot → ${currentActor} ${'─'.repeat(Math.max(0, W - 14 - currentActor.length))}${C.reset}`);
  for (const l of lines) console.log(`${C.dim}│${C.reset} ${l}`);
  const btns = buttons(markup);
  if (btns.length) {
    console.log(`${C.dim}│${C.reset}`);
    for (const b of btns) console.log(`${C.dim}│${C.reset} ${C.blue}${b}${C.reset}`);
  }
  const keys = menuKeys(markup);
  if (keys.length) {
    console.log(`${C.dim}│${C.reset}`);
    for (const k of keys) console.log(`${C.dim}│${C.reset} ${C.dim}${k}${C.reset}`);
  }
  console.log(`${C.dim}└${'─'.repeat(W)}${C.reset}\n`);
}

// Tarmoq o'rniga — ekranga
Telegram.prototype.callApi = async function (method, payload = {}) {
  if (method === 'sendMessage' || method === 'editMessageText') {
    screen(payload.text, payload.reply_markup);
  }
  return { message_id: Math.floor(Math.random() * 1e6), date: 1, chat: { id: 1 }, text: payload.text };
};

// ---------- harakatlar ----------

let uid = 1000, mid = 100;

function act(who, what) {
  currentActor = who;
  console.log(`${C.bold}${C.green}▶ ${who}:${C.reset} ${what}`);
}

const send = (who, id, text, username) => {
  act(who, `«${text}» deb yozdi`);
  return bot.handleUpdate({ update_id: ++uid, message: {
    message_id: ++mid, date: 1, chat: { id, type: 'private' },
    from: { id, is_bot: false, first_name: who.split(' ')[0], ...(username ? { username } : {}) },
    text,
    ...(text.startsWith('/') ? { entities: [{ offset: 0, length: text.split(' ')[0].length, type: 'bot_command' }] } : {}),
  } });
};

const tap = (who, id, data, label) => {
  act(who, `${C.blue}[ ${label} ]${C.reset}${C.green} tugmasini bosdi${C.reset}`);
  return bot.handleUpdate({ update_id: ++uid, callback_query: {
    id: String(++uid), chat_instance: '1', data,
    from: { id, is_bot: false, first_name: who.split(' ')[0] },
    message: { message_id: ++mid, date: 1, chat: { id, type: 'private' }, text: '—' },
  } });
};

const title = (t) => console.log(`\n${C.bold}${C.yellow}${'═'.repeat(W)}\n  ${t}\n${'═'.repeat(W)}${C.reset}\n`);

// ---------- ssenariy ----------

const SAIDAZIZ = 5001, ASADBEK = 5002, BURXON = 5003;

async function main() {
  // Demo uchun toza holat
  await db.q('TRUNCATE onix_operations RESTART IDENTITY CASCADE');
  await db.q("DELETE FROM onix_accounts WHERE kind = 'podotchet'");
  await db.q('DELETE FROM onix_users');
  await db.q('DELETE FROM onix_pending_users');

  const cats = await db.one('SELECT COUNT(*)::int AS n FROM onix_categories');
  if (!cats.n) {
    console.error('❌ Kategoriyalar yuklanmagan. Avval: npm run onix:categories');
    process.exit(1);
  }

  // Jamoa kutish ro'yxatida (npm run onix:users qilgandek)
  await db.addPendingUser('saidazizsaidiy', 'Saidaziz Saidiy', 'admin', null);
  await db.addPendingUser('kuchimala70', 'Asadbek Abduqahhorov', 'staff', null);
  await db.addPendingUser('abb_018', 'Burxon', 'staff', null);

  const id = async (name, level) => (await db.one(
    'SELECT id FROM onix_categories WHERE name = $1' + (level ? ' AND level = $2' : ''),
    level ? [name, level] : [name])).id;
  const acc = async (name) => (await db.one('SELECT id FROM onix_accounts WHERE name = $1', [name])).id;

  title("1. JAMOA TIZIMGA KIRADI — username bo'yicha avtomat");

  await send('Saidaziz', SAIDAZIZ, '/start', 'saidazizsaidiy');
  await send('Asadbek', ASADBEK, '/start', 'Kuchimala70');   // registr farq qilsa ham

  title('2. ADMIN KIRIM KIRITADI — ijara to\'lovi');

  const plastik = await acc('Plastik (sum)');
  const naqd = await acc('Naqd (sum)');

  await send('Saidaziz', SAIDAZIZ, '💰 Kirim');
  await tap('Saidaziz', SAIDAZIZ, `acc:${plastik}`, '💳 Plastik (sum)');
  await tap('Saidaziz', SAIDAZIZ, `grp:${await id('Onix bussines center', 1)}`, 'Onix bussines center');
  await tap('Saidaziz', SAIDAZIZ, `cat:${await id("Ijara to'lovi", 2)}`, "Ijara to'lovi");
  await tap('Saidaziz', SAIDAZIZ, `sub:${await id('mijoz nomi', 3)}`, 'mijoz nomi');
  await send('Saidaziz', SAIDAZIZ, '68 mln');
  await tap('Saidaziz', SAIDAZIZ, 'dat:2026-08-03', '📅 Bugun');
  await tap('Saidaziz', SAIDAZIZ, 'per:2026-08-01', '✅ Avg 2026');
  await tap('Saidaziz', SAIDAZIZ, 'note:skip', '⏭ Izohsiz');
  await tap('Saidaziz', SAIDAZIZ, 'save', '✅ Saqlash');

  title('3. ADMIN ASADBEKKA HISOBDOR PUL BERADI');

  const asadbekAcc = (await db.listAccounts({ kind: 'podotchet', ownerTgId: ASADBEK, currency: 'UZS' }))[0].id;
  await send('Saidaziz', SAIDAZIZ, "👛 Hodimga pul berish");
  await tap('Saidaziz', SAIDAZIZ, `acc:${naqd}`, '💵 Naqd (sum)');
  await tap('Saidaziz', SAIDAZIZ, `to:${asadbekAcc}`, '👛 Asadbek Abduqahhorov (sum)');
  await send('Saidaziz', SAIDAZIZ, '5 mln');
  await tap('Saidaziz', SAIDAZIZ, 'dat:2026-08-05', '📅 Bugun');
  await tap('Saidaziz', SAIDAZIZ, 'note:skip', '⏭ Izohsiz');
  await tap('Saidaziz', SAIDAZIZ, 'save', '✅ Saqlash');

  title('4. ASADBEK O\'Z PULIDAN XARAJAT KIRITADI');

  await send('Asadbek', ASADBEK, '💸 Xarajat kiritish');
  await tap('Asadbek', ASADBEK, `acc:${asadbekAcc}`, '👛 Asadbek Abduqahhorov (sum)');
  await tap('Asadbek', ASADBEK, `grp:${await id('Onix xarajatlar uchun', 1)}`, 'Onix xarajatlar uchun');
  await tap('Asadbek', ASADBEK, `cat:${await id("Xo'jalik xarajatlari", 2)}`, "Xo'jalik xarajatlari");
  await tap('Asadbek', ASADBEK, `sub:${await id('Tozalik mahsulotlari', 3)}`, 'Tozalik mahsulotlari');
  await send('Asadbek', ASADBEK, '1 150 000');
  await tap('Asadbek', ASADBEK, 'dat:2026-08-07', '📅 Bugun');
  await tap('Asadbek', ASADBEK, 'per:2026-08-01', '✅ Avg 2026');
  await send('Asadbek', ASADBEK, 'Metro dan olindi');
  await tap('Asadbek', ASADBEK, 'save', '✅ Saqlash');

  title('5. PODKATEGORIYASIZ KATEGORIYA — qadam o\'tkazib yuboriladi');

  await send('Saidaziz', SAIDAZIZ, '💸 Chiqim');
  await tap('Saidaziz', SAIDAZIZ, `acc:${plastik}`, '💳 Plastik (sum)');
  await tap('Saidaziz', SAIDAZIZ, `grp:${await id('Yangiobod', 1)}`, 'Yangiobod');
  await tap('Saidaziz', SAIDAZIZ, `cat:${await id('Soliq', 2)}`, 'Soliq');
  await send('Saidaziz', SAIDAZIZ, '3,2 mln');
  await tap('Saidaziz', SAIDAZIZ, 'dat:2026-08-15', '📅 Bugun');
  await tap('Saidaziz', SAIDAZIZ, 'per:2026-08-01', '✅ Avg 2026');
  await tap('Saidaziz', SAIDAZIZ, 'note:skip', '⏭ Izohsiz');
  await tap('Saidaziz', SAIDAZIZ, 'save', '✅ Saqlash');

  title('6. ⭐ AVGUSTDA TO\'LANADI, SENTABR HISOBOTIGA TUSHADI');

  await send('Saidaziz', SAIDAZIZ, '💸 Chiqim');
  await tap('Saidaziz', SAIDAZIZ, `acc:${plastik}`, '💳 Plastik (sum)');
  await tap('Saidaziz', SAIDAZIZ, `grp:${await id('Onix xarajatlar uchun', 1)}`, 'Onix xarajatlar uchun');
  await tap('Saidaziz', SAIDAZIZ, `cat:${await id("Komunal to'lovlar", 2)}`, "Komunal to'lovlar");
  await tap('Saidaziz', SAIDAZIZ, `sub:${await id('Elektr energiya', 3)}`, 'Elektr energiya');
  await send('Saidaziz', SAIDAZIZ, '6 mln');
  await tap('Saidaziz', SAIDAZIZ, 'dat:2026-08-30', '📅 Bugun');
  await tap('Saidaziz', SAIDAZIZ, 'per:2026-09-01', '➡️ Sen 2026');
  await tap('Saidaziz', SAIDAZIZ, 'note:skip', '⏭ Izohsiz');
  await tap('Saidaziz', SAIDAZIZ, 'save', '✅ Saqlash');

  title('7. ASADBEK O\'Z QOLDIG\'INI KO\'RADI');
  await send('Asadbek', ASADBEK, "👛 Qo'limdagi qoldiq");
  await send('Asadbek', ASADBEK, '📋 Mening operatsiyalarim');

  title('8. ⛔ ASADBEK BOSHQANI KO\'RMOQCHI — RAD ETILADI');
  await send('Asadbek', ASADBEK, "📊 Kassa qoldig'i");
  await send('Asadbek', ASADBEK, '📋 Kassa daftari');

  title('9. ADMIN: FOYDA-ZARAR — AVGUST');
  await send('Saidaziz', SAIDAZIZ, '📈 Foyda-zarar');
  await tap('Saidaziz', SAIDAZIZ, 'rcur:UZS', "🇺🇿 So'm");
  await tap('Saidaziz', SAIDAZIZ, 'rmon:2026-08-01', 'Avg');

  title('10. ADMIN: PUL OQIMI — AVGUST');
  await send('Saidaziz', SAIDAZIZ, '💹 Pul oqimi');
  await tap('Saidaziz', SAIDAZIZ, 'rcur:UZS', "🇺🇿 So'm");
  await tap('Saidaziz', SAIDAZIZ, 'rng:pick', '📅 Oy tanlash');
  await tap('Saidaziz', SAIDAZIZ, 'rrange:2026-08-01', 'Avg');

  title('11. ADMIN: PODOTCHYOT QOLDIQLAR');
  await send('Saidaziz', SAIDAZIZ, '👛 Podotchyot qoldiqlar');
  await tap('Saidaziz', SAIDAZIZ, 'rcur:UZS', "🇺🇿 So'm");
  await tap('Saidaziz', SAIDAZIZ, 'rng:month', 'Bu oy');

  console.log(`${C.bold}${C.green}✅ Demo tugadi.${C.reset}\n`);
  await db.pool.end();
}

main().catch(e => { console.error('❌', e); process.exit(1); });
