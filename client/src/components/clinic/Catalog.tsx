import { BadgeCheck, Clock3, History, MoreHorizontal, PackageCheck, Plus, Save, ShieldCheck, Stethoscope, TestTube2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ConsultationPrices } from "@shared/billing";
import { trpc } from "@/lib/trpc";
import type { LabTest } from "@/lib/catalog";
import { formatClinicTime } from "@/lib/clinic-workflow";
import { formatCurrency } from "@/lib/clinic-utils";
import { SectionTitle } from "./ui";

type Tab = "pricing" | "catalog";

export function CatalogPanel({ catalog, prices, canEditDefinitions, canEditPrices, onToast, onChanged }: {
  catalog: LabTest[];
  prices: ConsultationPrices;
  canEditDefinitions: boolean;
  canEditPrices: boolean;
  onToast: (message: string) => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>(canEditPrices ? "pricing" : "catalog");
  const [category, setCategory] = useState("الكل");
  const [editing, setEditing] = useState<LabTest | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState({ code: "", nameAr: "", nameEn: "", category: "", sample: "", turnaround: "", price: "0", fieldsJson: "[]" });
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [consultationDraft, setConsultationDraft] = useState({ general: String(prices.general), specialist: String(prices.specialist) });
  const saveMutation = trpc.catalog.save.useMutation();
  const pricesMutation = trpc.catalog.updatePrices.useMutation();
  const consultationMutation = trpc.pricing.updateConsultation.useMutation();
  const historyQuery = trpc.pricing.history.useQuery(undefined, { enabled: canEditPrices, retry: false });
  const trpcUtils = trpc.useUtils();

  useEffect(() => {
    setPriceDraft(Object.fromEntries(catalog.map(test => [test.code, String(test.price)])));
  }, [catalog]);
  useEffect(() => {
    if (!canEditPrices) setTab("catalog");
  }, [canEditPrices]);
  useEffect(() => {
    setConsultationDraft({ general: String(prices.general), specialist: String(prices.specialist) });
  }, [prices.general, prices.specialist]);

  const categories = useMemo(() => ["الكل", ...Array.from(new Set(catalog.map(test => test.category)))], [catalog]);
  const visibleTests = category === "الكل" ? catalog : catalog.filter(test => test.category === category);
  const changedPrices = catalog.filter(test => {
    const value = Number(priceDraft[test.code]);
    return priceDraft[test.code] !== undefined && priceDraft[test.code] !== "" && Number.isInteger(value) && value >= 0 && value !== test.price;
  });

  const refresh = () => {
    void trpcUtils.catalog.list.invalidate();
    void trpcUtils.pricing.get.invalidate();
    void trpcUtils.pricing.history.invalidate();
    onChanged();
  };

  const openEditor = (test?: LabTest) => {
    setEditing(test ?? null);
    setEditorOpen(true);
    setDraft(test
      ? { code: test.code, nameAr: test.name, nameEn: test.english, category: test.category, sample: test.sample, turnaround: test.turnaround, price: String(test.price), fieldsJson: JSON.stringify(test.fields) }
      : { code: "", nameAr: "", nameEn: "", category: "", sample: "", turnaround: "", price: "0", fieldsJson: "[]" });
  };

  const saveDefinition = () => {
    try {
      const parsed = JSON.parse(draft.fieldsJson) as unknown;
      if (!Array.isArray(parsed)) throw new Error("invalid");
    } catch {
      onToast("حقول الفحص ليست بصيغة JSON صحيحة");
      return;
    }
    saveMutation.mutate({
      code: draft.code.trim(),
      nameAr: draft.nameAr.trim(),
      nameEn: draft.nameEn.trim() || undefined,
      category: draft.category.trim() || undefined,
      sample: draft.sample.trim() || undefined,
      turnaround: draft.turnaround.trim() || undefined,
      price: Number(draft.price),
      fieldsJson: draft.fieldsJson,
      active: 1,
    }, {
      onSuccess: () => { setEditing(null); setEditorOpen(false); onToast(`تم ${editing ? "تحديث" : "إضافة"} الفحص ${draft.code}`); refresh(); },
      onError: error => onToast(error.message || "تعذر حفظ الفحص"),
    });
  };

  const savePrices = () => {
    if (!changedPrices.length) {
      onToast("لا توجد تغييرات في أسعار الفحوصات");
      return;
    }
    const invalid = changedPrices.find(test => !Number.isInteger(Number(priceDraft[test.code])) || Number(priceDraft[test.code]) < 0);
    if (invalid) {
      onToast(`سعر الفحص ${invalid.code} غير صالح`);
      return;
    }
    pricesMutation.mutate({ items: changedPrices.map(test => ({ code: test.code, price: Number(priceDraft[test.code]) })) }, {
      onSuccess: result => { onToast(`تم تحديث سعر ${result.updated} فحصًا`); refresh(); },
      onError: error => onToast(error.message || "تعذر تحديث الأسعار"),
    });
  };

  const saveConsultation = () => {
    const general = Number(consultationDraft.general);
    const specialist = Number(consultationDraft.specialist);
    if (!Number.isInteger(general) || general < 0 || !Number.isInteger(specialist) || specialist < 0) {
      onToast("أدخل سعرًا صحيحًا للمعاينة العمومية والاختصاصية");
      return;
    }
    consultationMutation.mutate({ generalPrice: general, specialistPrice: specialist }, {
      onSuccess: result => { onToast(result.changed ? "تم تحديث أسعار المعاينة" : "الأسعار مطابقة بالفعل"); refresh(); },
      onError: error => onToast(error.message || "تعذر تحديث أسعار المعاينة"),
    });
  };

  return (
    <div className="page-stack">
      <SectionTitle
        eyebrow="التسعير · مشرف التشغيل"
        title="الأسعار وكتالوج الفحوصات"
        description={canEditDefinitions
          ? "عدّل أسعار جميع الفحوصات وأسعار المعاينة، وأضف الفحوصات وحقول نتائجها كمدير نظام."
          : "تعديل أسعار الفحوصات وسعر معاينة الطبيب العمومي والاختصاصي. تعديل تعريف الفحوصات وحقولها من صلاحية مدير النظام فقط."}
        action={<div className="heading-actions">
          <div className="table-actions">
            {canEditPrices && <button className={`filter-button ${tab === "pricing" ? "active" : ""}`} onClick={() => setTab("pricing")}>التسعير</button>}
            {(canEditDefinitions || !canEditPrices) && <button className={`filter-button ${tab === "catalog" ? "active" : ""}`} onClick={() => setTab("catalog")}>كتالوج الفحوصات</button>}
          </div>
          {canEditDefinitions && tab === "catalog" && <button className="button button-primary" onClick={() => openEditor()}><Plus size={16} />إضافة فحص</button>}
        </div>}
      />

      {tab === "pricing" ? (
        <>
          <section className="panel consultation-panel">
            <div className="panel-header">
              <div><span className="eyebrow">مقابلة / معاينة الطبيب</span><h2>أسعار المعاينة الطبية</h2></div>
              <span className={canEditPrices ? "saved-badge" : "readonly-badge"}><ShieldCheck size={14} />{canEditPrices ? "قابلة للتعديل" : "قراءة فقط"}</span>
            </div>
            <div className="consultation-grid">
              <div className="consultation-card">
                <div className="consultation-icon"><Stethoscope size={18} /></div>
                <div><strong>طبيب عمومي</strong><span>تُضاف كبند اختياري في فاتورة المريض الجديد</span></div>
                <label className="form-field"><span>السعر (ج.س)</span><input type="number" min="0" step="1" disabled={!canEditPrices} value={consultationDraft.general} onChange={event => setConsultationDraft(current => ({ ...current, general: event.target.value }))} /></label>
              </div>
              <div className="consultation-card">
                <div className="consultation-icon specialist"><Stethoscope size={18} /></div>
                <div><strong>طبيب اختصاصي</strong><span>سعر مستقل لكل زيارة اختصاصي</span></div>
                <label className="form-field"><span>السعر (ج.س)</span><input type="number" min="0" step="1" disabled={!canEditPrices} value={consultationDraft.specialist} onChange={event => setConsultationDraft(current => ({ ...current, specialist: event.target.value }))} /></label>
              </div>
            </div>
            <div className="panel-footer">
              <span className="muted-line">السعر الجديد يُطبّق على الفواتير الجديدة؛ الفواتير السابقة تحتفظ بسعرها الأصلي.</span>
              <button className="button button-primary" disabled={!canEditPrices || consultationMutation.isPending} onClick={saveConsultation}><Save size={15} />{consultationMutation.isPending ? "جارٍ الحفظ..." : "حفظ أسعار المعاينة"}</button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div><span className="eyebrow">كتالوج الفحوصات · {catalog.length} فحصًا</span><h2>أسعار الفحوصات</h2></div>
              <div className="table-actions">
                <span className="catalog-count"><PackageCheck size={15} />{changedPrices.length} تغييرًا غير محفوظ</span>
                <button className="button button-primary" disabled={!canEditPrices || pricesMutation.isPending || changedPrices.length === 0} onClick={savePrices}><Save size={15} />{pricesMutation.isPending ? "جارٍ الحفظ..." : "حفظ الأسعار"}</button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="price-table">
                <thead><tr><th>الرمز</th><th>الفحص</th><th>التصنيف</th><th>العينة</th><th>السعر الحالي</th><th>السعر الجديد</th></tr></thead>
                <tbody>
                  {catalog.map(test => {
                    const draftValue = priceDraft[test.code] ?? String(test.price);
                    const dirty = Number(draftValue) !== test.price;
                    return (
                      <tr key={test.code} className={dirty ? "dirty-row" : ""}>
                        <td><span className="test-code">{test.code}</span></td>
                        <td><strong>{test.name}</strong><span className="muted-line">{test.english}</span></td>
                        <td>{test.category}</td>
                        <td>{test.sample}</td>
                        <td className="muted-cell">{formatCurrency(test.price)}</td>
                        <td><input className="price-input" type="number" min="0" step="1" disabled={!canEditPrices} value={draftValue} onChange={event => setPriceDraft(current => ({ ...current, [test.code]: event.target.value }))} aria-label={`سعر ${test.code}`} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header"><div><span className="eyebrow">سجل التدقيق</span><h2>آخر تغييرات الأسعار</h2></div><History size={18} className="muted-icon" /></div>
            {historyQuery.isLoading ? <div className="empty-state"><strong>جارٍ تحميل السجل...</strong></div> : !historyQuery.data?.length ? <div className="empty-state"><History size={20} /><strong>لا توجد تغييرات مسجلة</strong><span>سيظهر هنا كل تعديل سعر مع المستخدم والوقت.</span></div> : (
              <div className="table-wrap"><table><thead><tr><th>البند</th><th>السعر السابق</th><th>السعر الجديد</th><th>بواسطة</th><th>الوقت</th></tr></thead><tbody>
                {historyQuery.data.map(row => (
                  <tr key={row.id}>
                    <td><strong>{row.entity === "lab_test" ? `فحص ${row.reference}` : row.reference === "general" ? "معاينة طبيب عمومي" : "معاينة طبيب اختصاصي"}</strong></td>
                    <td className="muted-cell">{formatCurrency(row.oldPrice)}</td>
                    <td><strong className="teal-text">{formatCurrency(row.newPrice)}</strong></td>
                    <td>{row.actorName ?? "—"}</td>
                    <td className="muted-cell">{formatClinicTime(new Date(row.createdAt))}</td>
                  </tr>
                ))}
              </tbody></table></div>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="catalog-toolbar">
            <div className="category-tabs">{categories.map(item => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className="catalog-count"><TestTube2 size={16} />{visibleTests.length} فحوصات معروضة</div>
          </div>
          <div className="catalog-grid">
            {visibleTests.map(test => (
              <article className="test-card" key={test.code}>
                <div className="test-card-top"><span className="test-code">{test.code}</span>{canEditDefinitions && <button className="row-menu" title="تعديل إعدادات الفحص" onClick={() => openEditor(test)}><MoreHorizontal size={16} /></button>}</div>
                <h3>{test.name}</h3>
                <p>{test.english}</p>
                <div className="test-card-meta"><span><TestTube2 size={14} />{test.sample}</span><span><Clock3 size={14} />{test.turnaround}</span></div>
                <div className="test-card-bottom"><strong>{formatCurrency(test.price)}</strong><span>{test.fields.length} حقول نتيجة</span></div>
              </article>
            ))}
          </div>
        </>
      )}

      {editorOpen && canEditDefinitions && (
        <div className="modal-backdrop" onMouseDown={() => { setEditing(null); setEditorOpen(false); }}>
          <div className="modal-card" onMouseDown={event => event.stopPropagation()}>
            <div className="modal-header"><div><span className="eyebrow">كتالوج الفحوصات · مدير النظام</span><h2>{editing ? `تعديل ${editing.code}` : "إضافة فحص جديد"}</h2></div><button className="icon-button" onClick={() => { setEditing(null); setEditorOpen(false); }}><X size={18} /></button></div>
            <div className="modal-body">
              <div className="form-grid">
                <label className="form-field"><span>رمز الفحص *</span><input value={draft.code} disabled={Boolean(editing)} onChange={event => setDraft({ ...draft, code: event.target.value })} placeholder="CBC" /></label>
                <label className="form-field"><span>السعر *</span><input type="number" min="0" value={draft.price} onChange={event => setDraft({ ...draft, price: event.target.value })} /></label>
                <label className="form-field"><span>الاسم العربي *</span><input value={draft.nameAr} onChange={event => setDraft({ ...draft, nameAr: event.target.value })} /></label>
                <label className="form-field"><span>الاسم الإنجليزي</span><input value={draft.nameEn} onChange={event => setDraft({ ...draft, nameEn: event.target.value })} /></label>
                <label className="form-field"><span>التصنيف</span><input value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} /></label>
                <label className="form-field"><span>نوع العينة</span><input value={draft.sample} onChange={event => setDraft({ ...draft, sample: event.target.value })} /></label>
                <label className="form-field"><span>زمن النتيجة المتوقع</span><input value={draft.turnaround} onChange={event => setDraft({ ...draft, turnaround: event.target.value })} placeholder="30 دقيقة" /></label>
                <label className="form-field full-field"><span>حقول النتيجة والمديات بصيغة JSON</span><textarea rows={8} value={draft.fieldsJson} onChange={event => setDraft({ ...draft, fieldsJson: event.target.value })} /><small>مثال الحقل: {`[{"key":"result","label":"النتيجة","male":"—","female":"—","type":"text"}]`}</small></label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="button button-secondary" onClick={() => { setEditing(null); setEditorOpen(false); }}>إلغاء</button>
              <button className="button button-primary" disabled={saveMutation.isPending || !draft.code.trim() || draft.nameAr.trim().length < 2 || !Number.isInteger(Number(draft.price)) || Number(draft.price) < 0} onClick={saveDefinition}><BadgeCheck size={16} />{saveMutation.isPending ? "جارٍ الحفظ..." : "حفظ الفحص"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
