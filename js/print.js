/* =========================================================
   print.js — منطق صفحة إصدار وطباعة التقرير
   ========================================================= */

$(async function () {
  const session = requireAuth();
  if (!session) return;
  renderTopbar(session);

  // جلب أحدث بيانات من ملفات JSON المرفوعة على جيت هب
  await DB.init();

  // ---- تطبيق إعدادات العيادة وإخفاء/إظهار عناصر الطباعة ----
  function applyClinicSettings() {
    const clinic = DB.Clinic.get();
    $("#clinicNameEl, #footerClinicName").text(clinic.clinicName || "مركز الخبراء لطب وجراحة العيون والليزك");
    if (clinic.logo) {
      $("#watermarkImg, #headerLogo").attr("src", clinic.logo);
    }

    // إعدادات المعاينة والطباعة (للطباعة على ورق ألوان)
    // إذا كان الخيار محدداً (true): يظهر في المعاينة ويختفي عند الطباعة (hide-on-print)
    // إذا كان ملغياً (false): يختفي تماماً في المعاينة والطباعة (hidden-always)
    togglePrintElement("#headerLogo",     clinic.printLogo);
    togglePrintElement(".a4-header",      clinic.printHeader);
    togglePrintElement(".a4-footer",      clinic.printFooter);
    togglePrintElement("#watermarkImg",   clinic.printWatermark);
  }

  function togglePrintElement(selector, isPreviewOnly) {
    const $el = $(selector);
    $el.removeClass("hide-on-print hidden-always");
    if (isPreviewOnly !== false) {
      // يظهر بالمعاينة ويختفي بالطابعة (ورق ألوان)
      $el.addClass("hide-on-print");
    } else {
      // إخفاء تام من المعاينة والطباعة
      $el.addClass("hidden-always");
    }
  }

  applyClinicSettings();

  // ---- تحميل قائمة الأطباء في الـ dropdown ----
  function loadDoctors() {
    const doctors = DB.Doctors.all();
    const $sel = $("#doctorSelect").empty();
    $sel.append(`<option value="">— اختر طبيباً —</option>`);
    doctors.forEach((d) => {
      $sel.append(`<option value="${d.id}">${escapeHtml(d.name)} — ${escapeHtml(d.title)}</option>`);
    });
    applyDoctorToHeader(null);
  }

  // ---- تطبيق بيانات الطبيب على هيدر A4 ----
  function applyDoctorToHeader(doctor) {
    if (doctor && (doctor.name || doctor.title)) {
      $("#headerDoctorName").text(doctor.name || "");
      $("#headerDoctorTitle").text(doctor.title || "");
      $("#headerDoctorWrap").attr("data-empty", "false");
    } else {
      $("#headerDoctorName").text("");
      $("#headerDoctorTitle").text("");
      $("#headerDoctorWrap").attr("data-empty", "true");
    }
  }

  // ---- عند تغيير الطبيب المختار ----
  $("#doctorSelect").on("change", function () {
    const id = $(this).val();
    const doctor = id ? DB.Doctors.get(id) : null;
    applyDoctorToHeader(doctor);
  });

  let currentTemplate = null;

  function loadTemplates() {
    const templates = DB.Templates.all();
    const $sel = $("#templateSelect").empty();
    if (templates.length === 0) {
      $sel.append(`<option value="">لا توجد قوالب — أضف قالبًا من لوحة الإدارة</option>`);
      return;
    }
    templates.forEach((t) => {
      $sel.append(`<option value="${t.id}">${escapeHtml(t.name)} — ${escapeHtml(t.category || "")}</option>`);
    });
    selectTemplate(templates[0].id);
  }

  function selectTemplate(id) {
    currentTemplate = DB.Templates.get(id);
    $("#templateSelect").val(id);
    buildForm();
    renderPreview();
  }

  function buildForm() {
    const $form = $("#reportForm").empty();
    if (!currentTemplate) {
      $form.append(`<div class="empty-fields-note">اختر قالبًا لعرض الحقول الخاصة به.</div>`);
      return;
    }
    const today = new Date().toLocaleDateString("ar-EG");

    (currentTemplate.fields || []).forEach((f) => {
      const isDate = /تاريخ|date/i.test(f.key + f.label);
      const isEye = /عين|eye/i.test(f.key + f.label);

      if (isDate) {
        // حقل تاريخ → date picker (كليندر)
        const todayISO = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        $form.append(`
          <div class="field">
            <label>${escapeHtml(f.label)} <span style="color:var(--danger)">*</span></label>
            <input type="date" class="dyn-input date-input" data-key="${escapeHtml(f.key)}" value="${todayISO}" required />
          </div>
        `);
      } else if (isEye) {
        $form.append(`
          <div class="field">
            <label>${escapeHtml(f.label)} <span style="color:var(--danger)">*</span></label>
            <select class="dyn-input" data-key="${escapeHtml(f.key)}" required>
              <option value="">— اختر —</option>
              <option value="اليمنى">اليمنى</option>
              <option value="اليسرى">اليسرى</option>
              <option value="كلتا العينين">كلتا العينين</option>
              <option value="لا يوجد">لا يوجد</option>
            </select>
          </div>
        `);
      } else {
        $form.append(`
          <div class="field">
            <label>${escapeHtml(f.label)} <span style="color:var(--danger)">*</span></label>
            <input type="text" class="dyn-input" data-key="${escapeHtml(f.key)}" value="" required placeholder="مطلوب..." />
          </div>
        `);
      }
    });

    $form.on("input change", ".dyn-input", function () {
      if ($(this).val() && $(this).val().trim() !== "") {
        $(this).removeClass("field-invalid");
      }
      renderPreview();
    });
  }

  function renderPreview() {
    if (!currentTemplate) {
      $("#reportTitle").text("—");
      $("#reportBody").html("");
      return;
    }
    $("#reportTitle").text(currentTemplate.name);

    const values = {};
    $(".dyn-input").each(function () {
      const raw = $(this).val() || "";
      if ($(this).hasClass("date-input") && raw) {
        // تحويل YYYY-MM-DD إلى تنسيق عربي مقروء
        const parts = raw.split("-");
        if (parts.length === 3) {
          const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          values[$(this).data("key")] = d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
        } else {
          values[$(this).data("key")] = raw;
        }
      } else {
        values[$(this).data("key")] = raw;
      }
    });

    let html = currentTemplate.bodyHtml || "";
    (currentTemplate.fields || []).forEach((f) => {
      const re = new RegExp("{{\\s*" + escapeRegex(f.key) + "\\s*}}", "g");
      const val = values[f.key];
      const safeVal = (val !== undefined && val !== "") ? escapeHtml(val) : `<span style="color:#888;">[${escapeHtml(f.label)}]</span>`;
      html = html.replace(re, safeVal);
    });

    // إزالة أي فقرات تحتوي على متغيّرات تم حذفها من قائمة حقول القالب (مثل {{treatment}})
    html = html.replace(/<p>[^<]*\{\{\s*[\w-]+\s*\}\}[^<]*<\/p>/gi, "");
    // تنظيف أي أقواس متغيّرات متبقية لم تُستبدل
    html = html.replace(/\{\{\s*[\w-]+\s*\}\}/g, "");

    $("#reportBody").html(html);
    $("#footerDate").text("تاريخ الطباعة: " + new Date().toLocaleDateString("ar-EG"));
    const clinicData = DB.Clinic.get();
    $("#footerClinicName").text(clinicData.clinicName || "مركز الخبراء لطب وجراحة العيون والليزك");
  }

  // ---- دالة التحقق الإلزامي من إدخال كافة الحقول قبل الطباعة ----
  function validatePrintForm() {
    let isValid = true;
    let $firstInvalid = null;

    // 1. التحقق من حقول التقرير المتغيّرة
    $(".dyn-input").each(function () {
      const val = $(this).val();
      if (!val || val.trim() === "") {
        $(this).addClass("field-invalid");
        if (isValid) {
          isValid = false;
          $firstInvalid = $(this);
        }
      } else {
        $(this).removeClass("field-invalid");
      }
    });

    if (!isValid) {
      if ($firstInvalid) {
        $firstInvalid.focus();
      }
      showToast("⚠️ يرجى تعبئة جميع الحقول المطلوبة قبل الطباعة", true);
    }

    return isValid;
  }

  $("#templateSelect").on("change", function () {
    selectTemplate($(this).val());
  });

  $("#printBtn").on("click", function (e) {
    e.preventDefault();
    if (!currentTemplate) {
      showToast("اختر قالبًا أولًا", true);
      return;
    }

    // التحقق من أن جميع الحقول ممتلئة
    if (!validatePrintForm()) {
      return;
    }

    window.print();
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function showToast(msg, isErr) {
    const $t = $("#toast").text(msg).removeClass("err");
    if (isErr) $t.addClass("err");
    $t.addClass("show");
    setTimeout(() => $t.removeClass("show"), 2400);
  }

  loadDoctors();
  loadTemplates();
});
