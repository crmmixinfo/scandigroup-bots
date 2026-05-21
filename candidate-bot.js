require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const { Pool } = require('pg');

const bot = new Telegraf(process.env.CANDIDATE_BOT_TOKEN);
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const T = {
  ru: {
    chooseLang: '🌐 Выберите язык / Tilni tanlang:',
    welcome: '👋 Привет! Мы ищем сотрудников.\n\nКороткая анкета на 1 минуту — нажмите «Начать».',
    start: '🚀 Начать',
    chooseVacancy: '🎯 Какая вакансия вас интересует?',
    noVacancies: 'Активных вакансий пока нет. Попробуйте позже.',
    askName: '✍️ Введите вашу фамилию и имя:',
    askBirth: '🎂 Дата рождения:\n(Например: 15.03.1998)',
    askDistrict: '📍 Выберите ваш район проживания:',
    askContact: '📱 Поделитесь номером телефона:',
    shareContact: '📲 Поделиться контактом',
    orManual: '✏️ Или напишите вручную:\n+998901234567 @username',
    askPhoto: '📸 Загрузите вашу фотографию:\n(Чёткое фото лица, обязательно)',
    askVoice: '🎤 Запишите голосовое о себе (до 60 сек):\nРасскажите о себе и почему хотите работать с нами',
    done: '✅ Спасибо! Ваша анкета принята.\n\n📋 Скоро с вами свяжутся!\n\n🍀 Удачи!',
    invalid: '❌ Неверный формат. Попробуйте ещё раз.',
    photoOnly: '📸 Пожалуйста, отправьте фотографию.',
    voiceOnly: '🎤 Пожалуйста, отправьте голосовое сообщение.',
    shareLink: '👇 Поделитесь ботом с друзьями:',
  },
  uz: {
    chooseLang: '🌐 Выберите язык / Tilni tanlang:',
    welcome: "👋 Salom! Xodim izlayapmiz.\n\n1 daqiqalik qisqa ariza — «Boshlash» tugmasini bosing.",
    start: '🚀 Boshlash',
    chooseVacancy: '🎯 Qaysi lavozim sizni qiziqtiradi?',
    noVacancies: "Hozircha aktiv vakansiya yo'q. Keyinroq urinib ko'ring.",
    askName: '✍️ Familiya va ismingizni kiriting:',
    askBirth: "🎂 Tug'ilgan sanangiz:\n(Masalan: 15.03.1998)",
    askDistrict: '📍 Yashash tumaningizni tanlang:',
    askContact: '📱 Telefon raqamingizni ulashing:',
    shareContact: '📲 Kontaktni ulashish',
    orManual: "✏️ Yoki qo'lda yozing:\n+998901234567 @username",
    askPhoto: "📸 Rasmingizni yuklang:\n(Aniq yuz rasmi, majburiy)",
    askVoice: "🎤 O'zingiz haqida ovozli xabar yozing (60 soniyagacha):\nO'zingiz va nega biz bilan ishlashni xohlayotganingiz haqida",
    done: "✅ Rahmat! Arizangiz qabul qilindi.\n\n📋 Tez orada bog'lanamiz!\n\n🍀 Omad!",
    invalid: "❌ Noto'g'ri format. Qayta urinib ko'ring.",
    photoOnly: '📸 Iltimos, rasm yuboring.',
    voiceOnly: '🎤 Iltimos, ovozli xabar yuboring.',
    shareLink: "👇 Botni do'stlaringizga ulashing:",
  }
};

const DISTRICTS = {
  uz: ["Bektemir","Chilonzor","Yashnobod","Mirobod","Mirzo Ulug'bek","Sergeli","Olmazor","Shayxontohur","Uchtepa","Yakkasaroy","Yunusobod","Yangihayot"],
  ru: ["Бектемирский","Чиланзарский","Яшнободский","Мирободский","Мирзо Улугбека","Сергелийский","Алмазарский","Шайхантахурский","Учтепинский","Яккасарайский","Юнусабадский","Янгихаётский"]
};

bot.use(session({ defaultSession: () => ({ step: 'lang', data: {}, lang: 'ru' }) }));

// /start — til tanlash
bot.start(async (ctx) => {
  ctx.session = { step: 'lang', data: {}, lang: 'ru' };
  await ctx.reply(
    T.ru.chooseLang,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('🇷🇺 Русский', 'lang_ru'),
        Markup.button.callback("🇺🇿 O'zbek", 'lang_uz')
      ]
    ])
  );
});

// Til tanlash
bot.action('lang_ru', async (ctx) => {
  ctx.session.lang = 'ru';
  ctx.session.step = 'welcome';
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    T.ru.welcome,
    Markup.inlineKeyboard([[Markup.button.callback(T.ru.start, 'start_apply')]])
  );
});

bot.action('lang_uz', async (ctx) => {
  ctx.session.lang = 'uz';
  ctx.session.step = 'welcome';
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    T.uz.welcome,
    Markup.inlineKeyboard([[Markup.button.callback(T.uz.start, 'start_apply')]])
  );
});

// Boshlash
bot.action('start_apply', async (ctx) => {
  const { lang } = ctx.session;
  await ctx.answerCbQuery();
  try {
    const { rows } = await db.query('SELECT * FROM vacancies WHERE active = true ORDER BY id');
    if (rows.length === 0) {
      return ctx.reply(T[lang].noVacancies);
    }
    ctx.session.step = 'vacancy';
    const buttons = rows.map(v => [
      Markup.button.callback(
        `${v.position[lang]} — ${v.business_emoji} ${v.business} (${v.branch})`,
        `vac_${v.id}`
      )
    ]);
    await ctx.editMessageText(T[lang].chooseVacancy, Markup.inlineKeyboard(buttons));
  } catch (err) {
    console.error('DB xato:', err.message);
    await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
});

// Vakansiya tanlash
bot.action(/vac_(\d+)/, async (ctx) => {
  const { lang } = ctx.session;
  await ctx.answerCbQuery();
  const { rows } = await db.query('SELECT * FROM vacancies WHERE id = $1', [parseInt(ctx.match[1])]);
  if (!rows[0]) return ctx.reply('❌ Vakansiya topilmadi.');
  const v = rows[0];
  ctx.session.data.vacancyId = v.id;
  ctx.session.data.vacancy = `${v.position[lang]} — ${v.business_emoji} ${v.business} (${v.branch})`;
  ctx.session.step = 'name';
  await ctx.editMessageText(`✅ ${ctx.session.data.vacancy}`);
  await ctx.reply(T[lang].askName);
});

// Tuman tanlash
bot.action(/dist_(.+)/, async (ctx) => {
  const { lang } = ctx.session;
  await ctx.answerCbQuery();
  ctx.session.data.district = ctx.match[1];
  ctx.session.step = 'contact';
  await ctx.editMessageText(`✅ ${ctx.session.data.district}`);
  await ctx.reply(
    T[lang].askContact,
    Markup.keyboard([[Markup.button.contactRequest(T[lang].shareContact)]]).resize().oneTime()
  );
  await ctx.reply(T[lang].orManual);
});

// Matn xabarlari
bot.on('text', async (ctx) => {
  const { step, lang } = ctx.session;
  const text = ctx.message.text.trim();

  if (step === 'name') {
    if (text.length < 3) return ctx.reply(T[lang].invalid);
    ctx.session.data.name = text;
    ctx.session.step = 'birth';
    return ctx.reply(T[lang].askBirth);
  }

if (step === 'birth') {
    ctx.session.data.birth = text;
    ctx.session.step = 'district';
    const buttons = DISTRICTS[lang].map(d => [Markup.button.callback(d, `dist_${d}`)]);
    return ctx.reply(T[lang].askDistrict, Markup.inlineKeyboard(buttons));
  }
    }
    ctx.session.data.birth = text;
    ctx.session.step = 'district';
    const buttons = DISTRICTS[lang].map(d => [Markup.button.callback(d, `dist_${d}`)]);
    return ctx.reply(T[lang].askDistrict, Markup.inlineKeyboard(buttons));
  }

  if (step === 'contact' || step === 'contact_manual') {
    ctx.session.data.contact = text;
    ctx.session.step = 'photo';
    await ctx.reply(`✅ ${text}`, Markup.removeKeyboard());
    return ctx.reply(T[lang].askPhoto);
  }
});

// Kontakt tugma orqali
bot.on('contact', async (ctx) => {
  const { lang } = ctx.session;
  if (ctx.session.step !== 'contact') return;
  const phone = ctx.message.contact.phone_number;
  const username = ctx.from.username ? `@${ctx.from.username}` : '';
  ctx.session.data.contact = `${phone} ${username}`.trim();
  ctx.session.step = 'photo';
  await ctx.reply(`✅ ${ctx.session.data.contact}`, Markup.removeKeyboard());
  await ctx.reply(T[lang].askPhoto);
});

// Rasm
bot.on('photo', async (ctx) => {
  const { lang } = ctx.session;
  if (ctx.session.step !== 'photo') return ctx.reply(T[lang].photoOnly);
  ctx.session.data.photoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  ctx.session.step = 'voice';
  await ctx.reply('✅ ' + (lang === 'ru' ? 'Фото получено!' : 'Rasm qabul qilindi!'));
  await ctx.reply(T[lang].askVoice);
});

// Ovozli xabar
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
    console.error('DB saqlash xatosi:', err.message);
  }

  // HR ga xabar
  if (process.env.HR_CHAT_ID) {
    try {
      await bot.telegram.sendMessage(
        process.env.HR_CHAT_ID,
        `🆕 *Yangi ariza!*\n\n👤 ${ctx.session.data.name}\n💼 ${ctx.session.data.vacancy}\n📍 ${ctx.session.data.district}\n📱 ${ctx.session.data.contact}`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  }

  await ctx.reply(T[lang].done);
  await ctx.reply(
    T[lang].shareLink,
    Markup.inlineKeyboard([[
      Markup.button.url('✈️ Ulashish', `https://t.me/share/url?url=https://t.me/${ctx.botInfo.username}`)
    ]])
  );

  ctx.session = { step: 'lang', data: {}, lang };
});

bot.launch({ dropPendingUpdates: true });
console.log('✅ Candidate bot ishga tushdi — @Scandigroupbot');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
