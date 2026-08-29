# ONIX — moliyaviy model

Kassa daftari → **Pul oqimi** va **Foyda-zarar** hisobotlari avtomatik.
Ma'lumot bir marta kiritiladi, ikkala hisobot bir manbadan chiqadi.

---

## 1. Asosiy g'oya: ikkita sana

Har bir operatsiyada ikkita sana bor va ular **turli hisobotlarni** boshqaradi:

| Ustun | Nima | Qaysi hisobotga |
|---|---|---|
| `paid_at` | Pul real harakat qilgan sana | 💹 **Pul oqimi** |
| `period` | Xarajat/daromad tegishli bo'lgan oy | 📈 **Foyda-zarar** |

**Misol.** 25-yanvarda fevral oyining arendasi to'landi:

```
paid_at = 25.01.2026   →  Pul oqimi:    yanvarda −8 000 000 so'm
period  = 01.02.2026   →  Foyda-zarar:  fevralda −8 000 000 so'm
```

Yanvar foyda-zararida bu xarajat **ko'rinmaydi** — u fevralni belgilaydi.
Bot kiritish paytida har safar «Bu qaysi oyning hisobotiga tushsin?» deb so'raydi
va sanalar mos kelmasa tasdiq ekranida ogohlantiradi.

---

## 2. Rollar

| Rol | Kim | Nima qiladi |
|---|---|---|
| `cashier` | 1 ta kassir | Kirim, chiqim, hodimlarga pul berish, konvertatsiya |
| `staff` | 3 ta hodim | Faqat **o'z qo'lidagi puldan** xarajat kiritadi |
| `manager` | 2 ta rahbar | Faqat ko'radi — hisobotlar, qoldiqlar, daftar |
| `admin` | Egasi | Hammasi + foydalanuvchi/kategoriya sozlamalari |

---

## 3. Podotchyot (hisobdor pul)

Kassir hodimga pul beradi → bu **xarajat emas**, ichki o'tkazma.
Xarajat faqat hodim shu puldan sarflaganda paydo bo'ladi.

```
Kassir:  Naqd (sum) ──5 000 000──▶  Ali qo'li      [o'tkazma, P&L ga ta'sir yo'q]
Ali:     Ali qo'li  ──3 000 000──▶  Oziq-ovqat     [XARAJAT, P&L ga tushadi]
                     ─────────────
                     qoldiq: 2 000 000  →  Ali qo'lida qoladi, keyingi safar shundan davom etadi
```

Har bir hodimning qo'lidagi qoldiq doim ko'rinib turadi — hodimga ham, rahbarga ham.
Hodim xarajat kiritayotganda qoldig'idan oshib ketsa, bot ogohlantiradi
(to'xtatmaydi — kirim yozilmagan bo'lishi mumkin).

---

## 4. Valyuta

**UZS va USD butunlay alohida yuritiladi** — hech qayerda jamlanmaydi.
Har bir hisobot bitta valyuta uchun quriladi.

Sum ↔ dollar almashtirish «🔄 O'tkazma / Konvertatsiya» orqali kiritiladi:
berilgan summa va olingan summa alohida yoziladi, kurs avtomatik hisoblanadi.
Bu operatsiya sum pul oqimida chiqim, dollar pul oqimida kirim bo'lib ko'rinadi.

---

## 5. Hisoblar (kassalar)

Boshlang'ich to'plam:

| Hisob | Turi | Valyuta |
|---|---|---|
| Naqd (sum) | `cash` | UZS |
| Naqd ($) | `cash` | USD |
| Plastik (sum) | `card` | UZS |
| Plastik ($) | `card` | USD |

Har bir `staff` qo'shilganda unga avtomat ikkita podotchyot hisobi ochiladi (sum va $).
Yangi kassa qo'shish: `/add_account card USD Plastik Anor`

---

## 6. Hisobotlar

**💹 Pul oqimi** (`paid_at` bo'yicha) — boshlang'ich qoldiq, kirim va chiqim
bo'limlar kesimida, valyuta konvertatsiyasi, sof oqim, yakuniy qoldiq,
har bir kassaning qoldig'i, hodimlar kesimida chiqim.

**📈 Foyda-zarar** (`period` bo'yicha) — daromad va xarajat bo'lim →
podkategoriya kesimida, foyda/zarar, rentabellik, o'tgan oy bilan solishtirish.
Oxirida «kelgusi davrlarga yozilganlar» eslatmasi chiqadi.

**👛 Podotchyot** — har hodim bo'yicha: olgan, sarflagan, qaytargan, qo'lidagi qoldiq.

**📋 Kassa daftari** — barcha yozuvlar sahifalab, `paid_at ≠ period` bo'lganda
qatorda `→ P&L: Fev 2026` belgisi bilan.

---

## 7. O'rnatish

```bash
npm install
cp .env.example .env          # ONIX_BOT_TOKEN, DATABASE_URL, SUPER_ADMIN_ID to'ldiring
npm run onix:schema           # bazani tayyorlash (qayta ishga tushirsa ham xavfsiz)
npm run onix                  # botni ishga tushirish
```

Keyin Telegramda botga `/start` yuboring (siz `SUPER_ADMIN_ID` egasisiz) va
jamoani qo'shing:

```
/add_user 111111111 cashier Rustam Karimov
/add_user 222222222 staff   Ali Valiyev
/add_user 333333333 staff   Vali Aliyev
/add_user 444444444 staff   Gulnora Sattorova
/add_user 555555555 manager Sardor Rahmonov
/add_user 666666666 manager Dilshod Tursunov
```

Har bir hodim o'z Telegram ID sini `/myid` orqali oladi.

---

## 8. Sozlash buyruqlari (admin)

| Buyruq | Vazifasi |
|---|---|
| `/users` | Foydalanuvchilar ro'yxati |
| `/add_user <id> <rol> <Ism>` | Qo'shish |
| `/remove_user <id>` | O'chirish (yozuvlari daftarda qoladi) |
| `/accounts` | Hisoblar va qoldiqlar |
| `/add_account <cash\|card\|bank> <UZS\|USD> <nom>` | Yangi kassa |
| `/cats` | Kategoriyalar (ID lari bilan) |
| `/add_cat <bo'lim_id> <nom>` | Yangi podkategoriya |
| `/del_cat <id>` | Kategoriyani yashirish |
| `/del <id> <sabab>` | Yozuvni bekor qilish |

**Yozuvlar hech qachon o'chmaydi** — `deleted_at` bilan belgilanadi,
kim va nima sababdan bekor qilgani saqlanadi.

---

## 9. Fayllar

```
onix-bot.js          bot: menyu, kiritish sehrgari, hisobot oqimi, admin buyruqlari
onix-schema.sql      baza sxemasi + boshlang'ich kategoriyalar
onix/db.js           baza so'rovlari
onix/reports.js      pul oqimi, foyda-zarar, podotchyot hisob-kitobi
onix/views.js        hisobotlarni matn ko'rinishida chizish
onix/keyboards.js    Telegram klaviaturalari
onix/format.js       summa/sana formatlash va o'qish
onix/tests/          testlar (55 ta tekshiruv)
```

## 10. Testlar

Testlar bo'sh PostgreSQL bazasini talab qiladi:

```bash
psql "$TEST_DATABASE_URL" -f onix-schema.sql
PGDATABASE=onix_test npm run onix:test
```

Testlar quyidagilarni tekshiradi: rollar bo'yicha ruxsatlar, kiritish sehrgarining
har bir qadami, podotchyot hisob-kitobi, valyuta konvertatsiyasi, qoldiq nazorati,
bekor qilish, va **eng asosiysi** — yanvarda to'langan xarajat fevral
foyda-zararida chiqishi.
