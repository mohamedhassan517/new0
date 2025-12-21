import Layout from "@/components/Layout";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "sonner";
import {
  createProjectCost,
  createProjectSale,
  deleteProject,
  loadProjectSnapshot,
  payInstallment,
} from "@/services/accounting";
import type {
  ProjectCost,
  ProjectSale,
  ProjectSnapshot,
} from "@shared/accounting";

const today = () => new Date().toLocaleDateString("en-CA");

export default function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === "manager" || user?.role === "accountant";

  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const makeNewCostState = () => ({
    type: "construction" as ProjectCost["type"],
    amount: "",
    date: today(),
    note: "",
    customTypeLabel: "",
  });
  const [newCost, setNewCost] = useState(makeNewCostState);
  const [savingCost, setSavingCost] = useState(false);

  const [newSale, setNewSale] = useState({
    unitNo: "",
    buyer: "",
    price: "",
    date: today(),
    terms: "",
    area: "",
    paymentMethod: "كاش",
    downPayment: "",
    monthlyAmount: "",
    months: "",
    firstDueDate: today(),
  });
  const [savingSale, setSavingSale] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [installmentFilter, setInstallmentFilter] = useState<'all' | 'paid' | 'unpaid' | 'due'>('all');
  const [expandedInstallment, setExpandedInstallment] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const s = await loadProjectSnapshot(id);
        if (alive) setSnapshot(s);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "فشل التحميل";
        setError(msg);
        toast.error("تعذر تحميل المشروع", { description: msg });
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!snapshot) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const due = (snapshot.installments || []).filter(
      (i) => !i.paid && i.dueDate <= todayStr,
    );
    if (due.length) {
      // إشعار شامل للأقساط المستحقة
      const totalDueAmount = due.reduce((sum, i) => sum + i.amount, 0);
      toast.warning(
        `لديك ${due.length} أقساط مستحقة بإجمالي ${totalDueAmount.toLocaleString()} ج.م`,
        {
          description: `أقساط للوحدات: ${due.map(i => i.unitNo).join(', ')}`,
          duration: 10000,
        }
      );
      
      // إشعارات فردية للأقساط (محدودة)
      due
        .slice(0, 3)
        .forEach((i) =>
          toast.warning(
            `قسط مستحق ${i.amount.toLocaleString()} ج.م للوحدة ${i.unitNo}`,
            {
              description: `المشتري: ${i.buyer} - مستحق منذ: ${i.dueDate}`,
              duration: 8000,
            }
          ),
        );
    }
  }, [snapshot]);

  const totals = useMemo(() => {
    const costs = snapshot?.costs.reduce((a, b) => a + b.amount, 0) ?? 0;
    const sales = snapshot?.sales.reduce((a, b) => a + b.price, 0) ?? 0;
    return { costs, sales, profit: sales - costs };
  }, [snapshot]);

  const addCost = async () => {
    if (!snapshot || !id) return;
    if (!newCost.amount) return toast.error("المبلغ مطلوب");
    const amount = Number(newCost.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      return toast.error("قيمة غير صحيحة");
    const customTypeLabel =
      newCost.type === "other" ? newCost.customTypeLabel.trim() : undefined;
    if (newCost.type === "other" && !customTypeLabel) {
      return toast.error("يرجى إدخال نوع التكلفة");
    }
    try {
      setSavingCost(true);
      const res = await createProjectCost({
        projectId: id,
        projectName: snapshot.project.name,
        type: newCost.type,
        customTypeLabel,
        amount,
        date: newCost.date,
        note: newCost.note,
        approved: canManage,
        createdBy: user?.id ?? null,
      });
      setSnapshot((prev) =>
        prev ? { ...prev, costs: [res.cost, ...prev.costs] } : prev,
      );
      setNewCost(makeNewCostState());
      toast.success("تم تسجيل التكلفة");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر التسجيل";
      toast.error("فشل تسجيل التكلفة", { description: msg });
    } finally {
      setSavingCost(false);
    }
  };

  const addSale = async () => {
    if (!snapshot || !id) return;
    if (!newSale.unitNo || !newSale.buyer || !newSale.price)
      return toast.error("أكمل بيانات البيع");
    const price = Number(newSale.price);
    if (!Number.isFinite(price) || price <= 0)
      return toast.error("قيمة غير صحيحة");

    const isInstallment = newSale.paymentMethod === "تقسيط";
    let downPaymentNum: number | null = null;
    let monthlyAmountNum: number | null = null;
    let monthsNum: number | null = null;
    let firstDue = null as string | null;
    if (isInstallment) {
      monthlyAmountNum = Number(newSale.monthlyAmount);
      monthsNum = Number(newSale.months);
      downPaymentNum = newSale.downPayment ? Number(newSale.downPayment) : 0;
      firstDue = newSale.firstDueDate;
      if (
        !Number.isFinite(monthlyAmountNum) ||
        monthlyAmountNum! <= 0 ||
        !Number.isFinite(monthsNum) ||
        monthsNum! <= 0 ||
        !firstDue
      ) {
        return toast.error("أكمل بيانات التقسيط (المقدم اختياري)");
      }
    }

    try {
      setSavingSale(true);
      const res = await createProjectSale({
        projectId: id,
        projectName: snapshot.project.name,
        unitNo: newSale.unitNo,
        buyer: newSale.buyer,
        price,
        date: newSale.date,
        terms: newSale.terms || null,
        area: newSale.area || null,
        paymentMethod: newSale.paymentMethod || null,
        downPayment: isInstallment ? downPaymentNum : null,
        monthlyAmount: isInstallment ? monthlyAmountNum : null,
        months: isInstallment ? monthsNum : null,
        firstDueDate: isInstallment ? firstDue : null,
        approved: canManage,
        createdBy: user?.id ?? null,
      });
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              sales: [res.sale, ...prev.sales],
              installments:
                res.installments && res.installments.length
                  ? [...res.installments, ...prev.installments]
                  : prev.installments,
            }
          : prev,
      );
      setNewSale({
        unitNo: "",
        buyer: "",
        price: "",
        date: today(),
        terms: "",
        area: "",
        paymentMethod: "كاش",
        downPayment: "",
        monthlyAmount: "",
        months: "",
        firstDueDate: today(),
      });
      toast.success("تم تسجيل البيع وإصدار الفاتورة");
      printInvoice(res.sale.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر التسجيل";
      toast.error("فشل تسجيل البيع", { description: msg });
    } finally {
      setSavingSale(false);
    }
  };

  const printInvoice = (saleId: string) => {
    const sale = snapshot?.sales.find((s) => s.id === saleId);
    if (!sale || !snapshot) return;
    const p = snapshot.project;
    const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>فاتورة</title>
      <style>body{font-family:Arial,system-ui;padding:24px} h1{font-size:20px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;margin-top:12px} th,td{border:1px solid #ddd;padding:8px} th{background:#f1f5f9}</style>
    </head><body>
      <h1>فاتورة بيع وحدة</h1>
      <div>المشروع: <strong>${p.name}</strong> — الموقع: ${p.location}</div>
      <div>التاريخ: ${sale.date}</div>
      <table><thead><tr><th>الوحدة</th><th>المشتري</th><th>المساحة</th><th>طريقة الدفع</th><th>السعر</th></tr></thead>
        <tbody><tr><td>${sale.unitNo}</td><td>${sale.buyer}</td><td>${sale.area ?? "-"}</td><td>${sale.paymentMethod ?? "-"}</td><td>${sale.price.toLocaleString()} ج.م</td></tr></tbody>
      </table>
      <script>window.print()</script>
    </body></html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  const printInstallmentsReport = () => {
    if (!snapshot) return;
    const p = snapshot.project;
    const todayStr = new Date().toISOString().slice(0, 10);
    
    // تجميع الأقساط حسب الوحدة والمشتري
    const groupedInstallments = snapshot.installments.reduce((acc, inst) => {
      const key = `${inst.unitNo}-${inst.buyer}`;
      if (!acc[key]) {
        acc[key] = {
          unitNo: inst.unitNo,
          buyer: inst.buyer,
          installments: [],
          totalAmount: 0,
          paidAmount: 0,
          remainingAmount: 0,
        };
      }
      acc[key].installments.push(inst);
      acc[key].totalAmount += inst.amount;
      if (inst.paid) {
        acc[key].paidAmount += inst.amount;
      }
      return acc;
    }, {} as Record<string, {
      unitNo: string;
      buyer: string;
      installments: typeof snapshot.installments;
      totalAmount: number;
      paidAmount: number;
      remainingAmount: number;
    }>);

    // حساب المبلغ المتبقي لكل مجموعة
    Object.values(groupedInstallments).forEach(group => {
      group.remainingAmount = group.totalAmount - group.paidAmount;
    });

    const dueInstallments = snapshot.installments.filter(
      (i) => !i.paid && i.dueDate <= todayStr,
    );

    const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>تقرير الأقساط</title>
      <style>
        body{font-family:Arial,system-ui;padding:24px;line-height:1.6}
        h1{font-size:24px;margin-bottom:16px;color:#1e40af}
        h2{font-size:18px;margin:16px 0 8px 0;color:#374151}
        .summary{background:#f8fafc;padding:16px;border-radius:8px;margin:16px 0}
        .summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
        .summary-item{background:white;padding:12px;border-radius:6px;border:1px solid #e2e8f0}
        .summary-label{font-size:14px;color:#64748b;margin-bottom:4px}
        .summary-value{font-size:18px;font-weight:bold;color:#1e293b}
        table{width:100%;border-collapse:collapse;margin-top:16px}
        th,td{border:1px solid #d1d5db;padding:8px;text-align:right}
        th{background:#f1f5f9;font-weight:600}
        .paid{color:#059669;font-weight:bold}
        .unpaid{color:#dc2626;font-weight:bold}
        .due{background:#fef2f2;color:#dc2626}
        .section{margin:24px 0}
        .unit-header{background:#3b82f6;color:white;padding:12px;border-radius:6px;margin:16px 0 8px 0}
      </style>
    </head><body>
      <h1>تقرير متابعة الأقساط</h1>
      <div>المشروع: <strong>${p.name}</strong> — الموقع: ${p.location}</div>
      <div>تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}</div>
      
      <div class="summary">
        <h2>ملخص الأقساط</h2>
        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">إجمالي الأقساط</div>
            <div class="summary-value">${snapshot.installments.length} قسط</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">المسدد</div>
            <div class="summary-value">${snapshot.installments.filter(i => i.paid).length} قسط</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">المتبقي</div>
            <div class="summary-value">${snapshot.installments.filter(i => !i.paid).length} قسط</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">المبلغ المتبقي</div>
            <div class="summary-value">${snapshot.installments.filter(i => !i.paid).reduce((sum, i) => sum + i.amount, 0).toLocaleString()} ج.م</div>
          </div>
        </div>
      </div>

      ${dueInstallments.length > 0 ? `
      <div class="section">
        <h2>الأقساط المستحقة (${dueInstallments.length})</h2>
        <table>
          <thead>
            <tr>
              <th>المشتري</th>
              <th>الوحدة</th>
              <th>تاريخ الاستحقاق</th>
              <th>المبلغ</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${dueInstallments.map(inst => `
              <tr class="due">
                <td>${inst.buyer}</td>
                <td>${inst.unitNo}</td>
                <td>${inst.dueDate}</td>
                <td>${inst.amount.toLocaleString()} ج.م</td>
                <td class="unpaid">مستحق</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <div class="section">
        <h2>تفاصيل الأقساط حسب الوحدة</h2>
        ${Object.values(groupedInstallments).map(group => `
          <div class="unit-header">
            <strong>${group.buyer} - الوحدة ${group.unitNo}</strong>
            <div style="font-size:14px;margin-top:4px">
              إجمالي: ${group.totalAmount.toLocaleString()} ج.م | 
              مدفوع: ${group.paidAmount.toLocaleString()} ج.م | 
              متبقي: ${group.remainingAmount.toLocaleString()} ج.م
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>تاريخ الاستحقاق</th>
                <th>المبلغ</th>
                <th>الحالة</th>
                <th>تاريخ السداد</th>
              </tr>
            </thead>
            <tbody>
              ${group.installments.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(inst => `
                <tr>
                  <td>${inst.dueDate}</td>
                  <td>${inst.amount.toLocaleString()} ج.م</td>
                  <td class="${inst.paid ? 'paid' : 'unpaid'}">${inst.paid ? 'مسدد' : 'غير مسدد'}</td>
                  <td>${inst.paidAt || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `).join('')}
      </div>
      
      <script>window.print()</script>
    </body></html>`;
    
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm("هل أنت متأكد من حذف المشروع؟")) return;
    try {
      setDeleting(true);
      await deleteProject(id);
      toast.success("تم حذف المشروع");
      navigate("/dashboard", { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر الحذف";
      toast.error("فشل حذف المشروع", { description: msg });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6">جارٍ التحميل...</div>
      </Layout>
    );
  }

  if (error || !snapshot) {
    return (
      <Layout>
        <div className="p-6">تعذر العثور على المشروع</div>
      </Layout>
    );
  }

  const getCostTypeLabel = (cost: ProjectCost) => {
    if (cost.customTypeLabel && cost.customTypeLabel.trim()) {
      return cost.customTypeLabel;
    }
    if (cost.type === "construction") return "إنشاء";
    if (cost.type === "operation") return "تشغيل";
    if (cost.type === "expense") return "مصروفات";
    return "أخرى";
  };

  const p = snapshot.project;

  return (
    <Layout>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">{p.name}</h1>
            <div className="text-slate-600 text-sm">{p.location}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border px-3 py-2"
              onClick={() => navigate(-1)}
            >
              رجوع
            </button>
            <button
              className="rounded-md bg-red-600 text-white px-3 py-2 disabled:opacity-50"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? "حذف..." : "حذف المشروع"}
            </button>
          </div>
        </div>

        {/* إحصائيات سريعة */}
        {snapshot.installments && snapshot.installments.length > 0 && (() => {
          const totalInstallments = snapshot.installments.length;
          const paidInstallments = snapshot.installments.filter(i => i.paid).length;
          const unpaidInstallments = totalInstallments - paidInstallments;
          const totalAmount = snapshot.installments.reduce((sum, i) => sum + i.amount, 0);
          const paidAmount = snapshot.installments.filter(i => i.paid).reduce((sum, i) => sum + i.amount, 0);
          const remainingAmount = totalAmount - paidAmount;
          const todayStr = new Date().toISOString().slice(0, 10);
          const dueToday = snapshot.installments.filter(i => !i.paid && i.dueDate <= todayStr).length;

          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg p-4">
                <div className="text-sm opacity-90">إجمالي الأقساط</div>
                <div className="text-2xl font-bold">{totalInstallments}</div>
              </div>
              
              <div className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg p-4">
                <div className="text-sm opacity-90">المسدد</div>
                <div className="text-2xl font-bold">{paidInstallments}</div>
              </div>
              
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg p-4">
                <div className="text-sm opacity-90">المتبقي</div>
                <div className="text-2xl font-bold">{unpaidInstallments}</div>
              </div>
              
              <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg p-4">
                <div className="text-sm opacity-90">المستحقة اليوم</div>
                <div className="text-2xl font-bold">{dueToday}</div>
              </div>
            </div>
          );
        })()}

        {/* تذكيرات الأقساط المستحقة */}
        {snapshot.installments && snapshot.installments.length > 0 && (() => {
          const todayStr = new Date().toISOString().slice(0, 10);
          const dueInstallments = snapshot.installments.filter(
            (i) => !i.paid && i.dueDate <= todayStr,
          );
          const upcomingInstallments = snapshot.installments.filter(
            (i) => !i.paid && i.dueDate > todayStr,
          ).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);

          if (dueInstallments.length > 0 || upcomingInstallments.length > 0) {
            return (
              <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <h3 className="font-semibold text-orange-800">تذكيرات الأقساط</h3>
                </div>
                
                {dueInstallments.length > 0 && (
                  <div className="mb-4">
                    <div className="text-sm font-medium text-red-700 mb-2">
                      أقساط مستحقة ({dueInstallments.length})
                    </div>
                    <div className="space-y-2">
                      {dueInstallments.slice(0, 3).map((inst) => (
                        <div key={inst.id} className="bg-red-100 border border-red-200 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-red-800">
                                {inst.buyer} - الوحدة {inst.unitNo}
                              </div>
                              <div className="text-sm text-red-600">
                                مستحق منذ: {inst.dueDate}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-red-800">
                                {inst.amount.toLocaleString()} ج.م
                              </div>
                              <button
                                className="mt-1 text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 transition-colors"
                                onClick={async () => {
                                  try {
                                    const r = await payInstallment(inst.id);
                                    setSnapshot((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            installments: prev.installments.map(
                                              (x) =>
                                                x.id === inst.id
                                                  ? r.installment
                                                  : x,
                                            ),
                                          }
                                        : prev,
                                    );
                                    toast.success("تم تسجيل سداد القسط");
                                  } catch (e) {
                                    const msg =
                                      e instanceof Error
                                        ? e.message
                                        : "تعذر السداد";
                                    toast.error("فشل سداد القسط", {
                                      description: msg,
                                    });
                                  }
                                }}
                              >
                                سداد فوري
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {dueInstallments.length > 3 && (
                        <div className="text-sm text-red-600 text-center">
                          + {dueInstallments.length - 3} أقساط أخرى مستحقة
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {upcomingInstallments.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-orange-700 mb-2">
                      أقساط قادمة ({upcomingInstallments.length})
                    </div>
                    <div className="space-y-2">
                      {upcomingInstallments.map((inst) => (
                        <div key={inst.id} className="bg-orange-100 border border-orange-200 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-orange-800">
                                {inst.buyer} - الوحدة {inst.unitNo}
                              </div>
                              <div className="text-sm text-orange-600">
                                استحقاق: {inst.dueDate}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-orange-800">
                                {inst.amount.toLocaleString()} ج.م
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          }
          return null;
        })()}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
            <h3 className="font-semibold mb-3">تسجيل تكلفة للمشروع</h3>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <select
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  value={newCost.type}
                  onChange={(e) => {
                    const value = e.target.value as ProjectCost["type"];
                    setNewCost((prev) => ({
                      ...prev,
                      type: value,
                      customTypeLabel:
                        value === "other" ? prev.customTypeLabel : "",
                    }));
                  }}
                >
                  <option value="construction">إنشاء</option>
                  <option value="operation">تشغيل</option>
                  <option value="expense">مصروفات</option>
                  <option value="other">أخرى</option>
                </select>
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="المبلغ"
                  value={newCost.amount}
                  onChange={(e) =>
                    setNewCost({ ...newCost, amount: e.target.value })
                  }
                />
              </div>
              {newCost.type === "other" ? (
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="حدد نوع التكلفة"
                  value={newCost.customTypeLabel}
                  onChange={(e) =>
                    setNewCost((prev) => ({
                      ...prev,
                      customTypeLabel: e.target.value,
                    }))
                  }
                />
              ) : null}
              <input
                type="date"
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                value={newCost.date}
                onChange={(e) =>
                  setNewCost({ ...newCost, date: e.target.value })
                }
              />
              <input
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                placeholder="ملاحظة"
                value={newCost.note}
                onChange={(e) =>
                  setNewCost({ ...newCost, note: e.target.value })
                }
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void addCost()}
                  disabled={savingCost}
                  className="rounded-md bg-slate-900 px-4 py-2 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingCost ? "جاري التسجيل..." : "تسجيل التكلفة"}
                </button>
                <button
                  onClick={() => setNewCost(makeNewCostState())}
                  className="rounded-md border px-3 py-2 bg-white"
                >
                  إعادة تعيين
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
            <h3 className="font-semibold mb-3">تسجيل بيع وإصدار فاتورة</h3>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="رقم الوحدة"
                  value={newSale.unitNo}
                  onChange={(e) =>
                    setNewSale({ ...newSale, unitNo: e.target.value })
                  }
                />
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="السعر"
                  value={newSale.price}
                  onChange={(e) =>
                    setNewSale({ ...newSale, price: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="اسم المشتري"
                  value={newSale.buyer}
                  onChange={(e) =>
                    setNewSale({ ...newSale, buyer: e.target.value })
                  }
                />
                <input
                  type="date"
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  value={newSale.date}
                  onChange={(e) =>
                    setNewSale({ ...newSale, date: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="المساحة (م²)"
                  value={newSale.area}
                  onChange={(e) =>
                    setNewSale({ ...newSale, area: e.target.value })
                  }
                />
                <select
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  value={newSale.paymentMethod}
                  onChange={(e) =>
                    setNewSale({ ...newSale, paymentMethod: e.target.value })
                  }
                >
                  <option value="كاش">كاش</option>
                  <option value="تقسيط">تقسيط</option>
                </select>
              </div>

              {newSale.paymentMethod === "تقسيط" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                    placeholder="المقدم (اختياري)"
                    value={newSale.downPayment}
                    onChange={(e) =>
                      setNewSale({ ...newSale, downPayment: e.target.value })
                    }
                  />
                  <input
                    className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                    placeholder="قيمة القسط الشهري"
                    value={newSale.monthlyAmount}
                    onChange={(e) =>
                      setNewSale({ ...newSale, monthlyAmount: e.target.value })
                    }
                  />
                  <input
                    className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                    placeholder="عدد الأشهر"
                    value={newSale.months}
                    onChange={(e) =>
                      setNewSale({ ...newSale, months: e.target.value })
                    }
                  />
                  <input
                    type="date"
                    className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                    value={newSale.firstDueDate}
                    onChange={(e) =>
                      setNewSale({ ...newSale, firstDueDate: e.target.value })
                    }
                  />
                </div>
              )}

              <input
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                placeholder="شروط التعاقد (اختياري)"
                value={newSale.terms}
                onChange={(e) =>
                  setNewSale({ ...newSale, terms: e.target.value })
                }
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void addSale()}
                  disabled={savingSale}
                  className="rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingSale ? "جاري التسجيل..." : "تسجيل البيع + فاتورة"}
                </button>
                <button
                  onClick={() =>
                    setNewSale({
                      unitNo: "",
                      buyer: "",
                      price: "",
                      date: today(),
                      terms: "",
                    })
                  }
                  className="rounded-md border px-3 py-2 bg-white"
                >
                  إعادة تعيين
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
            <h3 className="font-semibold mb-3">التكاليف</h3>
            <div className="overflow-x-auto">
              <table className="w-full table-auto border-collapse text-sm text-right">
                <thead>
                  <tr className="text-right bg-slate-50">
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">النوع</th>
                    <th className="px-3 py-2">المبلغ</th>
                    <th className="px-3 py-2">ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.costs.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-3 py-2">{c.date}</td>
                      <td className="px-3 py-2">{getCostTypeLabel(c)}</td>
                      <td className="px-3 py-2">{c.amount.toLocaleString()}</td>
                      <td className="px-3 py-2">{c.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
            <h3 className="font-semibold mb-3">المبيعات</h3>
            <div className="overflow-x-auto">
              <table className="w-full table-auto border-collapse text-sm text-right">
                <thead>
                  <tr className="text-right bg-slate-50">
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">الوحدة</th>
                    <th className="px-3 py-2">المشتري</th>
                    <th className="px-3 py-2">المساحة</th>
                    <th className="px-3 py-2">طريقة الدفع</th>
                    <th className="px-3 py-2">السعر</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.sales.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-2">{s.date}</td>
                      <td className="px-3 py-2">{s.unitNo}</td>
                      <td className="px-3 py-2">{s.buyer}</td>
                      <td className="px-3 py-2">{s.area ?? "-"}</td>
                      <td className="px-3 py-2">{s.paymentMethod ?? "-"}</td>
                      <td className="px-3 py-2">{s.price.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="rounded-md bg-slate-900 text-white px-3 py-1"
                          onClick={() => printInvoice(s.id)}
                        >
                          فاتورة
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">متابعة الأقساط</h3>
            <div className="flex items-center gap-2">
              {snapshot.installments && snapshot.installments.length > 0 && (
                <>
                  <select
                    value={installmentFilter}
                    onChange={(e) => setInstallmentFilter(e.target.value as any)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="all">جميع الأقساط</option>
                    <option value="paid">المسدد</option>
                    <option value="unpaid">غير المسدد</option>
                    <option value="due">المستحقة</option>
                  </select>
                  {installmentFilter !== 'all' && (
                    <button
                      onClick={() => setInstallmentFilter('all')}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
                    >
                      إعادة تعيين
                    </button>
                  )}
                  <button
                    onClick={printInstallmentsReport}
                    className="rounded-md bg-blue-600 text-white px-4 py-2 text-sm hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    تصدير تقرير
                  </button>
                </>
              )}
            </div>
          </div>
          {snapshot.installments && snapshot.installments.length ? (
            <div className="space-y-4">
              {(() => {
                // تجميع الأقساط حسب الوحدة والمشتري
                const groupedInstallments = snapshot.installments.reduce((acc, inst) => {
                  const key = `${inst.unitNo}-${inst.buyer}`;
                  if (!acc[key]) {
                    acc[key] = {
                      unitNo: inst.unitNo,
                      buyer: inst.buyer,
                      installments: [],
                      totalAmount: 0,
                      paidAmount: 0,
                      remainingAmount: 0,
                      nextDueDate: null,
                      nextDueAmount: 0,
                    };
                  }
                  acc[key].installments.push(inst);
                  acc[key].totalAmount += inst.amount;
                  if (inst.paid) {
                    acc[key].paidAmount += inst.amount;
                  }
                  return acc;
                }, {} as Record<string, {
                  unitNo: string;
                  buyer: string;
                  installments: typeof snapshot.installments;
                  totalAmount: number;
                  paidAmount: number;
                  remainingAmount: number;
                  nextDueDate: string | null;
                  nextDueAmount: number;
                }>);

                // حساب المبلغ المتبقي وتاريخ الاستحقاق التالي لكل مجموعة
                Object.values(groupedInstallments).forEach(group => {
                  group.remainingAmount = group.totalAmount - group.paidAmount;
                  
                  // العثور على تاريخ الاستحقاق التالي
                  const unpaidInstallments = group.installments
                    .filter(inst => !inst.paid)
                    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
                  
                  if (unpaidInstallments.length > 0) {
                    group.nextDueDate = unpaidInstallments[0].dueDate;
                    group.nextDueAmount = unpaidInstallments[0].amount;
                  }
                });

                // تطبيق الفلترة
                const filteredGroups = Object.values(groupedInstallments).filter(group => {
                  if (installmentFilter === 'all') return true;
                  if (installmentFilter === 'paid') return group.paidAmount > 0;
                  if (installmentFilter === 'unpaid') return group.remainingAmount > 0;
                  if (installmentFilter === 'due') {
                    const todayStr = new Date().toISOString().slice(0, 10);
                    return group.installments.some(inst => !inst.paid && inst.dueDate <= todayStr);
                  }
                  return true;
                });

                if (filteredGroups.length === 0) {
                  return (
                    <div className="text-center py-8 text-slate-500">
                      <div className="text-lg font-medium mb-2">لا توجد نتائج</div>
                      <div className="text-sm">
                        {installmentFilter === 'paid' && 'لا توجد أقساط مسددة'}
                        {installmentFilter === 'unpaid' && 'لا توجد أقساط غير مسددة'}
                        {installmentFilter === 'due' && 'لا توجد أقساط مستحقة'}
                        {installmentFilter === 'all' && 'لا توجد أقساط'}
                      </div>
                    </div>
                  );
                }

                return filteredGroups.map((group, index) => {
                  const groupKey = `${group.unitNo}-${group.buyer}`;
                  const isExpanded = expandedInstallment === groupKey;
                  
                  return (
                    <div key={index} className="border border-slate-200 rounded-lg bg-white shadow-sm">
                      {/* العنوان الرئيسي - اسم المشتري ورقم الوحدة */}
                      <div 
                        className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setExpandedInstallment(isExpanded ? null : groupKey)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${
                                group.remainingAmount === 0 ? 'bg-green-500' : 
                                group.remainingAmount < group.totalAmount * 0.5 ? 'bg-yellow-500' : 
                                'bg-red-500'
                              }`}></div>
                              <div>
                                <div className="font-semibold text-slate-900 text-lg">
                                  {group.buyer}
                                </div>
                                <div className="text-sm text-slate-600">
                                  الوحدة {group.unitNo}
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            {/* معلومات سريعة */}
                            <div className="text-right">
                              <div className="text-sm text-slate-600">المبلغ المتبقي</div>
                              <div className={`font-bold ${group.remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {group.remainingAmount.toLocaleString()} ج.م
                              </div>
                            </div>
                            
                            <div className="text-right">
                              <div className="text-sm text-slate-600">معدل السداد</div>
                              <div className="font-bold text-slate-900">
                                {Math.round((group.paidAmount / group.totalAmount) * 100)}%
                              </div>
                            </div>
                            
                            {/* حالة السداد */}
                            <div className="text-right">
                              <div className="text-sm text-slate-600">حالة السداد</div>
                              <div className={`font-bold ${
                                group.remainingAmount === 0 ? 'text-green-600' : 
                                group.remainingAmount < group.totalAmount * 0.5 ? 'text-yellow-600' : 
                                'text-red-600'
                              }`}>
                                {group.remainingAmount === 0 ? 'مكتمل' : 
                                 group.remainingAmount < group.totalAmount * 0.5 ? 'متقدم' : 
                                 'مبتدئ'}
                              </div>
                            </div>
                            
                            {/* زر التوسيع */}
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-500">
                                {isExpanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
                              </span>
                              <svg 
                                className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                            
                            {/* عدد الأقساط */}
                            <div className="text-right">
                              <div className="text-sm text-slate-600">عدد الأقساط</div>
                              <div className="font-bold text-slate-900">
                                {group.installments.filter(i => i.paid).length}/{group.installments.length}
                              </div>
                            </div>
                            
                            {/* تاريخ الاستحقاق التالي */}
                            <div className="text-right">
                              <div className="text-sm text-slate-600">الاستحقاق التالي</div>
                              <div className={`font-bold ${group.nextDueDate ? 'text-slate-900' : 'text-green-600'}`}>
                                {group.nextDueDate ? group.nextDueDate : 'مكتمل'}
                              </div>
                            </div>
                            
                            {/* مبلغ الاستحقاق التالي */}
                            <div className="text-right">
                              <div className="text-sm text-slate-600">مبلغ الاستحقاق</div>
                              <div className={`font-bold ${group.nextDueAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {group.nextDueAmount > 0 ? `${group.nextDueAmount.toLocaleString()} ج.م` : 'لا يوجد'}
                              </div>
                            </div>
                            
                            {/* مؤشر التقدم السريع */}
                            <div className="text-right">
                              <div className="text-sm text-slate-600">التقدم</div>
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-slate-200 rounded-full h-1">
                                  <div 
                                    className="bg-gradient-to-r from-green-500 to-green-600 h-1 rounded-full transition-all duration-300"
                                    style={{ width: `${(group.paidAmount / group.totalAmount) * 100}%` }}
                                  ></div>
                                </div>
                                <span className="text-xs font-medium text-slate-900">
                                  {Math.round((group.paidAmount / group.totalAmount) * 100)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* التفاصيل المطوية */}
                      {isExpanded && (
                        <div className="border-t border-slate-200 p-4 bg-slate-50">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div className="bg-white rounded-lg p-3 border">
                              <div className="text-sm text-slate-600">المبلغ المدفوع</div>
                              <div className="text-lg font-bold text-green-600">
                                {group.paidAmount.toLocaleString()} ج.م
                              </div>
                            </div>
                            
                            <div className="bg-white rounded-lg p-3 border">
                              <div className="text-sm text-slate-600">المبلغ الباقي</div>
                              <div className={`text-lg font-bold ${group.remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {group.remainingAmount.toLocaleString()} ج.م
                              </div>
                            </div>
                            
                            <div className="bg-white rounded-lg p-3 border">
                              <div className="text-sm text-slate-600">إجمالي المبلغ</div>
                              <div className="text-lg font-bold text-slate-900">
                                {group.totalAmount.toLocaleString()} ج.م
                              </div>
                            </div>
                          </div>
                          
                          {/* مؤشر التقدم */}
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-slate-600">معدل السداد</span>
                              <span className="text-sm font-bold text-slate-900">
                                {Math.round((group.paidAmount / group.totalAmount) * 100)}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2">
                              <div 
                                className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(group.paidAmount / group.totalAmount) * 100}%` }}
                              ></div>
                            </div>
                            <div className="flex justify-between text-xs text-slate-500 mt-1">
                              <span>0 ج.م</span>
                              <span>{group.totalAmount.toLocaleString()} ج.م</span>
                            </div>
                          </div>
                          
                          {/* معلومات إضافية */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <div className="text-sm font-medium text-slate-600 mb-1">تاريخ الاستحقاق التالي</div>
                              <div className={`font-semibold ${group.nextDueDate ? 'text-slate-900' : 'text-green-600'}`}>
                                {group.nextDueDate ? group.nextDueDate : 'تم السداد بالكامل'}
                              </div>
                            </div>
                            
                            <div>
                              <div className="text-sm font-medium text-slate-600 mb-1">مبلغ الاستحقاق التالي</div>
                              <div className={`font-semibold ${group.nextDueAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {group.nextDueAmount > 0 ? `${group.nextDueAmount.toLocaleString()} ج.م` : 'لا يوجد'}
                              </div>
                            </div>
                          </div>
                          
                          {/* حالة الأقساط */}
                          <div className="mb-4">
                            <div className="text-sm font-medium text-slate-600 mb-2">حالة الأقساط</div>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-green-100 border border-green-200 rounded-lg p-2 text-center">
                                <div className="text-xs text-green-600">مسدد</div>
                                <div className="text-sm font-bold text-green-800">
                                  {group.installments.filter(i => i.paid).length}
                                </div>
                              </div>
                              <div className="bg-orange-100 border border-orange-200 rounded-lg p-2 text-center">
                                <div className="text-xs text-orange-600">غير مسدد</div>
                                <div className="text-sm font-bold text-orange-800">
                                  {group.installments.filter(i => !i.paid).length}
                                </div>
                              </div>
                              <div className="bg-red-100 border border-red-200 rounded-lg p-2 text-center">
                                <div className="text-xs text-red-600">مستحق</div>
                                <div className="text-sm font-bold text-red-800">
                                  {group.installments.filter(i => !i.paid && i.dueDate <= new Date().toISOString().slice(0, 10)).length}
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {/* تفاصيل الأقساط */}
                          <div>
                            <div className="text-sm font-medium text-slate-600 mb-2">تفاصيل الأقساط</div>
                            <div className="overflow-x-auto">
                              <table className="w-full table-auto border-collapse text-sm text-right">
                                <thead>
                                  <tr className="text-right bg-white">
                                    <th className="px-3 py-2 border">التاريخ</th>
                                    <th className="px-3 py-2 border">المبلغ</th>
                                    <th className="px-3 py-2 border">الحالة</th>
                                    <th className="px-3 py-2 border">الإجراء</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.installments
                                    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                                    .map((inst) => (
                                    <tr key={inst.id} className="border-t">
                                      <td className="px-3 py-2 border">{inst.dueDate}</td>
                                      <td className="px-3 py-2 border">
                                        {inst.amount.toLocaleString()} ج.م
                                      </td>
                                      <td className="px-3 py-2 border">
                                        <span className={`px-2 py-1 rounded-full text-xs ${
                                          inst.paid 
                                            ? 'bg-green-100 text-green-800' 
                                            : 'bg-red-100 text-red-800'
                                        }`}>
                                          {inst.paid ? "مسدد" : "غير مسدد"}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 border text-center">
                                        {!inst.paid && (
                                          <button
                                            className="rounded-md bg-emerald-600 text-white px-3 py-1 text-xs hover:bg-emerald-700 transition-colors"
                                            onClick={async () => {
                                              try {
                                                const r = await payInstallment(inst.id);
                                                setSnapshot((prev) =>
                                                  prev
                                                    ? {
                                                        ...prev,
                                                        installments: prev.installments.map(
                                                          (x) =>
                                                            x.id === inst.id
                                                              ? r.installment
                                                              : x,
                                                        ),
                                                      }
                                                    : prev,
                                                );
                                                toast.success("تم تسجيل سداد القسط");
                                              } catch (e) {
                                                const msg =
                                                  e instanceof Error
                                                    ? e.message
                                                    : "تعذر السداد";
                                                toast.error("فشل سداد القسط", {
                                                  description: msg,
                                                });
                                              }
                                            }}
                                          >
                                            سداد
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="text-sm text-slate-500">لا توجد أقساط مسجلة.</div>
          )}
        </div>

        {/* ملخص الأقساط */}
        {snapshot.installments && snapshot.installments.length > 0 && (() => {
          const totalInstallments = snapshot.installments.length;
          const paidInstallments = snapshot.installments.filter(i => i.paid).length;
          const unpaidInstallments = totalInstallments - paidInstallments;
          const totalAmount = snapshot.installments.reduce((sum, i) => sum + i.amount, 0);
          const paidAmount = snapshot.installments.filter(i => i.paid).reduce((sum, i) => sum + i.amount, 0);
          const remainingAmount = totalAmount - paidAmount;
          const todayStr = new Date().toISOString().slice(0, 10);
          const dueToday = snapshot.installments.filter(i => !i.paid && i.dueDate <= todayStr).length;

          return (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <h3 className="font-semibold text-blue-800">ملخص الأقساط</h3>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-3 border">
                  <div className="text-sm text-slate-600">إجمالي الأقساط</div>
                  <div className="text-lg font-bold text-slate-900">
                    {totalInstallments} قسط
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-3 border">
                  <div className="text-sm text-slate-600">المسدد</div>
                  <div className="text-lg font-bold text-green-600">
                    {paidInstallments} قسط
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-3 border">
                  <div className="text-sm text-slate-600">المتبقي</div>
                  <div className="text-lg font-bold text-orange-600">
                    {unpaidInstallments} قسط
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-3 border">
                  <div className="text-sm text-slate-600">المبلغ المتبقي</div>
                  <div className="text-lg font-bold text-red-600">
                    {remainingAmount.toLocaleString()} ج.م
                  </div>
                </div>
              </div>
              
              {dueToday > 0 && (
                <div className="mt-4 bg-red-100 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <div className="text-sm font-medium text-red-800">
                      {dueToday} أقساط مستحقة اليوم
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <div className="rounded-lg border p-4 bg-white">
          <div className="font-semibold">ملخص المشروع</div>
          <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
            <div>
              <div className="text-slate-500">التكاليف</div>
              <div className="font-bold">
                {totals.costs.toLocaleString()} ج.م
              </div>
            </div>
            <div>
              <div className="text-slate-500">المبيعات</div>
              <div className="font-bold">
                {totals.sales.toLocaleString()} ج.م
              </div>
            </div>
            <div>
              <div className="text-slate-500">الربح</div>
              <div className="font-bold">
                {totals.profit.toLocaleString()} ج.م
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
