# Implementation progress (working notes)

## Goal
Medical lab/clinic app (repo alrufaaey-yahoo/medical). Requirements:
- Supervisor: daily/weekly/monthly reports, add cashier/lab users, edit all prices + general/specialist consultation fees only. No lab/patient access. Cannot edit test definitions (admin only).
- Cashier: register patient, edit/cancel invoice, invoice for existing patient, own shift daily report.
- Fix invoice editing losing old tests/prices.
- Consultation type (none/general/specialist) with own prices, shown in invoices and reports.
- Lab-standard improvements without changing app approach.

## DONE (server)
- shared/billing.ts: consultation types/labels, invoice totals, planInvoiceEdit, prices.
- drizzle/schema.ts: clinicSettings.consultationGeneralPrice/SpecialistPrice; invoices.consultationType/consultationFee; labTests.turnaround; staffMembers; priceChanges.
- drizzle/0005_lab_operations.sql (not yet applied).
- server/operational-reports.ts: weekly + shift windows, consultation/payment breakdown.
- server/report-download.ts: weekly/shift, shiftType.
- server/report-pdf.ts: new cards, 6 columns, service column.
- server/_core/role-access.ts: ROLE_SECTIONS + capability helpers.
- server/pricing.ts: diffs/validation.
- server/routers.ts: staff router, pricing router, catalog.updatePrices, admin-only catalog.save, cashier-only billing/patients, lab-only laboratory, reports weekly/shift, billing.updateInvoice (preserves lines), previewLogin.
- server/_core/index.ts: shift/weekly PDF loader, cashier shift permission.
- server/_core/preview-auth.ts: ALLOW_PREVIEW_LOGIN gate.
- server/db.ts applyStaffRole; sdk.ts + oauth.ts call it.
- pnpm check passes (server).

## DONE (client libs/components)
- client/src/lib/catalog.ts (DEFAULT_CATALOG, buildCatalog, flags)
- client/src/lib/clinic-types.ts
- client/src/lib/clinic-utils.ts
- client/src/lib/clinic-workflow.ts (week range, consultation fields)
- components/clinic/ui.tsx, Overview.tsx, Patients.tsx, Billing.tsx, Lab.tsx

## TODO
1. server patients.workspace: include labResults; Home maps them.
2. Client components: Catalog (pricing tab + admin catalog), Reports (server-driven + shift), Team (staff/users/shifts), Settings, dialogs (Patient w/ consultation, Existing invoice w/ consultation, InvoiceEditor, Login preview, Drawer), Print.
3. Home.tsx rewrite orchestrating all; nav sections per role; preview login; invoice edit; catalog from DB; pricing query.
4. index.css: fix broken `.a4-header` line 146; add styles for pricing/team/editor/flags.
5. scripts/migrate.ts + scripts/seed.ts; package scripts.
6. Update tests (users.test role expectations, operational reports weekly/shift, billing shared).
7. Docs README/TODO/WORKFLOW.
8. Apply DB migrations to local MariaDB, seed, build, run on PORT, preview login, verify via curl, send link.
9. Commit + push to GitHub.

## Local env
- MariaDB running, DB `medical`, user medical/medical_pass at 127.0.0.1.
- Node 22, pnpm 10.18.
- GitHub auth via gh (alrufaaey-yahoo).
- Preview URL template: https://{port}-ifx4dh54b2esc5m8x1z0p-b8bbb3c6.us5.manus.computer
- Planned env: DATABASE_URL=mysql://medical:medical_pass@127.0.0.1:3306/medical, MANUS_JWT_SECRET=<random>, MANUS_PROJECT_ID=medical-preview, ALLOW_PREVIEW_LOGIN=1, NODE_ENV=production, PORT=3000.
