/**
 * navbar.js — Professional Responsive Navbar Logic
 * Handles mobile drawer, user info, and hamburger animation.
 */
(function () {
  "use strict";

  /* ─── Elements ─── */
  var hamburger = document.getElementById("navHamburger");
  var drawer = document.getElementById("navDrawer");
  var overlay = document.getElementById("navDrawerOverlay");
  var closeBtn = document.getElementById("navDrawerClose");

  /* ─── Open / Close helpers ─── */
  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add("open");
    overlay.classList.add("show");
    hamburger && hamburger.classList.add("open");
    document.body.style.overflow = "hidden"; // prevent scroll behind drawer
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("open");
    overlay.classList.remove("show");
    hamburger && hamburger.classList.remove("open");
    document.body.style.overflow = "";
  }

  /* ─── Event listeners ─── */
  if (hamburger) hamburger.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (overlay) overlay.addEventListener("click", closeDrawer);

  // Close on ESC
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDrawer();
  });

  // Close drawer when a link inside it is clicked (navigation)
  if (drawer) {
    drawer.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeDrawer);
    });
  }

  /* ─── Fill user info from session ─── */
  function fillUserInfo() {
    // DB might be loaded after this script — wait a tick
    if (typeof DB === "undefined" || !DB.Session) return;

    var user = DB.Session.current();
    if (!user) return;

    var name = user.fullName || user.username || "المستخدم";
    var role = user.role === "admin" ? "مدير النظام" : "موظف استقبال";
    var initial = name.charAt(0) || "م";

    // Desktop topbar
    var topbarName = document.getElementById("topbarUserName");
    if (topbarName) topbarName.textContent = name;

    // Drawer
    var drawerName = document.getElementById("drawerUserName");
    if (drawerName) drawerName.textContent = name;

    var drawerRole = document.getElementById("drawerUserRole");
    if (drawerRole) drawerRole.textContent = role;

    var drawerAvatar = document.getElementById("drawerUserAvatar");
    if (drawerAvatar) drawerAvatar.textContent = initial;

    updateSyncBadge();
  }

  /* ─── Sync Status & Last Update Time Helper ─── */
  function updateSyncBadge() {
    if (typeof DB === "undefined" || !DB.getLastSyncTime) return;
    var lastSync = DB.getLastSyncTime();
    var badges = document.querySelectorAll(".sync-badge-time, #syncBadgeTime");
    var timeStr = DB.formatSyncTime(lastSync);
    badges.forEach(function (el) {
      el.textContent = lastSync ? timeStr : "الآن";
    });

    var detailEl = document.getElementById("syncDetailedTime");
    if (detailEl && DB.formatSyncDate) {
      detailEl.textContent = DB.formatSyncDate(lastSync);
    }
  }

  // Handle Sync Button Click
  document.addEventListener("click", async function (e) {
    var btn = e.target.closest(".btn-sync-data, #btnSyncData, #btnForceSyncAdmin");
    if (!btn) return;
    e.preventDefault();

    if (typeof DB === "undefined" || !DB.syncNow) return;

    btn.classList.add("syncing");
    var syncText = btn.querySelector(".sync-text");
    var oldText = syncText ? syncText.textContent : "";
    if (syncText) syncText.textContent = "جاري الفحص...";

    try {
      await DB.syncNow();
      updateSyncBadge();

      // Trigger re-render if in admin or print page
      if (typeof renderTemplates === "function") renderTemplates();
      if (typeof renderDoctors === "function") renderDoctors();
      if (typeof renderUsers === "function") renderUsers();
      if (typeof loadClinicSettings === "function") loadClinicSettings();
      if (typeof loadTemplates === "function") loadTemplates();
      if (typeof loadDoctors === "function") loadDoctors();

      var toast = document.getElementById("toast");
      if (toast) {
        toast.textContent = "✅ تم فحص ومزامنة البيانات بنجاح (" + DB.formatSyncTime(DB.getLastSyncTime()) + ")";
        toast.classList.remove("err");
        toast.classList.add("show");
        setTimeout(function () { toast.classList.remove("show"); }, 3200);
      }
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setTimeout(function () {
        btn.classList.remove("syncing");
        if (syncText) syncText.textContent = oldText;
      }, 500);
    }
  });

  // Try immediately, and also after DOM is fully loaded (for late-bound DB)
  fillUserInfo();
  window.addEventListener("load", function () {
    fillUserInfo();
    updateSyncBadge();
  });
  document.addEventListener("DOMContentLoaded", function () {
    setTimeout(function () {
      fillUserInfo();
      updateSyncBadge();
    }, 100);
  });
})();
