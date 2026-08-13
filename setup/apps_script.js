// ============================================================
//   apps_script.js — كود Google Apps Script v2.3
//   انسخ هذا الكود كاملاً في Google Apps Script
//   ثم: Deploy > Manage deployments > تعديل > إصدار جديد > نشر
// ============================================================

var SHEET_NAME = 'Visits';
var MAX_ROWS   = 5000;

var HEADERS = [
  'ID','Timestamp','Page','Browser','Device',
  'Language','Screen','Referrer','LoggedIn',
  'Username','FullName','Role','IP','DeviceID','DeviceName'
];

/* ---- إصلاح / إنشاء رأس الجدول تلقائياً ---- */
function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return;
  }
  var lastCol    = sheet.getLastColumn();
  var headerVals = sheet.getRange(1, 1, 1, Math.max(lastCol, HEADERS.length)).getValues()[0];
  var headerLow  = headerVals.map(function(h) { return String(h).toLowerCase().trim(); });

  if (headerLow.indexOf('ip') === -1) sheet.getRange(1, 13).setValue('IP');
  if (headerLow.indexOf('deviceid') === -1) sheet.getRange(1, 14).setValue('DeviceID');
  if (headerLow.indexOf('devicename') === -1) sheet.getRange(1, 15).setValue('DeviceName');
  sheet.getRange(1, 1, 1, Math.max(lastCol, 15)).setFontWeight('bold');
}

/* ---- حفظ إعدادات الحظر/السماح في الشيت (POST saveConfig) ---- */
function doPost(e) {
  var action = (e && e.parameter && e.parameter.action) || '';

  if (action === 'saveConfig') {
    try {
      var ss2   = SpreadsheetApp.getActiveSpreadsheet();
      var cfgSh = ss2.getSheetByName('Config') || ss2.insertSheet('Config');
      cfgSh.getRange('A1').setValue(e.postData.contents);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, err: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

/* ---- استقبال زيارة جديدة (POST) ---- */
// (visit record)
  try {
    var data   = JSON.parse(e.postData.contents);
    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var sheet  = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    // إصلاح / إنشاء الرأس تلقائياً
    ensureHeaders(sheet);

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
      data.role      || '',
      data.ip        || data.IP || '',
      data.deviceId  || data.deviceid || data.DeviceID || '',
      data.deviceName|| data.devicename || ''
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

  /* --- قراءة إعدادات الحظر/السماح --- */
  if (action === 'getConfig') {
    var ss3   = SpreadsheetApp.getActiveSpreadsheet();
    var cfgSh = ss3.getSheetByName('Config');
    var raw   = cfgSh ? String(cfgSh.getRange('A1').getValue()) : '';
    if (!raw || raw === 'undefined') {
      raw = JSON.stringify({ mode: 'blacklist', blacklist: [], whitelist: [],
                             subscriptionPhone: '01126611570',
                             priceText: '100 ج.م شهرياً عبر انستا باي (InstaPay)',
                             customNotice: 'تواصل مع إدارة النظام لتفعيل حسابك بعد التحويل.' });
    }
    return ContentService
      .createTextOutput(raw)
      .setMimeType(ContentService.MimeType.JSON);
  }

  /* --- مسح الزيارات (مباشر بدون كود سري) --- */
  if (action === 'clear') {
    var ss2 = SpreadsheetApp.getActiveSpreadsheet();
    var sh  = ss2.getSheetByName(SHEET_NAME);
    if (sh && sh.getLastRow() > 1) {
      sh.deleteRows(2, sh.getLastRow() - 1);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, cleared: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput('Eye Clinic Visitor Tracker v2.3')
    .setMimeType(ContentService.MimeType.TEXT);
}

