/* ============================================================
   access_control.js — نظام التحكم بالوصول والقائمة السوداء/البيضاء
   يعمل تلقائياً في كل الصفحات لحماية الموقع وعرض شاشة الاشتراك
   ============================================================ */

const AccessControl = (() => {
  const STORAGE_KEY = 'eyeclinic_access_control';

  // الإعدادات الافتراضية
  const defaultConfig = {
    enabled: true,
    mode: 'blacklist', // 'blacklist' أو 'whitelist'
    blacklist: [],     // قوائم الحظر (أسماء المستخدمين / المعرفات / الأجهزة)
    whitelist: [],     // قائمة المسموح لهم فقط
    subscriptionPhone: '01126611570',
    priceText: '100 ج.م شهرياً عبر انستا باي (InstaPay)',
    customNotice: 'تواصل مع إدارة النظام لتفعيل حسابك بعد التحويل.'
  };

  function getConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaultConfig, ...JSON.parse(raw) } : defaultConfig;
    } catch (_) {
      return defaultConfig;
    }
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (_) {}
  }

  // الحصول على معرف الفريد للجهاز/المستخدم الحالي
  function getClientIdentifiers() {
    const list = [];

    // 1. اسم المستخدم الحساب المسجل إن وجد
    try {
      const session = JSON.parse(localStorage.getItem('eyeclinic_session'));
      if (session && session.username) {
        list.push(session.username.toLowerCase());
      }
    } catch (_) {}

    // 2. معرف الجهاز المحلي الثابت
    let deviceId = localStorage.getItem('eyeclinic_device_id');
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      localStorage.setItem('eyeclinic_device_id', deviceId);
    }
    list.push(deviceId.toLowerCase());

    // 3. عنوان الـ IP الخاص بالعميل إن وجد
    const lastIp = localStorage.getItem('eyeclinic_last_ip');
    if (lastIp) {
      list.push(lastIp.toLowerCase());
    }

    return list;
  }

  function isBlocked() {
    // صفحة التتبع trace.html مستثناة حتى لا يُحظر المدير من إدارة الحظر
    if (/trace\.html/i.test(location.pathname)) return false;

    const cfg = getConfig();
    if (!cfg.enabled) return false;

    const identifiers = getClientIdentifiers();

    if (cfg.mode === 'blacklist') {
      // إذا كان أي معرف للعميل موجوداً في القائمة السوداء -> محظور
      return identifiers.some(id => cfg.blacklist.map(b => b.toLowerCase().trim()).includes(id));
    } else if (cfg.mode === 'whitelist') {
      // إذا لم يكن أي معرف موجوداً في القائمة البيضاء -> محظور
      return !identifiers.some(id => cfg.whitelist.map(w => w.toLowerCase().trim()).includes(id));
    }

    return false;
  }

  function renderBlockScreen() {
    const cfg = getConfig();
    
    // إنشاء الحاوية الخاصة بشاشة المنع
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

        <!-- صندوق الاشتراك -->
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
              ${cfg.priceText}
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
            ${cfg.subscriptionPhone}
          </div>
          <div style="font-size:12px; color:rgba(255,255,255,0.6); margin-top:8px; text-align:center;">
            (اضغط على الرقم لنسخه)
          </div>
        </div>

        <p style="font-size:13px; color:rgba(255,255,255,0.7); margin-bottom:20px;">
          📌 ${cfg.customNotice}
        </p>

        <a href="https://wa.me/2${cfg.subscriptionPhone}" target="_blank" style="
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

    document.body.appendChild(overlay);
    // تعطيل التمرير وتدمير التفاعلات
    document.body.style.overflow = 'hidden';
  }

  function checkAndEnforce() {
    if (isBlocked()) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderBlockScreen);
      } else {
        renderBlockScreen();
      }
    }
  }

  // تشغيل الفحص تلقائياً
  checkAndEnforce();

  return {
    getConfig,
    saveConfig,
    isBlocked,
    getClientIdentifiers,
    renderBlockScreen
  };
})();
