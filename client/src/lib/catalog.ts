export type TestField = {
  key: string;
  label: string;
  unit?: string;
  male: string;
  female: string;
  type?: "number" | "text" | "select";
};

export type LabTest = {
  code: string;
  name: string;
  english: string;
  category: string;
  sample: string;
  price: number;
  turnaround: string;
  fields: TestField[];
  active?: boolean;
};

/** Shape returned by `catalog.list` (drizzle row). */
export type CatalogRow = {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string | null;
  category: string | null;
  sample: string | null;
  turnaround: string | null;
  price: number;
  fieldsJson: string | null;
  active: number;
};

const cbcFields: TestField[] = [
  { key: "wbc", label: "WBC", unit: "×10³/µL", male: "4.0 – 10.0", female: "4.0 – 10.0", type: "number" },
  { key: "neut", label: "Neutrophils (NEUT %)", unit: "%", male: "40 – 75", female: "40 – 75", type: "number" },
  { key: "lym", label: "Lymphocytes (LYM %)", unit: "%", male: "20 – 45", female: "20 – 45", type: "number" },
  { key: "mono", label: "Monocytes (MONO %)", unit: "%", male: "2 – 10", female: "2 – 10", type: "number" },
  { key: "eos", label: "Eosinophils (EOS %)", unit: "%", male: "1 – 6", female: "1 – 6", type: "number" },
  { key: "baso", label: "Basophils (BASO %)", unit: "%", male: "0 – 2", female: "0 – 2", type: "number" },
  { key: "rbc", label: "RBC", unit: "×10⁶/µL", male: "4.5 – 5.9", female: "4.1 – 5.1", type: "number" },
  { key: "hb", label: "Hemoglobin (Hb)", unit: "g/dL", male: "13.5 – 17.5", female: "12.0 – 15.5", type: "number" },
  { key: "hct", label: "Hematocrit (HCT)", unit: "%", male: "41 – 53", female: "36 – 46", type: "number" },
  { key: "mcv", label: "MCV", unit: "fL", male: "80 – 100", female: "80 – 100", type: "number" },
  { key: "mch", label: "MCH", unit: "pg", male: "27 – 33", female: "27 – 33", type: "number" },
  { key: "mchc", label: "MCHC", unit: "g/dL", male: "32 – 36", female: "32 – 36", type: "number" },
  { key: "rdw", label: "RDW", unit: "%", male: "11.5 – 14.5", female: "11.5 – 14.5", type: "number" },
  { key: "plt", label: "Platelets (PLT)", unit: "×10³/µL", male: "150 – 450", female: "150 – 450", type: "number" },
  { key: "mpv", label: "MPV", unit: "fL", male: "7.5 – 11.5", female: "7.5 – 11.5", type: "number" },
];

/**
 * Built-in catalog used when no database is connected (demo mode). The live
 * catalog always comes from `catalog.list` so tests added by the administrator
 * appear immediately in reception and the lab.
 */
export const DEFAULT_CATALOG: LabTest[] = [
  {
    code: "CBC",
    name: "صورة الدم الكاملة",
    english: "Complete Blood Count",
    category: "أمراض الدم",
    sample: "دم كامل EDTA",
    price: 18000,
    turnaround: "30 دقيقة",
    fields: cbcFields,
  },
  {
    code: "BFFM",
    name: "صورة الدم للملاريا",
    english: "Blood Film For Malaria",
    category: "أمراض الدم",
    sample: "دم",
    price: 12000,
    turnaround: "20 دقيقة",
    fields: [
      { key: "result", label: "النتيجة", male: "سالب / موجب", female: "سالب / موجب", type: "select" },
      { key: "parasite", label: "نوع الطفيل", male: "—", female: "—", type: "text" },
      { key: "density", label: "كثافة الطفيليات", male: "—", female: "—", type: "text" },
      { key: "remarks", label: "ملاحظات", male: "—", female: "—", type: "text" },
      { key: "technician", label: "فني المختبر", male: "—", female: "—", type: "text" },
    ],
  },
  {
    code: "UA",
    name: "تحليل البول الكامل",
    english: "Complete Urinalysis",
    category: "التحاليل العامة",
    sample: "بول عشوائي",
    price: 10000,
    turnaround: "20 دقيقة",
    fields: [
      { key: "color", label: "اللون والمظهر", male: "أصفر فاتح", female: "أصفر فاتح", type: "text" },
      { key: "ph", label: "pH", male: "4.5 – 8.0", female: "4.5 – 8.0", type: "text" },
      { key: "protein", label: "Protein", male: "Negative", female: "Negative", type: "text" },
      { key: "glucose", label: "Glucose", male: "Negative", female: "Negative", type: "text" },
      { key: "rbc", label: "RBC / HPF", male: "0 – 2", female: "0 – 2", type: "text" },
    ],
  },
  {
    code: "GLU",
    name: "سكر الدم العشوائي",
    english: "Random Blood Glucose",
    category: "الكيمياء السريرية",
    sample: "مصل / بلازما",
    price: 8000,
    turnaround: "15 دقيقة",
    fields: [{ key: "glucose", label: "Glucose", unit: "mg/dL", male: "70 – 140", female: "70 – 140", type: "number" }],
  },
  {
    code: "HbA1c",
    name: "السكر التراكمي",
    english: "Glycated Hemoglobin",
    category: "الكيمياء السريرية",
    sample: "دم كامل EDTA",
    price: 24000,
    turnaround: "45 دقيقة",
    fields: [{ key: "hba1c", label: "HbA1c", unit: "%", male: "4.0 – 5.6", female: "4.0 – 5.6", type: "number" }],
  },
  {
    code: "LFT",
    name: "وظائف الكبد",
    english: "Liver Function Tests",
    category: "الكيمياء السريرية",
    sample: "مصل",
    price: 30000,
    turnaround: "60 دقيقة",
    fields: [
      { key: "alt", label: "ALT", unit: "U/L", male: "7 – 56", female: "7 – 45", type: "number" },
      { key: "ast", label: "AST", unit: "U/L", male: "10 – 40", female: "9 – 32", type: "number" },
      { key: "bilirubin", label: "Total Bilirubin", unit: "mg/dL", male: "0.2 – 1.2", female: "0.2 – 1.2", type: "number" },
    ],
  },
  {
    code: "RFT",
    name: "وظائف الكلى",
    english: "Renal Function Tests",
    category: "الكيمياء السريرية",
    sample: "مصل",
    price: 28000,
    turnaround: "60 دقيقة",
    fields: [
      { key: "urea", label: "Urea", unit: "mg/dL", male: "15 – 45", female: "15 – 45", type: "number" },
      { key: "creatinine", label: "Creatinine", unit: "mg/dL", male: "0.7 – 1.3", female: "0.6 – 1.1", type: "number" },
    ],
  },
  {
    code: "LIPID",
    name: "الدهون الثلاثية والكوليسترول",
    english: "Lipid Profile",
    category: "الكيمياء السريرية",
    sample: "مصل صائم",
    price: 32000,
    turnaround: "60 دقيقة",
    fields: [
      { key: "cholesterol", label: "Total Cholesterol", unit: "mg/dL", male: "< 200", female: "< 200", type: "number" },
      { key: "triglycerides", label: "Triglycerides", unit: "mg/dL", male: "< 150", female: "< 150", type: "number" },
      { key: "hdl", label: "HDL", unit: "mg/dL", male: "> 40", female: "> 50", type: "number" },
      { key: "ldl", label: "LDL", unit: "mg/dL", male: "< 100", female: "< 100", type: "number" },
    ],
  },
  {
    code: "TSH",
    name: "الهرمون المحفز للغدة الدرقية",
    english: "Thyroid Stimulating Hormone",
    category: "الهرمونات",
    sample: "مصل",
    price: 26000,
    turnaround: "90 دقيقة",
    fields: [{ key: "tsh", label: "TSH", unit: "mIU/L", male: "0.4 – 4.0", female: "0.4 – 4.0", type: "number" }],
  },
  {
    code: "CRP",
    name: "البروتين المتفاعل C",
    english: "C-Reactive Protein",
    category: "المناعة والالتهاب",
    sample: "مصل",
    price: 16000,
    turnaround: "30 دقيقة",
    fields: [{ key: "crp", label: "CRP", unit: "mg/L", male: "< 5", female: "< 5", type: "number" }],
  },
  {
    code: "HBsAg",
    name: "مستضد التهاب الكبد B",
    english: "Hepatitis B Surface Antigen",
    category: "المناعة والفيروسات",
    sample: "مصل",
    price: 12000,
    turnaround: "30 دقيقة",
    fields: [{ key: "result", label: "النتيجة", male: "Negative / Positive", female: "Negative / Positive", type: "select" }],
  },
];

export function parseTestFields(fieldsJson: string | null | undefined): TestField[] | null {
  if (!fieldsJson) return null;
  try {
    const parsed = JSON.parse(fieldsJson) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.flatMap((field): TestField[] => {
      if (!field || typeof field !== "object") return [];
      const value = field as Record<string, unknown>;
      if (typeof value.key !== "string" || typeof value.label !== "string") return [];
      return [{
        key: value.key,
        label: value.label,
        unit: typeof value.unit === "string" ? value.unit : undefined,
        male: typeof value.male === "string" ? value.male : "—",
        female: typeof value.female === "string" ? value.female : "—",
        type: value.type === "number" || value.type === "select" ? value.type : "text",
      }];
    });
  } catch {
    return null;
  }
}

/** Merges database rows with the built-in definitions (fields fallback). */
export function buildCatalog(rows: CatalogRow[] | undefined): LabTest[] {
  if (!rows?.length) return DEFAULT_CATALOG;
  const defaults = new Map(DEFAULT_CATALOG.map(test => [test.code, test]));
  return rows.map(row => {
    const base = defaults.get(row.code);
    const parsed = parseTestFields(row.fieldsJson);
    return {
      code: row.code,
      name: row.nameAr,
      english: row.nameEn ?? base?.english ?? "",
      category: row.category ?? base?.category ?? "عام",
      sample: row.sample ?? base?.sample ?? "—",
      price: row.price,
      turnaround: row.turnaround ?? base?.turnaround ?? "—",
      fields: parsed && parsed.length ? parsed : base?.fields ?? [],
      active: row.active === 1,
    };
  });
}

/** Numeric reference range parser used to flag abnormal results. */
export function parseReferenceRange(range: string): { min: number; max: number } | null {
  const normalized = range.replace(/[–—]/g, "-").replace(/</g, "").replace(/>/g, "").trim();
  const rangeMatch = normalized.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) return { min: Math.min(min, max), max: Math.max(min, max) };
    return null;
  }
  const single = normalized.match(/(-?\d+(?:\.\d+)?)/);
  if (single && range.trim().startsWith("<")) {
    const max = Number(single[1]);
    return Number.isFinite(max) ? { min: Number.NEGATIVE_INFINITY, max } : null;
  }
  if (single && range.trim().startsWith(">")) {
    const min = Number(single[1]);
    return Number.isFinite(min) ? { min, max: Number.POSITIVE_INFINITY } : null;
  }
  return null;
}

export type ResultFlag = "normal" | "low" | "high" | "unknown";

export function flagResult(value: string, reference: string): ResultFlag {
  const numeric = Number(value);
  if (!value.trim() || !Number.isFinite(numeric)) return "unknown";
  const range = parseReferenceRange(reference);
  if (!range) return "unknown";
  if (numeric < range.min) return "low";
  if (numeric > range.max) return "high";
  return "normal";
}
