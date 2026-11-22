import PDFDocument from "pdfkit";
import path from "node:path";
import { CLINIC_TIME_ZONE, OperationalReport, ReportInvoiceRow, formatReportPeriod, reportPeriodTitle } from "./operational-reports";
import { renderOperationalReportHtmlPdf } from "./report-html";

const FONT_PATH = path.resolve(process.cwd(), "server/assets/fonts/Amiri-Regular.ttf");
const PAGE_WIDTH = 595.28;
const LEFT = 42;
const CONTENT_WIDTH = PAGE_WIDTH - LEFT * 2;
const TABLE_COLUMNS = [
  { label: "الفاتورة", width: 75, key: "invoice" },
  { label: "الملف", width: 62, key: "patient" },
  { label: "الخدمة", width: 70, key: "service" },
  { label: "الوقت", width: 48, key: "time" },
  { label: "الدفع / البنك / العملية", width: 110, key: "state" },
  { label: "الموظف", width: 76, key: "employee" },
  { label: "المبلغ", width: 70, key: "total" },
] as const;

type TableEntry = { invoice: string; patient: string; service: string; time: string; state: string; employee: string; total: string };

function safeText(value: string | null | undefined, maxLength = 120): string {
  return (value ?? "—").replace(/[\r\n\0\u2028\u2029]/g, " ").trim().slice(0, maxLength) || "—";
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

function tableEntry(row: ReportInvoiceRow, collected: boolean): TableEntry {
  const status = collected
    ? row.paymentMethod === "bank"
      ? `بنكي · ${safeText(row.paymentBank, 28)} · ${safeText(row.transactionNumber, 10)}`
      : safeText(row.paymentMethod === "cash" ? "نقدي" : row.paymentMethod ?? "مدفوع", 30)
    : row.status === "paid"
      ? "مدفوعة"
      : row.status === "pending"
        ? "بانتظار التحصيل"
        : row.status === "refunded" ? "مسترجعة" : "ملغاة";
  return {
    invoice: safeText(row.invoiceNumber, 40),
    patient: safeText(row.patientNumber, 32),
    service: consultationLabel(row),
    time: formatTime(collected ? row.paidAt ?? row.createdAt : row.createdAt),
    state: status,
    employee: collected ? safeText(row.employeeName, 24) : "—",
    total: formatMoney(row.total),
  };
}

export async function renderOperationalReportPdfWithPdfKit(report: OperationalReport, clinicName: string, branding: { clinicAddress?: string | null; clinicPhone?: string | null; clinicWebsite?: string | null; clinicFooterText?: string | null } = {}): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 38, right: LEFT, bottom: 42, left: LEFT },
    compress: true,
    info: {
      Title: `تقرير تشغيل ${report.label}`,
      Author: safeText(clinicName, 180),
      Subject: "تقرير فواتير وتحصيلات",
    },
  });
  doc.registerFont("Amiri", FONT_PATH);
  const chunks: Buffer[] = [];
  const pdfPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const drawPageHeader = () => {
    doc.font("Amiri").fillColor("#132f37").fontSize(17)
      .text(safeText(clinicName, 180), LEFT, 38, { width: CONTENT_WIDTH, align: "right" });
    doc.fillColor("#1a7a75").fontSize(14)
      .text(reportPeriodTitle(report), LEFT, 67, { width: CONTENT_WIDTH, align: "right" });
    doc.fillColor("#536970").fontSize(10)
      .text(`الفترة: ${formatReportPeriod(report)} · المنطقة الزمنية: الخرطوم`, LEFT, 91, { width: CONTENT_WIDTH, align: "right" });
    const contact = [branding.clinicAddress, branding.clinicPhone, branding.clinicWebsite].filter(Boolean).map(value => safeText(value, 120)).join(" · ");
    if (contact) doc.fillColor("#6d7e82").fontSize(8).text(contact, LEFT, 104, { width: CONTENT_WIDTH, align: "right" });
    doc.moveTo(LEFT, contact ? 124 : 112).lineTo(PAGE_WIDTH - LEFT, contact ? 124 : 112).strokeColor("#d7e5e3").stroke();
  };

  drawPageHeader();
  let y = 126;

  const drawCards = (cards: Array<{ label: string; value: string }>) => {
    const cardGap = 7;
    const cardWidth = (CONTENT_WIDTH - cardGap * (cards.length - 1)) / cards.length;
    cards.forEach((card, index) => {
      const x = LEFT + index * (cardWidth + cardGap);
      doc.roundedRect(x, y, cardWidth, 48, 5).fill("#f1f7f6");
      doc.font("Amiri").fillColor("#597078").fontSize(8.5)
        .text(card.label, x + 3, y + 6, { width: cardWidth - 6, align: "center" });
      doc.fillColor("#123a42").fontSize(10)
        .text(card.value, x + 3, y + 25, { width: cardWidth - 6, align: "center", lineBreak: false });
    });
    y += 56;
  };

  drawCards([
    { label: "الفواتير المنشأة", value: String(report.issuedCount) },
    { label: "قيمة الفواتير", value: formatMoney(report.issuedTotal) },
    { label: "عدد التحصيلات", value: String(report.collectedCount) },
    { label: "إجمالي التحصيل", value: formatMoney(report.collectedTotal) },
  ]);
  drawCards([
    { label: "الاسترجاعات", value: formatMoney(report.refundedTotal) },
    { label: "الصافي", value: formatMoney(report.netTotal) },
    { label: "إجمالي المعاينات", value: formatMoney(report.consultationTotal) },
    { label: "إجمالي الفحوصات", value: formatMoney(report.testsTotal) },
  ]);

  doc.font("Amiri").fillColor("#536970").fontSize(8)
    .text(`صافي التحصيل حسب الخدمة وطريقة الدفع: ${report.netCollectionBreakdown.map(row => `${row.service} · ${row.method}: ${formatMoney(row.total)}`).join(" · ") || "لا توجد تحصيلات صافية"}`, LEFT, y, { width: CONTENT_WIDTH, align: "right" });
  y += 14;

  doc.font("Amiri").fillColor("#536970").fontSize(9)
    .text(`المعاينات: ${report.consultationCount} (عمومي ${report.consultationGeneralCount} · اختصاصي ${report.consultationSpecialistCount}). جميع المبالغ بالجنيه السوداني.`, LEFT, y, { width: CONTENT_WIDTH, align: "right" });
  y += 17;
  if (report.paymentBreakdown.length) {
    const methods = report.paymentBreakdown
      .map(row => `${safeText(row.method, 24)}: ${row.count} (${formatMoney(row.total)})`)
      .join(" · ");
    doc.fillColor("#6d7e82").fontSize(8)
      .text(`طرق التحصيل: ${methods}`, LEFT, y, { width: CONTENT_WIDTH, align: "right" });
    y += 14;
  }
  y += 10;

  const drawTable = (title: string, rows: TableEntry[], emptyText: string) => {
    const drawTableHeading = (continued = false) => {
      doc.font("Amiri").fillColor("#1a7a75").fontSize(13)
        .text(continued ? `استكمال ${title}` : title, LEFT, y, { width: CONTENT_WIDTH, align: "right" });
      y += 23;
      doc.roundedRect(LEFT, y, CONTENT_WIDTH, 23, 3).fill("#e9f2f1");
      let x = LEFT;
      TABLE_COLUMNS.forEach(column => {
        doc.font("Amiri").fillColor("#24444b").fontSize(8)
          .text(column.label, x + 2, y + 5, { width: column.width - 4, align: "right", lineBreak: false });
        x += column.width;
      });
      y += 26;
    };
    const startNewPage = (continued: boolean) => {
      doc.addPage();
      drawPageHeader();
      y = 126;
      if (continued) drawTableHeading(true);
    };
    if (y + 70 > 780) startNewPage(false);
    drawTableHeading();
    if (!rows.length) {
      doc.font("Amiri").fillColor("#657980").fontSize(10)
        .text(emptyText, LEFT, y + 5, { width: CONTENT_WIDTH, align: "right" });
      y += 29;
      return;
    }
    for (const row of rows) {
      if (y + 28 > 780) startNewPage(true);
      let x = LEFT;
      const values = [row.invoice, row.patient, row.service, row.time, row.state, row.employee, row.total];
      values.forEach((value, index) => {
        const column = TABLE_COLUMNS[index];
        doc.font("Amiri").fillColor("#243b40").fontSize(8)
          .text(value, x + 2, y + 4, { width: column.width - 4, align: "right", lineBreak: false, ellipsis: true });
        x += column.width;
      });
      doc.moveTo(LEFT, y + 22).lineTo(PAGE_WIDTH - LEFT, y + 22).strokeColor("#e7eeed").stroke();
      y += 25;
    }
    y += 7;
  };

  drawTable(
    "الفواتير المنشأة خلال الفترة",
    report.issuedInvoices.map(row => tableEntry(row, false)),
    "لا توجد فواتير منشأة في الفترة المحددة.",
  );
  drawTable(
    "التحصيلات المسجلة خلال الفترة",
    report.collectedInvoices.map(row => tableEntry(row, true)),
    "لا توجد تحصيلات مسجلة في الفترة المحددة.",
  );
  const footer = branding.clinicFooterText ? `${safeText(branding.clinicFooterText, 240)}\n` : "";
  doc.font("Amiri").fillColor("#6d7e82").fontSize(8)
    .text(`${footer}يُحتسب إنشاء الفاتورة بحسب وقت الإنشاء، ويُحتسب التحصيل بحسب وقت الدفع. لا يتضمن التقرير نتائج المختبر أو بيانات التشخيص.`, LEFT, Math.min(y + 5, 780), { width: CONTENT_WIDTH, align: "right" });
  doc.end();
  return pdfPromise;
}

/**
 * Reports are rendered through headless Chromium when it is available so Arabic
 * shaping and bidirectional text are correct. PDFKit remains a dependency-free
 * fallback for hosts without a browser binary.
 */
export async function renderOperationalReportPdf(report: OperationalReport, clinicName: string, branding: { clinicAddress?: string | null; clinicPhone?: string | null; clinicWebsite?: string | null; clinicFooterText?: string | null } = {}): Promise<Buffer> {
  try {
    return await renderOperationalReportHtmlPdf(report, clinicName, branding);
  } catch (error) {
    console.warn("[Reports] HTML PDF rendering failed, falling back to PDFKit:", error instanceof Error ? error.message : error);
    return renderOperationalReportPdfWithPdfKit(report, clinicName, branding);
  }
}
