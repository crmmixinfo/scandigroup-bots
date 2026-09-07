require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const { Pool } = require('pg');
const cron = require('node-cron');

const bot = new Telegraf(process.env.SALES_BOT_TOKEN);
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const SUPER_ADMIN_ID = parseInt(process.env.SUPER_ADMIN_ID);
const TZ = process.env.TZ_NAME || 'Asia/Tashkent';
const COMPANY = process.env.COMPANY_NAME || 'ZELTA PREMIUM';
const CRON_MORNING = process.env.CRON_MORNING || '0 9 * * *';   // har kuni 09:00 — barchaga
const CRON_EVENING = process.env.CRON_EVENING || '0 19 * * *';  // har kuni 19:00 — rahbarga reyting

const ROLES = ['admin', 'head', 'seller'];
const ROLE_LABEL = { admin: '👑 Admin', head: '🎩 Rahbar', seller: '🧑‍💼 Sotuvchi' };

const MONTHS = ['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
const WEEKDAYS = ['yakshanba','dushanba','seshanba','chorshanba','payshanba','juma','shanba'];

// ─────────────────────────── Helperlar ───────────────────────────

// Tashkent vaqti bo'yicha "YYYY-MM-DD"
function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function addDays(ymd, delta) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Oyning 1-sanasi: "YYYY-MM-01"
function periodOf(ymd) {
  return `${ymd.slice(0, 7)}-01`;
}

function daysInMonth(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function dayNum(ymd) {
  return Number(ymd.slice(8, 10));
}

function humanDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${d}-${MONTHS[m - 1]}, ${WEEKDAYS[wd]}`;
}

function monthTitle(period) {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// "12 000 000", "12mln", "12.5 mln", "800k" → raqam
function parseAmount(raw) {
  if (!raw) return null;
  let s = String(raw).toLowerCase().trim()
    .replace(/\s| |_/g, '')
    .replace(/so'm|som|sum|сум|uzs/g, '')
    .replace(',', '.');
  let mult = 1;
  if (/(mln|млн|m)$/.test(s)) { mult = 1e6; s = s.replace(/(mln|млн|m)$/, ''); }
  else if (/(mlrd|млрд)$/.test(s)) { mult = 1e9; s = s.replace(/(mlrd|млрд)$/, ''); }
  else if (/(ming|тыс|k)$/.test(s)) { mult = 1e3; s = s.replace(/(ming|тыс|k)$/, ''); }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(parseFloat(s) * mult);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function money(n) {
  return Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/ /g, ' ');
}

function pct(fact, plan) {
  if (!plan || plan <= 0) return 0;
  return (Number(fact) / Number(plan)) * 100;
}

function bar(percent, size = 10) {
  const filled = Math.max(0, Math.min(size, Math.round((percent / 100) * size)));
  return '▓'.repeat(filled) + '░'.repeat(size - filled);
}

// Grafikdan orqada/oldinda: 🟢 / 🟡 / 🔴
function statusIcon(factPct, expectedPct) {
  if (factPct >= expectedPct) return '🟢';
  if (factPct >= expectedPct - 10) return '🟡';
  return '🔴';
}

function medal(i) {
  return ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─────────────────────────── Ma'lumotlar bazasi ───────────────────────────

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS sales_users (
      tg_id BIGINT PRIMARY KEY,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'seller',
      active BOOLEAN DEFAULT true,
      added_by BIGINT,
      added_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sales_plans (
      id SERIAL PRIMARY KEY,
      tg_id BIGINT NOT NULL REFERENCES sales_users(tg_id) ON DELETE CASCADE,
      period DATE NOT NULL,
      plan_amount NUMERIC(16,2) NOT NULL,
      updated_by BIGINT,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (tg_id, period)
    );
    CREATE TABLE IF NOT EXISTS sales_facts (
      id SERIAL PRIMARY KEY,
      tg_id BIGINT NOT NULL REFERENCES sales_users(tg_id) ON DELETE CASCADE,
      fact_date DATE NOT NULL,
      amount NUMERIC(16,2) NOT NULL,
      entered_by BIGINT,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (tg_id, fact_date)
    );
    CREATE INDEX IF NOT EXISTS sales_facts_date_idx ON sales_facts (fact_date);
  `);
}

async function getUser(tgId) {
  if (!tgId) return null;
  const { rows } = await db.query('SELECT * FROM sales_users WHERE tg_id = $1 AND active = true', [tgId]);
  if (rows[0]) return rows[0];
  if (tgId === SUPER_ADMIN_ID) return { tg_id: tgId, full_name: 'Super admin', role: 'admin', active: true };
  return null;
}

function isAdmin(user) {
  return !!user && user.role === 'admin';
}

async function activeUsers(roles) {
  const { rows } = await db.query(
    `SELECT * FROM sales_users WHERE active = true ${roles ? 'AND role = ANY($1)' : ''} ORDER BY full_name`,
    roles ? [roles] : []
  );
  return rows;
}

// Bitta xodimning oy kesimidagi ko'rsatkichlari
async function metricsFor(tgId, date) {
  const period = periodOf(date);
  const { rows } = await db.query(`
    SELECT
      COALESCE((SELECT plan_amount FROM sales_plans WHERE tg_id = $1 AND period = $2), 0) AS plan,
      COALESCE((SELECT SUM(amount) FROM sales_facts
                WHERE tg_id = $1 AND fact_date >= $2::date AND fact_date <= $3::date), 0) AS fact,
      COALESCE((SELECT amount FROM sales_facts WHERE tg_id = $1 AND fact_date = $3::date), 0) AS day_fact
  `, [tgId, period, date]);
  return buildMetrics(rows[0], date);
}

// Butun bo'lim (barcha aktiv xodimlar) — bitta so'rovda
async function metricsAll(date) {
  const period = periodOf(date);
  const { rows } = await db.query(`
    SELECT u.tg_id, u.full_name, u.role,
      COALESCE(p.plan_amount, 0) AS plan,
      COALESCE(f.total, 0) AS fact,
      COALESCE(d.amount, 0) AS day_fact
    FROM sales_users u
    LEFT JOIN sales_plans p ON p.tg_id = u.tg_id AND p.period = $1
    LEFT JOIN (
      SELECT tg_id, SUM(amount) AS total FROM sales_facts
      WHERE fact_date >= $1::date AND fact_date <= $2::date GROUP BY tg_id
    ) f ON f.tg_id = u.tg_id
    LEFT JOIN sales_facts d ON d.tg_id = u.tg_id AND d.fact_date = $2::date
    WHERE u.active = true AND u.role IN ('seller', 'head')
    ORDER BY COALESCE(f.total, 0) DESC
  `, [period, date]);
  return rows.map(r => ({ ...r, ...buildMetrics(r, date) }));
}

function buildMetrics(row, date) {
  const plan = Number(row.plan) || 0;
  const fact = Number(row.fact) || 0;
  const dayFact = Number(row.day_fact) || 0;
  const total = daysInMonth(date);
  const passed = dayNum(date);
  const left = total - passed;
  const factPct = pct(fact, plan);
  const expectedPct = (passed / total) * 100;
  const remain = Math.max(0, plan - fact);
  return {
    plan, fact, dayFact, remain, factPct, expectedPct,
    daysTotal: total, daysPassed: passed, daysLeft: left,
    // oy oxirigacha kuniga qancha kerak (bugun ham hisobga olinadi)
    needPerDay: remain > 0 ? Math.ceil(remain / Math.max(1, left + 1)) : 0,
    icon: statusIcon(factPct, expectedPct),
  };
}

// ─────────────────────────── Hisobot matnlari ───────────────────────────

function sellerReport(name, m, date, greeting = '🌅 Xayrli tong') {
  const diff = m.factPct - m.expectedPct;
  const trend = diff >= 0
    ? `🟢 Grafikdan oldinda: +${diff.toFixed(1)}%`
    : `🔴 Grafikdan orqada: ${diff.toFixed(1)}%`;

  const lines = [
    `${greeting}, ${esc(name)}!`,
    `📅 ${humanDate(date)}`,
    ``,
    `🏷 <b>${esc(COMPANY)}</b> — Savdo bo'limi`,
    `━━━━━━━━━━━━━━━━━━`,
    `🎯 Oylik plan: <b>${money(m.plan)}</b> so'm`,
    `✅ Bajarildi:  <b>${money(m.fact)}</b> so'm`,
    `📉 Qoldi:      <b>${money(m.remain)}</b> so'm`,
    ``,
    `${bar(m.factPct)} <b>${m.factPct.toFixed(1)}%</b>`,
    `━━━━━━━━━━━━━━━━━━`,
    `📆 Oy: ${m.daysPassed}/${m.daysTotal} kun (kutilgan ${m.expectedPct.toFixed(1)}%)`,
    trend,
  ];
  if (m.remain > 0) lines.push(`⚡️ Kunlik kerak: <b>${money(m.needPerDay)}</b> so'm`);
  else lines.push(`🏆 Plan bajarildi! Ustama: <b>${money(m.fact - m.plan)}</b> so'm`);
  return lines.join('\n');
}

function teamReport(rows, date, title) {
  const totals = rows.reduce((a, r) => ({
    plan: a.plan + r.plan, fact: a.fact + r.fact, day: a.day + r.dayFact,
  }), { plan: 0, fact: 0, day: 0 });
  const t = buildMetrics({ plan: totals.plan, fact: totals.fact, day_fact: totals.day }, date);

  const body = rows.length === 0
    ? ['—  Aktiv xodim yo\'q.']
    : rows.map((r, i) => [
        `${medal(i)} <b>${esc(r.full_name)}</b> ${r.icon}`,
        `    ${money(r.fact)} / ${money(r.plan)} — <b>${pct(r.fact, r.plan).toFixed(1)}%</b>`,
        `    ${bar(pct(r.fact, r.plan), 8)}  bugun: +${money(r.dayFact)}`,
      ].join('\n'));

  return [
    `${title}`,
    `📅 ${humanDate(date)}`,
    `🏷 <b>${esc(COMPANY)}</b> — Savdo bo'limi`,
    `━━━━━━━━━━━━━━━━━━`,
    body.join('\n\n'),
    `━━━━━━━━━━━━━━━━━━`,
    `📊 <b>BO'LIM JAMI</b>`,
    `🎯 Plan: ${money(t.plan)} so'm`,
    `✅ Fakt: ${money(t.fact)} so'm`,
    `${bar(t.factPct)} <b>${t.factPct.toFixed(1)}%</b> ${t.icon}`,
    `📉 Qoldi: ${money(t.remain)} so'm`,
    `📈 Bugungi savdo: +${money(totals.day)} so'm`,
    `📆 Oy: ${t.daysPassed}/${t.daysTotal} kun (kutilgan ${t.expectedPct.toFixed(1)}%)`,
  ].join('\n');
}

// ─────────────────────────── Yuborish ───────────────────────────

async function send(tgId, text, extra = {}) {
  try {
    await bot.telegram.sendMessage(tgId, text, { parse_mode: 'HTML', ...extra });
    return true;
  } catch (e) {
    console.error(`✖ ${tgId} ga yuborilmadi:`, e.description || e.message);
    return false;
  }
}

// 09:00 — barcha xodimlarga shaxsiy kartochka, rahbar/adminlarga bo'lim jadvali
// Bo'lim jadvalini oladiganlar: adminlar + rahbarlar (+ super admin)
async function leaderIds() {
  const ids = new Set((await activeUsers(['admin', 'head'])).map(u => Number(u.tg_id)));
  if (SUPER_ADMIN_ID) ids.add(SUPER_ADMIN_ID);
  return ids;
}

async function broadcastMorning() {
  const date = today();
  const rows = await metricsAll(date);
  let ok = 0;
  // 1) Har bir xodimga o'zining shaxsiy kartochkasi
  for (const r of rows) {
    if (r.plan <= 0) continue;
    if (await send(r.tg_id, sellerReport(r.full_name, r, date))) ok++;
  }
  // 2) Rahbar va adminlarga bo'lim jadvali
  const team = teamReport(rows, date, '🌅 <b>Ertalabki hisobot</b>');
  for (const id of await leaderIds()) {
    if (await send(id, team)) ok++;
  }
  console.log(`[${date}] 09:00 hisobot yuborildi — ${ok} ta xabar`);
}

// 19:00 — faqat rahbar/adminlarga kunlik reyting
async function broadcastEvening() {
  const date = today();
  const rows = await metricsAll(date);
  const text = teamReport(rows, date, '🌆 <b>Kunlik reyting</b>');
  const ids = await leaderIds();
  for (const id of ids) await send(id, text);
  console.log(`[${date}] 19:00 reyting yuborildi — ${ids.size} ta rahbar`);
}

// ─────────────────────────── Bot: umumiy ───────────────────────────

bot.use(session({ defaultSession: () => ({}) }));

bot.catch((err, ctx) => {
  console.error(`Xato (${ctx.updateType}):`, err);
});

bot.command('myid', (ctx) =>
  ctx.reply(`Sizning Telegram ID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' })
);

bot.start(async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) {
    return ctx.reply(
      `❌ Sizga ruxsat yo'q.\n\nSizning ID: <code>${ctx.from.id}</code>\n\n` +
      `Bu ID ni savdo bo'limi administratoriga yuboring.`,
      { parse_mode: 'HTML' }
    );
  }
  const help = isAdmin(user)
    ? `\n\n<b>Admin buyruqlari:</b>\n` +
      `/plan — oylik plan qo'yish\n` +
      `/fakt — kunlik fakt kiritish\n` +
      `/xodimlar — xodimlar ro'yxati\n` +
      `/xodim_qosh — xodim qo'shish\n` +
      `/yubor — hisobotni hozir yuborish\n` +
      `/hisobot — bo'lim jadvalini ko'rish`
    : `\n\n/men — o'z plan va faktimni ko'rish`;

  await ctx.reply(
    `👋 Salom, ${esc(ctx.from.first_name)}!\n\n` +
    `🏷 <b>${esc(COMPANY)}</b> — Savdo bo'limi\n` +
    `${ROLE_LABEL[user.role] || user.role}\n\n` +
    `📬 Har kuni 09:00 da shaxsiy hisobot keladi.` + help,
    { parse_mode: 'HTML' }
  );
});

// /men — o'z natijasi
bot.command('men', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply('❌ Ruxsat yo\'q.');
  const date = today();
  const m = await metricsFor(ctx.from.id, date);
  if (m.plan <= 0) return ctx.reply(`⚠️ ${monthTitle(periodOf(date))} uchun sizga plan qo'yilmagan.`);
  await ctx.reply(sellerReport(user.full_name, m, date, '📊 Sizning natijangiz'), { parse_mode: 'HTML' });
});

// ─────────────────────────── Bot: admin ───────────────────────────

async function requireAdmin(ctx) {
  const user = await getUser(ctx.from.id);
  if (!isAdmin(user)) {
    await ctx.reply('❌ Bu buyruq faqat admin uchun.');
    return null;
  }
  return user;
}

// /xodim_qosh <tg_id> <role> <F.I.Sh>
bot.command('xodim_qosh', async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const args = ctx.message.text.split(' ').slice(1);
  const [tgId, role] = args;
  const name = args.slice(2).join(' ').trim();
  if (!tgId || !ROLES.includes(role) || !name) {
    return ctx.reply(
      `Foydalanish:\n<code>/xodim_qosh &lt;tg_id&gt; &lt;rol&gt; &lt;F.I.Sh&gt;</code>\n\n` +
      `Rollar:\n• <b>admin</b> — ma'lumot kiritadi\n• <b>head</b> — rahbar, reyting oladi\n• <b>seller</b> — sotuvchi\n\n` +
      `Misol:\n<code>/xodim_qosh 123456789 seller Aliyev Vali</code>`,
      { parse_mode: 'HTML' }
    );
  }
  await db.query(`
    INSERT INTO sales_users (tg_id, full_name, role, active, added_by)
    VALUES ($1, $2, $3, true, $4)
    ON CONFLICT (tg_id) DO UPDATE SET full_name = $2, role = $3, active = true
  `, [parseInt(tgId), name, role, ctx.from.id]);
  await ctx.reply(`✅ Qo'shildi: <b>${esc(name)}</b>\n${ROLE_LABEL[role]}\nID: <code>${tgId}</code>`, { parse_mode: 'HTML' });
});

// /xodim_ochir <tg_id>
bot.command('xodim_ochir', async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const tgId = ctx.message.text.split(' ')[1];
  if (!tgId) return ctx.reply('Foydalanish: /xodim_ochir <tg_id>');
  const { rowCount } = await db.query('UPDATE sales_users SET active = false WHERE tg_id = $1', [parseInt(tgId)]);
  await ctx.reply(rowCount ? `✅ O'chirildi: ${tgId}` : '⚠️ Bunday xodim topilmadi.');
});

// /xodimlar
bot.command('xodimlar', async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const rows = await activeUsers();
  if (!rows.length) return ctx.reply("Xodimlar ro'yxati bo'sh. /xodim_qosh orqali qo'shing.");
  const text = rows.map(r =>
    `${ROLE_LABEL[r.role] || r.role} <b>${esc(r.full_name)}</b>\n    <code>${r.tg_id}</code>`
  ).join('\n');
  await ctx.reply(`📋 <b>Savdo bo'limi</b> (${rows.length} ta)\n\n${text}`, { parse_mode: 'HTML' });
});

// Xodim tanlash tugmalari
async function pickEmployee(ctx, action, title) {
  const rows = await activeUsers(['seller', 'head']);
  if (!rows.length) return ctx.reply("⚠️ Avval /xodim_qosh orqali xodim qo'shing.");
  const buttons = rows.map(r => [Markup.button.callback(r.full_name, `${action}:${r.tg_id}`)]);
  await ctx.reply(title, Markup.inlineKeyboard(buttons));
}

// /plan [tg_id] [summa] [YYYY-MM]
bot.command('plan', async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const [tgId, amountRaw, ym] = ctx.message.text.split(' ').slice(1);
  if (!tgId) return pickEmployee(ctx, 'plan', `🎯 ${monthTitle(periodOf(today()))} uchun kimga plan qo'yamiz?`);
  const amount = parseAmount(amountRaw);
  if (amount === null) return ctx.reply('❌ Summa noto\'g\'ri. Misol: /plan 123456789 120mln');
  await savePlan(ctx, parseInt(tgId), amount, ym ? `${ym}-01` : periodOf(today()));
});

// /fakt [tg_id] [summa] [YYYY-MM-DD]
bot.command('fakt', async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const [tgId, amountRaw, ymd] = ctx.message.text.split(' ').slice(1);
  if (!tgId) return pickEmployee(ctx, 'fakt', `💰 ${humanDate(today())} — kimning faktini kiritamiz?`);
  const amount = parseAmount(amountRaw);
  if (amount === null) return ctx.reply('❌ Summa noto\'g\'ri. Misol: /fakt 123456789 4.5mln');
  await saveFact(ctx, parseInt(tgId), amount, ymd || today());
});

bot.action(/^(plan|fakt):(\d+)$/, async (ctx) => {
  if (!await requireAdmin(ctx)) return ctx.answerCbQuery();
  const [, mode, tgId] = ctx.match;
  const { rows } = await db.query('SELECT full_name FROM sales_users WHERE tg_id = $1', [tgId]);
  const name = rows[0] ? rows[0].full_name : tgId;
  ctx.session.pending = { mode, tgId: parseInt(tgId), name };
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    mode === 'plan'
      ? `🎯 <b>${esc(name)}</b> — ${monthTitle(periodOf(today()))} oylik plani.\n\nSummani yuboring (masalan: <code>120mln</code> yoki <code>120 000 000</code>):`
      : `💰 <b>${esc(name)}</b> — ${humanDate(today())} kunlik savdosi.\n\nSummani yuboring (masalan: <code>4.5mln</code>):`,
    { parse_mode: 'HTML' }
  );
});

// Summa kutilayotgan holat
bot.on('text', async (ctx, next) => {
  const pending = ctx.session.pending;
  if (!pending || ctx.message.text.startsWith('/')) return next();
  if (!await requireAdmin(ctx)) { ctx.session.pending = null; return; }
  const amount = parseAmount(ctx.message.text);
  if (amount === null) return ctx.reply('❌ Summani tushunmadim. Misol: <code>12mln</code>, <code>4 500 000</code>', { parse_mode: 'HTML' });
  ctx.session.pending = null;
  if (pending.mode === 'plan') await savePlan(ctx, pending.tgId, amount, periodOf(today()));
  else await saveFact(ctx, pending.tgId, amount, today());
});

async function savePlan(ctx, tgId, amount, period) {
  const { rows } = await db.query('SELECT full_name FROM sales_users WHERE tg_id = $1 AND active = true', [tgId]);
  if (!rows[0]) return ctx.reply('⚠️ Bunday aktiv xodim yo\'q.');
  await db.query(`
    INSERT INTO sales_plans (tg_id, period, plan_amount, updated_by, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (tg_id, period) DO UPDATE SET plan_amount = $3, updated_by = $4, updated_at = NOW()
  `, [tgId, period, amount, ctx.from.id]);
  await ctx.reply(
    `✅ Plan saqlandi\n\n👤 <b>${esc(rows[0].full_name)}</b>\n📅 ${monthTitle(period)}\n🎯 <b>${money(amount)}</b> so'm`,
    { parse_mode: 'HTML' }
  );
  await send(tgId, `🎯 <b>${monthTitle(period)}</b> uchun oylik planingiz belgilandi:\n\n<b>${money(amount)}</b> so'm\n\n💪 Omad!`);
}

async function saveFact(ctx, tgId, amount, date) {
  const { rows } = await db.query('SELECT full_name FROM sales_users WHERE tg_id = $1 AND active = true', [tgId]);
  if (!rows[0]) return ctx.reply('⚠️ Bunday aktiv xodim yo\'q.');
  await db.query(`
    INSERT INTO sales_facts (tg_id, fact_date, amount, entered_by, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (tg_id, fact_date) DO UPDATE SET amount = $3, entered_by = $4, updated_at = NOW()
  `, [tgId, date, amount, ctx.from.id]);
  const m = await metricsFor(tgId, date);
  await ctx.reply(
    `✅ Fakt saqlandi\n\n👤 <b>${esc(rows[0].full_name)}</b>\n📅 ${humanDate(date)}\n💰 <b>${money(amount)}</b> so'm\n\n` +
    `📊 Oylik: ${money(m.fact)} / ${money(m.plan)} — <b>${m.factPct.toFixed(1)}%</b> ${m.icon}`,
    { parse_mode: 'HTML' }
  );
}

// /hisobot — bo'lim jadvali (admin/rahbar)
bot.command('hisobot', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user || user.role === 'seller') return ctx.reply('❌ Ruxsat yo\'q.');
  const date = today();
  const rows = await metricsAll(date);
  await ctx.reply(teamReport(rows, date, '📊 <b>Joriy holat</b>'), { parse_mode: 'HTML' });
});

// /yubor — hisobotni hozir qo'lda yuborish
bot.command('yubor', async (ctx) => {
  if (!await requireAdmin(ctx)) return;
  const mode = (ctx.message.text.split(' ')[1] || '').toLowerCase();
  if (mode === 'reyting') {
    await broadcastEvening();
    return ctx.reply('✅ Reyting rahbarlarga yuborildi.');
  }
  if (mode === 'hammaga') {
    await broadcastMorning();
    return ctx.reply('✅ Shaxsiy hisobotlar barchaga yuborildi.');
  }
  await ctx.reply(
    `Nimani yuboraylik?\n\n` +
    `<code>/yubor hammaga</code> — har bir xodimga shaxsiy hisobot\n` +
    `<code>/yubor reyting</code> — rahbarlarga bo'lim reytingi`,
    { parse_mode: 'HTML' }
  );
});

// ─────────────────────────── Ishga tushirish ───────────────────────────

(async () => {
  await ensureSchema();

  cron.schedule(CRON_MORNING, () => broadcastMorning().catch(console.error), { timezone: TZ });
  cron.schedule(CRON_EVENING, () => broadcastEvening().catch(console.error), { timezone: TZ });

  await bot.launch({ dropPendingUpdates: true });
  console.log(`✅ Savdo bot ishga tushdi — ${COMPANY}`);
  console.log(`⏰ ${TZ}: ertalabki "${CRON_MORNING}", kechqurungi "${CRON_EVENING}"`);
})().catch((e) => {
  console.error('Ishga tushirishda xato:', e);
  process.exit(1);
});

process.once('SIGINT', () => { bot.stop('SIGINT'); db.end(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); db.end(); });
