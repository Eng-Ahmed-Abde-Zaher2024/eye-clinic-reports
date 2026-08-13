// ============================================================
//   apps_script.js — كود Google Apps Script
//   انسخ هذا الكود كاملاً في Google Apps Script
// ============================================================
//
// خطوات الإعداد:
// 1. افتح Google Sheets جديد
// 2. من القائمة: Extensions > Apps Script
// 3. احذف الكود الموجود والصق هذا الكود
// 4. اضغط Save (Ctrl+S)
// 5. اضغط Deploy > New deployment
// 6. اختر Type: Web app
// 7. Execute as: Me
// 8. Who has access: Anyone
// 9. اضغط Deploy وانسخ الرابط (URL)
// 10. ضع الرابط في js/visitor.js و js/trace.js
// ============================================================

var SHEET_NAME = 'Visits';
var MAX_ROWS   = 5000; // أقصى عدد سجلات نحتفظ بها

/* ---- استقبال زيارة جديدة (POST) ---- */
function doPost(e) {
  try {
    var data   = JSON.parse(e.postData.contents);
    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var sheet  = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    // إنشاء الرأس عند أول مرة
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'ID','Timestamp','Page','Browser','Device',
        'Language','Screen','Referrer','LoggedIn',
        'Username','FullName','Role'
      ]);
      sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      data.id        || '',
      data.timestamp || new Date().toISOString(),
      data.page      || '',
      data.browser   || '',
      data.device    || '',
      data.language  || '',
      data.screen    || '',
      data.referrer  || '',
      data.loggedIn  ? 'YES' : 'NO',
      data.username  || '',
      data.fullName  || '',
      data.role      || ''
    ]);

    // حذف الصفوف القديمة إذا تجاوزنا الحد
    var total = sheet.getLastRow();
    if (total > MAX_ROWS + 1) {
      sheet.deleteRows(2, total - MAX_ROWS - 1);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, err: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ---- قراءة الزيارات (GET) ---- */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';

  /* --- إرجاع كل الزيارات --- */
  if (action === 'get') {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet || sheet.getLastRow() <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var rows    = sheet.getDataRange().getValues();
    var headers = rows[0].map(function(h) { return String(h).toLowerCase(); });
    var data    = rows.slice(1).map(function(row) {
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });

    // ترتيب من الأحدث للأقدم
    data.sort(function(a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }

  /* --- مسح الزيارات (مع كود تأكيد) --- */
  if (action === 'clear') {
    var secret = e.parameter.secret || '';
    var ss2    = SpreadsheetApp.getActiveSpreadsheet();
    var cfg    = ss2.getSheetByName('Config');
    var clearSecret = cfg ? cfg.getRange('B1').getValue() : '';

    if (!clearSecret || secret !== String(clearSecret)) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, err: 'Unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var sh = ss2.getSheetByName(SHEET_NAME);
    if (sh && sh.getLastRow() > 1) {
      sh.deleteRows(2, sh.getLastRow() - 1);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput('Eye Clinic Visitor Tracker v1.0')
    .setMimeType(ContentService.MimeType.TEXT);
}
