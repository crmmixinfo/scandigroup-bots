// ============================================================
// ONIX — moliyaviy bot
// Kassa daftari → Pul oqimi + Foyda-zarar (avtomatik)
// ============================================================

require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');

const db = require('./onix/db');
const R  = require('./onix/reports');
const V  = require('./onix/views');
const K  = require('./onix/keyboards');
const f  = require('./onix/format');

const bot = new Telegraf(process.env.ONIX_BOT_TOKEN);
bot.use(session({ defaultSession: () => ({}) }));

const HTML = { parse_mode: 'HTML' };
const MINI_APP_URL = process.env.ONIX_MINI_APP_URL;

// Katta operatsiyalar haqida rahbarlarga xabar (ixtiyoriy)
const NOTIFY = {
  UZS: Number(process.env.ONIX_NOTIFY_UZS) || 0,
  USD: Number(process.env.ONIX_NOTIFY_USD) || 0,
};

// ================= Ruxsatlar =================

const isAdmin      = (u) => u.role === 'admin';
const canEnterCash = (u) => u.role === 'admin' || u.role === 'cashier';
const canEnterOwn  = (u) => u.role === 'staff';
const canReport    = (u) => u.role === 'admin' || u.role === 'manager';
const canSeeBook   = (u) => u.role !== 'staff';
// Hodim faqat o'z podotchyot qoldig'ini ko'radi, kompaniya kassalarini emas
const canSeeAllBalances = (u) => u.role !== 'staff';

const ROLE_LABEL = {
  admin: '👑 Administrator', cashier: '💼 Kassir',
  staff: '🧾 Hodim',         manager: '👁 Rahbar',
};

// ================= Autentifikatsiya =================

bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  if (ctx.message?.text === '/myid') {
    return ctx.reply(`Sizning Telegram ID: <code>${ctx.from.id}</code>`, HTML);
  }
  ctx.user = await db.getUser(ctx.from.id);

  // Ro'yxatda yo'q — balki admin uni username bo'yicha oldindan yozib qo'ygandir
  if (!ctx.user && ctx.from.username) {
    ctx.user = await db.bindPendingUser(ctx.from.id, ctx.from.username);
    if (ctx.user) {
      await ctx.reply(
        `✅ <b>Xush kelibsiz, ${f.esc(ctx.user.full_name)}!</b>\n\n` +
        `Sizni <code>@${f.esc(ctx.from.username)}</code> bo'yicha tanidim.\n` +
        `Rol: ${ROLE_LABEL[ctx.user.role]}`, HTML);
      await notifyAdmins(ctx,
        `🔗 <b>Bog'landi</b>\n\n${f.esc(ctx.user.full_name)} ` +
        `(@${f.esc(ctx.from.username)}) tizimga kirdi.\n` +
        `ID: <code>${ctx.from.id}</code> · ${ROLE_LABEL[ctx.user.role]}`);
    }
  }

  if (!ctx.user) return askAdminToApprove(ctx);

  // Username o'zgargan bo'lsa yangilab qo'yamiz
  if (ctx.from.username) await db.touchUsername(ctx.from.id, ctx.from.username);

  // Super admin avtomat yozilganda ismi vaqtinchalik bo'ladi — haqiqiysiga almashtiramiz
  if (ctx.user.full_name === 'Super admin') {
    const real = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ');
    if (real) {
      await db.addUser(ctx.from.id, real, ctx.user.role, ctx.from.id, ctx.from.username);
      ctx.user.full_name = real;
    }
  }
  return next();
});

// Notanish odam botga kirdi — adminlarga rol tugmalari bilan xabar
async function askAdminToApprove(ctx) {
  const who = ctx.from;
  const uname = who.username ? `@${who.username}` : null;
  const name = [who.first_name, who.last_name].filter(Boolean).join(' ') || 'Nomsiz';

  await ctx.reply(
    `🔒 <b>ONIX</b> — moliyaviy tizim\n\n` +
    `Sizga hali ruxsat berilmagan.\n` +
    `So'rov administratorga yuborildi — tasdiqlashini kuting.\n\n` +
    `Sizning ID: <code>${who.id}</code>`, HTML);

  // Bir odam qayta-qayta /start bossa, adminni bezovta qilmaymiz
  if (ctx.session.approvalSent) return;
  ctx.session.approvalSent = true;

  const payload = `${who.id}:${encodeURIComponent(name).slice(0, 40)}`;
  await notifyAdmins(ctx,
    `🆕 <b>Yangi foydalanuvchi</b>\n\n` +
    `${f.esc(name)}${uname ? ` · <code>${f.esc(uname)}</code>` : ''}\n` +
    `ID: <code>${who.id}</code>\n\n` +
    `Rolni tanlang:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('💼 Kassir', `ok:cashier:${payload}`),
       Markup.button.callback('🧾 Hodim', `ok:staff:${payload}`)],
      [Markup.button.callback('👁 Rahbar', `ok:manager:${payload}`),
       Markup.button.callback('👑 Admin', `ok:admin:${payload}`)],
      [Markup.button.callback('✖️ Rad etish', `ok:no:${payload}`)],
    ]));
}

async function notifyAdmins(ctx, text, extra) {
  const admins = (await db.listUsers()).filter(u => u.role === 'admin');
  const ids = new Set(admins.map(a => String(a.tg_id)));
  if (db.SUPER_ADMIN_ID) ids.add(String(db.SUPER_ADMIN_ID));
  for (const id of ids) {
    if (String(id) === String(ctx.from.id)) continue;
    await ctx.telegram.sendMessage(id, text, { ...HTML, ...(extra || {}) }).catch(() => {});
  }
}

// ================= /start =================

bot.start(async (ctx) => {
  ctx.session = {};
  const u = ctx.user;
  const extras = [];
  if (canReport(u) && MINI_APP_URL) {
    extras.push(Markup.inlineKeyboard([[Markup.button.webApp('🌐 ONIX Panel', MINI_APP_URL)]]));
  }
  await ctx.reply(
    `👋 Salom, <b>${f.esc(u.full_name)}</b>!\n\n` +
    `<b>ONIX</b> — moliyaviy tizim\n` +
    `Rol: ${ROLE_LABEL[u.role]}\n\n` +
    `Quyidagi menyudan foydalaning 👇`,
    { ...HTML, ...K.mainMenu(u.role).reply_markup ? { reply_markup: K.mainMenu(u.role).reply_markup } : {} });
  for (const e of extras) await ctx.reply('📊 Kengaytirilgan hisobotlar:', e);
});

bot.command('menu', (ctx) => {
  ctx.session = {};
  return ctx.reply('📋 Menyu:', K.mainMenu(ctx.user.role));
});

// ================= Operatsiya kiritish sehrgari =================

const STEPS = {
  income:    ['account', 'group', 'cat', 'sub', 'amount', 'date', 'period', 'note', 'confirm'],
  expense:   ['account', 'group', 'cat', 'sub', 'amount', 'date', 'period', 'note', 'confirm'],
  podotchet: ['account', 'staff', 'amount', 'date', 'note', 'confirm'],
  convert:   ['account', 'toaccount', 'amount', 'toamount', 'date', 'note', 'confirm'],
  opening:   ['account', 'amount', 'date', 'confirm'],
};

const TITLE = {
  income:    '📥 Kirim kiritish',
  expense:   '📤 Chiqim kiritish',
  podotchet: '👛 Hodimga hisobdor pul berish',
  convert:   "🔄 O'tkazma / valyuta konvertatsiyasi",
  opening:   "⚖️ Boshlang'ich qoldiq kiritish",
};

async function startWizard(ctx, flow) {
  ctx.session.w = { flow, i: 0, d: {} };
  await ctx.reply(`<b>${TITLE[flow]}</b>`, HTML);
  return ask(ctx);
}

const wiz = (ctx) => ctx.session.w;
const curStep = (ctx) => STEPS[wiz(ctx).flow][wiz(ctx).i];

async function advance(ctx) {
  wiz(ctx).i += 1;
  return ask(ctx);
}

// Har bir qadam uchun savol
async function ask(ctx) {
  const w = wiz(ctx);
  const d = w.d;
  const step = curStep(ctx);

  switch (step) {
    case 'account': {
      const rows = await allowedSourceAccounts(ctx);
      if (!rows.length) {
        return fail(ctx, canEnterOwn(ctx.user)
          ? "Sizda podotchyot hisobi yo'q. Administratorga murojaat qiling."
          : "Hisoblar topilmadi.");
      }
      const prompt = canEnterOwn(ctx.user) ? '👛 Qaysi puldan sarfladingiz?' : {
        income:    '💰 Pul qaysi kassaga kirdi?',
        expense:   '💸 Pul qaysi kassadan chiqdi?',
        podotchet: '💼 Qaysi kassadan berilsin?',
        convert:   '💼 Qaysi hisobdan?',
        opening:   '⚖️ Qaysi kassaning qoldig\'ini kiritamiz?',
      }[w.flow];
      return ctx.reply(prompt, K.accounts(rows, 'acc', { showBalance: true }));
    }

    case 'staff': {
      const rows = await allowedTargetAccounts(ctx);
      if (!rows.length) return fail(ctx, await noWalletsYet(d.currency));
      return ctx.reply('🧾 Kimga beriladi?', K.accounts(rows, 'to', { showBalance: true }));
    }

    case 'toaccount': {
      const rows = await allowedTargetAccounts(ctx);
      if (!rows.length) return fail(ctx, "Boshqa hisob topilmadi.");
      return ctx.reply('📥 Qaysi hisobga tushadi?', K.accounts(rows, 'to', { showBalance: true }));
    }

    case 'group': {
      const rows = await db.listGroups(w.flow === 'income' ? 'income' : 'expense');
      if (!rows.length) return fail(ctx, "Guruhlar hali sozlanmagan. Administratorga murojaat qiling.");
      return ctx.reply('🗂 <b>Guruhni</b> tanlang:', { ...HTML, ...K.groups(rows) });
    }

    case 'cat': {
      const rows = await db.listChildren(d.groupId);
      if (!rows.length) return fail(ctx, `«${d.groupName}» guruhida kategoriya yo'q.`);
      return ctx.reply(`🗂 ${f.esc(d.groupName)}\n\n<b>Kategoriyani</b> tanlang:`,
        { ...HTML, ...K.categories(rows) });
    }

    case 'sub': {
      const rows = await db.listChildren(d.catId);
      // Podkategoriyasi yo'q kategoriya — operatsiya uning o'ziga yoziladi
      if (!rows.length) { d.categoryId = d.catId; d.categoryName = null; return advance(ctx); }
      return ctx.reply(`🗂 ${f.esc(d.groupName)} · ${f.esc(d.catName)}\n\n<b>Podkategoriyani</b> tanlang:`,
        { ...HTML, ...K.subCategories(rows) });
    }

    case 'amount': {
      const unit = d.currency === 'UZS' ? "so'm" : 'dollar';
      if (w.flow === 'opening') {
        return ctx.reply(
          `⚖️ <b>${f.esc(d.accountName)}</b> hisobida hozir qancha pul bor?\n\n` +
          `Summani kiriting (<b>${unit}</b>):\n` +
          `<i>Misol: 12 500 000  ·  12,5 mln</i>`, HTML);
      }
      return ctx.reply(
        `💵 Summani kiriting (<b>${unit}</b>):\n\n` +
        `<i>Misol: 1 500 000  ·  1,5 mln  ·  250k</i>`, HTML);
    }

    case 'toamount':
      // Bir xil valyuta — konvertatsiya yo'q, summa o'zgarmaydi
      if (d.toCurrency === d.currency) { d.toAmount = d.amount; return advance(ctx); }
      return ctx.reply(
        `💱 ${f.money(d.amount, d.currency)} evaziga qancha <b>${d.toCurrency}</b> olindi?\n\n` +
        `<i>Kurs avtomatik hisoblanadi</i>`, HTML);

    case 'date':
      if (w.flow === 'opening') {
        return ctx.reply(
          `📅 <b>Qaysi sanadagi qoldiq?</b>\n\n` +
          `<i>Odatda — hisobni yuritishni boshlagan kuningiz.\n` +
          `Shu sanadan keyingi barcha operatsiyalar shunga qo'shiladi.</i>`,
          { ...HTML, ...K.payDate() });
      }
      return ctx.reply("📅 To'lov sanasi — pul qachon real harakat qildi?", K.payDate());

    case 'period':
      return ctx.reply(
        `📆 <b>Foyda-zarar davri</b>\n\n` +
        `Bu ${w.flow === 'income' ? 'daromad' : 'xarajat'} qaysi oyning hisobotiga tushsin?\n` +
        `<i>To'lov sanasi: ${f.d(d.paidAt)}</i>`,
        { ...HTML, ...K.period(d.paidAt) });

    case 'note':
      return ctx.reply('💬 Izoh yozing (yoki chek rasmini yuboring):', K.skipNote());

    case 'confirm':
      return ctx.reply(V.draft(draftData(d, w.flow)), { ...HTML, ...K.confirm() });
  }
}

// Foydalanuvchi shu qadamda tanlashi mumkin bo'lgan manba hisoblari.
// Tugmalar ham, kelgan javobni tekshirish ham shu ro'yxatga tayanadi —
// shuning uchun soxta tugma bosib boshqa hisobni tanlab bo'lmaydi.
async function allowedSourceAccounts(ctx) {
  // Hodim faqat o'z podotchyot pulidan sarflaydi
  if (canEnterOwn(ctx.user)) {
    return db.balances({ kind: 'podotchet', ownerTgId: ctx.user.tg_id });
  }
  return db.balances({ kind: 'kassa' });
}

// Qabul qiluvchi hisob: podotchyot berishda hodimlar, konvertatsiyada kassalar
async function allowedTargetAccounts(ctx) {
  const w = wiz(ctx);
  if (w.flow === 'podotchet') return db.balances({ kind: 'podotchet', currency: w.d.currency });
  if (w.flow === 'convert') {
    return (await db.balances({ kind: 'kassa' })).filter(a => a.account_id !== w.d.accountId);
  }
  return [];
}

function draftData(d, flow) {
  return {
    type: flow === 'podotchet' || flow === 'convert' ? 'transfer' : flow,
    amount: d.amount, currency: d.currency,
    toAmount: d.toAmount, toCurrency: d.toCurrency,
    accountName: d.accountName, toAccountName: d.toAccountName,
    groupName: d.groupName, catName: d.catName, categoryName: d.categoryName,
    paidAt: d.paidAt, period: d.period, note: d.note,
  };
}

async function fail(ctx, text) {
  ctx.session.w = null;
  return ctx.reply(`⚠️ ${text}`, { ...HTML, ...K.mainMenu(ctx.user.role) });
}

// Hodimning "hamyoni" u botga /start bosganda ochiladi. Shu sababli
// hech kim ulanmagan bo'lsa, kimni kutayotganimizni aytib qo'yamiz —
// aks holda «hisob yo'q» degan xabar odamni boshi berk ko'chaga olib boradi.
async function noWalletsYet(currency) {
  const waiting = (await db.listPendingUsers()).filter(u => u.role === 'staff');
  const active  = (await db.listUsers()).filter(u => u.role === 'staff');

  let text = `<b>Hozircha hech kimning hamyoni ochilmagan.</b>\n\n` +
             `Hodimning hamyoni u botga <code>/start</code> bosgan zahoti ochiladi.\n`;

  if (waiting.length) {
    text += `\n⏳ <b>Kutilmoqda:</b>\n` +
      waiting.map(u => `   • ${f.esc(u.full_name)} — <code>@${f.esc(u.username)}</code>`).join('\n') +
      `\n\nUlarga ayting: botni ochib <code>/start</code> bossin.`;
  } else if (active.length) {
    text += `\n${currency} bo'yicha hisob topilmadi. Administratorga murojaat qiling.`;
  } else {
    text += `\nHali birorta hodim qo'shilmagan.\n` +
            `Qo'shish: <code>/add_user @username staff Ism Familiya</code>`;
  }
  return text;
}

// ================= Sehrgar javoblarini qabul qilish =================

const at = (ctx, ...steps) => wiz(ctx) && steps.includes(curStep(ctx));

// --- Hisob tanlandi ---
bot.action(/^acc:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!at(ctx, 'account')) return;
  const allowed = await allowedSourceAccounts(ctx);
  if (!allowed.some(a => a.account_id === +ctx.match[1])) {
    return ctx.answerCbQuery('Bu hisob sizga ochiq emas', { show_alert: true }).catch(() => {});
  }
  const acc = await db.getAccount(+ctx.match[1]);
  if (!acc) return;
  Object.assign(wiz(ctx).d, {
    accountId: acc.id, accountName: acc.name, currency: acc.currency,
  });
  await ctx.editMessageText(`✅ Hisob: <b>${f.esc(acc.name)}</b>`, HTML);
  return advance(ctx);
});

// --- Qabul qiluvchi hisob (o'tkazma / podotchyot) ---
bot.action(/^to:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!at(ctx, 'staff', 'toaccount')) return;
  const allowed = await allowedTargetAccounts(ctx);
  if (!allowed.some(a => a.account_id === +ctx.match[1])) {
    return ctx.answerCbQuery('Bu hisob sizga ochiq emas', { show_alert: true }).catch(() => {});
  }
  const acc = await db.getAccount(+ctx.match[1]);
  if (!acc) return;
  const d = wiz(ctx).d;
  Object.assign(d, { toAccountId: acc.id, toAccountName: acc.name, toCurrency: acc.currency });
  await ctx.editMessageText(`✅ Qabul qiluvchi: <b>${f.esc(acc.name)}</b>`, HTML);
  return advance(ctx);
});

// --- Guruh tanlandi (1-daraja) ---
bot.action(/^grp:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!at(ctx, 'group')) return;
  const g = await db.getCategory(+ctx.match[1]);
  if (!g) return;
  Object.assign(wiz(ctx).d, { groupId: g.id, groupName: g.name, groupEmoji: g.emoji });
  await ctx.editMessageText(`✅ Guruh: <b>${f.esc([g.emoji, g.name].filter(Boolean).join(' '))}</b>`, HTML);
  return advance(ctx);
});

// --- Kategoriya tanlandi (2-daraja) ---
bot.action(/^cat:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!at(ctx, 'cat')) return;
  const c = await db.getCategory(+ctx.match[1]);
  if (!c) return;
  Object.assign(wiz(ctx).d, { catId: c.id, catName: c.name, catEmoji: c.emoji });
  await ctx.editMessageText(`✅ Kategoriya: <b>${f.esc(c.name)}</b>`, HTML);
  return advance(ctx);
});

// --- Podkategoriya ---
bot.action(/^sub:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!at(ctx, 'sub')) return;
  const cat = await db.getCategory(+ctx.match[1]);
  if (!cat) return;
  Object.assign(wiz(ctx).d, { categoryId: cat.id, categoryName: cat.name });
  await ctx.editMessageText(`✅ Podkategoriya: <b>${f.esc(cat.name)}</b>`, HTML);
  return advance(ctx);
});

// Bir pog'ona orqaga
const back = (action, fromStep) => bot.action(action, async (ctx) => {
  await ctx.answerCbQuery();
  if (!at(ctx, fromStep)) return;
  wiz(ctx).i -= 1;
  await ctx.deleteMessage().catch(() => {});
  return ask(ctx);
});
back('back:cat', 'sub');    // podkategoriyadan kategoriyaga
back('back:grp', 'cat');    // kategoriyadan guruhga

// --- To'lov sanasi ---
bot.action(/^dat:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!at(ctx, 'date')) return;
  if (ctx.match[1] === 'manual') {
    wiz(ctx).awaitDate = true;
    return ctx.editMessageText('✏️ Sanani yozing: <code>05.02.2026</code> yoki <code>05.02</code>', HTML);
  }
  wiz(ctx).d.paidAt = ctx.match[1];
  await ctx.editMessageText(`✅ To'lov sanasi: <b>${f.d(ctx.match[1])}</b>`, HTML);
  return afterDate(ctx);
});

// O'tkazmalarda P&L davri so'ralmaydi — to'lov oyiga tenglashtiriladi
async function afterDate(ctx) {
  const w = wiz(ctx);
  if (w.flow !== 'income' && w.flow !== 'expense') {
    w.d.period = f.iso(new Date(w.d.paidAt.slice(0, 8) + '01'));
  }
  return advance(ctx);
}

// --- Foyda-zarar davri ---
bot.action(/^per:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!at(ctx, 'period')) return;
  if (ctx.match[1] === 'manual') {
    return ctx.editMessageText('📅 Oyni tanlang:',
      { ...HTML, ...K.monthGrid(new Date(wiz(ctx).d.paidAt).getFullYear(), 'per') });
  }
  wiz(ctx).d.period = ctx.match[1];
  await ctx.editMessageText(`✅ Foyda-zarar davri: <b>${f.periodLabel(ctx.match[1])}</b>`, HTML);
  return advance(ctx);
});

bot.action(/^yr:([a-z]+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.editMessageReplyMarkup(K.monthGrid(+ctx.match[2], ctx.match[1]).reply_markup);
});

// --- Izoh ---
bot.action('note:skip', async (ctx) => {
  await ctx.answerCbQuery();
  if (!at(ctx, 'note')) return;
  await ctx.editMessageText('⏭ Izohsiz');
  return advance(ctx);
});

// --- Bekor qilish ---
bot.action('cancel', async (ctx) => {
  await ctx.answerCbQuery('Bekor qilindi');
  ctx.session.w = null;
  ctx.session.r = null;
  await ctx.editMessageText('✖️ Bekor qilindi').catch(() => {});
  return ctx.reply('📋 Menyu:', K.mainMenu(ctx.user.role));
});

bot.action('noop', (ctx) => ctx.answerCbQuery());

// --- Yangi foydalanuvchini rol tugmasi bilan tasdiqlash ---
bot.action(/^ok:(cashier|staff|manager|admin|no):(\d+):(.*)$/, async (ctx) => {
  if (!isAdmin(ctx.user)) return ctx.answerCbQuery("Faqat administrator uchun", { show_alert: true });
  const [, role, tgId, rawName] = ctx.match;
  const name = decodeURIComponent(rawName) || 'Nomsiz';

  if (role === 'no') {
    await ctx.answerCbQuery('Rad etildi');
    return ctx.editMessageText(`✖️ Rad etildi: ${f.esc(name)} (<code>${tgId}</code>)`, HTML);
  }

  const u = await db.addUser(parseInt(tgId, 10), name, role, ctx.user.tg_id);
  await ctx.answerCbQuery('Qo\'shildi');
  await ctx.editMessageText(
    `✅ <b>${f.esc(u.full_name)}</b> qo'shildi\n${ROLE_LABEL[u.role]} · <code>${u.tg_id}</code>` +
    (role === 'staff' ? "\n👛 Podotchyot hisoblari ochildi." : '') +
    `\n\n<i>Ismni to'g'rilash: /add_user ${u.tg_id} ${role} To'liq Ism</i>`, HTML);

  return ctx.telegram.sendMessage(u.tg_id,
    `✅ <b>Tasdiqlandi!</b>\n\nRol: ${ROLE_LABEL[u.role]}\n\n/start bosing.`, HTML).catch(() => {});
});

// --- Saqlash ---
bot.action('save', async (ctx) => {
  await ctx.answerCbQuery();
  if (!at(ctx, 'confirm')) return;
  const { flow, d } = wiz(ctx);

  const op = await db.addOperation({
    type: flow === 'podotchet' || flow === 'convert' ? 'transfer' : flow,
    account_id: d.accountId,
    to_account_id: d.toAccountId || null,
    category_id: d.categoryId || null,
    amount: d.amount,
    to_amount: d.toAmount || null,
    currency: d.currency,
    paid_at: d.paidAt,
    period: d.period,
    note: d.note || null,
    photo_file_id: d.photoFileId || null,
    created_by: ctx.user.tg_id,
  });

  ctx.session.w = null;
  const saved = await db.getOperation(op.id);
  await ctx.editMessageText(
    `✅ <b>Saqlandi</b>  <code>#${op.id}</code>\n\n${V.operationLine(saved)}`, HTML);

  // Yangi qoldiqni ko'rsatamiz
  const accs = await db.balances({ currency: d.currency });
  const mine = accs.find(a => a.account_id === d.accountId);
  if (mine) {
    await ctx.reply(`💼 <b>${f.esc(mine.name)}</b> yangi qoldiq: <b>${f.money(mine.balance, mine.currency)}</b>`,
      { ...HTML, ...K.mainMenu(ctx.user.role) });
  }
  return notifyManagers(ctx, saved);
});

// Katta operatsiyalar haqida rahbarlarga xabar
async function notifyManagers(ctx, op) {
  const limit = NOTIFY[op.currency];
  if (!limit || Number(op.amount) < limit || op.type === 'transfer') return;
  const watchers = (await db.listUsers()).filter(u =>
    (u.role === 'manager' || u.role === 'admin') && u.tg_id !== ctx.user.tg_id);
  for (const w of watchers) {
    await ctx.telegram.sendMessage(w.tg_id,
      `🔔 <b>Yirik operatsiya</b>\n\n${V.operationLine(op)}`, HTML).catch(() => {});
  }
}

// ================= Matn / rasm kiritish =================

bot.on('photo', async (ctx) => {
  if (!at(ctx, 'note')) return;
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  wiz(ctx).d.photoFileId = photo.file_id;
  wiz(ctx).d.note = ctx.message.caption || wiz(ctx).d.note || null;
  await ctx.reply('📎 Chek biriktirildi');
  return advance(ctx);
});

bot.on('text', async (ctx, next) => {
  const text = ctx.message.text.trim();

  // Menyu tugmalari sehrgardan ustun
  if (Object.values(K.MENU).includes(text)) return next();
  if (text.startsWith('/')) return next();

  const w = wiz(ctx);
  if (!w) return next();
  const step = curStep(ctx);
  const d = w.d;

  // Qo'lda sana kiritish
  if (step === 'date' && w.awaitDate) {
    const date = f.parseDate(text);
    if (!date) return ctx.reply("❌ Sana noto'g'ri. Misol: <code>05.02.2026</code>", HTML);
    w.awaitDate = false;
    d.paidAt = date;
    await ctx.reply(`✅ To'lov sanasi: <b>${f.d(date)}</b>`, HTML);
    return afterDate(ctx);
  }

  if (step === 'amount' || step === 'toamount') {
    const amount = f.parseAmount(text);
    if (!amount) {
      return ctx.reply("❌ Summani tushunmadim.\n\n<i>Misol: 1 500 000 · 1,5 mln · 250k</i>", HTML);
    }
    if (step === 'amount') {
      d.amount = amount;
      // Podotchyot/chiqimda qoldiqdan oshsa — ogohlantiramiz, lekin to'xtatmaymiz
      const acc = (await db.balances({ currency: d.currency })).find(a => a.account_id === d.accountId);
      if (acc && Number(acc.balance) < amount) {
        await ctx.reply(
          `⚠️ <b>Diqqat:</b> «${f.esc(acc.name)}» qoldig'i ${f.money(acc.balance, acc.currency)}, ` +
          `siz ${f.money(amount, d.currency)} kiritdingiz.\n` +
          `<i>Qoldiq manfiy bo'ladi — kirim yozilmagan bo'lishi mumkin.</i>`, HTML);
      }
      await ctx.reply(`✅ Summa: <b>${f.money(amount, d.currency)}</b>`, HTML);
    } else {
      d.toAmount = amount;
      const rate = d.amount / amount;
      await ctx.reply(
        `✅ Olinadi: <b>${f.money(amount, d.toCurrency)}</b>\n` +
        `💱 Kurs: 1 ${d.toCurrency} = ${f.money(rate, d.currency)}`, HTML);
    }
    return advance(ctx);
  }

  if (step === 'note') {
    d.note = text.slice(0, 500);
    return advance(ctx);
  }

  return next();
});

// ================= Asosiy menyu =================

const menu = (label, guard, handler) =>
  bot.hears(label, async (ctx) => {
    if (guard && !guard(ctx.user)) return ctx.reply('🔒 Bu bo\'lim sizga ochiq emas.');
    ctx.session.w = null;
    return handler(ctx);
  });

menu(K.MENU.income,    canEnterCash, (ctx) => startWizard(ctx, 'income'));
menu(K.MENU.expense,   canEnterCash, (ctx) => startWizard(ctx, 'expense'));
menu(K.MENU.podotchet, canEnterCash, (ctx) => startWizard(ctx, 'podotchet'));
menu(K.MENU.transfer,  canEnterCash, (ctx) => startWizard(ctx, 'convert'));
menu(K.MENU.myExpense, canEnterOwn,  (ctx) => startWizard(ctx, 'expense'));

menu(K.MENU.myBalance, canEnterOwn, async (ctx) => {
  const rows = await db.balances({ kind: 'podotchet', ownerTgId: ctx.user.tg_id });
  return ctx.reply(V.balances(rows, "👛 QO'LINGIZDAGI QOLDIQ"), HTML);
});

menu(K.MENU.myOps, canEnterOwn, async (ctx) => {
  const ops = await db.listOperations({ createdBy: ctx.user.tg_id, limit: 15 });
  if (!ops.length) return ctx.reply("📭 Hali operatsiya kiritmagansiz.");
  return ctx.reply(`<b>📋 Oxirgi ${ops.length} ta operatsiyangiz</b>\n\n` +
    ops.map(V.operationLine).join('\n\n'), HTML);
});

menu(K.MENU.balance, canSeeAllBalances, async (ctx) => {
  const rows = await db.balances();
  return ctx.reply(V.balances(rows), HTML);
});

menu(K.MENU.cashflow, canReport, (ctx) => {
  ctx.session.r = { kind: 'cf' };
  return ctx.reply('💹 <b>Pul oqimi</b>\n\nValyutani tanlang:', { ...HTML, ...K.currencies('rcur') });
});

menu(K.MENU.pnl, canReport, (ctx) => {
  ctx.session.r = { kind: 'pl' };
  return ctx.reply('📈 <b>Foyda-zarar</b>\n\nValyutani tanlang:', { ...HTML, ...K.currencies('rcur') });
});

menu(K.MENU.podReport, canReport, (ctx) => {
  ctx.session.r = { kind: 'pod' };
  return ctx.reply('👛 <b>Podotchyot</b>\n\nValyutani tanlang:', { ...HTML, ...K.currencies('rcur') });
});

menu(K.MENU.book, canSeeBook, (ctx) => {
  ctx.session.r = { kind: 'book', currency: null };
  return ctx.reply('📋 <b>Kassa daftari</b>\n\nDavrni tanlang:', { ...HTML, ...K.rangePreset('rng') });
});

// ================= Hisobot oqimi =================

bot.action(/^rcur:(UZS|USD)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const r = ctx.session.r;
  if (!r) return;
  r.currency = ctx.match[1];
  if (r.kind === 'pl') {
    return ctx.editMessageText('📅 Qaysi oy uchun?',
      { ...HTML, ...K.monthGrid(new Date().getFullYear(), 'rmon') });
  }
  return ctx.editMessageText('📅 Davrni tanlang:', { ...HTML, ...K.rangePreset('rng') });
});

// Foyda-zarar: oy tanlandi
bot.action(/^rmon:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  await ctx.answerCbQuery('Hisoblanmoqda…');
  const r = ctx.session.r;
  if (!r || r.kind !== 'pl') return;
  const { now, prev } = await R.profitLossCompare(ctx.match[1], r.currency);
  await ctx.editMessageText(V.profitLoss(now, prev), HTML);
  return showDeferred(ctx, r.currency, ctx.match[1]);
});

// Kelgusi oylarga yozilgan xarajatlar haqida eslatma
async function showDeferred(ctx, currency, period) {
  const rows = await R.deferred(currency, period);
  if (!rows.length) return;
  const lines = rows.map(r =>
    `  ${f.periodShort(r.period)} — ${r.flow === 'income' ? '📥' : '📤'} ${f.money(r.total, currency)} (${r.ops} ta)`);
  return ctx.reply(
    `📌 <b>Kelgusi davrlarga yozilganlar</b>\n` +
    `<i>Puli allaqachon harakat qilgan, hisobotga keyin tushadi:</i>\n\n${lines.join('\n')}`, HTML);
}

// Davr presetlari
bot.action(/^rng:(today|week|month|prevmonth|pick)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const r = ctx.session.r;
  if (!r) return;
  if (ctx.match[1] === 'pick') {
    return ctx.editMessageText('📅 Oyni tanlang:',
      { ...HTML, ...K.monthGrid(new Date().getFullYear(), 'rrange') });
  }
  const [from, to] = resolveRange(ctx.match[1]);
  return renderRange(ctx, from, to);
});

bot.action(/^rrange:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  await ctx.answerCbQuery();
  const [y, m] = ctx.match[1].split('-').map(Number);
  return renderRange(ctx, f.firstDay(y, m), f.lastDay(y, m));
});

function resolveRange(preset) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  switch (preset) {
    case 'today': return [f.iso(now), f.iso(now)];
    case 'week': {
      const start = new Date(now);
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7));   // dushanba
      return [f.iso(start), f.iso(now)];
    }
    case 'prevmonth': {
      const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
      return [f.firstDay(py, pm), f.lastDay(py, pm)];
    }
    default: return [f.firstDay(y, m), f.lastDay(y, m)];
  }
}

async function renderRange(ctx, from, to) {
  const r = ctx.session.r;
  r.from = from; r.to = to;

  if (r.kind === 'cf') {
    const cf = await R.cashFlow(from, to, r.currency);
    await ctx.editMessageText(V.cashFlow(cf), HTML);
    const authors = await R.byAuthor(from, to, r.currency);
    if (authors.length) {
      const lines = authors.map(a =>
        V.row(f.shortName(a.full_name) + ` (${a.ops})`, Number(a.total), r.currency));
      await ctx.reply(`<b>👥 Hodimlar kesimida chiqim</b>\n<pre>${f.esc(lines.join('\n'))}</pre>`, HTML);
    }
    return;
  }

  if (r.kind === 'pod') {
    const rows = await R.podotchetReport(from, to, r.currency);
    return ctx.editMessageText(V.podotchet(rows, r.currency, from, to), HTML);
  }

  if (r.kind === 'book') {
    r.page = 0;
    return renderBook(ctx, true);
  }
}

const PER_PAGE = 8;

async function renderBook(ctx, edit = false) {
  const r = ctx.session.r;
  const [ops, count] = await Promise.all([
    db.listOperations({ from: r.from, to: r.to, limit: PER_PAGE, offset: r.page * PER_PAGE }),
    db.countOperations({ from: r.from, to: r.to }),
  ]);
  const text = V.book(ops, { from: r.from, to: r.to, page: r.page, total: count.n });
  const kb = K.pager(r.page, count.n, PER_PAGE, 'book');
  const opts = { ...HTML, ...kb };
  return edit ? ctx.editMessageText(text, opts) : ctx.editMessageText(text, opts);
}

bot.action(/^book:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session.r || ctx.session.r.kind !== 'book') return;
  ctx.session.r.page = +ctx.match[1];
  return renderBook(ctx, true);
});

// ================= Sozlamalar (admin) =================

menu(K.MENU.settings, isAdmin, (ctx) => ctx.reply(
  `⚙️ <b>Sozlamalar</b>\n\n` +
  `<b>Foydalanuvchilar</b>\n` +
  `<code>/users</code> — ro'yxat\n` +
  `<code>/add_user @username &lt;rol&gt; &lt;Ism&gt;</code> — /start da ulanadi\n` +
  `<code>/add_user &lt;tg_id&gt; &lt;rol&gt; &lt;Ism&gt;</code> — darhol\n` +
  `<code>/pending</code> — kutayotganlar\n` +
  `<code>/remove_user &lt;tg_id&gt;</code>\n\n` +
  `Rollar: <code>admin</code> · <code>cashier</code> · <code>staff</code> · <code>manager</code>\n\n` +
  `<b>Hisoblar</b>\n` +
  `<code>/accounts</code> — ro'yxat\n` +
  `<code>/add_account &lt;cash|card|bank&gt; &lt;UZS|USD&gt; &lt;nom&gt;</code>\n\n` +
  `<b>Kategoriyalar</b> — guruh › kategoriya › podkategoriya\n` +
  `<code>/cats</code> — to'liq daraxt (ID lari bilan)\n` +
  `<code>/add_group &lt;income|expense&gt; &lt;nom&gt;</code>\n` +
  `<code>/add_cat &lt;guruh_id&gt; &lt;nom&gt;</code>\n` +
  `<code>/add_sub &lt;kategoriya_id&gt; &lt;nom1, nom2&gt;</code>\n` +
  `<code>/del_cat &lt;id&gt;</code> — istalgan darajani yashiradi\n\n` +
  `<b>Operatsiyalar</b>\n` +
  `<code>/del &lt;id&gt; &lt;sabab&gt;</code> — yozuvni bekor qilish\n` +
  `<i>Yozuv o'chmaydi, bekor qilingan deb belgilanadi.</i>`,
  { ...HTML, ...Markup.inlineKeyboard([
      [Markup.button.callback("⚖️ Boshlang'ich qoldiq kiritish", 'openbal')],
  ]) }));

// Boshlang'ich qoldiq — tizim ishga tushgandagi kassadagi pul.
// Daromad emas: foyda-zararga kirmaydi, pul oqimida alohida qator.
bot.action('openbal', async (ctx) => {
  await ctx.answerCbQuery();
  if (!canEnterCash(ctx.user)) return;
  ctx.session.r = null;
  return startWizard(ctx, 'opening');
});

const adminOnly = (handler) => async (ctx) => {
  if (!isAdmin(ctx.user)) return ctx.reply('🔒 Faqat administrator uchun.');
  return handler(ctx);
};

const args = (ctx) => ctx.message.text.split(/\s+/).slice(1);

bot.command('users', adminOnly(async (ctx) => {
  const rows = await db.listUsers();
  if (!rows.length) return ctx.reply("Ro'yxat bo'sh.");
  const text = rows.map(u =>
    `${ROLE_LABEL[u.role]}\n  <b>${f.esc(u.full_name)}</b>\n  <code>${u.tg_id}</code>` +
    (u.username ? ` · <code>@${f.esc(u.username)}</code>` : '')).join('\n\n');
  const waiting = await db.listPendingUsers();
  return ctx.reply(`👥 <b>Foydalanuvchilar</b>\n\n${text}` +
    (waiting.length ? `\n\n⏳ Kutayotganlar: ${waiting.length} ta — /pending` : ''), HTML);
}));

bot.command('add_user', adminOnly(async (ctx) => {
  const [who, role, ...name] = args(ctx);
  if (!who || !role || !name.length) {
    return ctx.reply(
      "Foydalanish — ikki xil:\n\n" +
      "<b>1. Username bo'yicha</b> (ID ni bilmasangiz)\n" +
      "<code>/add_user @ali_valiyev staff Ali Valiyev</code>\n" +
      "<i>Hodim /start bosgan zahoti tizim uni o'zi taniydi.</i>\n\n" +
      "<b>2. Raqamli ID bo'yicha</b>\n" +
      "<code>/add_user 123456789 staff Ali Valiyev</code>\n\n" +
      "Rollar: <code>cashier</code> · <code>staff</code> · <code>manager</code> · <code>admin</code>", HTML);
  }
  if (!['admin', 'cashier', 'staff', 'manager'].includes(role)) {
    return ctx.reply('❌ Rol: admin | cashier | staff | manager');
  }
  const fullName = name.join(' ');

  // Raqamli ID — darhol qo'shamiz
  if (/^\d+$/.test(who)) {
    const u = await db.addUser(parseInt(who, 10), fullName, role, ctx.user.tg_id);
    return ctx.reply(
      `✅ Qo'shildi\n\n<b>${f.esc(u.full_name)}</b>\n${ROLE_LABEL[u.role]}\n<code>${u.tg_id}</code>` +
      (role === 'staff' ? "\n\n👛 Podotchyot hisoblari (sum va $) ochildi." : ''), HTML);
  }

  // Username — kutish ro'yxatiga yozamiz, /start da bog'lanadi
  const key = db.normUsername(who);
  if (!key || !/^[a-z0-9_]{4,32}$/.test(key)) {
    return ctx.reply("❌ Username noto'g'ri. Misol: <code>@ali_valiyev</code>", HTML);
  }
  const existing = await db.one('SELECT * FROM onix_users WHERE username = $1 AND active', [key]);
  if (existing) {
    return ctx.reply(`ℹ️ <code>@${f.esc(key)}</code> allaqachon tizimda: ` +
      `<b>${f.esc(existing.full_name)}</b> (<code>${existing.tg_id}</code>)`, HTML);
  }
  await db.addPendingUser(key, fullName, role, ctx.user.tg_id);
  return ctx.reply(
    `⏳ <b>Kutish ro'yxatiga qo'shildi</b>\n\n` +
    `<b>${f.esc(fullName)}</b>\n${ROLE_LABEL[role]}\n<code>@${f.esc(key)}</code>\n\n` +
    `Endi shu odam botga <code>/start</code> bossin — tizim uni o'zi taniydi va ulaydi.\n` +
    `Kutayotganlar ro'yxati: /pending`, HTML);
}));

bot.command('pending', adminOnly(async (ctx) => {
  const rows = await db.listPendingUsers();
  if (!rows.length) return ctx.reply("✅ Kutayotgan hech kim yo'q.");
  return ctx.reply(
    `⏳ <b>Kutayotganlar</b>\n<i>Botga /start bosishsa avtomat ulanadi</i>\n\n` +
    rows.map(r => `<code>@${f.esc(r.username)}</code>\n  ${f.esc(r.full_name)} — ${ROLE_LABEL[r.role]}`).join('\n\n') +
    `\n\nBekor qilish: <code>/cancel_pending @username</code>`, HTML);
}));

bot.command('cancel_pending', adminOnly(async (ctx) => {
  const [who] = args(ctx);
  if (!who) return ctx.reply('Foydalanish: <code>/cancel_pending @ali_valiyev</code>', HTML);
  await db.removePendingUser(who);
  return ctx.reply(`✅ Kutish ro'yxatidan o'chirildi: <code>${f.esc(who)}</code>`, HTML);
}));

bot.command('remove_user', adminOnly(async (ctx) => {
  const [tgId] = args(ctx);
  if (!tgId) return ctx.reply('Foydalanish: <code>/remove_user 123456789</code>', HTML);
  await db.deactivateUser(parseInt(tgId, 10));
  return ctx.reply(`✅ O'chirildi: <code>${tgId}</code>\n<i>Uning yozuvlari daftarda qoladi.</i>`, HTML);
}));

bot.command('accounts', adminOnly(async (ctx) => {
  const rows = await db.balances();
  const text = rows.map(a =>
    `<code>${a.account_id}</code> ${a.emoji || '•'} ${f.esc(a.name)} — ${f.money(a.balance, a.currency)}`).join('\n');
  return ctx.reply(`💼 <b>Hisoblar</b>\n\n${text}`, HTML);
}));

bot.command('add_account', adminOnly(async (ctx) => {
  const [kind, currency, ...name] = args(ctx);
  if (!['cash', 'card', 'bank'].includes(kind) || !['UZS', 'USD'].includes(currency) || !name.length) {
    return ctx.reply('Foydalanish:\n<code>/add_account card USD Plastik Anor</code>', HTML);
  }
  const emoji = { cash: '💵', card: '💳', bank: '🏦' }[kind];
  const a = await db.one(
    `INSERT INTO onix_accounts (name, kind, currency, emoji) VALUES ($1,$2,$3,$4) RETURNING *`,
    [name.join(' '), kind, currency, emoji]);
  return ctx.reply(`✅ Hisob qo'shildi: ${emoji} <b>${f.esc(a.name)}</b> (${a.currency})`, HTML);
}));

bot.command('cats', adminOnly(async (ctx) => {
  for (const flow of ['income', 'expense']) {
    const rows = await db.categoryTree(flow);
    const parts = [`<b>${flow === 'income' ? '📥 KIRIM' : '📤 CHIQIM'}</b>`];
    let group = null, cat = null;
    for (const r of rows) {
      if (r.group_id !== group) {
        group = r.group_id; cat = null;
        parts.push(`\n<code>${r.group_id}</code> ${r.group_emoji || ''} <b>${f.esc(r.group_name)}</b>`);
      }
      if (r.cat_id && r.cat_id !== cat) {
        cat = r.cat_id;
        parts.push(`  <code>${r.cat_id}</code> ${f.esc(r.cat_name)}`);
      }
      if (r.sub_id) parts.push(`      <code>${r.sub_id}</code> ${f.esc(r.sub_name)}`);
    }
    // Telegram xabari 4096 belgidan oshmasin
    let buf = '';
    for (const line of parts) {
      if (buf.length + line.length > 3500) { await ctx.reply(buf, HTML); buf = ''; }
      buf += line + '\n';
    }
    if (buf.trim()) await ctx.reply(buf, HTML);
  }
}));

bot.command('add_group', adminOnly(async (ctx) => {
  const [flow, ...name] = args(ctx);
  if (!['income', 'expense'].includes(flow) || !name.length) {
    return ctx.reply("Foydalanish:\n<code>/add_group expense Onix xarajatlar uchun</code>\n" +
      "<code>/add_group income Onix bussines center</code>", HTML);
  }
  const g = await db.addCategory(null, 1, name.join(' '), flow, null);
  return ctx.reply(`✅ Guruh qo'shildi: <b>${f.esc(g.name)}</b>  <code>#${g.id}</code>\n\n` +
    `Endi kategoriya qo'shing:\n<code>/add_cat ${g.id} Kategoriya nomi</code>`, HTML);
}));

bot.command('add_cat', adminOnly(async (ctx) => {
  const [groupId, ...name] = args(ctx);
  if (!groupId || !name.length) {
    return ctx.reply("Foydalanish:\n<code>/add_cat 10 Kommunal to'lovlar</code>\n\n" +
      "<i>10 — guruh ID si (/cats dan oling)</i>", HTML);
  }
  const g = await db.getCategory(parseInt(groupId, 10));
  if (!g || g.level !== 1) return ctx.reply("❌ Bunday guruh yo'q. /cats bilan ID ni tekshiring.");
  const c = await db.addCategory(g.id, 2, name.join(' '), g.flow, null);
  return ctx.reply(`✅ ${f.esc(g.name)} › <b>${f.esc(c.name)}</b>  <code>#${c.id}</code>\n\n` +
    `Endi podkategoriya qo'shing:\n<code>/add_sub ${c.id} Podkategoriya nomi</code>`, HTML);
}));

bot.command('add_sub', adminOnly(async (ctx) => {
  const [catId, ...name] = args(ctx);
  if (!catId || !name.length) {
    return ctx.reply("Foydalanish:\n<code>/add_sub 25 Elektr energiya</code>\n\n" +
      "<i>Vergul bilan bir nechta:</i>\n<code>/add_sub 25 Elektr, Suv, Gaz</code>", HTML);
  }
  const c = await db.getCategory(parseInt(catId, 10));
  if (!c || c.level !== 2) return ctx.reply("❌ Bunday kategoriya yo'q. /cats bilan ID ni tekshiring.");

  // Vergul bilan ajratilgan ro'yxatni bir yo'la qo'shamiz
  const names = name.join(' ').split(',').map(x => x.trim()).filter(Boolean);
  const added = [];
  for (const n of names) added.push(await db.addCategory(c.id, 3, n, c.flow, null));
  return ctx.reply(
    `✅ ${f.esc(c.name)} ostiga ${added.length} ta qo'shildi:\n` +
    added.map(a => `   <code>${a.id}</code> ${f.esc(a.name)}`).join('\n'), HTML);
}));

bot.command('del_cat', adminOnly(async (ctx) => {
  const [id] = args(ctx);
  if (!id) return ctx.reply('Foydalanish: <code>/del_cat 55</code>', HTML);
  await db.deactivateCategory(parseInt(id, 10));
  return ctx.reply(`✅ Kategoriya yashirildi.\n<i>Eski operatsiyalar hisobotda qoladi.</i>`, HTML);
}));

// Operatsiyani bekor qilish — muallif o'zinikini, admin har qanaqasini
bot.command('del', async (ctx) => {
  const [id, ...reason] = args(ctx);
  if (!id) return ctx.reply('Foydalanish: <code>/del 42 sabab</code>', HTML);

  const op = await db.getOperation(parseInt(id, 10));
  if (!op) return ctx.reply('❌ Bunday yozuv yo\'q.');
  if (op.deleted_at) return ctx.reply('ℹ️ Bu yozuv allaqachon bekor qilingan.');
  if (!isAdmin(ctx.user) && String(op.created_by) !== String(ctx.user.tg_id)) {
    return ctx.reply('🔒 Faqat o\'z yozuvingizni bekor qila olasiz.');
  }
  if (!reason.length) return ctx.reply('✍️ Sababini yozing: <code>/del 42 xato kiritildi</code>', HTML);

  await db.softDelete(op.id, ctx.user.tg_id, reason.join(' '));
  return ctx.reply(
    `🗑 <b>Bekor qilindi</b>  <code>#${op.id}</code>\n\n${V.operationLine(op)}\n\n` +
    `Sabab: <i>${f.esc(reason.join(' '))}</i>`, HTML);
});

bot.command('help', (ctx) => ctx.reply(
  `<b>ONIX — yordam</b>\n\n` +
  `<code>/start</code> — boshlash\n` +
  `<code>/menu</code> — menyuni qaytarish\n` +
  `<code>/myid</code> — Telegram ID\n` +
  `<code>/del &lt;id&gt; &lt;sabab&gt;</code> — yozuvni bekor qilish\n\n` +
  `<b>Muhim:</b> har operatsiyada ikkita sana bor —\n` +
  `📅 <b>to'lov sanasi</b> → pul oqimiga tushadi\n` +
  `📆 <b>P&amp;L davri</b> → foyda-zararga tushadi\n\n` +
  `<i>Masalan: yanvarda fevral arendasini to'lasangiz, ` +
  `pul oqimi yanvarni, foyda-zarar fevralni ko'rsatadi.</i>`, HTML));

// ================= Ishga tushirish =================

bot.catch((err, ctx) => {
  console.error('ONIX xatosi:', err);
  ctx.reply('⚠️ Xatolik yuz berdi. /menu bosing yoki administratorga xabar bering.').catch(() => {});
});

// Tarmoq uzilishi botni o'ldirmasligi kerak: uy yoki ofis internetida
// qisqa uzilish odatiy hol, bot esa kun bo'yi ishlab turishi kerak.
// Telegram har doim JSON qaytaradi. JSON kelmasa — oradagi to'siq
// (firewall, proksi, provayder sahifasi), token emas.
const NETWORK_ERROR = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETDOWN|ENETUNREACH|EHOSTUNREACH|socket hang up|network timeout|invalid json response|fetch failed|request to .* failed/i;

function explainNetworkError(err) {
  console.error(`\n⚠️  Telegram serveriga ulanib bo'lmadi.`);
  console.error(`   Sabab: ${err.message}\n`);
  if (/ENOTFOUND|EAI_AGAIN/i.test(err.message)) {
    console.error(`   Bu DNS muammosi — kompyuter api.telegram.org manzilini topa olmayapti.`);
    console.error(`   Tekshiring:`);
    console.error(`     1. Internet ishlayaptimi?`);
    console.error(`     2. DNS ni almashtiring: Tizim sozlamalari → Tarmoq → DNS → 1.1.1.1`);
    console.error(`     3. Ba'zi tarmoqlarda Telegram bloklangan — VPN yoqib ko'ring\n`);
  } else if (/invalid json response|request to .* failed/i.test(err.message)) {
    console.error(`   Telegram JSON qaytarmadi — yo'lda firewall yoki proksi bor.`);
    console.error(`   Bu tokenning muammosi EMAS. VPN yoqib ko'ring.\n`);
  }
}

async function start() {
  const RETRY_SECONDS = 15;
  let attempt = 0;

  // Avval ulanishni tekshiramiz — "ishga tushdi" deyishdan oldin
  for (;;) {
    attempt++;
    try {
      bot.botInfo = await bot.telegram.getMe();
      break;
    } catch (err) {
      if (!NETWORK_ERROR.test(err.message)) {
        console.error(`\n❌ Token qabul qilinmadi: ${err.message}`);
        console.error(`   .env dagi ONIX_BOT_TOKEN ni tekshiring (@BotFather → /mybots).\n`);
        process.exit(1);
      }
      if (attempt === 1) explainNetworkError(err);
      console.error(`   ⏳ ${RETRY_SECONDS} soniyadan keyin qayta urinaman… (${attempt}-urinish)`);
      await new Promise(r => setTimeout(r, RETRY_SECONDS * 1000));
    }
  }

  bot.launch({ dropPendingUpdates: true });
  console.log(`✅ ONIX bot ishga tushdi — @${bot.botInfo.username}`);
  console.log(`   To'xtatish: Control + C`);
}

// Ishlab turganda internet uzilsa — jarayon o'lmasin, qayta ulanishni kutsin
process.on('unhandledRejection', (err) => {
  const message = (err && err.message) || String(err);
  if (NETWORK_ERROR.test(message)) {
    console.error(`⚠️  Tarmoq uzildi: ${message}`);
    console.error(`   Internet tiklanganda bot o'zi davom etadi.`);
    return;
  }
  console.error('Kutilmagan xato:', err);
});

if (require.main === module) {
  start();
  // Bot hali ishga tushmasdan Control+C bosilsa, stop() xato beradi —
  // qayta ulanishni kutayotganda to'xtatish odatiy hol, xato emas.
  const shutdown = (signal) => {
    try { bot.stop(signal); } catch { /* hali ishga tushmagan */ }
    console.log('\n👋 ONIX to\'xtatildi.');
    process.exit(0);
  };
  process.once('SIGINT',  () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = bot;
