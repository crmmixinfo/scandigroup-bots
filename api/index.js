/* Vercel serverless kirish nuqtasi.
   Statik bo'lmagan har so'rov shu yerga tushadi, Express uni yo'llarga taqsimlaydi.
   Bu yerda listen() YO'Q — serverless'da doimiy port ochilmaydi.
   Vazifalar taqsimoti (vercel.json):
     · erp/public → statika, CDN'dan beriladi, funksiya uyg'onmaydi
     · qolgan hamma so'rov → shu funksiya (rewrites fayl tizimidan keyin)
     · baza migratsiyasi → deploy paytida bir marta:
       package.json → "vercel-build": "node erp/migrate.js"              */
module.exports = require('../erp/app');
