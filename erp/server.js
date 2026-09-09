require('dotenv').config();
const path = require('path');
const express = require('express');
const { db } = require('./db');
const auth = require('./auth');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Har so'rovda sessiya o'qiladi; huquq tekshiruvi modul yo'llarida.
app.use(auth.authenticate);
app.use('/api/auth', auth.router);

// ────────────────────────────────────────────────────────────────── MODULLAR
// Yangi modul qo'shish: modules/<nom>.js da express.Router yozib, shu yerda
// ulanadi. Huquqlar sql/core-seed.sql da allaqachon mavjud.
app.use('/api', require('./modules/production'));
// app.use('/api/warehouse',  require('./modules/warehouse'));   // xom ashyo + tayyor mahsulot
// app.use('/api/purchasing', require('./modules/purchasing'));  // ta'minotchilar
// app.use('/api/sales',      require('./modules/sales'));       // mijozlar, sotuv
// app.use('/api/cash',       require('./modules/cash'));        // kassa
// app.use('/api/payroll',    require('./modules/payroll'));     // maosh

// Foydalanuvchiga qaysi modullar ochiq — front shunga qarab menyu chizadi
app.get('/api/modules', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Kirish talab qilinadi' });
  const has = (p) => req.user.permissions.includes(p);
  res.json([
    { code: 'production', name: 'Ishlab chiqarish', ready: true,
      open: has('production.view') || has('production.entry') },
    { code: 'warehouse',  name: 'Ombor',            ready: false, open: has('warehouse.view') },
    { code: 'purchasing', name: "Ta'minot",         ready: false, open: has('purchasing.view') },
    { code: 'sales',      name: 'Savdo va mijozlar',ready: false, open: has('sales.view') },
    { code: 'cash',       name: 'Kassa',            ready: false, open: has('cash.view') },
    { code: 'payroll',    name: 'Maosh',            ready: false, open: has('payroll.view') },
  ].filter((m) => m.open));
});

app.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Scandi ERP → http://localhost:${PORT}`));
