# Brauzerdan kirish — uch yo'l

Dastur qayerdadir ishlab turishi kerak, shundan keyingina brauzerdan
ochiladi. Vaziyatingizga qarab birini tanlang.

---

## 1 · Serverga qo'yish — jamoa uchun

**Qachon:** bir necha xodim bir vaqtda ishlaydi, ma'lumot doimiy saqlanadi.
Sizga aynan shu kerak.

### Vercel — tavsiya etiladi

Uxlab qolmaydi, domen bepul, har push'dan keyin o'zi yangilanadi. Vercel'ning
o'z bazasi yo'q, shuning uchun baza alohida olinadi — Neon bepul tarifi yetadi.

1. **Baza.** [neon.tech](https://neon.tech) → **New Project** → **Connection
   string** ni nusxa oling. Ro'yxatdan **Pooled connection** turini tanlang —
   satrida `-pooler` bo'ladi. Serverless bilan aynan shu ishlaydi.
2. [vercel.com](https://vercel.com) → **Add New** → **Project** →
   `crmmixinfo/scandigroup-bots` ni import qiling.
3. **Settings → Environment Variables** ga bitta qator:
   ```
   DATABASE_URL=<Neon bergan pooled satr>
   ```
   `PGSSL` ni QO'YMANG — Neon SSL talab qiladi.
   `ERP_AUTO_MIGRATE` ham kerak emas: bazani build o'zi tayyorlaydi.
4. **Settings → Git → Production Branch** ni `claude/salom-asulmx` qiling.
   Standart holatda `main` turadi, unda ERP yo'q.
5. **Deploy**.

Loyiha allaqachon shu yerda turibdi: **https://scandi-erp.vercel.app**

**Build logida nima ko'rinishi kerak:**
```
  core.sql              OK
  ...
Baza tayyor: {"tsexlar":"4","bolimlar":"24","sku":"32",...}
```
Bu chiqsa — baza tayyor. Manzilni oching, PIN `0000`.

**Agar xato chiqsa:**

| Logdagi yozuv | Sabab | Yechim |
|---|---|---|
| `DATABASE_URL kiritilmagan` | o'zgaruvchi qo'yilmagan yoki faqat Preview uchun belgilangan | 3-qadam; o'zgaruvchi **Production** uchun ham yoqilgan bo'lsin |
| 404 yoki bo'sh sahifa | `main` branch deploy bo'lgan | 4-qadam: Production Branch |
| `too many connections` | direct (pooler'siz) satr ishlatilgan | Neon'dan `-pooler` li satrni oling |
| `self signed certificate` | `PGSSL` qo'shib qo'yilgan | o'zgaruvchini o'chiring |

**Botlar Vercel'da ishlamaydi.** `hr-bot.js` va `candidate-bot.js` uzluksiz
ishlab turuvchi jarayon talab qiladi (long polling), serverless esa faqat
so'rov kelganda uyg'onadi. Botlarni Railway'da yoki alohida serverda qoldiring —
ERP bilan bir bazaga ulanadi, ikkalasi birga ishlaydi.

### Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. `crmmixinfo/scandigroup-bots` ni tanlang.
3. **Settings → Source** da branch'ni `claude/salom-asulmx`
   ga o'zgartiring. Standart holatda `main` turadi, unda ERP yo'q.
4. Loyihada **+ New** → **Database** → **Add PostgreSQL**.
5. Dastur xizmatining **Variables** bo'limiga ikkita qator qo'shing:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   ERP_AUTO_MIGRATE=1
   ```
   Birinchi qator bazani dasturga ulaydi. Railway uni har doim ham o'zi
   qo'shmaydi — `Variables` ro'yxatida `DATABASE_URL` allaqachon turgan
   bo'lsa, faqat ikkinchi qatorni qo'shing.
6. **Settings** → **Networking** → **Generate Domain**.

Tayyor. Manzilni oching, PIN `0000`.

**Deploy logida nima ko'rinishi kerak:**
```
Migratsiya bajarildi: {"tsexlar":"4","bolimlar":"24","sku":"32",...}
Scandi ERP → http://localhost:3000
```
Bu ikki qator chiqsa — hammasi joyida.

**Agar xato chiqsa:**

| Logdagi yozuv | Sabab | Yechim |
|---|---|---|
| `DATABASE_URL kiritilmagan` | baza ulanmagan | 5-qadamdagi birinchi qatorni qo'shing |
| `Cannot find module 'telegraf'` yoki bot xatosi | eski branch | 3-qadam: branch'ni tekshiring |
| `ECONNREFUSED` / `timeout` | baza hali ko'tarilmagan | 1-2 daqiqa kuting, **Redeploy** bosing |
| `self signed certificate` | SSL sozlamasi | `PGSSL` o'zgaruvchisi qo'shilgan bo'lsa, o'chiring |

Logda quyidagi ko'rinsa hammasi joyida:
```
Migratsiya bajarildi: {"tsexlar":"4","bolimlar":"24","sku":"32",...}
Scandi ERP → http://localhost:3000
```

### Render

`render.yaml` tayyor — veb-xizmat va baza birga yaratiladi:
[render.com](https://render.com) → **New** → **Blueprint** → repozitoriyni tanlang.

---

## 2 · O'z kompyuteringizda, Docker bilan — bugun ko'rish uchun

**Qachon:** hozir ko'rmoqchisiz, hech qanday ro'yxatdan o'tish kerak emas.
Faqat shu kompyuterdan ochiladi.

[Docker Desktop](https://docker.com/products/docker-desktop) o'rnatilgan bo'lsa:

```bash
git clone -b claude/salom-asulmx \
  https://github.com/crmmixinfo/scandigroup-bots.git
cd scandigroup-bots
docker compose up
```

Birinchi ishga tushish 1-2 daqiqa (Postgres va Node yuklab olinadi).
Keyin brauzerda: **http://localhost:3000** · PIN `0000`

To'xtatish: `Ctrl+C`. Ma'lumot `pgdata/` papkasida qoladi, qayta
`docker compose up` desangiz joyida turadi.

---

## 3 · O'z kompyuteringizda, Dockersiz

**Kerak:** Node.js 18+ va PostgreSQL 14+.

```bash
git clone -b claude/salom-asulmx \
  https://github.com/crmmixinfo/scandigroup-bots.git
cd scandigroup-bots
cp .env.example .env
```

`.env` faylida:
```
DATABASE_URL=postgresql://postgres:parol@localhost:5432/scandi_erp
PGSSL=off
```

Keyin:
```bash
createdb scandi_erp
npm install
npm run erp:migrate
npm start
```

Brauzerda: **http://localhost:3000**

---

## Kirgandan keyin — birinchi yarim soat

| # | Sahifa | Ish |
|---|---|---|
| 1 | `/xodimlar.html` | Xodimlarni kiriting, PIN bering, rol biriktiring |
| 2 | `/xodimlar.html` | **Demo PIN'larni o'chiring** (`0000`, `1111`–`6666` hozir ochiq) |
| 3 | `/sozlamalar.html` | Bo'lim quvvatlari — muddat bashorati shusiz ishlamaydi |
| 4 | `/mijozlar.html` | Mijozlar ro'yxatini import qiling |
| 5 | `/qoldiq.html` | Konveyerdagi va T/M omboridagi mahsulotlar |

Rollar:

| Rol | Kim | Nima qiladi |
|---|---|---|
| Administrator | 1 | hammasi |
| Direktor | 1 | hisobotlarni ko'radi |
| **Ma'lumot kirituvchi** | 5 | jurnal, qoldiq, mijozlar — sozlamalarga tegmaydi |

---

## Muhim

- **Demo PIN'lar ochiq turibdi.** Serverga qo'yganingizdan keyin birinchi ish —
  o'z xodimlaringizni kiritib, demo hisoblarni o'chirish.
- **Ma'lumot faqat bazada.** Vercel'da hech narsa saqlanmaydi — hammasi
  Neon bazasida. Railway/Render bazasi ham doimiy; Docker'da `pgdata/`
  papkasida, uni o'chirmang.
- **Zaxira nusxa.** Neon'da **Branches/PITR**, Railway'da avtomatik backup
  yoqib qo'ying. Bazani yo'qotsangiz — hamma ish yo'qoladi.
