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

## 2. Rollar va kim nimani ko'radi

| Rol | Nima qiladi | Nima ko'radi |
|---|---|---|
| `cashier` | Kirim, chiqim, hodimlarga pul berish, konvertatsiya | Kassa qoldiqlari |
| `staff` | **Faqat o'z qo'lidagi puldan**, **faqat bugungi kun bilan** | **Faqat o'ziniki** — kunlik hisoboti, qoldig'i, yozuvlari |
| `manager` | Hech nima kiritmaydi | **Hammasini** — barcha hisobotlar, qoldiqlar, daftar |
| `admin` | Hammasi | Hammasi + sozlamalar |

### Hodim uchun chegara

Hodim ko'radi:
- 💸 o'z xarajatini kiritish oynasi
- 👛 **o'z** podotchyot qoldig'i
- 📋 **faqat o'zi kiritgan** operatsiyalar

Hodim ko'rmaydi: kompaniya kassalari qoldig'i, kassa daftari, pul oqimi,
foyda-zarar, boshqa hodimlarning yozuvlari va qoldiqlari.

Cheklov faqat tugmalarni yashirish bilan emas — **serverda** tekshiriladi:

- menyu matnini qo'lda yozsa ham ruxsat so'raladi;
- soxta tugma yuborib boshqa hisobni tanlab bo'lmaydi — hodim faqat o'z
  podotchyot hisobidan sarflay oladi, kompaniya kassasidan emas;
- hisobot callback'ini qo'lda yuborsa hech narsa qaytmaydi.

### Hodim faqat bugungi kun bilan kiritadi

Kechagi xarajatni ertaga yozib qo'yish kassa daftarini chalkashtiradi va
nazoratni yo'qotadi. Shuning uchun hodimdan sana **umuman so'ralmaydi** —
avtomat bugun qo'yiladi:

```
📅 Sana: 01.09.2026 (bugun)
```

Bu bir qadamni ham tejaydi. Soxta tugma yoki qo'lda yozilgan sana ham rad
etiladi. Kassir va admin esa avvalgidek istalgan sanani tanlaydi.

Bularning har biri testlar bilan qoplangan.

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

## 6. Kategoriyalar — uch pog'ona

```
GURUH  ›  KATEGORIYA  ›  PODKATEGORIYA
```

Uchinchi pog'ona **shart emas** — ba'zi kategoriyalar bo'linmaydi:

```
Onix xarajatlar uchun  ›  Komunal to'lovlar  ›  Elektr energiya    (3 pog'ona)
Yangiobod              ›  Soliq                                    (2 pog'ona)
Ta'sischidan           ›  Humoyun aka                              (2 pog'ona)
```

Operatsiya **har doim eng pastki tugunga (bargga)** yoziladi. Baza triggeri
uchta narsani kafolatlaydi:

- guruhga (1-daraja) hech qachon yozilmaydi;
- ostida podkategoriyasi bor kategoriyaga yozilmaydi — bo'lmasa jami ikki
  marta hisoblanardi;
- podkategoriyasiz kategoriyaga bemalol yoziladi.

Botda ham shunday: podkategoriyasi bo'lmagan kategoriya tanlansa, ortiqcha
qadam so'ralmaydi — to'g'ridan-to'g'ri summaga o'tadi.

Hisobotlar mavjud pog'onalar kesimida jamlanadi: guruh jami → kategoriya
jami → (bo'lsa) podkategoriya tafsiloti.

### Ro'yxatni tahrirlash

Manba — `onix/kategoriyalar.txt`. Bitta qator = bitta kategoriya yo'li:

```
KIRIM

Onix bussines center > Ijara to'lovi > Mijoz A, Mijoz B, Mijoz C
Ta'sischidan > Humoyun aka

CHIQIM

Onix xarajatlar uchun > Komunal to'lovlar > Elektr energiya, Suv, Gaz, Chiqindi, Internet
Yangiobod > Soliq, Marketing
Strong Well > Xujjatlar uchun
```

Ikkinchi qatordagi `Yangiobod > Soliq, Marketing` — bitta guruh ostida ikkita
podkategoriyasiz kategoriya. Vergul oxirgi pog'onani ajratadi.

```bash
npm run onix:categories -- --dry   # avval tekshiring — bazaga yozmaydi
npm run onix:categories            # yuklash
```

Qayta yuklash xavfsiz: mavjudlari takrorlanmaydi, faqat yangilari qo'shiladi.

### Yoki to'g'ridan-to'g'ri Telegramdan

```
/cats                                    — daraxt, ID lari bilan
/add_group expense Onix xarajatlar uchun
/add_cat   87 Komunal to'lovlar
/add_sub   92 Elektr energiya, Suv, Gaz  — vergul bilan bir yo'la
/del_cat   92                            — istalgan darajani yashiradi
```

Kategoriya hech qachon o'chmaydi — `active = false` bo'ladi, shuning uchun
eski operatsiyalar hisobotlarda joyida qoladi.

Nomini o'zgartirish ham xavfsiz: `/rename_cat <id> <yangi nom>`. ID
o'zgarmagani uchun eski yozuvlar yangi nom bilan ko'rinadi, hech narsa
yo'qolmaydi.

---

### Bo'sh hisoblar taklif qilinmaydi

Pul chiqadigan qadamlarda — **chiqim**, **hodimga pul berish**,
**konvertatsiya** — qoldig'i nol bo'lgan hisob ro'yxatda ko'rinmaydi.
Bo'sh kassadan pul chiqmaydi, uni har safar o'qib o'tishning hojati yo'q.

Uchta istisno bor:

| Holat | Nega ko'rsatiladi |
|---|---|
| **Kirim** | Bo'sh kassaga pul kirishi butunlay normal |
| **Boshlang'ich qoldiq** | U aynan bo'sh hisob uchun kiritiladi |
| **Manfiy qoldiq** | Nol emas — bu xato belgisi, yashirish zarar qiladi |

Hech qayerda pul bo'lmasa hammasi ko'rsatiladi: yangi o'rnatilgan tizimda
foydalanuvchi tanlashga hisob topmay qolmasin.

Tugmalar ham, kelgan javobni tekshirish ham bitta ro'yxatdan
(`allowedSourceAccounts`) oziqlanadi — shuning uchun soxta tugma bosib
yashirilgan hisobni tanlab bo'lmaydi.

## 7. Boshlang'ich qoldiq

Tizimni ishga tushirganda kassalarda allaqachon pul bo'ladi. Uni kiritish:

**⚙️ Sozlamalar → ⚖️ Boshlang'ich qoldiq kiritish** → kassa → summa → sana.

Ro'yxatda **kassalar ham, hodimlar qo'lidagi pul ham** chiqadi — tizim ishga
tushganda hodimda allaqachon avans bo'lishi mumkin:

```
💵 Naqd (sum)                    💳 Plastik (sum)
💵 Naqd ($)                      💳 Plastik ($)
👛 Asadbek Abduqahhorov (sum)    👛 Burxon (sum)
```

Har biri uchun alohida kiritiladi. Faqat admin va kassir kirita oladi —
hodim o'z qoldig'ini o'zi belgilay olmaydi.

### Nima uchun alohida tur

Boshlang'ich qoldiqni oddiy kirim sifatida yozib bo'lmaydi — u foyda-zararga
daromad bo'lib kirib, birinchi oy foydasini yolg'on ko'rsatardi. Shuning uchun
`opening` degan alohida tur bor:

| | Ta'siri |
|---|---|
| Kassa qoldig'i | ✅ qo'shiladi |
| Pul oqimi | alohida qator — kirim sifatida sanalmaydi |
| Foyda-zarar | ❌ umuman kirmaydi |

Sana odatda hisob yuritishni boshlagan kun bo'ladi. Shu sanadan keyingi
davrlarda u avtomat «boshlang'ich qoldiq» bo'lib o'tadi.

### Yozuvni bekor qilish

```
/del 12 xato kiritildi
```

Raqamni kassa daftaridan olasiz — har yozuv tagida `#12` turadi.
Sabab yozish majburiy.

Tugma ataylab qo'yilmagan: bir bosishda yozuv yo'qolishi xavfli, va sabab
yozilmay qolardi.

| Kim | Nimani bekor qila oladi |
|---|---|
| admin | har qanday yozuvni |
| cashier, staff | faqat o'zi kiritganini |

Bekor qilingan yozuv daftardan ham, qoldiqdan ham chiqib ketadi. Bazada esa
kim, qachon va nima sababdan bekor qilgani saqlanib qoladi — hech narsa
izsiz yo'qolmaydi.

---

## 8. Hisobotlar

> **Nol ko'rsatilmaydi.** Qoldiq va podotchyot hisobotlarida pul turmagan
> hisob va harakat qilmagan hodim chiqmaydi. Butun valyuta bo'sh bo'lsa —
> o'sha bo'lim ham chiqmaydi: «$ hisobda 0» degan qatorni har kuni
> o'qishning hojati yo'q. Bitta hisob qolganda `JAMI` qatori ham
> tushiriladi — u shu raqamni takrorlagan bo'lardi. Hammasi bo'sh bo'lsa
> «Hamma hisob bo'sh» deb yoziladi.

**📊 Kassa qoldig'i** — asosiy menyuda, bir bosishda. Eng ko'p kerak
bo'ladigan ma'lumot bo'lgani uchun hisobotlar ichiga yashirilmagan.
Admin, kassir va rahbar ko'radi.

Qolgan hisobotlar **📈 Hisobotlar** tugmasi ostida:

```
💹 Pul oqimi          — pul qachon harakat qilgani bo'yicha
📈 Foyda-zarar        — xarajat qaysi oyga tegishli bo'lgani bo'yicha
👤 Hodimlar           — kunlik batafsil
📋 Kassa daftari      — barcha yozuvlar
```

Bu bo'lim **faqat admin va rahbarlarga** ochiq. Kassir va hodim uni ko'ra
olmaydi — soxta so'rov yuborilsa ham serverda rad etiladi.

### 👤 Hodimlar — kim bo'yicha

Valyutadan keyin **qaysi hodim** so'raladi:

```
[ 👥 Hammasi ]
[ 👤 Asadbek Abduqahhorov ]
[ 👤 Burxon ]
[ 👤 Faxriddin ]
```

Bittasi tanlansa faqat o'sha hodim chiqadi, «Hammasi» tanlansa hammasi
va oxirida jami.

### Hodimning o'z hisoboti

Hodim menyusida **📊 Mening hisobotim** tugmasi bor — kun tanlaydi va
o'zining o'sha kungi to'liq manzarasini ko'radi (so'm va dollar).

Boshqa hodimni ko'ra olmaydi: hisobot **sessiyadagi tanlovdan emas,
foydalanuvchining o'zidan** quriladi, shuning uchun soxta so'rov ham
o'ziniki bilan qaytadi.

### Davrni tanlash

| Hisobot | Davr |
|---|---|
| 💹 Pul oqimi | Bugun · Kecha · Bu hafta · Bu oy · O'tgan oy · **📅 Kun tanlash** · 📅 Oy tanlash |
| 📈 Foyda-zarar | oy (yil bo'yicha o'tish bilan) |
| 👤 Hodimlar | Bugun · Kecha · **📅 Kun tanlash** |
| 📋 Kassa daftari | pul oqimi bilan bir xil |

**📅 Kun tanlash** kalendar ochadi — `‹` va `›` bilan oyni almashtirib,
istalgan kunni bosasiz:

```
‹    Iyul 2026    ›
 1  2  3  4  5  6  7
 8  9 10 11 12 13 14
…
```

### Nima chiqadi

**💹 Pul oqimi** (`paid_at` bo'yicha) — boshlang'ich qoldiq, kirim va chiqim
guruh → kategoriya kesimida, valyuta konvertatsiyasi, sof oqim, yakuniy
qoldiq, har kassaning qoldig'i, hodimlar kesimida chiqim.

**📈 Foyda-zarar** (`period` bo'yicha) — daromad va xarajat guruh →
kategoriya → podkategoriya kesimida, foyda/zarar, rentabellik, o'tgan oy
bilan solishtirish, va kelgusi davrlarga yozilganlar eslatmasi.

**👤 Hodimlar** — bitta kun so'ralganda batafsil, bir necha kun
so'ralganda qisqa jamlanma:

```
👤 Asadbek Abduqahhorov
Kun boshida             1 200 000 so'm

OLINDI                 +3 000 000 so'm
  ← Naqd (sum)          3 000 000 so'm
     Xo'jalik uchun

SARFLANDI                −800 000 so'm
  · Salfetka              420 000 so'm
       Onix xarajatlar uchun › Xo'jalik xarajatlari
       💬 Metrodan
  · Sovun                 380 000 so'm
──────────────────────────────────────
KUN OXIRIDA             3 400 000 so'm
```

**📋 Kassa daftari** — yozuvlar sahifalab, `paid_at ≠ period` bo'lganda
qatorda `→ P&L: Fev 2026` belgisi bilan.

### Bekor qilish va tiklash

`/del 42 sabab` yozuvni bekor qiladi: u hisobotlardan, qoldiqdan va
foyda-zarardan chiqadi, lekin bazadan **o'chmaydi** — kim, qachon va
nega bekor qilgani saqlanadi.

`/tikla 42` uni qaytaradi. Bekor qilish ham xato bo'lishi mumkin.
Tiklashda `deleted_at` tozalanadi (yozuv yana hisobga kiradi), ammo
`deleted_by` va `delete_reason` joyida qoladi — «bir marta bekor
qilingan edi» degani daftardan yo'qolmaydi. Qo'shimcha `restored_at`
va `restored_by` kim tiklaganini yozadi.

Ikkalasida ham qoida bir xil: admin har qanday yozuvni, hodim faqat
o'zinikini. Google Sheets dagi «Holati» ustuni uchta qiymat oladi —
bo'sh, `ha` (bekor qilingan), `tiklangan`.

Davr tanlangandan keyin **hisob so'raladi**: hamma hisoblar yoki bittasi
(naqd sum, plastik sum, naqd $, plastik $, hodim podotchyoti). Kassir
kuniga o'nlab yozuv kiritadi — «plastikdan nima chiqdi» degan savolga
hammasini varaqlab javob topish og'ir.

Ro'yxat ostidagi `🗂 Plastik (sum)` tugmasi bilan hisobni boshqasiga
almashtirish mumkin — davrni qayta tanlash shart emas.

---

## 9. Kunlik avtomat hisobot

Har kuni **soat 09:00** da **admin va rahbarlarga** kechagi kun bo'yicha
yuboriladi. Hodimlar va kassirga yuborilmaydi.

Ikki xil xabar keladi, har biri alohida — telefonda o'qish oson bo'lsin
va kerakligini alohida uzatish mumkin bo'lsin:

**1. 📋 KASSA** — kassaga kirgan va chiqqan pul, hodimlarga berilgani

```
📋 KASSA
📅 31.08.2026, dushanba

⚖️ KUN BOSHIDA
 💵 Naqd (sum)         12 500 000 so'm
 💳 Plastik (sum)      30 000 000 so'm
 JAMI                  42 500 000 so'm

📥 KIRIM
 · mijoz nomi          18 000 000 so'm
      Onix bussines center › Ijara to'lovi
      Plastik (sum) · Mijoz A
Jami kirim            +23 000 000 so'm

📤 CHIQIM
 · Elektr energiya      4 200 000 so'm
      Onix xarajatlar uchun › Komunal to'lovlar
      Plastik (sum)
Jami chiqim           −12 200 000 so'm

👛 HODIMLARGA BERILDI
 · Asadbek Abduqahhorov 3 000 000 so'm
      Naqd (sum) dan · Xo'jalik uchun
Jami berildi           −3 000 000 so'm

──────────────────────────────────────
⚖️ KUN OXIRIDA
 💵 Naqd (sum)          6 500 000 so'm
 💳 Plastik (sum)      48 000 000 so'm
 JAMI                  54 500 000 so'm
```

Kassa daftari sahifasidek: kun boshidagi qoldiq, kun ichidagi harakatlar,
kun oxiridagi qoldiq. Hodimlar hamyoni bu yerga kirmaydi — ular o'z
xabarlarida.

**2. 👤 Har bir hodim — alohida xabar**

```
👤 ASADBEK ABDUQAHHOROV — KUNLIK HISOBOT
📅 31.08.2026 · 🇺🇿 so'm

Kun boshida                     0 so'm

OLINDI                 +3 000 000 so'm
  ← Naqd (sum)          3 000 000 so'm
     Xo'jalik uchun

SARFLANDI                −800 000 so'm
  · Salfetka              420 000 so'm
       Onix xarajatlar uchun › Xo'jalik xarajatlari
       💬 Metrodan
──────────────────────────────────────
KUN OXIRIDA             2 200 000 so'm
```

Qoldiqlar har ikkala xabarning ichida turadi (kassa uchun kun boshi va
kun oxiri, hodim uchun ham shunday), shuning uchun alohida «qoldiqlar»
xabari yuborilmaydi.

Pul oqimi va foyda-zarar ham bu yerga **kirmaydi** — ular so'ralganda,
📈 Hisobotlar bo'limida ko'riladi.

### Sozlash

`.env` faylida:

```
ONIX_DAILY_TIME=09:00     # soat (24 soatlik format)
ONIX_DAILY=off            # butunlay o'chirish
```

### Bot o'chiq bo'lsa nima bo'ladi

Hisobot yo'qolmaydi. Bot aniq soatga timer qo'ymaydi — har 10 daqiqada
tekshiradi: «bugungi hisobot yuborilganmi?». Shuning uchun MacBook uxlab
tursa, internet uzilsa yoki bot kechroq yoqilsa ham, hisobot kechikib
bo'lsa-da yetib boradi. Yuborilgan kun bazada belgilanadi — ikki marta
ketmaydi.

### Qo'lda ko'rish

```
/kunlik                 — kechagi kun
/kunlik 29.08.2026      — tanlangan kun
/hodim                  — hodimlarning bugungi batafsili
/hodim 29.08.2026       — tanlangan kun
```

---

### Qo'lda tarqatish

| Buyruq | Kimga boradi |
|---|---|
| `/kunlik` | Faqat so'ragan odamga (admin, rahbar) |
| `/yubor` | **Hamma oluvchiga** — admin va rahbarlarga (faqat admin) |

`/yubor 03.09.2026` — boshqa kun bo'yicha. Sana ko'rsatilmasa kechagi kun.

Javobda kimga yetgani ro'yxat bilan ko'rsatiladi. Kechagi kun tarqatilgan
bo'lsa ertalabki avtomat yuborish uni takrorlamaydi.

### Yetkazilmasa — yo'qolmaydi

Kun «yuborilgan» deb faqat kimdir hisobotni **haqiqatan olgandagina**
belgilanadi. Bot yonganda Telegram bilan aloqa hali tiklanmagan bo'lishi
mumkin — o'shanda hamma xabar xato ketadi. Bunday holatda kun
belgilanmaydi va 10 daqiqadan keyingi tekshiruv qayta uriniadi.

Bir qismi yetib borsa kun belgilanadi, qolganlariga yetmagani logda
yoziladi — ularga `/kunlik` bilan qo'lda yuborsa bo'ladi.

## 10. Zaxira nusxa

Baza bitta kompyuterda turadi. Disk buzilsa yoki noutbuk yo'qolsa —
hamma yozuv bilan birga ketadi. Shuning uchun har kuni bazaning to'liq
nusxasi olinadi.

### Nima olinadi

`pg_dump` bazani boshdan-oyoq bitta SQL faylga yozadi, fayl siqiladi:

```
onix-2026-09-03-0300.sql.gz
```

Ichida hamma narsa bor — jadval tuzilishi, har bir operatsiya
(o'chirilganlari ham), foydalanuvchilar, kategoriyalar, hisoblar,
ID lar va hisoblagichlar. Shu bitta fayldan baza **aynan** avvalgi
holiga qaytadi.

> **Google Sheets (yoki Excel) zaxira emas.** Sheets jadval bog'lanishlarini
> yo'qotadi, sanalarni o'z formatiga o'zgartiradi, uzun raqamlarni
> yaxlitlaydi va tahrirlanadi — bexosdan bosilgan bitta katak
> zaxirani buzadi. Sheets ko'rish uchun, `.sql.gz` tiklash uchun.

### Qayerga tushadi

Bot papkani shu tartibda tanlaydi:

1. `.env` dagi `ONIX_BACKUP_DIR`
2. topilsa — bulut papkasi ichidagi `ONIX zaxira`
3. topilmasa — loyiha ichidagi `zaxira/`

Qaysi bulut o'rnatilgan bo'lsa o'shanisi ishlatiladi — hammasining ishi
bir xil, papkaga tushgan faylni ko'taradi:

| Xizmat | Yo'l |
|---|---|
| OneDrive | `~/Library/CloudStorage/OneDrive-…`, `~/OneDrive - Kompaniya`, `%OneDrive%` |
| Google Drive | `~/Library/CloudStorage/GoogleDrive-…/My Drive`, `~/Google Drive`, `G:\My Drive` |
| iCloud Drive | `~/Library/Mobile Documents/com~apple~CloudDocs` |
| Dropbox | `~/Library/CloudStorage/Dropbox`, `~/Dropbox` |
| Yandex.Disk | `~/Yandex.Disk` |

Sozlash shart emas: xizmat o'rnatilgan bo'lsa bot papkani o'zi topadi va
ishga tushganda qaysi bulutga ko'tarilayotganini yozadi. Bulut topilmasa
ogohlantiradi — bunda ham nusxa olinaveradi, faqat kompyuterda qoladi
(va Telegramda).

Fayl avval `.part` nomi bilan yoziladi va tugagachgina o'z nomiga
o'tadi — bulut yarim faylni ko'tarmaydi.

### Telegramga ham

Nusxa adminlarga Telegramda fayl bo'lib keladi. Bu **ikkinchi, mustaqil
saqlash joyi**: kompyuter ham, Drive ham ishdan chiqsa fayl chatda
qoladi. O'chirish uchun `.env` ga `ONIX_BACKUP_TELEGRAM=off`.

### Qachon

Har kuni `ONIX_BACKUP_TIME` da (birlamchi 03:00). Kunlik hisobot bilan
bir xil mantiq: aniq soatga timer emas, har 10 daqiqada tekshirish.
Kompyuter o'sha paytda o'chiq bo'lsa nusxa yo'qolmaydi — yonganda
darhol olinadi, kuniga bir marta.

Nusxa olinmasa admin xabar oladi — zaxira jimgina buzilib yotmasin.

### Necha kun saqlanadi

Oxirgi `ONIX_BACKUP_KEEP` kunlik (birlamchi 30). Chegara fayl soni emas,
**kun** soni: bir kunda qo'lda bir necha marta nusxa olinsa ham «oxirgi
30 kun» o'z ma'nosini yo'qotmaydi.

Bir kunlik fayl ~50–200 KB. Bepul 15 GB Google hisobiga yillar davomida
yetadi.

### Qo'lda

| | |
|---|---|
| Botda | `/zaxira` — nusxa oladi va faylni chatga yuboradi (admin) |
| Terminalda | `npm run onix:zaxira` |
| Boshqa papkaga | `npm run onix:zaxira -- ~/Desktop` |

### Tiklash

```bash
gunzip -c "onix-2026-09-03-0300.sql.gz" | psql "$DATABASE_URL"
```

Fayl ichida `DROP TABLE IF EXISTS` bor — eski jadvallar tozalanib,
o'rniga nusxadagilari qo'yiladi. Bo'sh bazaga ham, ustiga ham tushadi.

### Sozlamalar

| Kalit | Birlamchi | Nima qiladi |
|---|---|---|
| `ONIX_BACKUP` | yoqiq | `off` — zaxira umuman olinmaydi |
| `ONIX_BACKUP_TIME` | `03:00` | kunlik nusxa soati |
| `ONIX_BACKUP_DIR` | bulut papkasi | papka |
| `ONIX_BACKUP_KEEP` | `30` | necha kunlik saqlansin |
| `ONIX_BACKUP_TELEGRAM` | yoqiq | `off` — fayl Telegramga yuborilmaydi |
| `ONIX_PG_DUMP` | o'zi topadi | `pg_dump` ning to'liq yo'li |

## 11. Google Sheets

Daftar to'liq jadvalga ko'chiriladi — rahbarlar va buxgalter o'zi
xohlagancha kesib ko'radi, filtr qo'yadi, Excel ga yuklab oladi.

> **Bu zaxira emas.** Sheets jadval bog'lanishlarini yo'qotadi va
> tahrirlanadi. Tiklash uchun `.sql.gz` fayl xizmat qiladi — 10-bo'limga
> qarang. Ikkalasi bir-birining o'rnini bosmaydi.

### To'rtta varaq

| Varaq | Ichida |
|---|---|
| **Operatsiyalar** | daftarning o'zi — har yozuv bitta qator, bekor qilinganlari ham |
| **Qoldiqlar** | hisoblar va hodimlar qo'lidagi pul |
| **Foyda-zarar** | kategoriyalar × oylar, `period` bo'yicha |
| **Pul oqimi** | kategoriyalar × oylar, `paid_at` bo'yicha |

Oxirgi ikkitasi bir xil ko'rinadi, lekin **boshqa sanadan** yig'iladi —
25-yanvarda to'langan fevral arendasi «Pul oqimi» da yanvar ustunida,
«Foyda-zarar» da fevral ustunida turadi.

Har varaq oxirida `JAMI DAROMAD`, `JAMI XARAJAT`, `FOYDA / ZARAR`
qatorlari bor — valyuta bo'yicha alohida.

Summalar Sheets ga **son** bo'lib boradi, matn bo'lib emas — ustiga
darhol formula yozsa bo'ladi.

«Operatsiyalar» varag'ida eng yangi yozuv tepada turadi, va har
yangilanishdan keyin sarlavhaga **filtr** qo'yiladi (qatorlar soni
o'zgargani uchun filtr qayta chiziladi — eski filtr yangi yozuvlarni
qamrab olmay qolardi).

### O'z ko'rinishingizni yasash

Jadval har safar to'liq qayta yoziladi, shuning uchun varaqning **ichida**
qo'yilgan saralash keyingi yangilanishda yo'qoladi. O'zgarmaydigan
ko'rinish kerak bo'lsa — **yangi varaq** ochib formula yozing:

```
=SORT(Operatsiyalar!A2:P; 6; FALSE)          summasi bo'yicha kamayish
=QUERY(Operatsiyalar!A:P; "select * where G='Plastik (sum)'")
```

Bunday varaqqa bot tegmaydi, lekin ma'lumot o'zi yangilanib turadi.

### Sozlash

Google Cloud, kalit fayl yoki kutubxona kerak emas. Jadvalning o'zida
kichik skript turadi, bot unga oddiy HTTPS so'rov yuboradi.

1. Google Sheets da yangi jadval oching
2. **Extensions → Apps Script**
3. Ichidagini o'chirib, `onix/tools/apps-script.gs` ni to'liq nusxalang
4. Skript boshidagi `SECRET` ni o'zingiznikiga almashtiring
5. **Deploy → New deployment → Web app**
   · Execute as: **Me** · Who has access: **Anyone with the link**
6. Chiqqan havolani `.env` ga yozing

```
ONIX_SHEETS_URL=https://script.google.com/macros/s/…/exec
ONIX_SHEETS_SECRET=…        # skriptdagi SECRET bilan bir xil
```

Skriptni keyin o'zgartirsangiz — yana **Deploy** bosib mavjud
joylashtirishni yangilang, aks holda eski versiya ishlab turaveradi.

### Qachon yangilanadi

Har `ONIX_SHEETS_MINUTES` daqiqada (birlamchi 15), lekin **faqat daftar
o'zgargan bo'lsa**: bot yozuvlar soni va oxirgi o'zgarish vaqtidan iz
oladi, iz o'zgarmasa so'rov ham yubormaydi.

Jadval har safar **to'liq qayta yoziladi** — qo'shib borilmaydi. Shunda
bekor qilingan va tuzatilgan yozuvlar ham to'g'ri ko'rinadi. 2000 qatordan
katta jadval bo'laklarga bo'lib yuboriladi.

### Qo'lda

| | |
|---|---|
| Botda | `/sheets` (admin va rahbarlar) |
| Terminalda | `npm run onix:sheets` |

### Xavfsizlik

Havola — sirning o'zi: uni bilgan har kim jadvalga yozishi mumkin edi.
Shuning uchun har so'rovda maxfiy so'z boradi va skript uni tekshiradi.
Havolani ham, maxfiy so'zni ham `.env` dan tashqariga chiqarmang.

### Sozlamalar

| Kalit | Birlamchi | Nima qiladi |
|---|---|---|
| `ONIX_SHEETS_URL` | — | Apps Script havolasi; bo'sh bo'lsa Sheets o'chiq |
| `ONIX_SHEETS_SECRET` | — | skriptdagi `SECRET` bilan bir xil |
| `ONIX_SHEETS_MINUTES` | `15` | necha daqiqada bir yangilansin (eng kami 5) |
| `ONIX_SHEETS` | yoqiq | `off` — yangilanmasin |

## 12. Terminalsiz ishga tushirish (macOS)

Har safar Terminal ochib buyruq yozish shart emas. Loyiha ichida ikkita
ikki marta bosiladigan fayl bor:

| Fayl | Nima qiladi |
|---|---|
| `onix/tools/ONIX-ishga-tushirish.command` | Terminalni o'zi ochadi va botni yoqadi |
| `onix/tools/ONIX-yangilash.command` | Yangi kodni oladi, kutubxonalarni tekshiradi, keyin botni yoqadi |

**Ish stoliga chiqarish:** faylni o'ng tugma bilan bosib
«Создать псевдоним» (Make Alias) tanlang, yorliqni ish stoliga suring.
Yorliq orqali ochilganda ham skript asl papkasini topadi.

Faylning o'zini boshqa joyga **ko'chirmang** — u o'zini loyihaga nisbatan
qidiradi. Ko'chirilgan bo'lsa tushunarli xato beradi.

Bot to'xtaganda oyna darrov yopilmaydi — xato yozuvini o'qib olish
mumkin bo'lsin.

## 13. Tokensiz sinab ko'rish

Telegram tokeni olishdan oldin butun tizimni terminalda ko'rish mumkin:

```bash
npm run onix:schema
npm run onix:categories
npm run onix:demo
```

Demo botning **haqiqiy kodini** yurgizadi — faqat tarmoqqa chiqmaydi:
har bir ekran, tugma va hisobot terminalda chiziladi. 11 qadamli ssenariy:
jamoaning username bo'yicha ulanishi, kirim kiritish, hodimga hisobdor pul
berish, hodimning o'z pulidan xarajat qilishi, podkategoriyasiz kategoriya,
kelgusi oyga yoziladigan to'lov, hodimning chegarasi, va rahbar hisobotlari.

> Demo bazadagi operatsiya, foydalanuvchi va podotchyot hisoblarini tozalaydi —
> ishlab turgan bazada ishlatmang.

---

## 14. O'rnatish

```bash
npm install
cp .env.example .env          # ONIX_BOT_TOKEN, DATABASE_URL, SUPER_ADMIN_ID to'ldiring
npm run onix:schema           # bazani tayyorlash (qayta ishga tushirsa ham xavfsiz)
npm run onix:categories       # kategoriyalarni yuklash
npm run onix:users            # jamoani yuklash
npm run onix                  # botni ishga tushirish
```

Keyin Telegramda botga `/start` yuboring — siz `SUPER_ADMIN_ID` egasisiz.

### Jamoani qo'shishning uch yo'li

Bot `@username` ni raqamli ID ga aylantira olmaydi (Telegram bunga ruxsat
bermaydi), shuning uchun uch xil qulay usul bor:

**1. Username bo'yicha — ID kerak emas** *(eng qulay)*

```
/add_user @rustam_k  cashier Rustam Karimov
/add_user @ali_v     staff   Ali Valiyev
/add_user @sardor_r  manager Sardor Rahmonov
```

Odam kutish ro'yxatiga tushadi. U botga `/start` bosgan zahoti tizim uni
username bo'yicha taniydi, haqiqiy ID bilan bog'laydi va sizga xabar beradi.
Kutayotganlarni ko'rish: `/pending`, bekor qilish: `/cancel_pending @username`.

**2. Tugma bilan tasdiqlash — hech narsa yozmasdan**

Notanish odam botga `/start` bossa, sizga uning ismi, username va ID si
**rol tugmalari bilan** keladi:

```
🆕 Yangi foydalanuvchi
Ali Valiyev · @ali_v
ID: 123456789

[💼 Kassir] [🧾 Hodim]
[👁 Rahbar] [👑 Admin]
[✖️ Rad etish]
```

Tugmani bosasiz — qo'shildi, va odamga «tasdiqlandi» xabari ketadi.

**3. Raqamli ID bo'yicha**

Odam `/myid` yozsa o'z ID sini oladi:

```
/add_user 123456789 staff Ali Valiyev
```

Har qanday usulda `staff` qo'shilsa, unga ikkita podotchyot hisobi
(sum va $) avtomat ochiladi.

---

## 15. Sozlash buyruqlari (admin)

| Buyruq | Vazifasi |
|---|---|
| `/users` | Foydalanuvchilar ro'yxati |
| `/add_user @username <rol> <Ism>` | Qo'shish — `/start` da avtomat ulanadi |
| `/add_user <id> <rol> <Ism>` | Qo'shish — darhol |
| `/pending` | Kutayotganlar ro'yxati |
| `/cancel_pending @username` | Kutish ro'yxatidan o'chirish |
| `/remove_user <id>` | O'chirish (yozuvlari daftarda qoladi) |
| `/accounts` | Hisoblar va qoldiqlar |
| `/add_account <cash\|card\|bank> <UZS\|USD> <nom>` | Yangi kassa |
| `/cats` | Kategoriya daraxti (ID lari bilan) |
| `/add_group <income\|expense> <nom>` | Yangi guruh |
| `/add_cat <guruh_id> <nom>` | Yangi kategoriya |
| `/add_sub <kategoriya_id> <nom1, nom2>` | Yangi podkategoriya(lar) |
| `/rename_cat <id> <yangi nom>` | Nomini o'zgartirish (yozuvlar saqlanadi) |
| `/del_cat <id>` | Istalgan darajani yashirish |
| `/del <id> <sabab>` | Yozuvni bekor qilish |

**Yozuvlar hech qachon o'chmaydi** — `deleted_at` bilan belgilanadi,
kim va nima sababdan bekor qilgani saqlanadi.

---

## 16. Fayllar

```
onix-bot.js          bot: menyu, kiritish sehrgari, hisobot oqimi, admin buyruqlari
onix-schema.sql      baza sxemasi + boshlang'ich kategoriyalar
onix/db.js           baza so'rovlari
onix/reports.js      pul oqimi, foyda-zarar, podotchyot hisob-kitobi
onix/views.js        hisobotlarni matn ko'rinishida chizish
onix/keyboards.js    Telegram klaviaturalari
onix/format.js       summa/sana formatlash va o'qish
onix/daily.js        kunlik avtomat hisobot
onix/backup.js       bazaning zaxira nusxasi
onix/sheets.js       Google Sheets ga chiqarish
onix/tools/apps-script.gs  Sheets ichiga qo'yiladigan skript
onix/tools/          yuklovchilar, zaxira, Sheets, ishga tushirish fayllari
onix/kategoriyalar.txt   kategoriya daraxtining manbasi — shuni tahrirlang
onix/jamoa.txt       jamoa ro'yxati — shuni tahrirlang
onix/tests/          testlar (352 ta tekshiruv)
```

## 17. Testlar

Testlar bo'sh PostgreSQL bazasini talab qiladi:

```bash
psql "$TEST_DATABASE_URL" -f onix-schema.sql
PGDATABASE=onix_test npm run onix:test
```

Testlar quyidagilarni tekshiradi: rollar bo'yicha ruxsatlar va hodim uchun
ma'lumot chegarasi (soxta tugma va qo'lda yozilgan menyu bilan urinishlar), username bo'yicha
ulanish va tugma bilan tasdiqlash, kiritish sehrgarining
har bir qadami, ikki va uch pog'onali kategoriyalar, podotchyot hisob-kitobi,
valyuta konvertatsiyasi, qoldiq nazorati, bekor qilish, zaxira nusxa olish va
undan tiklash, Google Sheets ga chiqarish, va **eng asosiysi** — yanvarda to'langan xarajat fevral
foyda-zararida chiqishi.
