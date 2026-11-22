import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { and, desc, eq, gte, inArray, lt, ne, or } from "drizzle-orm";
import { clinicSettings, invoices, patients, shifts, userShiftAssignments, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { buildOperationalReport } from "../operational-reports";
import { createReportDownloadResponse } from "../report-download";
import { renderOperationalReportPdf } from "../report-pdf";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { serveStatic, setupVite } from "./vite";
import { canAccessLaboratory } from "./role-access";
import { acceptBridgeHeartbeat, getBridgeConfig, getCbcBridgeStatus, getCbcSampleBySampleId, getLatestCbcSample, listCbcSamples, storeBridgeSample } from "../cbc-bridge";

const REPORT_SELECT = {
  invoiceNumber: invoices.invoiceNumber,
  patientNumber: patients.patientNumber,
  createdAt: invoices.createdAt,
  paidAt: invoices.paidAt,
  refundedAt: invoices.refundedAt,
  total: invoices.total,
  status: invoices.status,
  paymentMethod: invoices.paymentMethod,
  paymentBank: invoices.paymentBank,
  transactionNumber: invoices.transactionNumber,
  employeeName: users.name,
  consultationType: invoices.consultationType,
  consultationFee: invoices.consultationFee,
} as const;

async function cashierCanViewShift(userId: number, dateKey: unknown, shiftType: unknown): Promise<boolean> {
  if (typeof dateKey !== "string" || (shiftType !== "morning" && shiftType !== "evening" && shiftType !== "night")) return false;
  const db = await getDb();
  if (!db) return false;
  const [shift] = await db.select().from(shifts)
    .where(and(eq(shifts.shiftDate, dateKey), eq(shifts.shiftType, shiftType)))
    .limit(1);
  // An empty shift has no data to protect; the generated report is blank.
  if (!shift) return true;
  if (shift.cashierUserId === userId) return true;
  const [assignment] = await db.select({ id: userShiftAssignments.id }).from(userShiftAssignments)
    .where(and(eq(userShiftAssignments.shiftId, shift.id), eq(userShiftAssignments.userId, userId)))
    .limit(1);
  return Boolean(assignment);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  const authorizeLab = async (req: express.Request, res: express.Response) => {
    let user = null;
    try { user = await sdk.authenticateRequest(req); } catch { user = null; }
    if (!user) { res.status(401).json({ error: "Authentication required" }); return false; }
    if (!canAccessLaboratory(user.role)) { res.status(403).json({ error: "Laboratory access required" }); return false; }
    return true;
  };
  const bridgeToken = (req: express.Request) => {
    const value = req.get("authorization") ?? "";
    return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, "").trim() : "";
  };
  app.get("/api/cbc/health", async (req, res) => {
    if (!await authorizeLab(req, res)) return;
    try { res.json({ service: "cbc-bridge-api", status: await getCbcBridgeStatus() }); }
    catch { res.status(503).json({ error: "CBC bridge status unavailable" }); }
  });
  app.get("/api/cbc/status", async (req, res) => {
    if (!await authorizeLab(req, res)) return;
    try { res.json(await getCbcBridgeStatus()); }
    catch { res.status(503).json({ error: "CBC bridge status unavailable" }); }
  });
  app.get("/api/cbc/latest", async (req, res) => {
    if (!await authorizeLab(req, res)) return;
    try { res.json({ sample: await getLatestCbcSample() }); }
    catch { res.status(503).json({ error: "CBC sample service unavailable" }); }
  });
  app.get("/api/cbc/samples", async (req, res) => {
    if (!await authorizeLab(req, res)) return;
    const requested = Number(req.query.limit ?? 50);
    try { res.json({ samples: await listCbcSamples(Number.isInteger(requested) ? requested : 50) }); }
    catch { res.status(503).json({ error: "CBC sample service unavailable" }); }
  });
  app.get("/api/cbc/samples/:sampleId", async (req, res) => {
    if (!await authorizeLab(req, res)) return;
    try {
      const sample = await getCbcSampleBySampleId(req.params.sampleId);
      if (!sample) { res.status(404).json({ error: "CBC sample not found" }); return; }
      res.json({ sample });
    } catch { res.status(503).json({ error: "CBC sample service unavailable" }); }
  });
  // The local bridge initiates all calls; no TCP instrument port is exposed by this web server.
  app.get("/api/cbc/bridge/config", async (req, res) => {
    const config = await getBridgeConfig(bridgeToken(req));
    if (!config) { res.status(401).json({ error: "Bridge not configured or token invalid" }); return; }
    res.set("Cache-Control", "no-store").json(config);
  });
  app.post("/api/cbc/bridge/heartbeat", async (req, res) => {
    if (!await acceptBridgeHeartbeat(bridgeToken(req))) { res.status(401).json({ error: "Bridge not configured or token invalid" }); return; }
    res.set("Cache-Control", "no-store").json({ accepted: true });
  });
  app.post("/api/cbc/bridge/ingest", async (req, res) => {
    if (Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8") > 512_000) { res.status(413).json({ error: "CBC payload too large" }); return; }
    try {
      const result = await storeBridgeSample(bridgeToken(req), req.body);
      if (!result.authorized) { res.status(401).json({ error: "Bridge not configured or token invalid" }); return; }
      res.set("Cache-Control", "no-store").json({ accepted: true, duplicate: result.duplicate });
    } catch {
      // Intentionally do not log rejected HL7/result payloads or patient identifiers.
      res.status(400).json({ error: "Invalid CBC sample payload" });
    }
  });
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  app.get("/api/reports/pdf", async (req, res) => {
    let user = null;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
    if (req.query.period === "shift" && user?.role === "cashier") {
      const allowed = await cashierCanViewShift(user.id, req.query.date, req.query.shiftType);
      if (!allowed) {
        res.status(403).json({ error: "لا يمكنك تنزيل تقرير وردية غير مسندة إليك" });
        return;
      }
    }
    const result = await createReportDownloadResponse({
      period: req.query.period,
      date: req.query.date,
      shiftType: req.query.shiftType,
      role: user?.role,
    }, {
      loadReport: async window => {
        const db = await getDb();
        if (!db) return null;
        const settingsRows = await db.select({
          name: clinicSettings.name,
          address: clinicSettings.address,
          phone: clinicSettings.phone,
          website: clinicSettings.website,
          footerText: clinicSettings.footerText,
        }).from(clinicSettings).limit(1);
        const branding = {
          clinicName: settingsRows[0]?.name ?? "مستوصف بكّا الطبي الحديث",
          clinicAddress: settingsRows[0]?.address,
          clinicPhone: settingsRows[0]?.phone,
          clinicWebsite: settingsRows[0]?.website,
          clinicFooterText: settingsRows[0]?.footerText,
        };

        if (window.period === "shift" && window.shiftType) {
          const [shift] = await db.select().from(shifts)
            .where(and(eq(shifts.shiftDate, window.dateKey), eq(shifts.shiftType, window.shiftType)))
            .limit(1);
          if (!shift) {
            return {
              report: buildOperationalReport(window, [], [], { reportGeneratedByName: user?.name }),
              ...branding,
            };
          }
          const staffIds = [shift.cashierUserId, shift.labUserId].filter((id): id is number => id != null);
          const staffRows = staffIds.length
            ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, staffIds))
            : [];
          const staffById = new Map(staffRows.map(row => [row.id, row.name]));
          const rows = await db.select(REPORT_SELECT)
            .from(invoices)
            .innerJoin(patients, eq(invoices.patientId, patients.id))
            .leftJoin(users, eq(invoices.createdBy, users.id))
            .where(eq(invoices.shiftId, shift.id))
            .orderBy(desc(invoices.createdAt));
          return {
            report: buildOperationalReport(window, rows, rows, {
              shiftOwnerName: shift.cashierUserId ? staffById.get(shift.cashierUserId) : null,
              shiftLabName: shift.labUserId ? staffById.get(shift.labUserId) : null,
              reportGeneratedByName: user?.name,
            }),
            ...branding,
          };
        }

        const [issuedRows, collectedRows] = await Promise.all([
          db.select(REPORT_SELECT)
            .from(invoices)
            .innerJoin(patients, eq(invoices.patientId, patients.id))
            .leftJoin(users, eq(invoices.createdBy, users.id))
            .where(and(
              ne(invoices.status, "cancelled"),
              gte(invoices.createdAt, window.start),
              lt(invoices.createdAt, window.end),
            ))
            .orderBy(desc(invoices.createdAt)),
          db.select(REPORT_SELECT)
            .from(invoices)
            .innerJoin(patients, eq(invoices.patientId, patients.id))
            .leftJoin(users, eq(invoices.createdBy, users.id))
            .where(or(
              and(eq(invoices.status, "paid"), gte(invoices.paidAt, window.start), lt(invoices.paidAt, window.end)),
              and(eq(invoices.status, "refunded"), gte(invoices.refundedAt, window.start), lt(invoices.refundedAt, window.end)),
            ))
            .orderBy(desc(invoices.paidAt)),
        ]);
        return {
          report: buildOperationalReport(window, issuedRows, collectedRows, {
            reportGeneratedByName: user?.name,
          }),
          ...branding,
        };
      },
      renderPdf: renderOperationalReportPdf,
    });
    if (Buffer.isBuffer(result.body)) {
      res.status(result.status).set(result.headers ?? {}).send(result.body);
    } else {
      res.status(result.status).json(result.body);
    }
  });
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
