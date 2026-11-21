import { Printer, Search, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { initials } from "@/lib/clinic-utils";
import type { Patient, PatientFilter } from "@/lib/clinic-types";
import { SectionTitle, StatusPill } from "./ui";

export function Patients({ patients, search, setSearch, onAddPatient, onSelectPatient, onPrintInvoice }: {
  patients: Patient[];
  search: string;
  setSearch: (value: string) => void;
  onAddPatient: () => void;
  onSelectPatient: (patient: Patient) => void;
  onPrintInvoice: (patient: Patient) => void;
}) {
  const [filter, setFilter] = useState<PatientFilter>("all");
  const filtered = patients.filter(patient => {
    const matchesSearch = `${patient.name} ${patient.id} ${patient.phone}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all"
      || (filter === "pending" ? patient.status === "في الانتظار" : filter === "lab" ? patient.status === "في المختبر" : patient.status === "مكتملة");
    return matchesSearch && matchesFilter;
  });
  const inLabCount = patients.filter(patient => patient.status === "في المختبر").length;
  const pendingCount = patients.filter(patient => patient.status === "في الانتظار").length;
  const completedCount = patients.filter(patient => patient.status === "مكتملة").length;
  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow={`السجلات · ${filtered.length} من ${patients.length} سجل`}
        title="المرضى والمراجعين"
        description="ابحث في سجلات المرضى، وراجع مسارهم والفواتير المرتبطة بهم."
        action={<button className="button button-primary" onClick={onAddPatient}><UserPlus size={16} />تسجيل مريض جديد</button>}
      />
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالاسم أو رقم الملف أو الهاتف" />
          {search && <button type="button" className="search-clear" onClick={() => setSearch("")} aria-label="مسح بحث المرضى"><X size={14} /></button>}
        </div>
        <div className="toolbar-filters">
          <button className={`filter-button ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>كل المرضى <span>{patients.length}</span></button>
          <button className={`filter-button ${filter === "pending" ? "active" : ""}`} onClick={() => setFilter("pending")}>بانتظار الإجراء <span>{pendingCount}</span></button>
          <button className={`filter-button ${filter === "lab" ? "active" : ""}`} onClick={() => setFilter("lab")}>في المختبر <span>{inLabCount}</span></button>
          <button className={`filter-button ${filter === "completed" ? "active" : ""}`} onClick={() => setFilter("completed")}>مكتملة <span>{completedCount}</span></button>
        </div>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>المريض</th><th>النوع / العمر</th><th>الفحوصات</th><th>الدفع</th><th>الحالة</th><th>التسجيل</th><th /></tr></thead>
            <tbody>
              {filtered.map(patient => (
                <tr key={patient.id} className="clickable-row" onClick={() => onSelectPatient(patient)}>
                  <td><div className="person-cell"><div className={`avatar ${patient.gender === "أنثى" ? "female" : ""}`}>{initials(patient.name)}</div><div><strong>{patient.name}</strong><span>{patient.id}{patient.sequence != null ? ` · #${String(patient.sequence).padStart(4, "0")}` : ""} · {patient.phone}</span></div></div></td>
                  <td><strong>{patient.gender}</strong><span className="muted-line">{patient.age == null ? "العمر غير محدد" : `${patient.age} سنة`}</span></td>
                  <td><div className="test-tags">{patient.tests.map(test => <span key={test}>{test}</span>)}</div><span className="muted-line">{patient.tests.length} فحوصات</span></td>
                  <td><span className={`payment-label ${patient.paid ? "paid" : "unpaid"}`}>{patient.paid ? "مدفوعة" : "غير مكتملة"}</span></td>
                  <td><StatusPill status={patient.status} /></td>
                  <td className="muted-cell">{patient.registeredAt}</td>
                  <td><button className="row-menu" onClick={event => { event.stopPropagation(); onPrintInvoice(patient); }} aria-label="طباعة الفاتورة"><Printer size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="empty-state"><Search size={22} /><strong>{patients.length ? "لا توجد نتائج مطابقة" : "لا توجد سجلات محفوظة"}</strong><span>{patients.length ? "جرّب اسمًا أو رقم ملف مختلفًا أو غيّر الفلتر." : "أنشئ سجل مريض لبدء العمل."}</span></div>}
        </div>
      </section>
    </div>
  );
}
