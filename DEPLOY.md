# Brauzerdan kirish — uch yo'l

Dastur qayerdadir ishlab turishi kerak, shundan keyingina brauzerdan
ochiladi. Vaziyatingizga qarab birini tanlang.

---

## 1 · Serverga qo'yish — jamoa uchun

**Qachon:** bir necha xodim bir vaqtda ishlaydi, ma'lumot doimiy saqlanadi.
Sizga aynan shu kerak.

### Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. `crmmixinfo/scandigroup-bots` ni tanlang, branch: `claude/mebel-production-monitoring-nje80r`
3. Loyihada **+ New** → **Database** → **Add PostgreSQL**
   → `DATABASE_URL` avtomatik qo'shiladi
4. Veb-xizmatning **Variables** bo'limiga bitta qator qo'shing:
   ```
   ERP_AUTO_MIGRATE=1
   ```
5. **Settings** → **Networking** → **Generate Domain**

Tayyor. Manzilni oching, PIN `0000`.

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
git clone -b claude/mebel-production-monitoring-nje80r \
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
git clone -b claude/mebel-production-monitoring-nje80r \
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
- **Ma'lumot faqat bazada.** Railway/Render bazasi doimiy; Docker'da
  `pgdata/` papkasida. Bu papkani o'chirmang.
- **Zaxira nusxa.** Railway'da baza uchun avtomatik backup yoqib qo'ying.
