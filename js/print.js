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
    togglePrintElement("#headerLogo", clinic.printLogo);
    togglePrintElement(".a4-header", clinic.printHeader);
    togglePrintElement(".a4-footer", clinic.printFooter);
    togglePrintElement("#watermarkImg", clinic.printWatermark);

    // تطبيق إزاحة المحتوى لأسفل عند الطباعة
    const offset = (clinic.printOffsetTop !== undefined && clinic.printOffsetTop !== null) ? Number(clinic.printOffsetTop) : 0;
    document.documentElement.style.setProperty("--print-top-offset", offset + "mm");
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

  // ---- عند تغيير الطبيب المختار (اختياري) ----
  $("#doctorSelect").on("change", function () {
    const id = $(this).val();
    const doctor = id ? DB.Doctors.get(id) : null;
    applyDoctorToHeader(doctor);
    renderPreview(); // تحديث سطر الطبيب في بودي التقرير فوراً
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

    (currentTemplate.fields || []).forEach((f) => {
      const fieldType = (f.type || "text").toLowerCase();
      let defVal = f.defaultValue !== undefined ? f.defaultValue : (f.default !== undefined ? f.default : "");

      // إذا كانت القيمة الافتراضية مفقودة من القالب المحفوظ محلياً، جلب القيمة الأصلية الحية
      if (!defVal && currentTemplate && currentTemplate.id && DB.DEFAULT_TEMPLATES) {
        const dTpl = DB.DEFAULT_TEMPLATES.find(t => t.id === currentTemplate.id);
        if (dTpl) {
          const dField = (dTpl.fields || []).find(df => df.key === f.key);
          if (dField && (dField.defaultValue !== undefined || dField.default !== undefined)) {
            defVal = dField.defaultValue !== undefined ? dField.defaultValue : dField.default;
          }
        }
      }

      let inputHtml = "";

      if (fieldType === "date") {
        const todayISO = new Date().toISOString().slice(0, 10);
        const val = defVal || todayISO;
        inputHtml = `<input type="date" class="dyn-input date-input" data-key="${escapeHtml(f.key)}" value="${escapeHtml(String(val))}" required />`;

      } else if (fieldType === "textarea") {
        inputHtml = `<textarea class="dyn-input" data-key="${escapeHtml(f.key)}" rows="3" placeholder="مطلوب..." required>${escapeHtml(String(defVal))}</textarea>`;

      } else if (fieldType === "number") {
        inputHtml = `<input type="number" class="dyn-input" data-key="${escapeHtml(f.key)}" value="${escapeHtml(String(defVal))}" required placeholder="مطلوب..." />`;

      } else if (fieldType === "select") {
        const rawOpts = (f.options || "").split(",").map(o => o.trim()).filter(Boolean);
        const optionsHtml = rawOpts.length
          ? rawOpts.map(o => `<option value="${escapeHtml(o)}" ${String(o) === String(defVal) ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")
          : `<option value="يمنى">يمنى</option><option value="يسرى">يسرى</option><option value="كلتا العينين">كلتا العينين</option>`;
        inputHtml = `<select class="dyn-input" data-key="${escapeHtml(f.key)}" required>
          <option value="">— اختر —</option>
          ${optionsHtml}
        </select>`;

      } else {
        // text (default / legacy)
        inputHtml = `<input type="text" class="dyn-input" data-key="${escapeHtml(f.key)}" value="${escapeHtml(String(defVal))}" required placeholder="مطلوب..." />`;
      }

      $form.append(`
        <div class="field">
          <label>${escapeHtml(f.label)} <span style="color:var(--danger)">*</span></label>
          ${inputHtml}
        </div>
      `);
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
        // تحويل YYYY-MM-DD إلى تنسيق رقمي YYYY/MM/DD
        const parts = raw.split("-");
        if (parts.length === 3) {
          values[$(this).data("key")] = `${parts[0]}/${parts[1]}/${parts[2]}`;
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
      let safeVal;
      if (val !== undefined && val !== "") {
        // تحويل الأسطر الجديدة في نصوص textarea إلى <br> وتمييز المتغير في المعاينة
        const formatted = escapeHtml(val).replace(/\n/g, "<br>");
        safeVal = `<span class="tpl-val">${formatted}</span>`;
      } else {
        safeVal = `<span class="tpl-placeholder">[${escapeHtml(f.label)}]</span>`;
      }
      html = html.replace(re, safeVal);
    });

    // إزالة أي فقرات تحتوي على متغيّرات تم حذفها من قائمة حقول القالب
    html = html.replace(/<p>[^<]*\{\{\s*[\w-]+\s*\}\}[^<]*<\/p>/gi, "");
    // تنظيف أي أقواس متغيّرات متبقية لم تُستبدل
    html = html.replace(/\{\{\s*[\w-]+\s*\}\}/g, "");
    // إزالة الفقرات الفاضية أو المحتوية على رموز فقط
    html = html.replace(/<p[^>]*>\s*[.،:؛\-–—\s]*\s*<\/p>/gi, "");

    $("#reportBody").html(html);

    // ---- بطاقة الطبيب في نهاية التقرير (تظهر في المعاينة والطباعة) ----
    const doctorId = $("#doctorSelect").val();
    const doctor = doctorId ? DB.Doctors.get(doctorId) : null;
    if (doctor && doctor.name) {
      const titleHtml = doctor.title
        ? `<div class="report-doctor-title">${escapeHtml(doctor.title)}</div>`
        : "";
      $("#reportBody").append(
        `<div class="report-doctor-sig">
           <div class="report-doctor-name">${escapeHtml(doctor.name)}</div>
           ${titleHtml}
         </div>`
      );
    }
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    $("#footerDate").text("تاريخ الطباعة: " + yyyy + "/" + mm + "/" + dd);
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
