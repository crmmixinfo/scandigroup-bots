/* Doimiy ishlaydigan server: Railway, Render, Docker, lokal kompyuter.
   Vercel serverless uchun kirish nuqtasi boshqa — api/index.js.
   Ikkalasi ham bitta ilovani (app.js) ishlatadi.                       */
require('dotenv').config();
const app = require('./app');

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
