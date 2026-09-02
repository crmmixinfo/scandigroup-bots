/**
 * ONIX — Google Sheets qabul qiluvchi skript
 *
 * Bu fayl Node emas, GOOGLE SHEETS ichida ishlaydi.
 *
 * O'rnatish:
 *   1. Google Sheets da yangi jadval oching
 *   2. Kengaytmalar (Extensions) > Apps Script
 *   3. Ichidagi hamma narsani o'chirib, shu faylni to'liq nusxalab qo'ying
 *   4. Pastdagi SECRET ni o'zingiznikiga almashtiring
 *      (.env dagi ONIX_SHEETS_SECRET bilan bir xil bo'lsin)
 *   5. Joylashtirish (Deploy) > Yangi joylashtirish (New deployment)
 *      Turi: Veb-ilova (Web app)
 *      Kim nomidan: Men (Me)
 *      Kim kira oladi: Havolasi bor har kim (Anyone with the link)
 *   6. Chiqqan havolani nusxalab, .env ga ONIX_SHEETS_URL qilib yozing
 *
 * Skriptni keyin o'zgartirsangiz — yana Deploy bosib, mavjud
 * joylashtirishni yangilang, aks holda eski versiya ishlab turaveradi.
 */

// !!! Buni o'zgartiring — .env dagi ONIX_SHEETS_SECRET bilan bir xil bo'lsin
var SECRET = 'BU-YERGA-MAXFIY-SOZ';

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return fail('Bo\'sh so\'rov');

    var data = JSON.parse(e.postData.contents);

    // Havola sirdan chiqib ketsa ham begona yozolmasin
    if (String(data.secret || '') !== SECRET) return fail('Maxfiy so\'z to\'g\'ri kelmadi');
    if (!data.sheet) return fail('Varaq nomi ko\'rsatilmagan');

    var book = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = book.getSheetByName(data.sheet) || book.insertSheet(data.sheet);

    // Birinchi bo'lak — varaqni tozalab, sarlavhani qo'yamiz
    if (data.reset) {
      sheet.clear();
      if (data.header && data.header.length) {
        sheet.getRange(1, 1, 1, data.header.length).setValues([data.header])
             .setFontWeight('bold').setBackground('#f1f3f4');
        sheet.setFrozenRows(1);
      }
    }

    var rows = data.rows || [];
    if (rows.length) {
      // Qatorlar turli uzunlikda bo'lishi mumkin — eng uzuniga tenglashtiramiz
      var width = 0;
      for (var i = 0; i < rows.length; i++) width = Math.max(width, rows[i].length);
      var maxCols = sheet.getMaxColumns();
      if (width > maxCols) sheet.insertColumnsAfter(maxCols, width - maxCols);

      for (var j = 0; j < rows.length; j++) {
        while (rows[j].length < width) rows[j].push('');
      }

      var start = sheet.getLastRow() + 1;
      var need = start + rows.length - 1;
      if (need > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), need - sheet.getMaxRows());
      sheet.getRange(start, 1, rows.length, width).setValues(rows);
    }

    // Oxirgi bo'lak — ortiqcha bo'sh qatorlarni olib tashlaymiz
    if (data.done) {
      var used = Math.max(sheet.getLastRow(), 1);
      if (sheet.getMaxRows() > used + 1) sheet.deleteRows(used + 1, sheet.getMaxRows() - used - 1);
      if (sheet.getLastColumn() > 0) sheet.autoResizeColumns(1, sheet.getLastColumn());
    }

    return ok({ sheet: data.sheet, rows: rows.length });
  } catch (err) {
    return fail(String(err));
  }
}

// Havola ishlayotganini brauzerda tekshirish uchun
function doGet() {
  return ok({ message: 'ONIX qabul qiluvchi ishlayapti' });
}

function ok(extra) {
  var body = { ok: true };
  for (var k in extra) body[k] = extra[k];
  return ContentService.createTextOutput(JSON.stringify(body))
                       .setMimeType(ContentService.MimeType.JSON);
}

function fail(message) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: message }))
                       .setMimeType(ContentService.MimeType.JSON);
}
