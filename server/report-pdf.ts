import PDFDocument from "pdfkit";
import path from "node:path";
import { CLINIC_TIME_ZONE, OperationalReport, ReportInvoiceRow, formatReportPeriod } from "./operational-reports";

const FONT_PATH = path.resolve(process.cwd(), "server/assets/fonts/Amiri-Regular.ttf");
const PAGE_WIDTH = 595.28;
const LEFT = 42;
const CONTENT_WIDTH = PAGE_WIDTH - LEFT * 2;
const TABLE_COLUMNS = [
  { label: "رقم الفاتورة", width: 123, key: "invoice" },
  { label: "رقم الملف", width: 100, key: "patient" },
  { label: "الوقت", width: 105, key: "time" },
  { label: "الحالة / الطريقة", width: 112, key: "state" },
  { label: "المبلغ", width: 71, key: "total" },
] as const;

type TableEntry = { invoice: string; patient: string; time: string; state: string; total: string };

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

function tableEntry(row: ReportInvoiceRow, collected: boolean): TableEntry {
  const status = collected
    ? safeText(row.paymentMethod ?? "مدفوع", 30)
    : row.status === "paid"
      ? "مدفوعة"
      : row.status === "pending"
        ? "بانتظار التحصيل"
        : "ملغاة";
  return {
    invoice: safeText(row.invoiceNumber, 40),
    patient: safeText(row.patientNumber, 32),
    time: formatTime(collected ? row.paidAt ?? row.createdAt : row.createdAt),
    state: status,
    total: formatMoney(row.total),
  };
}

export async function renderOperationalReportPdf(report: OperationalReport, clinicName: string, branding: { clinicAddress?: string | null; clinicPhone?: string | null; clinicWebsite?: string | null; clinicFooterText?: string | null } = {}): Promise<Buffer> {
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
      .text(report.period === "daily" ? "تقرير حركة المستوصف اليومي" : "تقرير حركة المستوصف الشهري", LEFT, 67, { width: CONTENT_WIDTH, align: "right" });
    doc.fillColor("#536970").fontSize(10)
      .text(`الفترة: ${formatReportPeriod(report)} · المنطقة الزمنية: الخرطوم`, LEFT, 91, { width: CONTENT_WIDTH, align: "right" });
    const contact = [branding.clinicAddress, branding.clinicPhone, branding.clinicWebsite].filter(Boolean).map(value => safeText(value, 120)).join(" · ");
    if (contact) doc.fillColor("#6d7e82").fontSize(8).text(contact, LEFT, 104, { width: CONTENT_WIDTH, align: "right" });
    doc.moveTo(LEFT, contact ? 124 : 112).lineTo(PAGE_WIDTH - LEFT, contact ? 124 : 112).strokeColor("#d7e5e3").stroke();
  };

  drawPageHeader();
  let y = 126;
  const summaryCards = [
    { label: "الفواتير المنشأة", value: String(report.issuedCount) },
    { label: "قيمة الفواتير", value: formatMoney(report.issuedTotal) },
    { label: "عدد التحصيلات", value: String(report.collectedCount) },
    { label: "إجمالي التحصيل", value: formatMoney(report.collectedTotal) },
  ];
  const cardGap = 8;
  const cardWidth = (CONTENT_WIDTH - cardGap * 3) / 4;
  summaryCards.forEach((card, index) => {
    const x = LEFT + index * (cardWidth + cardGap);
    doc.roundedRect(x, y, cardWidth, 52, 5).fill("#f1f7f6");
    doc.font("Amiri").fillColor("#597078").fontSize(9)
      .text(card.label, x + 4, y + 7, { width: cardWidth - 8, align: "center" });
    doc.fillColor("#123a42").fontSize(10)
      .text(card.value, x + 3, y + 27, { width: cardWidth - 6, align: "center", lineBreak: false });
  });
  y += 67;
  doc.font("Amiri").fillColor("#536970").fontSize(9)
    .text("جميع المبالغ في هذا التقرير بالجنيه السوداني.", LEFT, y, { width: CONTENT_WIDTH, align: "right" });
  y += 28;

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
      const values = [row.invoice, row.patient, row.time, row.state, row.total];
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
