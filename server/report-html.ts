import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { CLINIC_TIME_ZONE, OperationalReport, ReportInvoiceRow, formatReportPeriod, reportPeriodTitle } from "./operational-reports";

const run = promisify(execFile);
const FONT_PATH = path.resolve(process.cwd(), "server/assets/fonts/NotoSansArabic-Regular.ttf");
let cachedFontDataUri: string | null = null;

function fontDataUri(): string {
  if (cachedFontDataUri) return cachedFontDataUri;
  const base64 = readFileSync(FONT_PATH).toString("base64");
  cachedFontDataUri = `data:font/ttf;base64,${base64}`;
  return cachedFontDataUri;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeText(value: string | null | undefined, maxLength = 160): string {
  return escapeHtml((value ?? "—").replace(/[\r\n\0\u2028\u2029]/g, " ").trim().slice(0, maxLength) || "—");
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function consultationLabel(row: ReportInvoiceRow): string {
  const type = row.consultationType ?? ((row.consultationFee ?? 0) > 0 ? "general" : "none");
  if (type === "specialist") return "معاينة اختصاصي";
  if (type === "general") return "معاينة عمومي";
  return "فحوصات";
}

function statusLabel(row: ReportInvoiceRow, collected: boolean): string {
  if (collected) {
    const details = row.paymentMethod === "bank"
      ? `بنكي · ${safeText(row.paymentBank ?? "—", 40)} · رقم العملية ${safeText(row.transactionNumber ?? "—", 20)}`
      : row.paymentMethod === "cash" ? "نقدي" : safeText(row.paymentMethod ?? "مدفوع", 30);
    return `${details} · الموظف: ${safeText(row.employeeName, 80)}`;
  }
  if (row.status === "paid") return "مدفوعة";
  if (row.status === "pending") return "بانتظار التحصيل";
  if (row.status === "refunded") return "مسترجعة";
  return "ملغاة";
}

function tableRows(rows: ReportInvoiceRow[], collected: boolean): string {
  return rows.map(row => `
    <tr>
      <td class="mono">${safeText(row.invoiceNumber, 40)}</td>
      <td class="mono">${safeText(row.patientNumber, 32)}</td>
      <td>${safeText(consultationLabel(row), 40)}</td>
      <td>${formatTime(collected ? row.paidAt ?? row.createdAt : row.createdAt)}</td>
      <td>${safeText(statusLabel(row, collected), 120)}</td>
      <td>${safeText(collected ? row.employeeName : null, 80)}</td>
      <td class="money">${formatMoney(row.total)}</td>
    </tr>`).join("");
}

export function buildOperationalReportHtml(report: OperationalReport, clinicName: string, branding: { clinicAddress?: string | null; clinicPhone?: string | null; clinicWebsite?: string | null; clinicFooterText?: string | null } = {}): string {
  const contact = [
    branding.clinicAddress ? safeText(branding.clinicAddress, 120) : null,
    branding.clinicPhone ? `<span dir="ltr">${safeText(branding.clinicPhone, 120)}</span>` : null,
    branding.clinicWebsite ? `<span dir="ltr">${safeText(branding.clinicWebsite, 120)}</span>` : null,
  ].filter(Boolean).join(" · ");
  const reportMeta = [
    report.shiftOwnerName ? `صاحب الوردية: ${safeText(report.shiftOwnerName, 80)}` : null,
    report.shiftLabName ? `المختبر: ${safeText(report.shiftLabName, 80)}` : null,
    report.reportGeneratedByName ? `أصدر التقرير: ${safeText(report.reportGeneratedByName, 80)}` : null,
  ].filter(Boolean).join(" · ");
  const payments = report.paymentBreakdown.length
    ? report.paymentBreakdown.map(row => `${safeText(row.method, 24)}: ${row.count} (${formatMoney(row.total)})`).join(" · ")
    : "لا توجد تحصيلات مسجلة";
  const cards = [
    { label: "الفواتير المنشأة", value: String(report.issuedCount) },
    { label: "قيمة الفواتير", value: formatMoney(report.issuedTotal) },
    { label: "عدد التحصيلات", value: String(report.collectedCount) },
    { label: "إجمالي التحصيل", value: formatMoney(report.collectedTotal) },
    { label: "الاسترجاعات", value: formatMoney(report.refundedTotal) },
    { label: "الصافي", value: formatMoney(report.netTotal) },
    { label: "إجمالي المعاينات", value: formatMoney(report.consultationTotal) },
    { label: "إجمالي الفحوصات", value: formatMoney(report.testsTotal) },
  ];
  const netBreakdown = report.netCollectionBreakdown.map(row => `${safeText(row.service, 20)} · ${safeText(row.method, 40)}: ${formatMoney(row.total)}`).join(" · ") || "لا توجد تحصيلات صافية";
  const issuedRows = tableRows(report.issuedInvoices, false);
  const collectedRows = tableRows(report.collectedInvoices, true);
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${safeText(reportPeriodTitle(report), 90)}</title>
<style>
  @font-face { font-family: "NotoArabicEmbedded"; src: url("${fontDataUri()}") format("truetype"); font-weight: 400; font-style: normal; }
  @page { size: A4; margin: 12mm 11mm 13mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "NotoArabicEmbedded", "Noto Sans Arabic", "Noto Naskh Arabic", sans-serif; direction: rtl; color: #17323a; font-size: 10.5pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .header { border-bottom: 1.5px solid #d6e6e3; padding-bottom: 6px; }
  .clinic { font-size: 17pt; font-weight: 700; color: #123039; margin: 0; }
  .title { font-size: 13pt; color: #1a7a75; margin: 2px 0 0; }
  .period { font-size: 9.5pt; color: #52696f; margin-top: 2px; }
  .contact { font-size: 8pt; color: #7b8c90; margin-top: 1px; }
  .meta { font-size: 8pt; color: #52696f; margin-top: 2px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 9px 0 6px; }
  .card { background: #f1f7f6; border-radius: 5px; padding: 7px 6px; text-align: center; }
  .card span { display: block; color: #5a7178; font-size: 8pt; }
  .card strong { display: block; color: #123a42; font-size: 12pt; margin-top: 1px; }
  .note { color: #5f7479; font-size: 8.5pt; margin: 2px 0; }
  h2 { font-size: 12pt; color: #1a7a75; margin: 12px 0 5px; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  thead th { background: #e9f2f1; color: #24444b; font-weight: 700; padding: 5px 4px; text-align: right; }
  tbody td { padding: 4px; border-bottom: 1px solid #e7eeed; color: #243b40; }
  td.money { font-weight: 700; white-space: nowrap; }
  td.mono { font-family: "DejaVu Sans Mono", monospace; font-size: 7.5pt; direction: ltr; text-align: right; unicode-bidi: embed; }
  .empty { color: #7b8c90; font-size: 9pt; padding: 6px 0; }
  .footer { margin-top: 14px; padding-top: 7px; border-top: 1px solid #e2ecea; color: #71858a; font-size: 8pt; }
  .footer strong { color: #435e65; font-weight: 700; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
</style>
</head>
<body>
  <div class="header">
    <p class="clinic">${safeText(clinicName, 180)}</p>
    <p class="title">${safeText(reportPeriodTitle(report), 90)}</p>
    <p class="period">الفترة: ${safeText(formatReportPeriod(report), 90)} · المنطقة الزمنية: الخرطوم</p>
    ${contact ? `<p class="contact">${contact}</p>` : ""}
    ${reportMeta ? `<p class="meta">${reportMeta}</p>` : ""}
  </div>
  <div class="cards">${cards.map(card => `<div class="card"><span>${card.label}</span><strong>${card.value}</strong></div>`).join("")}</div>
  <p class="note">المعاينات: ${report.consultationCount} (عمومي ${report.consultationGeneralCount} · اختصاصي ${report.consultationSpecialistCount}). جميع المبالغ بالجنيه السوداني.</p>
  <p class="note">طرق التحصيل: ${payments}</p>
  <p class="note">صافي التحصيل حسب الخدمة وطريقة الدفع: ${netBreakdown}</p>
  <h2>الفواتير المنشأة خلال الفترة</h2>
  ${issuedRows ? `<table><thead><tr><th>رقم الفاتورة</th><th>رقم الملف</th><th>الخدمة</th><th>الوقت</th><th>الحالة / الطريقة</th><th>الموظف</th><th>المبلغ</th></tr></thead><tbody>${issuedRows}</tbody></table>` : `<p class="empty">لا توجد فواتير منشأة في الفترة المحددة.</p>`}
  <h2>التحصيلات المسجلة خلال الفترة</h2>
  ${collectedRows ? `<table><thead><tr><th>رقم الفاتورة</th><th>رقم الملف</th><th>الخدمة</th><th>الوقت</th><th>طريقة الدفع / البنك / العملية</th><th>الموظف</th><th>المبلغ</th></tr></thead><tbody>${collectedRows}</tbody></table>` : `<p class="empty">لا توجد تحصيلات مسجلة في الفترة المحددة.</p>`}
  <div class="footer">
    ${branding.clinicFooterText ? `<div><strong>${safeText(branding.clinicFooterText, 240)}</strong></div>` : ""}
    <div>يُحتسب إنشاء الفاتورة بحسب وقت الإنشاء، ويُحتسب التحصيل بحسب وقت الدفع. لا يتضمن التقرير نتائج المختبر أو بيانات التشخيص.</div>
  </div>
</body>
</html>`;
}

function chromiumCandidates(): string[] {
  return [
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ].filter((value): value is string => Boolean(value));
}

export function chromiumBinary(): string | null {
  return chromiumCandidates().find(candidate => existsSync(candidate)) ?? null;
}

export async function renderOperationalReportHtmlPdf(report: OperationalReport, clinicName: string, branding: { clinicAddress?: string | null; clinicPhone?: string | null; clinicWebsite?: string | null; clinicFooterText?: string | null } = {}): Promise<Buffer> {
  const binary = chromiumBinary();
  if (!binary) throw new Error("Chromium is not available for HTML report rendering");
  const directory = await mkdtemp(path.join(tmpdir(), "clinic-report-"));
  const htmlPath = path.join(directory, "report.html");
  const pdfPath = path.join(directory, "report.pdf");
  try {
    await writeFile(htmlPath, buildOperationalReportHtml(report, clinicName, branding), "utf8");
    await run(binary, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--no-pdf-header-footer",
      "--virtual-time-budget=4000",
      `--print-to-pdf=${pdfPath}`,
      `file://${htmlPath}`,
    ], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
    const buffer = await readFile(pdfPath);
    if (buffer.length < 1000) throw new Error("Chromium produced an empty PDF");
    return buffer;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
