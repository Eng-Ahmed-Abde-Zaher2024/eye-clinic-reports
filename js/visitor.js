/* ============================================================
   visitor.js — تتبع الزيارات بصمت تام (الزوار لا يعرفون شيئاً)
   يرسل البيانات لـ Google Sheets عبر Apps Script
   ============================================================ */

/* ====================================================
   ⚙️  ضع رابط Apps Script بعد النشر هنا:
   ==================================================== */
var VISITOR_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxWYh4bXsx6CQUB1O4WpS9aj9gaKieDxgGYtv6kLQ3JlBi0Jrg9XOQw_5lupUqV8slpWA/exec';
/* ==================================================== */

(function () {
  // لا تسجّل صفحة التتبع نفسها
  if (/trace\.html/i.test(location.pathname)) return;

  /* ---------- كشف المتصفح ---------- */
  function detectBrowser(ua) {
    if (/Edg\//.test(ua))          return 'Edge';
    if (/OPR\/|Opera/.test(ua))    return 'Opera';
    if (/Chrome\//.test(ua))       return 'Chrome';
    if (/Firefox\//.test(ua))      return 'Firefox';
    if (/Safari\//.test(ua))       return 'Safari';
    return 'Other';
  }

  /* ---------- كشف الجهاز ---------- */
  function detectDevice(ua) {
    if (/iPad|Tablet/i.test(ua))              return 'Tablet';
    if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'Mobile';
    return 'Desktop';
  }

  /* ---------- اسم الصفحة ---------- */
  function getPage() {
    var p = location.pathname.split('/').pop();
    return p || 'index.html';
  }

  /* ---------- الجلسة الحالية ---------- */
  function getSession() {
    try { return JSON.parse(localStorage.getItem('eyeclinic_session')); }
    catch (_) { return null; }
  }

  /* ---------- الحصول على معرف الجهاز الثابت ---------- */
  function getDeviceId() {
    var devId = localStorage.getItem('eyeclinic_device_id');
    if (!devId) {
      devId = 'dev_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      localStorage.setItem('eyeclinic_device_id', devId);
    }
    return devId;
  }

  /* ---------- بناء كائن الزيارة ---------- */
  function buildEntry(ip) {
    var ua      = navigator.userAgent;
    var session = getSession();
    return {
      id:        Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      ip:        ip || '',
      deviceId:  getDeviceId(),
      page:      getPage(),
      browser:   detectBrowser(ua),
      device:    detectDevice(ua),
      language:  navigator.language || '',
      screen:    screen.width + 'x' + screen.height,
      referrer:  document.referrer || '',
      loggedIn:  !!session,
      username:  session ? (session.username || '') : '',
      fullName:  session ? (session.fullName  || '') : '',
      role:      session ? (session.role      || '') : ''
    };
  }

  /* ---------- إرسال للـ Google Sheets (بصمت) ---------- */
  function sendToSheets(entry) {
    if (!VISITOR_SCRIPT_URL || VISITOR_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') return;
    try {
      fetch(VISITOR_SCRIPT_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify(entry)
      });
    } catch (_) {}
  }

  /* ---------- حفظ احتياطي في localStorage ---------- */
  function saveLocal(entry) {
    try {
      var KEY  = 'eyeclinic_visits';
      var MAX  = 500;
      var list = JSON.parse(localStorage.getItem(KEY) || '[]');
      list.unshift(entry);
      if (list.length > MAX) list.length = MAX;
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (_) {}
  }

  /* ---------- جلب IP بالتوازي من 3 خدمات + timeout 4 ثواني ---------- */
  function fetchIpBackground(onDone) {
    var resolved = false;
    var timer    = setTimeout(function () {
      if (!resolved) { resolved = true; onDone(''); }
    }, 4000);

    var APIs = [
      { url: 'https://api.ipify.org?format=json',   key: 'ip'  },
      { url: 'https://api4.my-ip.io/ip.json',        key: 'ip'  },
      { url: 'https://api.ip.sb/geoip',              key: 'ip'  }
    ];

    APIs.forEach(function (api) {
      fetch(api.url)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!resolved && d && d[api.key] && /^[\d.]+$/.test(d[api.key])) {
            resolved = true;
            clearTimeout(timer);
            onDone(d[api.key]);
          }
        })
        .catch(function () {});
    });
  }

  /* ---------- تسجيل الزيارة ---------- */
  function record() {
    // ① إرسال فوري بـ IP محفوظ من زيارة سابقة (بدون أي انتظار)
    var cachedIp = localStorage.getItem('eyeclinic_last_ip') || '';
    var entry    = buildEntry(cachedIp);
    sendToSheets(entry);
    saveLocal(entry);

    // ② جلب IP جديد في الخلفية → حفظه فقط للزيارة القادمة
    fetchIpBackground(function (freshIp) {
      if (freshIp) localStorage.setItem('eyeclinic_last_ip', freshIp);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', record);
  } else {
    record();
  }
})();


