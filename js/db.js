/* =========================================================
   db.js — طبقة البيانات المرتبطة بملفات JSON والتحميل المحلي
   تصل بين ملفات data/*.json والمتصفح
   ========================================================= */

const DB = (() => {
  const KEYS = {
    users: "eyeclinic_users",
    templates: "eyeclinic_templates",
    session: "eyeclinic_session",
    clinic: "eyeclinic_settings",
    doctors: "eyeclinic_doctors"
  };

  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error("DB read error", key, e);
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ---------- جلب ملفات JSON الخارجية لتحديث البيانات عند الفتح لأول مرة ----------
  async function loadJsonFiles() {
    // التصفح المباشر من الملفات (file://) لا يدعم fetch() في المتصفحات الحديثة بسبب سياسة CORS
    if (window.location.protocol === "file:") {
      return;
    }

    // إذا كانت البيانات موجودة بالفعل في localStorage فلا نقوم بالاستبدال من جيت هب حتى لا تمحى تعديلات المستخدم
    const needDoctors = !localStorage.getItem(KEYS.doctors);
    const needTemplates = !localStorage.getItem(KEYS.templates);
    const needClinic = !localStorage.getItem(KEYS.clinic);
    const needUsers = !localStorage.getItem(KEYS.users);

    if (!needDoctors && !needTemplates && !needClinic && !needUsers) {
      return;
    }

    try {
      const fetchJson = (url) => fetch(url + "?t=" + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null);

      const [doctors, templates, clinic, users] = await Promise.all([
        needDoctors ? fetchJson("data/doctors.json") : null,
        needTemplates ? fetchJson("data/templates.json") : null,
        needClinic ? fetchJson("data/clinic.json") : null,
        needUsers ? fetchJson("data/users.json") : null
      ]);

      if (needDoctors && doctors && Array.isArray(doctors) && doctors.length > 0) write(KEYS.doctors, doctors);
      if (needTemplates && templates && Array.isArray(templates) && templates.length > 0) write(KEYS.templates, templates);
      if (needClinic && clinic && typeof clinic === "object") write(KEYS.clinic, clinic);
      if (needUsers && users && Array.isArray(users) && users.length > 0) write(KEYS.users, users);
    } catch (e) {
      console.warn("لم يتم التمكن من قراءة ملفات JSON الحية، الاعتماد على التخزين المحلي", e);
    }
  }

  const DEFAULT_TEMPLATES = [
    {
      id: "t_general_exam",
      name: "تقرير فحص عيون عام",
      category: "كشف عام",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "التاريخ" },
        { key: "eye", label: "العين محل الفحص" },
        { key: "diagnosis", label: "التشخيص" },
        { key: "treatment", label: "العلاج الموصوف" },
        { key: "rest_days", label: "مدة الراحة الطبية (مثل: 3 أيام)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>التاريخ:</strong> {{date}}</p><p><strong>العين محل الفحص:</strong> {{eye}}</p><p>تم إجراء فحص شامل لقاع العين وقياس ضغط العين وحدة الإبصار، وقد تبين الآتي:</p><p><strong>التشخيص:</strong> {{diagnosis}}</p><p><strong>العلاج الموصوف:</strong> {{treatment}}</p><p><strong>الراحة الطبية:</strong> يحتاج المريض إلى راحة طبية لمدة <strong>{{rest_days}}</strong> اعتبارات لراحة العين وعدم الإجهاد.</p>"
    },
    {
      id: "t_sick_leave",
      name: "تقرير إجازة مرضية وراحة طبية",
      category: "إجازات وراحة",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "تاريخ التقرير" },
        { key: "diagnosis", label: "المرض / التشخيص الطبي" },
        { key: "rest_days", label: "مدة الإجازة المرضية (مثل: أسبوع)" },
        { key: "start_date", label: "تاريخ بداية الإجازة" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>تاريخ التقرير:</strong> {{date}}</p><p>يشهد الطبيب المعالج بأن المريض المذكور أعلاه قد حضر للعيادة وتم فحص حالته الصحية وتبين أنه يعاني من: <strong>{{diagnosis}}</strong>.</p><p>وبناءً على التقييم الطبي ونظراً لحاجة العين للراحة التامة وعدم التعرض للإجهاد أو الغبار، يوصى بمنحه إجازة مرضية وراحة طبية لمدة <strong>{{rest_days}}</strong> تبدأ من يوم <strong>{{start_date}}</strong>.</p><p>هذا التقرير أعطي بناءً على طلب المريض لتقديمه لمن يهمه الأمر.</p>"
    },
    {
      id: "t_lasik_op",
      name: "تقرير عملية الليزك وتصحيح الإبصار",
      category: "الليزك والجراحات",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "تاريخ العملية" },
        { key: "eye", label: "العين" },
        { key: "power_before", label: "درجة النظر قبل العملية" },
        { key: "notes", label: "ملاحظات ما بعد العملية" },
        { key: "rest_days", label: "مدة الراحة الموصى بها (مثل: 5 أيام)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>تاريخ العملية:</strong> {{date}}</p><p><strong>العين التي أُجريت لها العملية:</strong> {{eye}}</p><p><strong>درجة النظر قبل العملية:</strong> {{power_before}}</p><p>تمت عملية تصحيح الإبصار بتقنية الليزك بنجاح ودون أي مضاعفات أثناء الإجراء.</p><p><strong>ملاحظات ما بعد العملية:</strong> {{notes}}</p><p><strong>الراحة والتعافي:</strong> يحتاج المريض لراحة تامة وتجنب إجهاد العين والفرك لمدة <strong>{{rest_days}}</strong> مع الالتزام بالقطرات الموصوفة.</p>"
    },
    {
      id: "t_cataract",
      name: "تقرير جراحة المياه البيضاء وزرع عدسة",
      category: "الجراحات",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "تاريخ الجراحة" },
        { key: "eye", label: "العين محل الجراحة" },
        { key: "lens_type", label: "نوع العدسة المزروعة" },
        { key: "power", label: "قوة العدسة (Power)" },
        { key: "post_op_care", label: "تعليمات القطرات والغيار" },
        { key: "rest_days", label: "مدة الراحة الطبية (مثل: 10 أيام)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>تاريخ الجراحة:</strong> {{date}}</p><p><strong>العين محل الجراحة:</strong> {{eye}}</p><p>تم إجراء جراحة إزالة المياه البيضاء (Cataract Extraction) بالموجات فوق الصوتية (الفاكو) وزرع عدسة مطوية مطابقة داخل العين:</p><p><strong>نوع العدسة المزروعة:</strong> {{lens_type}} &nbsp;&nbsp; <strong>قوة العدسة (Power):</strong> {{power}}</p><p><strong>تعليمات العناية:</strong> {{post_op_care}}</p><p><strong>الراحة الطبية:</strong> يوصى بمنح المريض إجازة وراحة طبية لمدة <strong>{{rest_days}}</strong> للتعافي التام ومنع دخول الماء أو الأتربة للعين.</p>"
    },
    {
      id: "t_glaucoma",
      name: "تقرير فحص المياه الزرقاء (الجلوكوما)",
      category: "الفحوصات المتخصصة",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "التاريخ" },
        { key: "iop_right", label: "ضغط العين اليمنى (mmHg)" },
        { key: "iop_left", label: "ضغط العين اليسرى (mmHg)" },
        { key: "field_test", label: "نتيجة مجال الإبصار" },
        { key: "treatment", label: "القطرات والخطة العلاجية" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>التاريخ:</strong> {{date}}</p><p>تم تقييم حالة المياه الزرقاء ومتابعة ضغط العين والعصب البصري وكان الفحص كالآتي:</p><p><strong>قياس ضغط العين اليمنى (IOP OD):</strong> {{iop_right}} mmHg &nbsp;&nbsp; <strong>العين اليسرى (IOP OS):</strong> {{iop_left}} mmHg</p><p><strong>نتائج فحص مجال الإبصار (Visual Field):</strong> {{field_test}}</p><p><strong>الخطة العلاجية والقطرات:</strong> {{treatment}}</p>"
    },
    {
      id: "t_diabetic_retina",
      name: "تقرير متابعة اعتلال الشبكية السكري",
      category: "الشبكية",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "التاريخ" },
        { key: "eye", label: "العين المفحوصة" },
        { key: "stage", label: "مرحلة اعتلال الشبكية" },
        { key: "laser_sessions", label: "جلسات الليزر / العلاج المنجز" },
        { key: "recommendations", label: "التوصيات وموعد المتابعة" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>التاريخ:</strong> {{date}}</p><p><strong>العين المجهوزة بالفحص:</strong> {{eye}}</p><p>تم فحص قاع العين لمريض السكر وتبين وجود تغيرات بالشبكية وفق التقييم التالي:</p><p><strong>مرحلة اعتلال الشبكية:</strong> {{stage}}</p><p><strong>جلسات الليزر / العلاج السابق:</strong> {{laser_sessions}}</p><p><strong>التوصيات الطبية:</strong> {{recommendations}} وضبط مستوى السكر بالدم والمتابعة الدورية خلال شهرين.</p>"
    },
    {
      id: "t_refraction",
      name: "تقرير قياس كشف النظارة الطبية",
      category: "النظارات والقياسات",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "التاريخ" },
        { key: "sph_od", label: "Sph اليمنى" },
        { key: "cyl_od", label: "Cyl اليمنى" },
        { key: "axis_od", label: "Axis اليمنى" },
        { key: "sph_os", label: "Sph اليسرى" },
        { key: "cyl_os", label: "Cyl اليسرى" },
        { key: "axis_os", label: "Axis اليسرى" },
        { key: "add", label: "إضافة القراءة (ADD)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>التاريخ:</strong> {{date}}</p><p><strong>مقاسات النظارة الطبية الموصوفة (Prescription):</strong></p><p><strong>العين اليمنى (OD):</strong> Sph: {{sph_od}} | Cyl: {{cyl_od}} | Axis: {{axis_od}}°</p><p><strong>العين اليسرى (OS):</strong> Sph: {{sph_os}} | Cyl: {{cyl_os}} | Axis: {{axis_os}}°</p><p><strong>إضافة القراءة (ADD):</strong> {{add}}</p><p>يوصى بارتداء النظارة أثناء القراءة أو قيادة السيارة حسب التوجيهات.</p>"
    },
    {
      id: "t_crosslinking",
      name: "تقرير تثبيت القرنية المخروطية",
      category: "القرنية",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "تاريخ الإجراء" },
        { key: "eye", label: "العين المعالجة" },
        { key: "kmax", label: "قيمة انحناء القرنية (Kmax)" },
        { key: "post_care", label: "تعليمات الضمادة والقطرات" },
        { key: "rest_days", label: "مدة الراحة من العمل/الدراسة (مثل: أسبوع)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>تاريخ الإجراء:</strong> {{date}}</p><p><strong>العين المعالجة:</strong> {{eye}} &nbsp;&nbsp; <strong>قيمة انحناء القرنية Kmax:</strong> {{kmax}}</p><p>تم خضوع المريض لإجراء تثبيت القرنية الضوئي (Corneal Cross-Linking CXL) بنجاح لحماية القرنية من التحدب.</p><p><strong>العناية بالضمادة الشفافة:</strong> {{post_care}}</p><p><strong>فترة الراحة والراحة من العمل:</strong> يتطلب الإجراء راحة طبية وعدم التعرض للضوء الساطع لمدة <strong>{{rest_days}}</strong>.</p>"
    },
    {
      id: "t_retinal_injection",
      name: "تقرير حقن شبكية العين (Anti-VEGF)",
      category: "الشبكية",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "تاريخ الحقن" },
        { key: "eye", label: "العين المحقونة" },
        { key: "drug_name", label: "اسم عقار الحقن (مثل: Eylea/Lucentis)" },
        { key: "dose_number", label: "رقم الجلسة (مثل: الأولى)" },
        { key: "next_dose", label: "موعد الجلسة القادمة" },
        { key: "rest_days", label: "مدة الراحة الطبية (مثل: 3 أيام)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>تاريخ الحقن:</strong> {{date}}</p><p><strong>العين التي تم حقنها:</strong> {{eye}}</p><p>تم إعطاء المريض حقنة داخل السائل الزجاجي (Intravitreal Injection) بمادة: <strong>{{drug_name}}</strong> (الجلسة رقم: {{dose_number}}).</p><p><strong>موعد الجلسة القادمة:</strong> {{next_dose}}</p><p><strong>الراحة والملاحظة:</strong> يُنصح المريض بالراحة والامتناع عن غسل العين بالماء لمدة <strong>{{rest_days}}</strong> للوقاية من العدوى.</p>"
    },
    {
      id: "t_conjunctivitis",
      name: "تقرير التهاب ملتحمة العين والراحة الوقائية",
      category: "التهابات وعدوى",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "التاريخ" },
        { key: "eye", label: "العين المصابة" },
        { key: "contagious_type", label: "نوع الالتهاب (فيروسي / بكتيري)" },
        { key: "treatment", label: "العلاج والقطرات" },
        { key: "rest_days", label: "مدة الراحة والرمز الوقائي (مثل: 4 أيام)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>التاريخ:</strong> {{date}}</p><p><strong>العين المصابة:</strong> {{eye}}</p><p>تبين بعد الفحص الإكلينيكي إصابة المريض بـ: <strong>{{contagious_type}}</strong> (التهاب ملتحمة العين).</p><p><strong>العلاج المقترح:</strong> {{treatment}}</p><p><strong>تنبيه وراحة وقائية:</strong> نظراً لأن الحالة قد تكون معدية وتستلزم راحة العين، يوصى بالابتعاد عن العمل ومكان الدراسة لمدة <strong>{{rest_days}}</strong> لتجنب العدوى والتعافي.</p>"
    },
    {
      id: "t_pterygium",
      name: "تقرير استئصال الظفرة (اللحمية بالعين)",
      category: "الجراحات",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "تاريخ العملية" },
        { key: "eye", label: "العين محل الجراحة" },
        { key: "graft_type", label: "نوع الترقيع المستعمل" },
        { key: "treatment", label: "علاج المتابعة" },
        { key: "rest_days", label: "مدة الراحة الموصى بها (مثل: أسبوع)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>تاريخ العملية:</strong> {{date}}</p><p><strong>العين محل الجراحة:</strong> {{eye}}</p><p>تم استئصال الظفرة الملتحمية (Pterygium Excision) بنجاح مع ترقيع الملتحمة الذاتي: <strong>{{graft_type}}</strong>.</p><p><strong>علاج المتابعة:</strong> {{treatment}}</p><p><strong>الراحة الموصى بها:</strong> يستلزم الوضع راحة طبية وتغطية العين لمدة <strong>{{rest_days}}</strong> لمنع الأتربة والغبار.</p>"
    },
    {
      id: "t_dcr",
      name: "تقرير جراحة تسليك انسداد القناة الدمعية",
      category: "الجراحات",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "تاريخ العملية" },
        { key: "eye", label: "العين" },
        { key: "procedure", label: "تفاصيل الجراحة (DCR)" },
        { key: "stent_info", label: "أنبوبة السيليكون المزروعة" },
        { key: "rest_days", label: "مدة الراحة الطبية (مثل: 7 أيام)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>تاريخ العملية:</strong> {{date}}</p><p><strong>العين:</strong> {{eye}}</p><p>تم إجراء عملية جراحة القناة الدمعية (Dacryocystorhinostomy - DCR): <strong>{{procedure}}</strong> مع تركيب أنبوبة سيليكون مؤقتة: <strong>{{stent_info}}</strong>.</p><p><strong>الراحة والتعافي:</strong> يحتاج المريض إلى راحة من الإجهاد البدني والنفخ من الأنف لمدة <strong>{{rest_days}}</strong>.</p>"
    },
    {
      id: "t_strabismus",
      name: "تقرير جراحة إصلاح الحول",
      category: "حول وجراحة أطفال",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "تاريخ العملية" },
        { key: "eye", label: "العين المعالجة" },
        { key: "muscles", label: "العضلات المعدلة" },
        { key: "alignment", label: "استقامة المحور بعد الجراحة" },
        { key: "rest_days", label: "مدة الراحة الطبية (مثل: أسبوعين)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>تاريخ العملية:</strong> {{date}}</p><p><strong>العين/العضلات المعالجة:</strong> {{eye}} — {{muscles}}</p><p>تمت عملية تعديل عضلات العين وتعديل استقامة المحور البصري بنجاح.</p><p><strong>استقامة العينين بعد العملية:</strong> {{alignment}}</p><p><strong>فترة الراحة الطبية:</strong> يمنح المريض راحة طبية وتوقف عن المجهود لمدة <strong>{{rest_days}}</strong>.</p>"
    },
    {
      id: "t_dry_eye",
      name: "تقرير تقييم جفاف العين الشديد",
      category: "الفحوصات المتخصصة",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "التاريخ" },
        { key: "schirmer", label: "قياس اختبار شيرمر (mm)" },
        { key: "tbut", label: "قياس تكسر الدمع TBUT (ثانية)" },
        { key: "treatment_plan", label: "القطرات البديلة والخطة" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>التاريخ:</strong> {{date}}</p><p>تم إجراء فحص جفاف العين المتقدم وكانت النتائج كالتالي:</p><p><strong>اختبار شيرمر (Schirmer Test):</strong> {{schirmer}} mm &nbsp;&nbsp; <strong>زمن تكسر الفيلم الدمعي (TBUT):</strong> {{tbut}} ثانية</p><p><strong>العلاج والبدائل الدمعية:</strong> {{treatment_plan}} وتجنب التكييف والشاشات لفترات طويلة.</p>"
    },
    {
      id: "t_corneal_abrasion",
      name: "تقرير إصابة وخدش بالقرنية (طوارئ)",
      category: "طوارئ وإصابات",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "تاريخ المعاينة" },
        { key: "eye", label: "العين المصابة" },
        { key: "cause", "label": "سبب الإصابة" },
        { key: "treatment", "label": "العلاج والضمادة" },
        { key: "rest_days", "label": "مدة الراحة الطبية (مثل: 4 أيام)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>تاريخ المعاينة:</strong> {{date}}</p><p><strong>العين المصابة:</strong> {{eye}}</p><p>حضر المريض إلى قسم الطوارئ وتبين وجود خدش سطحي في القرنية (Corneal Abrasion) نتيجة: <strong>{{cause}}</strong>.</p><p><strong>الإجراء والعلاج:</strong> تم عمل غيار معقم ووضع عدسة لاصقة ضمادية أو مراهم مضادة: {{treatment}}.</p><p><strong>الإجازة والراحة الطبية:</strong> نظراً لألم الخدش وحاجة النسيج التغطوي للاحتيام، يُمنح المريض راحة طبية لمدة <strong>{{rest_days}}</strong>.</p>"
    },
    {
      id: "t_oct_scan",
      name: "تقرير فحص قاع العين بالأشعة المقطعية OCT",
      category: "فحوصات وأشعة",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "تاريخ الفحص" },
        { key: "eye", label: "العين المفحوصة" },
        { key: "macular_thickness", label: "سمك مركز اللطخة (µm)" },
        { key: "fovea_status", label: "حالة التقعر المركزي" },
        { key: "summary", label: "الخلاصة والتشخيص" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>تاريخ الفحص:</strong> {{date}}</p><p><strong>العين المفحوصة:</strong> {{eye}}</p><p>نتائج التصوير المقطعي للشبكية ولطخة العين (Optical Coherence Tomography - OCT):</p><p><strong>سمك مركز اللطخة (Central Macular Thickness):</strong> {{macular_thickness}} µm</p><p><strong>حالة التقعر المركزي (Foveal Contour):</strong> {{fovea_status}}</p><p><strong>الخلاصة:</strong> {{summary}}</p>"
    },
    {
      id: "t_retinal_detachment",
      name: "تقرير جراحة انفصال الشبكية",
      category: "الشبكية",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "تاريخ الجراحة" },
        { key: "eye", label: "العين محل الجراحة" },
        { key: "tamponade", label: "المادة المحقونة (غاز / زيت سيليكون)" },
        { key: "head_position", label: "الوضعية المطلوبة للرأس" },
        { key: "rest_days", label: "مدة الراحة التامة (مثل: شهر كامل)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>تاريخ الجراحة:</strong> {{date}}</p><p><strong>العين محل الجراحة:</strong> {{eye}}</p><p>تم إجراء جراحة استئصال الجسم الزجاجي وتثبيت الشبكية (Vitrectomy & Retinal Reattachment) بنجاح.</p><p><strong>المادة المحقونة داخل العين (Tamponade):</strong> {{tamponade}}</p><p><strong>الوضعية المطلوبة للرأس:</strong> {{head_position}}</p><p><strong>الراحة التامة المطلوبة:</strong> يحتاج المريض لراحة تامة بالسرير والإجازة المرضية لمدة <strong>{{rest_days}}</strong> متواصلة.</p>"
    },
    {
      id: "t_visual_fitness",
      name: "تقرير تقييم اللياقة البصرية والقيادة",
      category: "تقارير رسمية",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "التاريخ" },
        { key: "va_right", label: "حدّة إبصار العين اليمنى" },
        { key: "va_left", label: "حدّة إبصار العين اليسرى" },
        { key: "color_vision", label: "تمييز الألوان (إيشيهارا)" },
        { key: "result", label: "نتيجة التقييم (لائق / غير لائق)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>التاريخ:</strong> {{date}}</p><p>بناءً على طلب المريض لتحديد كفاءة حدة الإبصار واللياقة البصرية، أظهر الفحص النتائج التالية:</p><p><strong>حدّة الإبصار للعين اليمنى:</strong> {{va_right}} &nbsp;&nbsp; <strong>حدّة الإبصار للعين اليسرى:</strong> {{va_left}}</p><p><strong>تمييز الألوان (Ishihara Test):</strong> {{color_vision}}</p><p><strong>النتيجة والتوصية:</strong> المريض {{result}} من الناحية البصرية لممارسة القيادة/العمل.</p>"
    },
    {
      id: "t_foreign_body",
      name: "تقرير إزالة جسم غريب من القرنية",
      category: "طوارئ وإصابات",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض" },
        { key: "age", label: "السن" },
        { key: "date", label: "تاريخ الإجراء" },
        { key: "eye", label: "العين المصابة" },
        { key: "object_type", label: "نوع الجسم الغريب (رايش حديد / زجاج)" },
        { key: "treatment", label: "العلاج والقطرات" },
        { key: "rest_days", label: "مدة الراحة الطبية (مثل: 3 أيام)" }
      ],
      bodyHtml: "<p><strong>اسم المريض:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنة &nbsp;&nbsp; <strong>تاريخ الإجراء:</strong> {{date}}</p><p><strong>العين المصابة:</strong> {{eye}}</p><p>تمت إزالة جسم غريب (<strong>{{object_type}}</strong>) من طبقة القرنية السطحية تحت البنج الموضعي وتنظيف حلقة الصدأ (Rust Ring).</p><p><strong>العلاج الموصوف:</strong> {{treatment}}</p><p><strong>فترة الراحة الطبية:</strong> يحتاج المريض إلى راحة وتغطية العين لمدة <strong>{{rest_days}}</strong> لمنع التلوث والتئام القرنية.</p>"
    },
    {
      id: "t_amblyopia",
      name: "تقرير تقييم كسل العين وعلاج الأطفال",
      category: "حول وجراحة أطفال",
      createdAt: new Date().toISOString(),
      fields: [
        { key: "name", label: "اسم المريض الطفل" },
        { key: "age", label: "السن" },
        { key: "date", label: "التاريخ" },
        { key: "eye", label: "العين المصابة بالكسل" },
        { key: "patching_hours", label: "عدد ساعات تغطية العين يومياً" },
        { key: "drops_glasses", label: "النظارة والقطرات المساعدة" },
        { key: "followup", "label": "موعد إعادة التقييم" }
      ],
      bodyHtml: "<p><strong>اسم المريض الطفل:</strong> {{name}} &nbsp;&nbsp; <strong>السن:</strong> {{age}} سنوات &nbsp;&nbsp; <strong>التاريخ:</strong> {{date}}</p><p><strong>العين المصابة بالكسل (Amblyopia):</strong> {{eye}}</p><p>تم تقييم حالة كسل العين الوظيفي ووضع بروتوكول العلاج بالتغطية كالآتي:</p><p><strong>عدد ساعات تغطية العين السليمة يومياً:</strong> {{patching_hours}} ساعات</p><p><strong>النظارة والعلاج المساعد:</strong> {{drops_glasses}}</p><p><strong>موعد إعادة التقييم:</strong> {{followup}}</p>"
    }
  ];

  function seed() {
    if (!localStorage.getItem(KEYS.users)) {
      write(KEYS.users, [
        { id: uid("u"), username: "admin", password: "Admin@123", fullName: "مدير النظام", role: "admin" },
        { id: uid("u"), username: "agent", password: "Agent@123", fullName: "موظف الاستقبال", role: "agent" }
      ]);
    }
    const currentTemplates = read(KEYS.templates, []);
    const hasOldPhraming = currentTemplates.some(t => t.bodyHtml && t.bodyHtml.includes("إدارة المركز"));
    if (!localStorage.getItem(KEYS.templates) || currentTemplates.length < 20 || hasOldPhraming) {
      write(KEYS.templates, DEFAULT_TEMPLATES);
    }
    if (!localStorage.getItem(KEYS.doctors)) {
      write(KEYS.doctors, [
        {
          id: "d_doc1",
          name: "د. أحمد عبد الوهاب",
          title: "استشاري طب وجراحة العيون والليزك"
        },
        {
          id: "d_doc2",
          name: "د. محمود مصطفى",
          title: "أخصائي جراحة المياه البيضاء وتصحيح الإبصار"
        }
      ]);
    }
    if (!localStorage.getItem(KEYS.clinic)) {
      write(KEYS.clinic, { clinicName: "مركز الخبراء لطب وجراحة العيون والليزك", logo: "assets/logo.png" });
    }
  }

  seed();

  // ---------------------- Users ----------------------
  const Users = {
    all() { return read(KEYS.users, []); },
    findByUsername(username) {
      return this.all().find((u) => u.username.trim().toLowerCase() === username.trim().toLowerCase());
    },
    add(user) {
      const users = this.all();
      user.id = uid("u");
      users.push(user);
      write(KEYS.users, users);
      return user;
    },
    update(id, changes) {
      const users = this.all().map((u) => (u.id === id ? { ...u, ...changes } : u));
      write(KEYS.users, users);
    },
    remove(id) {
      const users = this.all().filter((u) => u.id !== id);
      write(KEYS.users, users);
    }
  };

  // ---------------------- Templates ----------------------
  const Templates = {
    all() { return read(KEYS.templates, []); },
    get(id) { return this.all().find((t) => t.id === id); },
    add(tpl) {
      const templates = this.all();
      tpl.id = uid("t");
      tpl.createdAt = new Date().toISOString();
      templates.push(tpl);
      write(KEYS.templates, templates);
      return tpl;
    },
    update(id, changes) {
      const templates = this.all().map((t) => (t.id === id ? { ...t, ...changes } : t));
      write(KEYS.templates, templates);
    },
    remove(id) {
      const templates = this.all().filter((t) => t.id !== id);
      write(KEYS.templates, templates);
    },
    replaceAll(list) { write(KEYS.templates, list); }
  };

  // ---------------------- Session ----------------------
  const Session = {
    login(user) {
      write(KEYS.session, {
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        loginAt: new Date().toISOString()
      });
    },
    current() { return read(KEYS.session, null); },
    logout() { localStorage.removeItem(KEYS.session); }
  };

  const Clinic = {
    get() { return read(KEYS.clinic, {}); },
    save(changes) {
      const current = this.get();
      write(KEYS.clinic, { ...current, ...changes });
    }
  };

  // ---------------------- Doctors ----------------------
  const Doctors = {
    all() { return read(KEYS.doctors, []); },
    get(id) { return this.all().find((d) => d.id === id); },
    add(doctor) {
      const list = this.all();
      doctor.id = uid("d");
      list.push(doctor);
      write(KEYS.doctors, list);
      return doctor;
    },
    remove(id) {
      const list = this.all().filter((d) => d.id !== id);
      write(KEYS.doctors, list);
    }
  };

  // ---------------------- Export JSON Files for GitHub ----------------------
  function downloadJsonFile(filename, data) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportAllJsonFiles() {
    downloadJsonFile("doctors.json", Doctors.all());
    setTimeout(() => downloadJsonFile("templates.json", Templates.all()), 300);
    setTimeout(() => downloadJsonFile("clinic.json", Clinic.get()), 600);
  }

  return {
    init: loadJsonFiles,
    Users,
    Templates,
    Session,
    Clinic,
    Doctors,
    exportAllJsonFiles,
    downloadJsonFile,
    uid
  };
})();
