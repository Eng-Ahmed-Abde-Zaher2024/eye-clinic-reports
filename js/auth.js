/* =========================================================
   auth.js — حماية الصفحات وإدارة الجلسة
   ========================================================= */

/**
 * يتأكد أن هناك مستخدم مسجل دخوله، وإلا يعيد التوجيه لصفحة الدخول.
 * requiredRole (اختياري): "admin" لتقييد الصفحة على المدير فقط.
 */
function requireAuth(requiredRole) {
  const session = DB.Session.current();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
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
