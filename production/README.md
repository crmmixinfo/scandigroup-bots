# Ishlab chiqarish monitoringi

Brauzer orqali ishlaydigan mebel ishlab chiqarish monitoringi. Stack repo bilan bir xil:
Node.js + PostgreSQL, frontend — statik HTML (build talab qilmaydi, tsex planshetlarida
kiosk rejimda ochiladi).

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

Bu qat'iy konveyer emas. Har SKU o'z marshrutiga ega: ayrim fasonlar Aboy, Palirovka
yoki Oyna qo'yish bo'limlariga kirmaydi. Marshrut kodga emas, bazaga yozilgan:

```
route_templates + route_steps  →  marshrut shabloni
product_route_skip             →  bitta SKU uchun istisno
```

Yangi fason qo'shish uchun kod o'zgartirish shart emas.

### 2 · Umumiy tsex

Bo'yoqlash tsexi **ikkala yo'nalishni** xizmat qiladi — korpus mebel ham, stul ham.
Shuning uchun u yo'nalishga bog'lanmagan (`shops.line_id = NULL`, `is_shared = true`),
navbati esa manba yo'nalish kesimida hisoblanadi (`v_shared_load`).

Stul oqimi bo'yoqlashdan keyin **Stul tsexiga qaytadi** (Qoplash → Qadoqlash).
Marshrut tartibi `route_steps.sort` da yozilgani uchun bu muammo tug'dirmaydi.

Operator smenani tanlamaydi: umumiy tsexda u ikkala yo'nalish mahsulotini ishlaydi,
tizim smenani **mahsulot yo'nalishidan** aniqlaydi (`resolveShift`).

## Uchta o'lchov, uchta maqsad

| O'lchov | Nima ko'rsatadi | Qayerda |
|---|---|---|
| **WIP / navbat** | Bottleneck qaysi bo'limda | `v_wip`, `v_shop_wip` |
| **Umumiy tsex yuklamasi** | Bo'yoqlash quvvatini qaysi yo'nalish yeyapti | `v_shared_load` |
| **Komplektlilik** | Omborda nechta **to'liq to'plam** bor | `v_set_completeness`, `v_set_blockers` |
| **Pareto** | Brak va prostoyning asosiy sabablari | dashboard API, davr bo'yicha |

Komplektlilik — eng muhimi. "500 dona ishlab chiqarildi" degani "40 to'plam sotish mumkin"
degani emas. Bitta pozitsiya yetishmasa to'plam jo'natilmaydi va bu oddiy dona hisobida
ko'rinmaydi. `v_set_blockers` aynan qaysi pozitsiya bloklab turganini ko'rsatadi.

## Fayllar

| Fayl | Nima |
|---|---|
| `schema.sql` | Jadvallar va hisobot view'lari |
| `seed.sql` | Tsexlar, bo'limlar, marshrut shablonlari, brak/prostoy kodlari |
| `seed-sku.sql` | 17 fason, 32 SKU (mehmonxona, yotoqxona, stol, stul) |
| `api.js` | Express API |
| `public/terminal.html` | Tsex planshet terminali |
| `public/dashboard.html` | Rahbariyat paneli |

## Ishga tushirish

```bash
npm install
psql "$DATABASE_URL" -f production/schema.sql
psql "$DATABASE_URL" -f production/seed.sql
psql "$DATABASE_URL" -f production/seed-sku.sql
DATABASE_URL=... npm run production      # -> http://localhost:3000
```

`.env`: `DATABASE_URL`, ixtiyoriy `PORT`, `PGSSL=off` (lokal Postgres uchun).

| Sahifa | Kim uchun |
|---|---|
| `/terminal.html` | Tsex planshetlari — PIN, dona qayd etish, brak, to'xtash, kamera partiyasi |
| `/dashboard.html` | Rahbariyat — reja/fakt, bottleneck, komplektlilik, umumiy tsex yuklamasi |

Demo PIN: `1111` `2222` `3333` `4444` (`seed.sql` dagi test xodimlari).

## Joriy qilish tartibi

**1-faza — ishga tushirishdan oldin.** To'plam tarkibini kiritish (`set_items`) —
komplektlilik hisoboti shusiz ishlamaydi, `seed-sku.sql` oxirida to'liq misol bor.
Fasonlarning real marshrutlarini biriktirish. Kamera sig'imi va quritish siklini
(`chambers`) to'ldirish. **Normani (`route_steps.norma_min`) bo'sh qoldiring.**

**2-faza — 1-oy.** Faqat ma'lumot yig'iladi, faqat tsex chegaralarida
(`shops.track_sections = false`): Korpus chiqishi, Bo'yoqlash chiqishi, Qadoqlash
chiqishi, Stul chiqishi. 24 ta bo'limni birdan o'lchash — ma'lumot kiritilmay
qolishining eng keng tarqalgan sababi.

**3-faza — 2-3-oy.** Real fakt asosida `norma_min` to'ldiriladi. Bottleneck aniqlangan
tsexda `track_sections = true` qilinadi va bo'limlar alohida o'lchana boshlaydi.
Bo'yoqlash umumiy resurs bo'lgani uchun bottleneck deyarli aniq o'sha yerda chiqadi.

**4-faza.** Ombor (LDSP, kromka, furnitura, mato), tannarx, individual zakazlar moduli.

## Hali qilinmagan

- **Auth** — hozir PIN + `localStorage`. Tsex terminali uchun yetarli, lekin ofis
  paneli ochiq. Telegram Mini App `initData` tekshiruvi qo'shilishi kerak
  (`hr-bot.js` dagi `MINI_APP_URL` mexanizmi bilan bir xil).
- **To'plam tarkibi** — `set_items` bo'sh. Har to'plam qaysi pozitsiyalardan iborat
  ekani kiritilishi kerak; marshrutdan pozitsiyalar o'tadi, to'plamning o'zi emas.
- **Fason marshrutlari** — barcha stol va stullarga hozir `L1-FULL` / `L2-FULL`
  biriktirilgan. Qaysi fason qaysi bo'limga kirmasligi aniqlangach tuzatiladi.
- **`track_sections` bayrog'i** hozir faqat spravochnikda; terminalda filtrlash
  2-fazada qo'shiladi.
- **Telegram alert** — smena rejasi 80% dan past bo'lganda yoki prostoy 30 daqiqadan
  oshganda xabar yuborish.
