require('dotenv').config();
const path = require('path');
const express = require('express');
const { db } = require('./db');
const auth = require('./auth');

const app = express();
app.use(express.json());
// Sahifa va skriptlar keshlanmasin: yangi versiya chiqqanda xodim brauzerni
// tozalab o'tirmasligi kerak. Rasm va shrift keshlanaveradi.
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/.test(filePath))
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  },
}));

// Har so'rovda sessiya o'qiladi; huquq tekshiruvi modul yo'llarida.
app.use(auth.authenticate);
app.use('/api/auth', auth.router);

// ────────────────────────────────────────────────────────────────── MODULLAR
// Yangi modul qo'shish: modules/<nom>.js da express.Router yozib, shu yerda
// ulanadi. Huquqlar sql/core-seed.sql da allaqachon mavjud.
app.use('/api', require('./modules/production'));
app.use('/api/admin', require('./modules/admin'));
app.use('/api/units', require('./modules/units'));
app.use('/api/catalog', require('./modules/catalog'));
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

// Qaysi versiya ishlayotganini brauzerdan ko'rish uchun: /health ni ochib
// commit raqamiga qarash kifoya. "Deploy o'tdimi yoki brauzer eskisini
// ko'rsatyaptimi" degan savol shu bilan yopiladi.
// Railway commit SHA sini o'zi qo'yadi; lokalda bo'lmasa 'local' turadi.
const VERSION = process.env.RAILWAY_GIT_COMMIT_SHA
             || process.env.RENDER_GIT_COMMIT
             || process.env.GIT_COMMIT || 'local';
const STARTED = new Date().toISOString();

app.get('/health', async (_req, res) => {
  const info = {
    version: VERSION.slice(0, 7),
    started: STARTED,
    // Jurnal ustunlari shu ro'yxatdan chiqadi — brauzerda eski jadval
    // ko'rinsa, bu yerdan yangi ustunlar bor-yo'qligi bilinadi.
    columns: ['rang', 'mato', 'lak', 'qadoqlash', 'tm_ombor'],
  };
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, ...info });
  } catch (e) {
    res.status(503).json({ ok: false, ...info, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;

// Serverga qo'yishda migratsiyani qo'lda ishga tushirish noqulay — ERP_AUTO_MIGRATE=1
// bo'lsa server ko'tarilishidan oldin o'zi bajaradi. SQL fayllar idempotent,
// shuning uchun har qayta ishga tushishda takrorlanishi xavfsiz.
(async () => {
  if (process.env.ERP_AUTO_MIGRATE === '1') {
    try {
      const { migrate } = require('./migrate');
      const stat = await migrate({ quiet: true });
      console.log('Migratsiya bajarildi:', JSON.stringify(stat));
    } catch (e) {
      console.error('Migratsiya xatosi:', e.message);
      process.exit(1);
    }
  }
  app.listen(PORT, () => console.log(`Scandi ERP → http://localhost:${PORT}`));
})();
