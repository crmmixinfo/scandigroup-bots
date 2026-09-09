# Ishlab chiqarish monitoringi

Brauzer orqali ishlaydigan mebel ishlab chiqarish monitoringi. Stack repo bilan bir xil:
Node.js + PostgreSQL, frontend — statik HTML (build talab qilmaydi, tsex planshetlarida
kiosk rejimda ochiladi).

## Asosiy g'oya

Bu qat'iy konveyer emas, **marshrutli oqim (routed flow)**. Har SKU o'z marshrutiga ega:
ayrim fasonlar Aboy, Palirovka yoki Oyna qo'yish uchastkalariga kirmaydi. Shuning uchun
yo'nalish kodga emas, `route_templates` + `product_route_skip` jadvallariga yozilgan —
yangi fason qo'shish uchun kod o'zgartirish shart emas.

## Struktura

```
Liniya-1 · Korpus mebel (mehmonxona, yotoqxona, stol)
  Korpus      Arra · Rover · Press · Freza · Zborka · Shkurka · Kromka · Prisadka
  Bo'yoqlash  Astar sepish 1 · Astar shkurka · Astar sepish 2 · Aboy · Grunt sepish ·
              Grunt shkurka · Rang sepish · Lak · Palirovka
  Qadoqlash   Oyna qo'yish · Qadoqlash · Omborga topshirish

Liniya-2 · Stul
  Korpus      Rover · Zborka · Shkurka
  Bo'yoqlash  Astar sepish 1 · Astar shkurka · Astar sepish 2 · Grunt sepish ·
              Grunt shkurka · Rang · Lak
  Qadoqlash   Qoplash · Qadoqlash
```

## Uchta o'lchov, uchta maqsad

| O'lchov | Nima ko'rsatadi | Qayerda |
|---|---|---|
| **WIP / navbat** | Bottleneck qaysi uchastkada | `v_wip`, `v_department_wip` |
| **Komplektlilik** | Omborda nechta **to'liq to'plam** bor | `v_set_completeness`, `v_set_blockers` |
| **Pareto** | Brak va prostoyning asosiy sabablari | `v_defect_pareto`, `v_downtime_pareto` |

Komplektlilik — eng muhimi. "500 dona ishlab chiqarildi" degani "40 to'plam sotish mumkin"
degani emas. Bitta pozitsiya yetishmasa to'plam jo'natilmaydi va bu oddiy dona hisobida
ko'rinmaydi. `v_set_blockers` aynan qaysi pozitsiya bloklab turganini ko'rsatadi.

## Ishga tushirish

```bash
npm install
psql "$DATABASE_URL" -f production/schema.sql
psql "$DATABASE_URL" -f production/seed.sql
DATABASE_URL=... npm run production      # -> http://localhost:3000
```

`.env`: `DATABASE_URL`, ixtiyoriy `PORT`, `PGSSL=off` (lokal Postgres uchun).

| Sahifa | Kim uchun |
|---|---|
| `/terminal.html` | Tsex planshetlari — PIN bilan kirish, dona qayd etish, brak, to'xtash |
| `/dashboard.html` | Rahbariyat — reja/fakt, bottleneck, komplektlilik, Pareto |

Demo PIN: `1111` `2222` `3333` `4444` (`seed.sql` dagi test xodimlari).

## Joriy qilish tartibi

**1-faza — ishga tushirishdan oldin.** Fason, SKU va to'plam tarkibini kiritish.
Marshrut shablonlarini real fasonlarga moslash. **Normani (`route_steps.norma_min`)
bo'sh qoldiring.**

**2-faza — 1-oy.** Faqat ma'lumot yig'iladi, faqat bo'lim chegaralarida
(`departments.track_stations = false`): Korpus chiqishi, Bo'yoqlash chiqishi,
Qadoqlash chiqishi. 20 ta uchastkani birdan o'lchash — ma'lumot kiritilmay
qolishining eng keng tarqalgan sababi.

**3-faza — 2-3-oy.** Real fakt asosida `norma_min` to'ldiriladi. Bottleneck aniqlangan
bo'limda `track_stations = true` qilinadi va o'sha bo'lim ichidagi uchastkalar alohida
o'lchana boshlaydi.

**4-faza.** Ombor (LDSP, kromka, furnitura), tannarx, individual zakazlar moduli.

## Hali qilinmagan

- **Auth** — hozir PIN + `localStorage`. Tsex terminali uchun yetarli, lekin ofis
  paneli ochiq. Telegram Mini App `initData` tekshiruvi qo'shilishi kerak
  (`hr-bot.js` dagi `MINI_APP_URL` mexanizmi bilan bir xil).
- **Bo'yoqlash partiyalari** — API tayyor (`/api/paint/*`), terminal UI yo'q.
  Kamera va quritish sikli ma'lumotlari aniqlangach qo'shiladi.
- **Telegram alert** — smena rejasi 80% dan past bo'lganda yoki prostoy 30 daqiqadan
  oshganda xabar yuborish.
- **`track_stations` bayrog'i** hozir faqat spravochnikda; terminaldagi filtrlash
  2-fazada qo'shiladi.
