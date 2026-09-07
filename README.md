# scandigroup-bots

Telegram botlar to'plami.

| Bot | Fayl | Vazifasi |
|---|---|---|
| Candidate bot | `candidate-bot.js` | Nomzod anketasi (uz/ru) |
| HR bot | `hr-bot.js` | HR panel, nomzodlar statistikasi |
| **Savdo boti** | `sales-bot.js` | **ZELTA Premium savdo bo'limi — oylik plan / fakt hisoboti** |

---

## Savdo boti (sales-bot.js)

Admin plan va kunlik faktni kiritadi — bot savdo bo'limi xodimlariga avtomatik hisobot yuboradi.

### Jadval (Asia/Tashkent)

| Vaqt | Kimga | Nima |
|---|---|---|
| Har kuni **09:00** | Barcha xodimlar | Shaxsiy kartochka: oylik plan, bajarilgan summa, %, qolgan summa, kunlik kerakli temp |
| Har kuni **09:00** | Admin + rahbar | Bo'lim bo'yicha umumiy jadval |
| Har kuni **19:00** | Admin + rahbar | Kunlik reyting: har bir xodim, %, bugungi savdo, bo'lim jami |

Jadvalni `.env` dagi `CRON_MORNING` / `CRON_EVENING` orqali o'zgartirish mumkin.

### Hisobot ichidagi ko'rsatkichlar

Har bir hisobotda (shaxsiy va bo'lim kesimida) quyidagilar chiqadi:

| Ko'rsatkich | Formula | Nima uchun |
|---|---|---|
| Bajarilish % | `fakt / oylik plan` | Umumiy holat |
| **Kunlik indeks** | `fakt / (oylik plan × o'tgan kun / oy kuni)` | O'tgan kunlarga proporsional planga nisbatan. **100% = grafik bo'yicha ketyapti**, 60% = jiddiy orqada |
| **Oy oxiri prognozi** | `(fakt / o'tgan kun) × oy kuni` | Joriy temp saqlansa oy oxirida qancha bo'ladi + plandan farqi |
| Kunlik kerak | `qolgan summa / qolgan kun` | Planni yopish uchun bugungi maqsad |

Baholash: 🟢 ≥ 100% · 🟡 90–99% · 🔴 < 90%.

**Muhim nuans:** ertalabki 09:00 hisobotda bugungi kun *tugagan kunlar* qatoriga qo'shilmaydi
(fakt hali kiritilmagan) — indeks va prognoz faqat yopilgan kunlar bo'yicha hisoblanadi.
19:00 reytingida esa bugungi kun ham hisobga olinadi. Shu tufayli indeks sun'iy ravishda
pasayib ketmaydi.

### Rollar

| Rol | Huquqlar |
|---|---|
| `admin` | Plan/fakt kiritadi, xodim qo'shadi, hisobot yuboradi |
| `head` | Rahbar — reyting va bo'lim jadvalini oladi |
| `seller` | Sotuvchi — faqat o'z hisobotini oladi |

### Admin buyruqlari

```
/xodim_qosh <tg_id> <rol> <F.I.Sh>   # /xodim_qosh 123456789 seller Aliyev Vali
/xodim_ochir <tg_id>
/xodimlar                            # aktiv xodimlar ro'yxati
/plan                                # xodimni tugmadan tanlab, oylik plan qo'yish
/plan <tg_id> <summa> [YYYY-MM]      # /plan 123456789 120mln
/fakt                                # xodimni tugmadan tanlab, bugungi savdoni kiritish
/fakt <tg_id> <summa> [YYYY-MM-DD]   # /fakt 123456789 4.5mln
/hisobot                             # bo'lim jadvalini hozir ko'rish
/yubor hammaga                       # shaxsiy hisobotlarni hozir yuborish
/yubor reyting                       # rahbarlarga reytingni hozir yuborish
```

Summa formatlari: `120000000`, `120 000 000`, `120mln`, `4.5mln`, `800k`, `12ming`.

Fakt kunlik kiritiladi va oylik fakt shu kunlarning yig'indisi bo'ladi. Bir kunning summasi qayta
kiritilsa — eskisi yangisiga almashadi (dublikat bo'lmaydi).

### Xodim buyruqlari

```
/start   # rol va status
/men     # o'z plan/fakt holati
/myid    # Telegram ID (adminga yuborish uchun)
```

### O'rnatish

```bash
npm install
psql "$DATABASE_URL" -f schema.sql   # ixtiyoriy — bot ishga tushganda jadvallarni o'zi yaratadi
cp .env.example .env                 # tokenlarni to'ldiring
npm run sales
```

`.env` kalitlari: `SALES_BOT_TOKEN`, `DATABASE_URL`, `SUPER_ADMIN_ID`, `COMPANY_NAME`,
`TZ_NAME`, `CRON_MORNING`, `CRON_EVENING`.

Birinchi ishga tushirishda `SUPER_ADMIN_ID` egasi avtomatik admin bo'ladi — u `/xodim_qosh`
orqali qolgan xodimlarni qo'shadi.
