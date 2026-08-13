/* =========================================================
   auth.js — حماية الصفحات وإدارة الجلسة
   ========================================================= */

/**
 * يتأكد أن هناك مستخدم مسجل دخوله بكلمة مرور صحيحة وحساب مفعّل، وإلا يعيد التوجيه لصفحة الدخول.
 * requiredRole (اختياري): "admin" لتقييد الصفحة على المدير فقط.
 */
function requireAuth(requiredRole) {
  if (typeof DB === "undefined" || !DB.Session || !DB.Session.isValid()) {
    if (typeof DB !== "undefined" && DB.Session) DB.Session.logout();
    if (!/index\.html/i.test(window.location.pathname) && window.location.pathname !== "/") {
      window.location.href = "index.html?reason=expired";
    }
    return null;
  }

  const session = DB.Session.current();
  if (requiredRole && session.role !== requiredRole) {
    window.location.href = "print.html";
    return null;
  }
  return session;
}

function logout() {
  DB.Session.logout();
  window.location.href = "index.html";
}

function renderTopbar(session) {
  const clinic = DB.Clinic.get();
  $(".topbar-clinic-name").text(clinic.clinicName || "مركز الخبراء");
  $(".topbar-user-name").text(session.fullName + " · " + roleLabel(session.role));
  if (session.role !== "admin") {
    $(".admin-only-link").remove();
  }
  $(".btn-logout").on("click", logout);
}

function roleLabel(role) {
  return role === "admin" ? "مدير" : "موظف استقبال";
}

// -------------------------------------------------------------
// فحص حي دوري في الخلفية (Live Session Monitor)
// يتم الفحص كل 10 ثوانٍ للتأكد من عدم تغيير كلمة المرور على جيت هب
// إذا تم التغيير، يتم إخراج المستخدم فوراً ودون حاجة لإعادة التحميل اليدوي
// -------------------------------------------------------------
(function startLiveSessionMonitor() {
  if (window.location.protocol === "file:") return;
  if (/index\.html/i.test(location.pathname) || /trace\.html/i.test(location.pathname)) return;

  setInterval(async function () {
    if (typeof DB !== "undefined" && DB.checkRemoteUsers) {
      await DB.checkRemoteUsers();
    }
  }, 10000); // 10 ثوانٍ
})();

