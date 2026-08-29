# ONIX ni o'z kompyuteringizda ishga tushirish

Bu yo'riqnoma dasturchi bo'lmagan odam uchun yozilgan.
Hammasi **4 qadam**, taxminan 20-30 daqiqa.

> ⚠️ Kompyuter o'chirilsa bot ham to'xtaydi. Bu — sinash uchun.
> Doimiy ishlashi uchun keyinroq serverga ko'chiramiz.

---

## Qadam 1 — Ikkita dastur o'rnatish

### Node.js

1. Kiring: **https://nodejs.org**
2. Chapdagi katta yashil tugmani bosing (**LTS** yozilgan)
3. Yuklangan faylni oching → **Next → Next → Install** → **Finish**

### PostgreSQL (ma'lumotlar bazasi)

1. Kiring: **https://www.postgresql.org/download/**
2. Windows yoki macOS ni tanlang → **Download the installer**
3. O'rnating. Ikki narsaga e'tibor bering:

   - **Parol so'raydi** — o'ylab toping va **yozib qo'ying**.
     Masalan: `Onix2026!` — keyin kerak bo'ladi.
   - **Port** so'rasa `5432` ni o'zgartirmang.

4. Oxirida "Stack Builder" so'rasa — **kerak emas**, yopib yuboring.

### Tekshirish

Terminalni oching:
- **Windows:** Boshlash tugmasi → `cmd` deb yozing → Enter
- **Mac:** Spotlight (⌘+Bo'sh joy) → `Terminal` → Enter

Ikkita buyruqni yozib ko'ring:

```
node -v
```
`v22.x.x` kabi javob kelsa — yaxshi.

```
psql --version
```
Javob kelmasa muammo emas — bizga kerak emas.

---

## Qadam 2 — Loyihani yuklab olish

Terminalda:

```
git clone https://github.com/crmmixinfo/scandigroup-bots.git
cd scandigroup-bots
npm install
```

> `git` yo'q desa: **https://git-scm.com** dan o'rnating (Next-Next-Install),
> terminalni yopib qayta oching va qaytadan urinib ko'ring.

---

## Qadam 3 — Baza yaratish va sozlamalar

### Bazani yaratish

**Windows:** Boshlash → `pgAdmin` ni oching (PostgreSQL bilan birga o'rnatilgan).
Chapda **Databases** ustiga o'ng tugma → **Create → Database…** →
nomi `onix` → **Save**.

**Mac (terminalda osonroq):**
```
createdb onix
```

### Sozlamalar fayli

Loyiha papkasida `.env.example` degan fayl bor.
Uni **nusxalab**, nomini `.env` qilib qo'ying:

**Windows:**
```
copy .env.example .env
```
**Mac:**
```
cp .env.example .env
```

Endi `.env` faylni Bloknot (Notepad) yoki TextEdit bilan oching va shu
uchta qatorni to'ldiring:

```
ONIX_BOT_TOKEN=8524712236:AAF...          ← @BotFather bergan token
DATABASE_URL=postgresql://postgres:PAROL@localhost:5432/onix
SUPER_ADMIN_ID=123456789                  ← sizning Telegram ID ingiz
PGSSL=off
```

**PAROL** o'rniga PostgreSQL o'rnatayotganda o'ylab topgan parolingizni yozing.
Masalan parol `Onix2026!` bo'lsa:

```
DATABASE_URL=postgresql://postgres:Onix2026!@localhost:5432/onix
```

**SUPER_ADMIN_ID** ni bilmasangiz — hozircha bo'sh qoldiring, keyin to'ldiramiz.

Saqlang va yoping.

> 💡 `.env` fayli hech qayerga yuborilmaydi — faqat sizning kompyuteringizda
> qoladi. Token va parol shuning uchun shu yerda turadi.

---

## Qadam 4 — Ishga tushirish

```
npm run onix:setup
```

Bu buyruq bazani tayyorlaydi, kategoriyalar va jamoani yuklaydi, keyin
hammasini tekshiradi. Oxirida shunday chiqishi kerak:

```
✅ Hammasi tayyor — npm run onix
```

Endi botni yoqamiz:

```
npm run onix
```

`✅ ONIX bot ishga tushdi` deb yozsa — **tayyor!**
Terminalni **yopmang** — yopsangiz bot to'xtaydi.

Telegramda botingizni toping va `/start` bosing.

---

## Xatolik chiqsa

Avval shuni ishlating — u nima yetishmayotganini aniq aytadi:

```
npm run onix:check
```

| Xabar | Nima qilish kerak |
|---|---|
| `Bazaga ulanib bo'lmadi` | `.env` dagi parolni tekshiring. PostgreSQL ishlab turibdimi? |
| `password authentication failed` | Parol noto'g'ri. `.env` dagi `DATABASE_URL` ni to'g'rilang |
| `database "onix" does not exist` | Bazani yaratmagansiz — Qadam 3 ga qarang |
| `Token qabul qilinmadi` | Token noto'g'ri. @BotFather → `/mybots` → API Token |
| `api.telegram.org ga chiqib bo'lmadi` | Internet yoki firewall. Telegram ochiladimi tekshiring |
| `Sxema to'liq emas` | `npm run onix:setup` ni qayta ishlating |

---

## Foydali buyruqlar

| Buyruq | Vazifasi |
|---|---|
| `npm run onix` | Botni yoqish |
| `npm run onix:check` | Nima yetishmayotganini tekshirish |
| `npm run onix:demo` | Tokensiz sinab ko'rish (terminalda) |
| `npm run onix:categories` | Kategoriyalarni qayta yuklash |
| `npm run onix:users` | Jamoani qayta yuklash |

Botni to'xtatish: terminalda **Ctrl+C**.

---

## Keyingi qadam

Sinab bo'lgach, botni serverga ko'chiramiz — shunda kompyuteringiz
o'chgan bo'lsa ham 24/7 ishlab turadi. Aytsangiz, o'shanda yordam beraman.
