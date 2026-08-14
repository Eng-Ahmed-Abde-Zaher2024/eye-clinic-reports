/* ============================================================
   access_control.js — نظام التحكم بالوصول والقائمة السوداء/البيضاء
   يعمل تلقائياً في كل الصفحات لحماية الموقع وعرض شاشة الاشتراك
   ============================================================ */

const AccessControl = (() => {
  const STORAGE_KEY = 'eyeclinic_access_control';

  // الإعدادات الافتراضية
  const defaultConfig = {
    enabled: true,
    mode: 'blacklist',
    blacklist: [],
    whitelist: [],
    subscriptionPhone: '01126611570',
    priceText: '100 ج.م شهرياً عبر انستا باي (InstaPay)',
    customNotice: 'تواصل مع إدارة النظام لتفعيل حسابك بعد التحويل.'
  };

  // ── localStorage فقط للـ fallback (لو الشبكة وقعت) ──
  function getLocalConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaultConfig, ...JSON.parse(raw) } : defaultConfig;
    } catch (_) {
      return defaultConfig;
    }
  }

  // هذا هو getConfig العام — يرجع الكاش المحلي للقراءة السريعة
  function getConfig() {
    return getLocalConfig();
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (_) {}
  }

  // الحصول على معرف الفريد للجهاز/المستخدم الحالي
  function getClientIdentifiers() {
    const list = [];

    try {
      const session = JSON.parse(localStorage.getItem('eyeclinic_session'));
      if (session && session.username) {
        list.push(session.username.toLowerCase());
      }
    } catch (_) {}

    let deviceId = localStorage.getItem('eyeclinic_device_id');
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      localStorage.setItem('eyeclinic_device_id', deviceId);
    }
    list.push(deviceId.toLowerCase());

    const lastIp = localStorage.getItem('eyeclinic_last_ip');
    if (lastIp) {
      list.push(lastIp.toLowerCase());
    }

    return list;
  }

  function isBlockedByConfig(cfg) {
    if (!cfg || cfg.enabled === false) return false;
    const identifiers = getClientIdentifiers().map(i => String(i).toLowerCase().trim());
    if (identifiers.length === 0) return false;

    if (cfg.mode === 'blacklist') {
      const bList = (cfg.blacklist || []).map(b => String(b).toLowerCase().trim());
      return identifiers.some(id => bList.includes(id));
    } else if (cfg.mode === 'whitelist') {
      const wList = (cfg.whitelist || []).map(w => String(w).toLowerCase().trim());
      return !identifiers.some(id => wList.includes(id));
    }
    return false;
  }

  function isBlocked() {
    if (/trace\.html/i.test(location.pathname)) return false;
    return isBlockedByConfig(getLocalConfig());
  }

  function renderBlockScreen() {
    if (document.getElementById('accessBlockOverlay')) return;
    const cfg = getLocalConfig();

    const overlay = document.createElement('div');
    overlay.id = 'accessBlockOverlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 999999;
      background: linear-gradient(135deg, #0b1740 0%, #12245e 50%, #0d1b48 100%);
      color: #ffffff; font-family: 'Tajawal', 'Cairo', sans-serif;
      display: flex; align-items: center; justify-content: center;
      padding: 20px; text-align: center; direction: rtl;
    `;

    overlay.innerHTML = `
      <div style="
        background: rgba(255, 255, 255, 0.07);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 24px;
        padding: 40px 30px;
        max-width: 480px; width: 100%;
        box-shadow: 0 30px 70px rgba(0,0,0,0.5);
        animation: blockFadeIn 0.4s ease;
      ">
        <div style="font-size: 60px; margin-bottom: 16px;">🚫</div>
        <h2 style="font-family:'Cairo',sans-serif; font-size:24px; font-weight:800; color:#fff; margin-bottom:10px;">
          الوصول مقتصر على المشتركين
        </h2>
        <p style="color: rgba(255,255,255,0.75); font-size:14px; line-height:1.6; margin-bottom:24px;">
          عذراً، هذا الجهاز / الحساب غير مفعّل لاستخدام نظام تقارير العيادة.
        </p>

        <div style="
          background: rgba(30, 143, 213, 0.15);
          border: 1px dashed rgba(99, 196, 238, 0.4);
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 24px;
          text-align: right;
        ">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
            <span style="font-size:13px; color:#63c4ee; font-weight:700;">💳 قيمة الاشتراك الشهري:</span>
            <span style="background:#f5820c; color:#fff; font-weight:800; padding:4px 12px; border-radius:20px; font-size:13px;">
              ${cfg.priceText || '100 ج.م شهرياً عبر انستا باي (InstaPay)'}
            </span>
          </div>
          <div style="font-size:14px; color:#fff; margin-bottom:8px;">
            📲 <strong>الدفع عبر انستا باي (InstaPay):</strong>
          </div>
          <div style="
            background: rgba(0,0,0,0.3);
            border-radius: 10px;
            padding: 10px;
            text-align: center;
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 2px;
            color: #63c4ee;
            font-family: monospace;
            user-select: all;
          ">
            ${cfg.subscriptionPhone || '01126611570'}
          </div>
          <div style="font-size:12px; color:rgba(255,255,255,0.6); margin-top:8px; text-align:center;">
            (اضغط على الرقم لنسخه)
          </div>
        </div>

        <p style="font-size:13px; color:rgba(255,255,255,0.7); margin-bottom:20px;">
          📌 ${cfg.customNotice || 'تواصل مع إدارة النظام لتفعيل حسابك بعد التحويل.'}
        </p>

        <a href="https://wa.me/2${cfg.subscriptionPhone || '01126611570'}" target="_blank" style="
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; padding: 14px;
          background: #25D366; color: #fff; text-decoration: none;
          font-weight: 800; font-size: 15px; border-radius: 12px;
          box-shadow: 0 8px 20px rgba(37, 211, 102, 0.3);
          transition: transform 0.15s;
        ">
          💬 تواصل عبر واتساب للتفعيل
        </a>
      </div>
      <style>
        @keyframes blockFadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
    `;

    function mount() {
      if (document.body && !document.getElementById('accessBlockOverlay')) {
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount);
    } else {
      mount();
    }
  }

  function removeBlockScreen() {
    var overlay = document.getElementById('accessBlockOverlay');
    if (overlay) {
      overlay.parentNode.removeChild(overlay);
      document.body.style.overflow = '';
    }
  }

  // ================================================================
  // fetchFromServer: يجلب الـ config من Apps Script عبر POST
  //   ✅ POST لا يتعمله cache أبداً على عكس GET
  //   ✅ السيرفر هو المصدر الوحيد للحقيقة
  //   ✅ localStorage فقط fallback لو الشبكة وقعت
  // ================================================================
  function fetchFromServer(onDone) {
    var DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbxWYh4bXsx6CQUB1O4WpS9aj9gaKieDxgGYtv6kLQ3JlBi0Jrg9XOQw_5lupUqV8slpWA/exec';
    var scriptUrl = (typeof VISITOR_SCRIPT_URL !== 'undefined' && VISITOR_SCRIPT_URL &&
                     VISITOR_SCRIPT_URL !== 'YOUR_APPS_SCRIPT_URL_HERE')
                  ? VISITOR_SCRIPT_URL
                  : (localStorage.getItem('eyeclinic_script_url') || DEFAULT_URL);

    if (!scriptUrl) { if (onDone) onDone(null); return; }

    // ── POST بدل GET ← بيتجاوز الـ CDN cache تماماً ──
    fetch(scriptUrl + '?action=getConfig', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'getConfig', t: Date.now() })
    })
      .then(function(r) { return r.text(); })
      .then(function(text) {
        try {
          var serverCfg = JSON.parse(text);
          if (serverCfg && typeof serverCfg === 'object' && serverCfg.mode) {
            // حفظ في localStorage كـ fallback فقط
            saveConfig(serverCfg);
            if (onDone) onDone(serverCfg);
            return;
          }
        } catch (_) {}
        // لو الـ parse فشل — استخدم الكاش المحلي
        if (onDone) onDone(null);
      })
      .catch(function () {
        // الشبكة وقعت — fallback للكاش المحلي
        if (onDone) onDone(null);
      });
  }

  function applyServerDecision(serverCfg) {
    // لو السيرفر رد بـ config صالح → استخدمه مباشرة
    // لو السيرفر فشل (null) → استخدم الكاش المحلي كـ fallback
    var cfg = serverCfg || getLocalConfig();
    var blocked = isBlockedByConfig(cfg);

    if (blocked) {
      renderBlockScreen();
    } else {
      removeBlockScreen();
    }
  }

  function checkAndEnforce() {
    if (/trace\.html/i.test(location.pathname)) return;

    // ======================================================
    // ① فحص سريع من localStorage للاستجابة الفورية
    //    مجرد "hint" مبدئي — السيرفر هو الفيصل الحقيقي
    // ======================================================
    if (isBlocked()) {
      renderBlockScreen();
    }

    // ======================================================
    // ② اجلب الـ config من السيرفر عبر POST (بدون cache)
    //    قرار السيرفر هو النهائي ويطغى على الكاش المحلي
    // ======================================================
    fetchFromServer(function(serverCfg) {
      applyServerDecision(serverCfg);
    });
  }

  // ======================================================
  // ③ فحص دوري كل 10 ثوانٍ من السيرفر مباشرة
  //    يضمن استجابة شبه فورية لأي تغيير حظر/رفع حظر
  // ======================================================
  (function startPeriodicCheck() {
    if (/trace\.html/i.test(location.pathname)) return;
    setInterval(function() {
      fetchFromServer(function(serverCfg) {
        applyServerDecision(serverCfg);
      });
    }, 10000); // كل 10 ثوانٍ
  })();

  // تشغيل الفحص تلقائياً
  checkAndEnforce();

  return {
    getConfig,
    saveConfig,
    isBlocked,
    getClientIdentifiers,
    renderBlockScreen,
    removeBlockScreen
  };
})();

