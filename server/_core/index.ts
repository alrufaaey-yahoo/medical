import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { and, desc, eq, gte, lt, ne } from "drizzle-orm";
import { clinicSettings, invoices, patients } from "../../drizzle/schema";
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

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
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
    const result = await createReportDownloadResponse({
      period: req.query.period,
      date: req.query.date,
      role: user?.role,
    }, {
      loadReport: async window => {
        const db = await getDb();
        if (!db) return null;
        const [issuedRows, collectedRows, settingsRows] = await Promise.all([
          db.select({
            invoiceNumber: invoices.invoiceNumber,
            patientNumber: patients.patientNumber,
            createdAt: invoices.createdAt,
            paidAt: invoices.paidAt,
            total: invoices.total,
            status: invoices.status,
            paymentMethod: invoices.paymentMethod,
          })
            .from(invoices)
            .innerJoin(patients, eq(invoices.patientId, patients.id))
            .where(and(
              ne(invoices.status, "cancelled"),
              gte(invoices.createdAt, window.start),
              lt(invoices.createdAt, window.end),
            ))
            .orderBy(desc(invoices.createdAt)),
          db.select({
            invoiceNumber: invoices.invoiceNumber,
            patientNumber: patients.patientNumber,
            createdAt: invoices.createdAt,
            paidAt: invoices.paidAt,
            total: invoices.total,
            status: invoices.status,
            paymentMethod: invoices.paymentMethod,
          })
            .from(invoices)
            .innerJoin(patients, eq(invoices.patientId, patients.id))
            .where(and(
              eq(invoices.status, "paid"),
              gte(invoices.paidAt, window.start),
              lt(invoices.paidAt, window.end),
            ))
            .orderBy(desc(invoices.paidAt)),
          db.select({ name: clinicSettings.name, address: clinicSettings.address, phone: clinicSettings.phone, website: clinicSettings.website, footerText: clinicSettings.footerText }).from(clinicSettings).limit(1),
        ]);
        return {
          report: buildOperationalReport(window, issuedRows, collectedRows),
          clinicName: settingsRows[0]?.name ?? "مستوصف بكّا الطبي الحديث",
          clinicAddress: settingsRows[0]?.address,
          clinicPhone: settingsRows[0]?.phone,
          clinicWebsite: settingsRows[0]?.website,
          clinicFooterText: settingsRows[0]?.footerText,
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
