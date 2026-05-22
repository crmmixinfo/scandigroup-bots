require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const { Pool } = require('pg');

const bot = new Telegraf(process.env.CANDIDATE_BOT_TOKEN);
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TOTAL_STEPS = 7;

const PRAISE = {
  ru: ['🔥 Отлично!','✅ Принято!','💪 Записали!','👍 Хорошо!','✨ Супер!','🎯 Понял!','🙌 Класс!'],
  uz: ['🔥 Zo\'r!','✅ Qabul!','💪 Yozib oldik!','👍 Yaxshi!','✨ Ajoyib!','🎯 Tushunarli!','🙌 Barakalla!']
};

const STEP_NAMES = {
  ru: ['Вакансия','Имя','Дата рождения','Район','Контакт','Фото','Голосовое'],
  uz: ['Vakansiya','Ism','Tug\'ilgan sana','Tuman','Kontakt','Rasm','Ovozli']
};

const T = {
  ru: {
    chooseLang: '🌐 Выберите язык / Tilni tanlang:',
    welcome: '👋 Привет! Мы ищем сотрудников.\n\nКороткая анкета — нажмите «Начать».',
    start: '🚀 Начать',
    chooseVacancy: '🎯 Какая вакансия вас интересует?',
    noVacancies: 'Активных вакансий пока нет.',
    askName: '✍️ Введите вашу фамилию и имя:',
    askBirth: '🎂 Выберите год рождения:',
    askBirthMonth: '🎂 Выберите месяц:',
    askBirthDay: '🎂 Выберите день:',
    askDistrict: '📍 Выберите ваш район:',
    askContact: '📱 Поделитесь номером телефона:',
    shareContact: '📲 Поделиться контактом',
    orManual: '✏️ Или напишите вручную: +998901234567',
    askPhoto: '📸 Загрузите вашу фотографию:',
    askVoice: '🎤 Запишите голосовое о себе (до 60 сек):',
    done: '✅ Спасибо! Ваша анкета принята.\n\n📋 Скоро с вами свяжутся!\n\n🍀 Удачи!',
    invalid: '❌ Неверный формат.',
    photoOnly: '📸 Отправьте фотографию.',
    voiceOnly: '🎤 Отправьте голосовое сообщение.',
    shareLink: '👇 Поделитесь ботом:',
    cancel: '❌ Анкета отменена. Нажмите /start чтобы начать заново.',
    months: ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'],
  },
  uz: {
    chooseLang: '🌐 Выберите язык / Tilni tanlang:',
    welcome: "👋 Salom! Xodim izlayapmiz.\n\n1 daqiqalik qisqa ariza — «Boshlash» tugmasini bosing.",
    start: '🚀 Boshlash',
    chooseVacancy: '🎯 Qaysi lavozim sizni qiziqtiradi?',
    noVacancies: "Hozircha aktiv vakansiya yo'q.",
    askName: '✍️ Familiya va ismingizni kiriting:',
    askBirth: '🎂 Tug\'ilgan yilni tanlang:',
    askBirthMonth: '🎂 Oyni tanlang:',
    askBirthDay: '🎂 Kunni tanlang:',
    askDistrict: '📍 Yashash tumaningizni tanlang:',
    askContact: '📱 Telefon raqamingizni ulashing:',
    shareContact: '📲 Kontaktni ulashish',
    orManual: "✏️ Yoki qo'lda yozing: +998901234567",
    askPhoto: '📸 Rasmingizni yuklang:',
    askVoice: "🎤 O'zingiz haqida ovozli xabar yozing (60 sek):",
    done: "✅ Rahmat! Arizangiz qabul qilindi.\n\n📋 Tez orada bog'lanamiz!\n\n🍀 Omad!",
    invalid: "❌ Noto'g'ri format.",
    photoOnly: '📸 Rasm yuboring.',
    voiceOnly: '🎤 Ovozli xabar yuboring.',
    shareLink: "👇 Botni ulashing:",
    cancel: "❌ Ariza bekor qilindi. Qayta boshlash uchun /start bosing.",
    months: ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek'],
  }
};

const DISTRICTS = {
  uz: ["Bektemir","Chilonzor","Yashnobod","Mirobod","Mirzo Ulug'bek","Sergeli","Olmazor","Shayxontohur","Uchtepa","Yakkasaroy","Yunusobod","Yangihayot"],
  ru: ["Бектемирский","Чиланзарский","Яшнободский","Мирободский","Мирзо Улугбека","Сергелийский","Алмазарский","Шайхантахурский","Учтепинский","Яккасарайский","Юнусабадский","Янгихаётский"]
};

// Progress panel
function progress(step, lang) {
  const filled = '▓';
  const empty = '░';
  const bar = filled.repeat(step) + empty.repeat(TOTAL_STEPS - step);
  return `\n📊 ${bar} ${step}/${TOTAL_STEPS} — ${STEP_NAMES[lang][step-1]}`;
}

// Maqtov so'zi
function praise(step, lang) {
  return PRAISE[lang][(step - 1) % PRAISE[lang].length];
}

// Typing + delay
async function typing(ctx, ms = 1000) {
  await ctx.sendChatAction('typing');
  await new Promise(r => setTimeout(r, ms));
}

// Yil tugmalari
function yearButtons() {
  const rows = [];
  const row = [];
  for (let y = 2006; y >= 1970; y--) {
    row.push(Markup.button.callback(String(y), `year_${y}`));
    if (row.length === 4) { rows.push([...row]); row.length = 0; }
  }
  if (row.length) rows.push([...row]);
  return rows;
}

// Oy tugmalari
function monthButtons(lang, year) {
  const months = T[lang].months;
  const rows = [];
  for (let i = 0; i < 12; i += 4) {
    rows.push(months.slice(i, i+4).map((m, j) =>
      Markup.button.callback(m, `month_${year}_${i+j+1}`)
    ));
  }
  return rows;
}

// Kun tugmalari
function dayButtons(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const rows = [];
  const row = [];
  for (let d = 1; d <= daysInMonth; d++) {
    row.push(Markup.button.callback(String(d), `day_${year}_${month}_${d}`));
    if (row.length === 7) { rows.push([...row]); row.length = 0; }
  }
  if (row.length) rows.push([...row]);
  return rows;
}

bot.use(session({ defaultSession: () => ({ step: 'lang', data: {}, lang: 'ru' }) }));

// /start
bot.start(async (ctx) => {
  ctx.session = { step: 'lang', data: {}, lang: 'ru' };
  await ctx.reply(T.ru.chooseLang, Markup.inlineKeyboard([
    [Markup.button.callback('🇷🇺 Русский', 'lang_ru'), Markup.button.callback("🇺🇿 O'zbek", 'lang_uz')]
  ]));
});

// /cancel
bot.command('cancel', async (ctx) => {
  const lang = ctx.session?.lang || 'ru';
  ctx.session = { step: 'lang', data: {}, lang };
  await ctx.reply(T[lang].cancel);
});

// Til
bot.action('lang_ru', async (ctx) => {
  ctx.session.lang = 'ru'; ctx.session.step = 'welcome';
  await ctx.answerCbQuery();
  await ctx.editMessageText(T.ru.welcome, Markup.inlineKeyboard([[Markup.button.callback(T.ru.start, 'start_apply')]]));
});
bot.action('lang_uz', async (ctx) => {
  ctx.session.lang = 'uz'; ctx.session.step = 'welcome';
  await ctx.answerCbQuery();
  await ctx.editMessageText(T.uz.welcome, Markup.inlineKeyboard([[Markup.button.callback(T.uz.start, 'start_apply')]]));
});

// Boshlash
bot.action('start_apply', async (ctx) => {
  const { lang } = ctx.session;
  await ctx.answerCbQuery();
  try {
    const { rows } = await db.query('SELECT * FROM vacancies WHERE active = true ORDER BY id');
    if (rows.length === 0) return ctx.reply(T[lang].noVacancies);
    ctx.session.step = 'vacancy';
    const buttons = rows.map(v => [Markup.button.callback(
      `${v.position[lang]} — ${v.business_emoji} ${v.business} (${v.branch})`, `vac_${v.id}`
    )]);
    const text = T[lang].chooseVacancy + progress(1, lang);
    await ctx.editMessageText(text, Markup.inlineKeyboard(buttons));
  } catch (err) {
    console.error(err.message);
    await ctx.reply('❌ Xatolik. Qayta urinib ko\'ring.');
  }
});

// Vakansiya
bot.action(/vac_(\d+)/, async (ctx) => {
  const { lang } = ctx.session;
  await ctx.answerCbQuery();
  const { rows } = await db.query('SELECT * FROM vacancies WHERE id = $1', [parseInt(ctx.match[1])]);
  const v = rows[0];
  ctx.session.data.vacancyId = v.id;
  ctx.session.data.vacancy = `${v.position[lang]} — ${v.business_emoji} ${v.business} (${v.branch})`;
  ctx.session.step = 'name';
  await ctx.editMessageText(`✅ ${ctx.session.data.vacancy}`);
  await typing(ctx);
  await ctx.reply(T[lang].askName + progress(2, lang));
});

// Yil
bot.action(/year_(\d+)/, async (ctx) => {
  const { lang } = ctx.session;
  await ctx.answerCbQuery();
  ctx.session.data.birthYear = parseInt(ctx.match[1]);
  await ctx.editMessageText(T[lang].askBirthMonth + progress(3, lang), Markup.inlineKeyboard(monthButtons(lang, ctx.session.data.birthYear)));
});

// Oy
bot.action(/month_(\d+)_(\d+)/, async (ctx) => {
  const { lang } = ctx.session;
  await ctx.answerCbQuery();
  ctx.session.data.birthMonth = parseInt(ctx.match[2]);
  await ctx.editMessageText(T[lang].askBirthDay + progress(3, lang), Markup.inlineKeyboard(dayButtons(parseInt(ctx.match[1]), parseInt(ctx.match[2]))));
});

// Kun
bot.action(/day_(\d+)_(\d+)_(\d+)/, async (ctx) => {
  const { lang } = ctx.session;
  await ctx.answerCbQuery();
  const year = parseInt(ctx.match[1]);
  const month = parseInt(ctx.match[2]);
  const day = parseInt(ctx.match[3]);
  const birth = `${String(day).padStart(2,'0')}.${String(month).padStart(2,'0')}.${year}`;
  ctx.session.data.birth = birth;
  ctx.session.step = 'district';
  await ctx.editMessageText(`✅ ${birth}`);
  await typing(ctx);
  const buttons = DISTRICTS[lang].map(d => [Markup.button.callback(d, `dist_${d}`)]);
  await ctx.reply(T[lang].askDistrict + progress(4, lang), Markup.inlineKeyboard(buttons));
});

// Tuman
bot.action(/dist_(.+)/, async (ctx) => {
  const { lang } = ctx.session;
  await ctx.answerCbQuery();
  ctx.session.data.district = ctx.match[1];
  ctx.session.step = 'contact';
  await ctx.editMessageText(`✅ ${ctx.session.data.district}`);
  await typing(ctx);
  await ctx.reply(T[lang].askContact + progress(5, lang), Markup.keyboard([
    [Markup.button.contactRequest(T[lang].shareContact)]
  ]).resize().oneTime());
  await ctx.reply(T[lang].orManual);
});

// Matn
bot.on('text', async (ctx) => {
  const { step, lang } = ctx.session;
  const text = ctx.message.text.trim();

  if (step === 'name') {
    if (text.length < 3) return ctx.reply(T[lang].invalid);
    ctx.session.data.name = text;
    ctx.session.step = 'birth';
    await typing(ctx);
    await ctx.reply(praise(2, lang));
    await typing(ctx, 800);
    return ctx.reply(T[lang].askBirth + progress(3, lang), Markup.inlineKeyboard(yearButtons()));
  }

  if (step === 'contact') {
    ctx.session.data.contact = text;
    ctx.session.step = 'photo';
    await typing(ctx);
    await ctx.reply(praise(5, lang));
    await typing(ctx, 800);
    await ctx.reply(`✅ ${text}`, Markup.removeKeyboard());
    return ctx.reply(T[lang].askPhoto + progress(6, lang));
  }
});

// Kontakt
bot.on('contact', async (ctx) => {
  const { lang } = ctx.session;
  if (ctx.session.step !== 'contact') return;
  const phone = ctx.message.contact.phone_number;
  const username = ctx.from.username ? `@${ctx.from.username}` : '';
  ctx.session.data.contact = `${phone} ${username}`.trim();
  ctx.session.step = 'photo';
  await typing(ctx);
  await ctx.reply(praise(5, lang));
  await typing(ctx, 800);
  await ctx.reply(`✅ ${ctx.session.data.contact}`, Markup.removeKeyboard());
  await ctx.reply(T[lang].askPhoto + progress(6, lang));
});

// Rasm
bot.on('photo', async (ctx) => {
  const { lang } = ctx.session;
  if (ctx.session.step !== 'photo') return ctx.reply(T[lang].photoOnly);
  ctx.session.data.photoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  ctx.session.step = 'voice';
  await typing(ctx);
  await ctx.reply(praise(6, lang));
  await typing(ctx, 800);
  await ctx.reply(T[lang].askVoice + progress(7, lang));
});

// Ovoz
bot.on('voice', async (ctx) => {
  const { lang } = ctx.session;
  if (ctx.session.step !== 'voice') return ctx.reply(T[lang].voiceOnly);
  ctx.session.data.voiceFileId = ctx.message.voice.file_id;
  ctx.session.data.voiceDuration = ctx.message.voice.duration;

  try {
    await db.query(`
      INSERT INTO candidates
      (tg_id, tg_username, name, birth, district, contact, photo_file_id, voice_file_id, voice_duration, vacancy_id, vacancy_label, lang, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'new',NOW())
    `, [
      ctx.from.id, ctx.from.username || null,
      ctx.session.data.name, ctx.session.data.birth,
      ctx.session.data.district, ctx.session.data.contact,
      ctx.session.data.photoFileId, ctx.session.data.voiceFileId,
      ctx.session.data.voiceDuration, ctx.session.data.vacancyId,
      ctx.session.data.vacancy, lang
    ]);
  } catch (err) {
    console.error('DB xato:', err.message);
  }

  // HR ga rasm + matn
  if (process.env.HR_CHAT_ID) {
    try {
      await bot.telegram.sendPhoto(process.env.HR_CHAT_ID,
        ctx.session.data.photoFileId,
        { caption: `🆕 *Yangi ariza!*\n\n👤 ${ctx.session.data.name}\n💼 ${ctx.session.data.vacancy}\n📍 ${ctx.session.data.district}\n📱 ${ctx.session.data.contact}\n🎂 ${ctx.session.data.birth}`, parse_mode: 'Markdown' }
      );
      await bot.telegram.forwardMessage(process.env.HR_CHAT_ID, ctx.chat.id, ctx.message.message_id);
    } catch (e) {}
  }

  await typing(ctx);
  await ctx.reply(praise(7, lang));
  await typing(ctx, 1000);
  await ctx.reply(T[lang].done);
  await ctx.reply(T[lang].shareLink, Markup.inlineKeyboard([[
    Markup.button.url('✈️ Ulashish', `https://t.me/share/url?url=https://t.me/${ctx.botInfo.username}`)
  ]]));

  ctx.session = { step: 'lang', data: {}, lang };
});

// HR buyruqlari
const ADMINS = (process.env.ADMIN_IDS || '').split(',').map(Number);

bot.command('hr', async (ctx) => {
  if (!ADMINS.includes(ctx.from.id)) return;
  await ctx.reply('📊 HR Panel:', Markup.inlineKeyboard([[
    Markup.button.url('📊 HR Panel ochish', process.env.MINI_APP_URL || 'https://google.com')
  ]]));
});

bot.command('add_hr', async (ctx) => {
  if (!ADMINS.includes(ctx.from.id)) return;
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) return ctx.reply('Foydalanish: /add_hr <tg_id> <role>');
  await db.query(`INSERT INTO hr_users (tg_id, role, active, added_at) VALUES ($1,$2,true,NOW()) ON CONFLICT (tg_id) DO UPDATE SET role=$2, active=true`, [parseInt(args[0]), args[1]]);
  await ctx.reply(`✅ HR qo'shildi: ${args[0]}`);
});

bot.command('stats', async (ctx) => {
  if (!ADMINS.includes(ctx.from.id)) return;
  const { rows } = await db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='new') as yangi, COUNT(*) FILTER (WHERE status='accepted') as qabul FROM candidates`);
  const s = rows[0];
  await ctx.reply(`📊 Statistika:\n📋 Jami: ${s.total}\n🆕 Yangi: ${s.yangi}\n✅ Qabul: ${s.qabul}`);
});

// ENG OXIRI
bot.launch({ dropPendingUpdates: true });
console.log('✅ Candidate bot ishga tushdi — @Scandigroupbot');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
