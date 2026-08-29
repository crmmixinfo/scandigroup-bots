# scandigroup-bots

Scandi Group uchun Telegram botlar.

| Bot | Fayl | Vazifasi |
|---|---|---|
| 💼 **ONIX** | `onix-bot.js` | Moliyaviy model: kassa daftari → pul oqimi + foyda-zarar → [ONIX.md](ONIX.md) |
| 👤 Candidate | `candidate-bot.js` | Nomzodlar uchun ariza anketasi |
| 🧑‍💼 HR | `hr-bot.js` | HR paneli va nomzodlarni ko'rib chiqish |

## Ishga tushirish

👉 **Birinchi marta ishlatyapsizmi?** [ISHGA-TUSHIRISH.md](ISHGA-TUSHIRISH.md) — qadamma-qadam, oddiy tilda.

```bash
npm install
cp .env.example .env      # kerakli tokenlarni to'ldiring

npm run onix              # ONIX moliyaviy bot
npm start                 # nomzod boti
npm run hr                # HR boti
```

Baza sxemalari: `onix-schema.sql` (ONIX), `schema.sql` (HR/nomzod).
