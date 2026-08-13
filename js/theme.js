/* =========================================================
   theme.js — محرك التبديل وحفظ الثيمات (Default / Pink Rose)
   ========================================================= */

(function () {
  const THEME_KEY = "eyeclinic_theme";

  // تطبيق الثيم فوراً قبل الـ render لمنع الـ Flash
  const savedTheme = localStorage.getItem(THEME_KEY) || "default";
  document.documentElement.setAttribute("data-theme", savedTheme);

  window.ThemeManager = {
    get() {
      return localStorage.getItem(THEME_KEY) || "default";
    },

    set(themeName) {
      localStorage.setItem(THEME_KEY, themeName);
      document.documentElement.setAttribute("data-theme", themeName);
      this.updateToggleButtonUI();
    },

    toggle() {
      const current = this.get();
      const next = current === "pink" ? "default" : "pink";
      this.set(next);
    },

    updateToggleButtonUI() {
      const current = this.get();
      const $btns = $(".btn-theme-toggle");
      if (!$btns.length) return;

      if (current === "pink") {
        $btns.html(`
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-left:4px;"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          Classic Mode
        `).attr("title", "Switch to Classic Mode");
      } else {
        $btns.html(`
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-left:4px;"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
          Rose Eye
        `).attr("title", "Switch to Rose Eye");
      }
    }
  };

  // عند تجهز الصفحة
  if (typeof $ !== "undefined") {
    $(function () {
      window.ThemeManager.updateToggleButtonUI();
      $(document).on("click", ".btn-theme-toggle", function (e) {
        e.preventDefault();
        window.ThemeManager.toggle();
      });
    });
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      window.ThemeManager.updateToggleButtonUI();
    });
  }
})();
