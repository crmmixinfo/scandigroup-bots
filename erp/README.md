# Scandi ERP

Zavod uchun modulli boshqaruv tizimi. Yadro bitta: bitta baza, bitta API,
bitta rol/huquq tizimi. Modullar shu yadroga ulanadi.

Bugun **ishlab chiqarish** moduli ishlaydi. Ombor, ta'minot, savdo, kassa va
maosh modullari uchun huquqlar, rollar va ulanish nuqtasi allaqachon tayyor.

## Uchta ko'rinish, bitta backend

Kod bitta, interfeys uch xil — kim qayerda ishlashiga qarab:

| Ko'rinish | Kim uchun | Qanday ishlaydi |
|---|---|---|
| **Sayt** (brauzer) | Direktor, buxgalter, kassir, ta'minotchi, sotuvchi | PIN bilan kirish, kompyuter yoki planshet |
| **Telegram Mini App** | Tsex ustasi, operator, omborchi | Bot ichida ochiladi, parol so'ralmaydi — Telegram imzosi orqali tanib olinadi |
| **Bot xabarlari** | Kim faqat xabar olishi kerak | Interfeys yo'q, `notifications` navbatidan xabar keladi |

Rolning ko'rinishi `roles.surface` da yozilgan, ya'ni yangi lavozim qo'shilganda
qaysi ko'rinishda ishlashi ham shu yerda belgilanadi.

Mini App uchun sahifa oddiy sayt sahifasining o'zi: `telegram-web-app.js` ulangan
va `App.start()` Telegram ichida ochilganini sezsa `initData` imzosini serverga
yuboradi (`POST /api/auth/telegram`), server HMAC bilan tekshirib xodimni
`workers.tg_id` bo'yicha topadi. Mavjud `hr-bot.js` dagi Mini App mexanizmi
bilan bir xil.

## Huquqlar

Huquq **rolga emas, amalga** beriladi. Rol — huquqlar to'plami.

```
permissions        production.entry, cash.manage, payroll.view ...
roles              tsex_usta, kassir, buxgalter, direktor ...
role_permissions   rol → huquqlar
worker_roles       xodim → rol (+ tsex/yo'nalish doirasi)
```

API tomonida bitta qator yetarli:

```js
router.post('/flow', need('production.entry'), handler)
```

Yangi lavozim paydo bo'lsa — yangi rol yaratiladi, **kod tegilmaydi**.
`worker_roles.scope_shop_id` rolni bitta tsex bilan cheklaydi: Korpus ustasi
terminalda faqat o'z tsexini ko'radi.

Kim nima yozgani ham klientdan olinmaydi — sessiyadan olinadi. Terminal boshqa
xodim nomidan yozuv kirita olmaydi.

## Struktura

```
erp/
  server.js            kirish nuqtasi, modullarni ulaydi
  db.js                baza, xatolik ushlagichi, audit
  auth.js              sessiya, PIN, Telegram imzosi, huquq guard'i
  notify.js            bot xabarlari navbati
  modules/
    production.js      ishlab chiqarish API
  sql/
    core.sql           xodim, rol, huquq, sessiya, audit, bildirishnoma
    core-seed.sql      huquqlar va rollar
    production.sql     ishlab chiqarish jadvallari va hisobot view'lari
    production-seed.sql tsexlar, bo'limlar, marshrutlar
    production-sku.sql  fason va SKU katalogi
  public/
    app.js             klient: sessiya, huquq, so'rov
    index.html         modullar menyusi
    zavod.html         zavod ko'rinishi
    dashboard.html     ko'rsatkichlar paneli
    terminal.html      tsex terminali
```

### Yangi modul qo'shish

1. `sql/<modul>.sql` — jadvallar.
2. `modules/<modul>.js` — `express.Router`, har yo'lda `need('<modul>.<amal>')`.
3. `server.js` da bitta qator: `app.use('/api/<modul>', require('./modules/<modul>'))`.
4. Huquqlar `sql/core-seed.sql` da allaqachon bor — rolga biriktirish kifoya.

Pul yoki ombor tegadigan amallarda `audit(req, {...})` chaqiriladi.

## Modullar

| Modul | Holat | Nima bo'ladi |
|---|---|---|
| **Ishlab chiqarish** | ✅ ishlayapti | Tsex/bo'lim, marshrut, WIP, komplektlilik, muddat bashorati |
| **Ombor** | rejada | Xom ashyo va tayyor mahsulot: kirim, chiqim, qoldiq, inventarizatsiya |
| **Ta'minot** | rejada | Ta'minotchilar, buyurtmalar, kirim hujjatlari, qarzdorlik |
| **Savdo** | rejada | Mijozlar, zakazlar, jo'natma, debitorlik |
| **Kassa** | rejada | Kirim/chiqim, kun yopish, hisobotlar |
| **Maosh** | rejada | Xodim, davomat, ishbay hisob, to'lov |

Ishlab chiqarish moduli maosh uchun poydevorni allaqachon yozib boradi:
`flow_log` da kim, qaysi bo'limda, nechta dona qilgani turadi — ishbay
maosh aynan shundan hisoblanadi.

---

# Ishlab chiqarish moduli

## Ierarxiya

```
TSEX  →  BO'LIM  →  (mahsulot marshruti)
```

| Tsex | Bo'limlar |
|---|---|
| **Korpus** | Arra · Rover · Press · Freza · Zborka · Shkurka · Kromka · Prisadka |
| **Bo'yoqlash** *(umumiy)* | Astar sepish 1 · Astar shkurka · Astar sepish 2 · Aboy · Grunt sepish · Grunt shkurka · Rang sepish · Lak · Palirovka |
| **Qadoqlash** | Oyna qo'yish · Qadoqlash |
| **Stul** | Rover · Zborka · Shkurka · Qoplash · Qadoqlash |

## Ikki asosiy prinsip

### 1 · Marshrutli oqim

Qat'iy konveyer emas. Har SKU o'z marshrutiga ega: ayrim fasonlar Aboy,
Palirovka yoki Oyna qo'yish bo'limlariga kirmaydi. Marshrut kodga emas, bazaga
yozilgan (`route_templates` + `product_route_skip`), shuning uchun yangi fason
qo'shish uchun kod o'zgartirish shart emas.

### 2 · Umumiy tsex

Bo'yoqlash tsexi **ikkala yo'nalishni** xizmat qiladi — korpus mebel ham, stul
ham. U yo'nalishga bog'lanmagan (`shops.line_id = NULL`), navbati esa manba
yo'nalish kesimida hisoblanadi (`v_shared_load`).

Stul oqimi bo'yoqlashdan keyin **Stul tsexiga qaytadi** (Qoplash → Qadoqlash).
Operator smenani tanlamaydi — tizim uni mahsulot yo'nalishidan aniqlaydi.

## Sahifalar

| Sahifa | Kim uchun | Huquq |
|---|---|---|
| `/zavod.html` | Nima qayerda, qachon keyingi tsexga o'tadi, qachon omborga kiradi | `production.view` |
| `/dashboard.html` | Reja/fakt, bottleneck, komplektlilik, umumiy tsex yuklamasi, Pareto | `production.view` |
| `/terminal.html` | Tsex planshetlari: dona, brak, to'xtash, kamera partiyasi | `production.entry` |

## Muddat qanday hisoblanadi

Oqim liniyasida partiya bo'limlardan ketma-ket emas, quvur (pipeline) bo'lib
o'tadi:

```
MAX(qty / rate)   -- eng tor bo'lim butun partiyani o'tkazish vaqti
+ SUM(1 / rate)   -- bitta dona quvurdan o'tish vaqti
```

`rate` ikki manbadan: **fakt** (oxirgi 14 kundagi real o'rtacha, ustuvor) yoki
**reja** (`sections.capacity_per_day`, ishga tushish davri uchun). Ikkalasi ham
yo'q bo'lsa muddat ko'rsatilmaydi va panel buni ochiq aytadi.

## Uchta o'lchov

| O'lchov | Nima ko'rsatadi | Qayerda |
|---|---|---|
| **WIP / navbat** | Bottleneck qaysi bo'limda | `v_wip`, `v_shop_wip` |
| **Umumiy tsex yuklamasi** | Bo'yoqlash quvvatini qaysi yo'nalish yeyapti | `v_shared_load` |
| **Komplektlilik** | Omborda nechta **to'liq to'plam** bor | `v_set_completeness`, `v_set_blockers` |

Komplektlilik — eng muhimi. "500 dona ishlab chiqarildi" degani "40 to'plam
sotish mumkin" degani emas: bitta pozitsiya yetishmasa to'plam jo'natilmaydi va
bu oddiy dona hisobida ko'rinmaydi.

## Detalirovka uchun qoldirilgan joy

Bugun kuzatuv **SKU darajasida**. Detalirovka tayyor bo'lgach **detal
darajasiga** tushirish mumkin, schema tayyor:

| Joy | Nima uchun |
|---|---|
| `product_parts` | Detal ro'yxati: raqam, nom, material, o'lcham, dona/mahsulot |
| `product_parts.route_template_id` | Detal butun mahsulotdan boshqa yo'ldan yurishi mumkin |
| `flow_log.part_id` | Qaysi detal o'tgani. Hozir NULL — yozuv SKU ga tegishli |
| `set_items` | To'plam tarkibi: to'plam → pozitsiyalar |

`part_id` NULL bo'lsa yozuv SKU darajasida qoladi, ya'ni detalirovka
bosqichma-bosqich kiritilishi mumkin — hammasi birdan emas.

## Ishga tushirish

```bash
npm install
for f in core core-seed production production-seed production-sku; do
  psql "$DATABASE_URL" -f erp/sql/$f.sql
done
DATABASE_URL=... npm run erp        # -> http://localhost:3000
```

`.env`: `DATABASE_URL`, `HR_BOT_TOKEN` (Mini App imzosi uchun),
ixtiyoriy `PORT`, `SESSION_DAYS`, `PGSSL=off` (lokal Postgres uchun).

Demo PIN: `0000` admin · `5555` direktor · `1111`–`4444` tsex ustalari ·
`6666` operator.

## Joriy qilish tartibi

**1-faza — ishga tushirishdan oldin.** To'plam tarkibini kiritish (`set_items`)
— komplektlilik hisoboti shusiz ishlamaydi. Fasonlarning real marshrutlarini
biriktirish. Kamera sig'imi va siklini (`chambers`) to'ldirish. Muddat bashorati
birinchi kundan ishlashi uchun `sections.capacity_per_day` ga taxminiy quvvatni
kiritish. **Normani (`route_steps.norma_min`) bo'sh qoldiring.**

**2-faza — 1-oy.** Faqat ma'lumot yig'iladi, faqat tsex chegaralarida
(`shops.track_sections = false`). 24 ta bo'limni birdan o'lchash — ma'lumot
kiritilmay qolishining eng keng tarqalgan sababi.

**3-faza — 2-3-oy.** Real fakt asosida `norma_min` to'ldiriladi. Bottleneck
aniqlangan tsexda `track_sections = true` qilinadi.

**4-faza.** Ombor va ta'minot modullari, keyin savdo, kassa, maosh.

## Hali qilinmagan

- **Xodim boshqaruvi UI** — rol biriktirish hozir faqat SQL orqali
  (`worker_roles`). `admin.users` huquqi bor, sahifa yo'q.
- **Telegram tugma** — xodimlarga `workers.tg_id` kiritilmagan, shuning
  uchun Mini App va bot xabarlari hali hech kimga bormaydi.
- **Bot jarayoni** — `notify.sendPending()` tayyor, uni chaqiruvchi bot
  jarayoni yozilmagan (`hr-bot.js` ga o'xshash).
- **Audit** — jadval va `audit()` yordamchisi tayyor, ishlab chiqarish
  modulida hali chaqirilmagan (pul tegadigan modullarda majburiy bo'ladi).
- **To'plam tarkibi va detalirovka** — jadvallar bo'sh, yuqoriga qarang.
- **HTTPS va rate limit** — ishlab chiqarish serveriga qo'yishdan oldin
  reverse proxy (nginx/Caddy) orqali.
