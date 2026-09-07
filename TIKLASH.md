# ONIX — yangi kompyuterda tiklash

Kompyuter almashsa, buzilsa yoki yo'qolsa — hammasi qaytariladi.
Bu hujjat GitHub'da turadi, ya'ni **kompyuteringiz qo'lingizda bo'lmasa
ham** brauzerdan ochib o'qiy olasiz:

```
github.com/crmmixinfo/scandigroup-bots
```

---

## Nima qayerda saqlanadi

| Narsa | Qayerda | Yo'qoladimi |
|---|---|---|
| Kod | GitHub | ❌ Yo'q |
| Ma'lumot (baza) | Har kuni 03:00 → OneDrive va Telegram | ❌ Yo'q |
| Bot tokeni | @BotFather | ❌ Yo'q — qayta olinadi |
| Sheets havolasi va maxfiy so'zi | Apps Script ichida | ❌ Yo'q |
| `.env` fayli | Faqat eski kompyuterda | ⚠️ **Ha** — qayta yoziladi |

`.env` dagi hamma narsa boshqa joydan qayta topiladi, shuning uchun
uning yo'qolishi falokat emas.

---

## Kerak bo'ladigan narsalar

Boshlashdan oldin qo'lingizda bo'lsin:

1. **Zaxira fayli** — `onix-2026-09-07-0300.sql.gz` ko'rinishida.
   OneDrive'dagi «ONIX zaxira» papkasida yoki botdan kelgan Telegram
   xabarlarida. **Eng yangisini oling.**
2. **Google hisobi** — OneDrive va Sheets uchun
3. **Telegram** — @BotFather ga kirish uchun

---

## 1-qadam. Dasturlarni o'rnatish

Terminal'ni oching (**Cmd + Space** → `Terminal`).

**Homebrew** (boshqalarini shu o'rnatadi):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

O'rnatish oxirida ekranda ikkita `echo …` qatori chiqadi — ularni
ko'chirib bajarish kerak (Homebrew ni PATH ga qo'shadi).

**Node.js, PostgreSQL va git:**

```bash
brew install node postgresql@16 git
brew services start postgresql@16
```

---

## 2-qadam. Kodni olish

```bash
cd ~
git clone https://github.com/crmmixinfo/scandigroup-bots.git
cd scandigroup-bots
git checkout claude/salom-2mumbb
npm install
```

---

## 3-qadam. Bo'sh baza ochish

```bash
createdb onix
```

---

## 4-qadam. Ma'lumotni tiklash

Zaxira faylini `~/Downloads` ga qo'ying (OneDrive'dan yoki Telegramdan
yuklab oling), keyin:

```bash
gunzip -c ~/Downloads/onix-2026-09-07-0300.sql.gz | psql onix
```

> Fayl nomini o'zingiznikiga almashtiring. Ekranda `CREATE TABLE`,
> `COPY`, `setval` kabi qatorlar oqib o'tadi — bu normal.

Tekshirish:

```bash
psql onix -c "SELECT count(*) FROM onix_operations"
```

Yozuvlar soni chiqsa — ma'lumot joyida.

---

## 5-qadam. Yangi token olish

Eski token eski kompyuterda qolgan va ehtimol xavfsiz emas. Yangisini
oling:

1. Telegramda **@BotFather**
2. `/mybots` → **@onix_xisobot**
3. **API Token** → **Revoke current token**
4. Yangi token chiqadi — nusxalang

---

## 6-qadam. `.env` faylini yozish

```bash
open -e ~/scandigroup-bots/.env
```

Bo'sh fayl ochiladi (yoki «yo'q» desa, quyidagini yozib saqlang).
Ichiga:

```
ONIX_BOT_TOKEN=<@BotFather bergan yangi token>
DATABASE_URL=postgresql://FOYDALANUVCHI@localhost:5432/onix
PGSSL=off
ONIX_SHEETS_URL=<Apps Script havolasi>
ONIX_SHEETS_SECRET=<skriptdagi SECRET>
```

`FOYDALANUVCHI` o'rniga yangi kompyuterdagi foydalanuvchi nomingiz.
Bilish uchun:

```bash
whoami
```

**Sheets havolasi va maxfiy so'zini qayerdan olasiz:** ONIX jadvalini
oching → **Extensions → Apps Script**. Skript boshida `var SECRET = '…'`
turadi. Havola: **Начать развертывание → Управление развертываниями**.

Sheets hozircha kerak bo'lmasa — oxirgi ikki qatorni bo'sh qoldiring,
bot baribir ishlaydi.

**Cmd + S** bilan saqlang.

---

## 7-qadam. Tekshirish

```bash
cd ~/scandigroup-bots
npm run onix:check
```

Hamma qatorda ✅ bo'lishi kerak. ❌ chiqsa — nima yozilganini Claude ga
yuboring.

---

## 8-qadam. Botni ishga tushirish

```bash
npm run onix
```

Telegramda botga `/menu` yozing. Javob kelsa — tiklash tugadi.

Keyin fonda ishlaydigan qilish uchun (Terminal kerak bo'lmasin):

```bash
open ~/scandigroup-bots/onix/tools
```

**ONIX-avtomat-yoqish.command** ni ikki marta bosing.

---

## 9-qadam. Zaxirani qayta ulash

Yangi kompyuterga **OneDrive** (yoki iCloud/Google Drive) o'rnating va
hisobingizga kiring. Bot bulut papkasini o'zi topadi.

Tekshirish:

```bash
npm run onix:zaxira
```

`☁️ OneDrive orqali bulutga ko'tariladi` yozuvi chiqishi kerak.

---

## Nimalar tiklanmaydi

| | Izoh |
|---|---|
| Oxirgi zaxiradan keyingi yozuvlar | Zaxira 03:00 da olinadi — o'shandan keyin kiritilganlari yo'qoladi |
| Eski bot tokeni | Yangisi olinadi, bot va yozishmalar joyida qoladi |

Bir kunlik ma'lumotni yo'qotmaslik uchun muhim ish qilgan kuni botga
`/zaxira` yozib qo'ying — nusxa darrov olinadi va Telegramga keladi.

---

## Eng qisqa xulosa

Yo'qotib qo'ymaslik kerak bo'lgan **bitta narsa** — zaxira fayli.
U OneDrive'da ham, Telegramda ham turibdi. Ikkalasi ham yo'qolmasa,
ONIX butunlay tiklanadi.
