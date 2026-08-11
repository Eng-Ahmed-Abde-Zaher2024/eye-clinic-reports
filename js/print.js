/* =========================================================
   print.js — منطق صفحة إصدار وطباعة التقرير
   ========================================================= */

$(async function () {
  const session = requireAuth();
  if (!session) return;
  renderTopbar(session);

  // جلب أحدث بيانات من ملفات JSON المرفوعة على جيت هب
  await DB.init();

  const clinic = DB.Clinic.get();
  $("#clinicNameEl").text(clinic.clinicName || "مركز الخبراء");
  if (clinic.logo) {
    $("#watermarkImg, #headerLogo").attr("src", clinic.logo);
  }

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
      if (isDate) {
        // حقل تاريخ → date picker (كليندر)
        const todayISO = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        $form.append(`
          <div class="field">
            <label>${escapeHtml(f.label)}</label>
            <input type="date" class="dyn-input date-input" data-key="${escapeHtml(f.key)}" value="${todayISO}" />
          </div>
        `);
      } else {
        $form.append(`
          <div class="field">
            <label>${escapeHtml(f.label)}</label>
            <input type="text" class="dyn-input" data-key="${escapeHtml(f.key)}" value="" />
          </div>
        `);
      }
    });

    $form.on("input", ".dyn-input", renderPreview);
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
      const safeVal = escapeHtml(values[f.key] || `[${f.label}]`);
      html = html.replace(re, safeVal);
    });

    $("#reportBody").html(html);
    $("#footerDate").text("تاريخ الطباعة: " + new Date().toLocaleDateString("ar-EG"));
    const clinicData = DB.Clinic.get();
    $("#footerClinicName").text(clinicData.clinicName || "مركز الخبراء لطب وجراحة العيون والليزك");
  }

  $("#templateSelect").on("change", function () {
    selectTemplate($(this).val());
  });

  $("#printBtn").on("click", function () {
    if (!currentTemplate) {
      showToast("اختر قالبًا أولًا", true);
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
