import { useCallback, useEffect, useMemo, useState } from "react";
import { DollarSign, ArrowUp, ArrowDown, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import UserManagement from "@/components/users/UserManagement";
import { toast } from "sonner";
import {
  approveTransaction,
  createInventoryItem,
  createProject,
  createTransaction,
  deleteInventoryItem,
  deleteTransaction,
  loadAccountingData,
  recordInventoryIssue,
  recordInventoryReceipt,
} from "@/services/accounting";
import type {
  InventoryItem,
  Movement,
  Project,
  ProjectCost,
  ProjectSale,
  Transaction,
  TransType,
} from "@shared/accounting";

const today = () => new Date().toLocaleDateString("en-CA");

export default function AccountingSystem() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isManager = user?.role === "manager";
  const isAccountant = user?.role === "accountant";
  const isEmployee = user?.role === "employee";
  const [active, setActive] = useState<
    | "dashboard"
    | "transactions"
    | "inventory"
    | "projects"
    | "reports"
    | "users"
  >("dashboard");

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [costs, setCosts] = useState<ProjectCost[]>([]);
  const [sales, setSales] = useState<ProjectSale[]>([]);

  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [quick, setQuick] = useState(() => ({
    type: "revenue" as TransType,
    amount: "",
    description: "",
    date: today(),
  }));
  const [newItem, setNewItem] = useState({
    name: "",
    quantity: "",
    unit: "طن",
    min: "",
  });
  const [receive, setReceive] = useState({
    itemId: "",
    qty: "",
    unitPrice: "",
    supplier: "",
    date: today(),
  });
  const [issue, setIssue] = useState({
    itemId: "",
    qty: "",
    unitPrice: "",
    project: "",
    date: today(),
  });
  const [newProject, setNewProject] = useState({
    name: "",
    location: "",
    floors: "",
    units: "",
  });

  const [savingQuick, setSavingQuick] = useState(false);

  const [projQuery, setProjQuery] = useState("");
  const [savingItem, setSavingItem] = useState(false);
  const [savingReceive, setSavingReceive] = useState(false);
  const [savingIssue, setSavingIssue] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<
    string | null
  >(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadingError(null);
    setInitialLoading(true);
    try {
      const data = await loadAccountingData();
      setTransactions(data.transactions);
      setItems(data.items);
      setMovements(data.movements);
      setProjects(data.projects);
      setCosts(data.costs);
      setSales(data.sales);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "حدث خطأ أثناء تحميل البيانات";
      setLoadingError(message);
      toast.error("تعذر تحميل البيانات من قاعدة البيانات", {
        description: message,
      });
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totals = useMemo(() => {
    const rev = transactions
      .filter((t) => t.type === "revenue")
      .reduce((a, b) => a + b.amount, 0);
    const exp = transactions
      .filter((t) => t.type === "expense" || t.type === "salaries")
      .reduce((a, b) => a + b.amount, 0);
    return { revenue: rev, expenses: exp, profit: rev - exp };
  }, [transactions]);

  const addQuick = async () => {
    if (!quick.amount || !quick.description || !quick.date) {
      toast.error("الرجاء إدخال جميع بيانات المعاملة");
      return;
    }
    const amount = Number(quick.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("قيمة المبلغ غير صحيحة");
      return;
    }
    try {
      setSavingQuick(true);
      const approved = isManager || isAccountant;
      const transaction = await createTransaction({
        date: quick.date,
        type: quick.type,
        description: quick.description,
        amount,
        approved,
        createdBy: user?.id ?? null,
      });
      setTransactions((prev) => [transaction, ...prev]);
      setQuick({ type: "revenue", amount: "", description: "", date: today() });
      toast.success("تمت إضافة المعاملة");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر حفظ المعاملة";
      toast.error("لم يتم حفظ المعاملة", { description: message });
    } finally {
      setSavingQuick(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      setApprovingId(id);
      const updated = await approveTransaction(id);
      setTransactions((prev) => prev.map((t) => (t.id === id ? updated : t)));
      toast.success("تم اعتماد المعاملة");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر اعتماد المعاملة";
      toast.error("فشل اعتماد المعاملة", { description: message });
    } finally {
      setApprovingId(null);
    }
  };

  const deleteTrans = async (id: string) => {
    try {
      setDeletingTransactionId(id);
      await deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      toast.success("تم حذف المعاملة");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر حذف المعاملة";
      toast.error("فشل حذف المعاملة", { description: message });
    } finally {
      setDeletingTransactionId(null);
    }
  };

  const addItem = async () => {
    if (!newItem.name || !newItem.quantity || !newItem.min) {
      toast.error("الرجاء إدخال بيانات المادة كاملة");
      return;
    }
    const quantity = Number(newItem.quantity);
    const min = Number(newItem.min);
    if (
      !Number.isFinite(quantity) ||
      quantity < 0 ||
      !Number.isFinite(min) ||
      min < 0
    ) {
      toast.error("القيم العددية غير صحيحة");
      return;
    }
    try {
      setSavingItem(true);
      const item = await createInventoryItem({
        name: newItem.name,
        quantity,
        unit: newItem.unit,
        min,
        updatedAt: today(),
      });
      setItems((prev) => [item, ...prev]);
      setNewItem({ name: "", quantity: "", unit: "طن", min: "" });
      toast.success("تم حفظ المادة");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر حفظ المادة";
      toast.error("لم يتم حفظ المادة", { description: message });
    } finally {
      setSavingItem(false);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      setDeletingItemId(id);
      await deleteInventoryItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("تم حذف المادة");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر حذف المادة";
      toast.error("فشل حذف المادة", { description: message });
    } finally {
      setDeletingItemId(null);
    }
  };

  const receiveSubmit = async () => {
    if (
      !receive.itemId ||
      !receive.qty ||
      !receive.unitPrice ||
      !receive.supplier
    ) {
      toast.error("الرجاء إدخال جميع بيانات الوارد");
      return;
    }
    const qty = Number(receive.qty);
    const unitPrice = Number(receive.unitPrice);
    if (
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice <= 0
    ) {
      toast.error("القيم العددية غير صحيحة");
      return;
    }
    try {
      setSavingReceive(true);
      const result = await recordInventoryReceipt({
        itemId: receive.itemId,
        qty,
        unitPrice,
        supplier: receive.supplier,
        date: receive.date,
        approved: isManager || isAccountant,
        createdBy: user?.id ?? null,
      });
      setItems((prev) =>
        prev.map((i) => (i.id === result.item.id ? result.item : i)),
      );
      setMovements((prev) => [result.movement, ...prev]);
      setTransactions((prev) => [result.transaction, ...prev]);
      if (result.item.quantity < result.item.min) {
        toast.warning(`تنبيه: مخزون ${result.item.name} منخفض`);
      } else {
        toast.success("تم تسجيل الوارد وتحديث المصروفات");
      }
      setReceive({
        itemId: "",
        qty: "",
        unitPrice: "",
        supplier: "",
        date: today(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر تسجيل الوارد";
      toast.error("فشل تسجيل الوارد", { description: message });
    } finally {
      setSavingReceive(false);
    }
  };

  const issueSubmit = async () => {
    if (!issue.itemId || !issue.qty || !issue.unitPrice || !issue.project) {
      toast.error("الرجاء إدخال جميع بيانات الصرف");
      return;
    }
    const qty = Number(issue.qty);
    const unitPrice = Number(issue.unitPrice);
    if (
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice <= 0
    ) {
      toast.error("القيم العددية غير صحيحة");
      return;
    }
    try {
      setSavingIssue(true);
      const result = await recordInventoryIssue({
        itemId: issue.itemId,
        qty,
        unitPrice,
        project: issue.project,
        date: issue.date,
        approved: isManager || isAccountant,
        createdBy: user?.id ?? null,
      });
      setItems((prev) =>
        prev.map((i) => (i.id === result.item.id ? result.item : i)),
      );
      setMovements((prev) => [result.movement, ...prev]);
      setTransactions((prev) => [result.transaction, ...prev]);
      if (result.item.quantity < result.item.min) {
        toast.warning(`تنبيه: مخزون ${result.item.name} منخفض`);
      } else {
        toast.success("تم تسجيل الصرف وتحديث المصروفات");
      }
      setIssue({
        itemId: "",
        qty: "",
        unitPrice: "",
        project: "",
        date: today(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر تسجيل الصرف";
      toast.error("فشل تسجيل الصرف", { description: message });
    } finally {
      setSavingIssue(false);
    }
  };

  const addProject = async () => {
    if (
      !newProject.name ||
      !newProject.location ||
      !newProject.floors ||
      !newProject.units
    ) {
      toast.error("الرجاء إدخال بيانات المشروع كاملة");
      return;
    }
    const floors = Number(newProject.floors);
    const units = Number(newProject.units);
    if (
      !Number.isFinite(floors) ||
      floors <= 0 ||
      !Number.isFinite(units) ||
      units <= 0
    ) {
      toast.error("القيم العددية غير صحيحة");
      return;
    }
    try {
      setSavingProject(true);
      const project = await createProject({
        name: newProject.name,
        location: newProject.location,
        floors,
        units,
        createdAt: today(),
      });
      setProjects((prev) => [project, ...prev]);
      setNewProject({ name: "", location: "", floors: "", units: "" });
      toast.success("تمت إضافة المشروع العقاري");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر إضافة المشروع";
      toast.error("فشل إضافة المشروع", { description: message });
    } finally {
      setSavingProject(false);
    }
  };

  const projectTotals = useCallback(
    (id: string) => {
      const projectCosts = costs
        .filter((x) => x.projectId === id)
        .reduce((a, b) => a + b.amount, 0);
      const projectSales = sales
        .filter((x) => x.projectId === id)
        .reduce((a, b) => a + b.price, 0);
      return {
        costs: projectCosts,
        sales: projectSales,
        profit: projectSales - projectCosts,
        sold: sales.filter((x) => x.projectId === id).length,
      };
    },
    [costs, sales],
  );

  if (initialLoading) {
    return (
      <div className="py-10 text-center text-slate-500">
        جارٍ تحميل البيانات من قاعدة البيانات...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadingError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <div className="font-semibold">تعذر تحميل البيانات</div>
          <div className="text-sm">{loadingError}</div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="mt-3 inline-flex items-center rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white shadow disabled:cursor-not-allowed disabled:opacity-50"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold">لوحة التحكم</h1>
          <p className="text-slate-500 text-sm">نظام محاسبة عقاري</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 justify-center sm:justify-start md:w-auto md:justify-end">
          {(() => {
            const tabs: (typeof active)[] = [
              "dashboard",
              "inventory",
              "projects",
            ];
            if (isManager || isAccountant) tabs.splice(1, 0, "transactions");
            if (isManager || isAccountant) tabs.push("reports");
            if (isManager) tabs.push("users");
            return tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActive(tab)}
                className={`w-full rounded-full border px-3 py-2 text-center transition sm:w-auto disabled:cursor-not-allowed disabled:opacity-50 ${
                  active === tab
                    ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-transparent"
                    : "border-indigo-300 text-indigo-700"
                }`}
              >
                {tab === "dashboard"
                  ? "لوحة التحكم"
                  : tab === "transactions"
                    ? "المعاملات"
                    : tab === "inventory"
                      ? "المخزون"
                      : tab === "projects"
                        ? "العقارات"
                        : tab === "reports"
                          ? "التقارير"
                          : "المستخدمون"}
              </button>
            ));
          })()}
        </div>
      </div>

      {active === "dashboard" && (
        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl p-4 bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg flex flex-col justify-between">
              <div>
                <div className="text-sm opacity-90">الحساب</div>
                <div className="mt-2 text-2xl font-extrabold">{user?.name}</div>
                <div className="text-xs mt-1">
                  الدور:{" "}
                  {user?.role === "manager"
                    ? "مدير"
                    : user?.role === "accountant"
                      ? "محاسب"
                      : "موظف"}
                </div>
              </div>
              <div className="mt-4 text-xs opacity-90">
                مرحباً بك في لوحة التحكم — يمكنك إدارة العمليات بسرعة وسهولة.
              </div>
            </div>
          </div>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <Stat
              value={totals.revenue}
              label="إجمالي الإيرادات"
              color="from-emerald-100 to-emerald-300"
              icon={<ArrowUp className="h-5 w-5 text-emerald-700" />}
            />
            <Stat
              value={totals.expenses}
              label="إجمالي المصروفات"
              color="from-rose-100 to-rose-200"
              icon={<ArrowDown className="h-5 w-5 text-rose-700" />}
            />
            <Stat
              value={totals.profit}
              label="صافي الربح"
              color="from-indigo-100 to-indigo-200"
              icon={<DollarSign className="h-5 w-5 text-indigo-700" />}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-md">
            <h3 className="font-semibold mb-3">إضافة معاملة </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <select
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2 bg-white"
                value={quick.type}
                onChange={(e) =>
                  setQuick({ ...quick, type: e.target.value as TransType })
                }
              >
                <option value="revenue">إيراد</option>
                <option value="expense">مصروف</option>
                <option value="salaries">المرتبات</option>
              </select>
              <input
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                placeholder="المبلغ"
                value={quick.amount}
                onChange={(e) => setQuick({ ...quick, amount: e.target.value })}
              />
              <input
                type="date"
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                value={quick.date}
                onChange={(e) => setQuick({ ...quick, date: e.target.value })}
              />
              <input
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2 sm:col-span-2 xl:col-span-2"
                placeholder="الوصف"
                value={quick.description}
                onChange={(e) =>
                  setQuick({ ...quick, description: e.target.value })
                }
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => void addQuick()}
                disabled={savingQuick}
                className="flex items-center gap-2 rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {savingQuick ? "جاري الحفظ..." : "إضافة معاملة"}
              </button>
              <button
                onClick={() =>
                  setQuick({
                    type: "revenue",
                    amount: "",
                    description: "",
                    date: today(),
                  })
                }
                className="rounded-md border px-3 py-2 bg-white"
              >
                إعادة تعيين
              </button>
            </div>
          </div>
        </section>
      )}

      {active === "transactions" && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow">
          <h3 className="font-semibold mb-3">المعاملات المالية</h3>
          <div className="overflow-x-auto">
            <table className="w-full table-auto border-collapse text-sm text-right">
              <thead>
                <tr className="text-right bg-slate-50">
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">النوع</th>
                  <th className="px-3 py-2">الوصف</th>
                  <th className="px-3 py-2">المبلغ</th>
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2">{t.date}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          t.type === "revenue"
                            ? "bg-emerald-100 text-emerald-700"
                            : t.type === "salaries"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {t.type === "revenue" ? "إيراد" : t.type === "salaries" ? "المرتبات" : "مصروف"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{t.description}</td>
                    <td className="px-3 py-2">
                      {t.amount.toLocaleString()} ج.م
                    </td>
                    <td className="px-3 py-2">
                      {t.approved ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700">
                          معتمد
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-700">
                          بانتظار الاعتماد
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right space-x-2 space-x-reverse">
                      {isManager && !t.approved && (
                        <button
                          className="rounded-md bg-indigo-600 text-white px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void handleApprove(t.id)}
                          disabled={approvingId === t.id}
                        >
                          {approvingId === t.id ? "جاري الاعتماد" : "اعتماد"}
                        </button>
                      )}
                      <button
                        className="rounded-md bg-red-600 text-white px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void deleteTrans(t.id)}
                        disabled={deletingTransactionId === t.id}
                      >
                        {deletingTransactionId === t.id ? "حذف..." : "حذف"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transactions.length === 0 && (
              <div className="py-6 text-center text-sm text-slate-500">
                لا توجد معاملات مسجلة بعد.
              </div>
            )}
          </div>
        </section>
      )}

      {active === "inventory" && (
        <section className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
            <h3 className="font-semibold mb-3">إضافة مادة جديدة</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <input
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                placeholder="اسم المادة"
                value={newItem.name}
                onChange={(e) =>
                  setNewItem({ ...newItem, name: e.target.value })
                }
              />
              <input
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                placeholder="الكمية"
                value={newItem.quantity}
                onChange={(e) =>
                  setNewItem({ ...newItem, quantity: e.target.value })
                }
              />
              <select
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                value={newItem.unit}
                onChange={(e) =>
                  setNewItem({ ...newItem, unit: e.target.value })
                }
              >
                <option value="طن">طن</option>
                <option value="قطعة">قطعة</option>
                <option value="متر">متر</option>
                <option value="لتر">لتر</option>
              </select>
              <input
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                placeholder="الحد الأدنى"
                value={newItem.min}
                onChange={(e) =>
                  setNewItem({ ...newItem, min: e.target.value })
                }
              />
            </div>
            <button
              onClick={() => void addItem()}
              disabled={savingItem}
              className="mt-3 w-full rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {savingItem ? "جاري الحفظ..." : "حفظ المادة"}
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
              <h3 className="font-semibold mb-3">تسجيل وارد من مورد</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <select
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  value={receive.itemId}
                  onChange={(e) =>
                    setReceive({ ...receive, itemId: e.target.value })
                  }
                >
                  <option value="">اختر المادة</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="الكمية"
                  value={receive.qty}
                  onChange={(e) =>
                    setReceive({ ...receive, qty: e.target.value })
                  }
                />
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="سعر الوحدة"
                  value={receive.unitPrice}
                  onChange={(e) =>
                    setReceive({ ...receive, unitPrice: e.target.value })
                  }
                />
                <input
                  type="date"
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  value={receive.date}
                  onChange={(e) =>
                    setReceive({ ...receive, date: e.target.value })
                  }
                />
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="اسم المورد"
                  value={receive.supplier}
                  onChange={(e) =>
                    setReceive({ ...receive, supplier: e.target.value })
                  }
                />
              </div>
              <button
                onClick={() => void receiveSubmit()}
                disabled={savingReceive}
                className="mt-3 w-full rounded-md bg-slate-900 px-4 py-2 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {savingReceive ? "جاري التسجيل..." : "تسجيل الوارد"}
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
              <h3 className="font-semibold mb-3">تسجيل صرف لمشروع</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <select
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  value={issue.itemId}
                  onChange={(e) =>
                    setIssue({ ...issue, itemId: e.target.value })
                  }
                >
                  <option value="">اختر المادة</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="الكمية"
                  value={issue.qty}
                  onChange={(e) => setIssue({ ...issue, qty: e.target.value })}
                />
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="سعر الوحدة"
                  value={issue.unitPrice}
                  onChange={(e) =>
                    setIssue({ ...issue, unitPrice: e.target.value })
                  }
                />
                <input
                  type="date"
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  value={issue.date}
                  onChange={(e) => setIssue({ ...issue, date: e.target.value })}
                />
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="اسم المشروع"
                  value={issue.project}
                  onChange={(e) =>
                    setIssue({ ...issue, project: e.target.value })
                  }
                />
              </div>
              <button
                onClick={() => void issueSubmit()}
                disabled={savingIssue}
                className="mt-3 w-full rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {savingIssue ? "جاري التسجيل..." : "تسجيل الصرف"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {items.map((i) => (
              <div
                key={i.id}
                className={`flex flex-col gap-3 rounded-lg border bg-white p-3 sm:flex-row sm:items-center sm:justify-between ${
                  i.quantity < i.min ? "border-rose-300" : "border-slate-200"
                }`}
              >
                <div className="space-y-1">
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-slate-500">
                    آخر تحديث: {i.updatedAt}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`font-bold ${i.quantity < i.min ? "text-rose-600" : ""}`}
                  >
                    {i.quantity.toLocaleString()} {i.unit}
                  </div>
                  <div
                    className={`text-xs ${i.quantity < i.min ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {i.quantity < i.min ? "مخزون منخفض" : "متوفر"}
                  </div>
                </div>
                <button
                  className="w-full rounded-md bg-red-600 px-3 py-1 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  onClick={() => void deleteItem(i.id)}
                  disabled={deletingItemId === i.id}
                >
                  {deletingItemId === i.id ? "حذف..." : "حذف"}
                </button>
              </div>
            ))}
            {items.length === 0 && (
              <div className="py-6 text-center text-sm text-slate-500">
                لا توجد مواد مسجلة بعد.
              </div>
            )}
          </div>

          {movements.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
              <h3 className="font-semibold mb-3">حركة المخزون</h3>
              <div className="overflow-x-auto">
                <table className="w-full table-auto border-collapse text-sm text-right">
                  <thead>
                    <tr className="text-right bg-slate-50">
                      <th className="px-3 py-2">التاريخ</th>
                      <th className="px-3 py-2">المادة</th>
                      <th className="px-3 py-2">نوع الحركة</th>
                      <th className="px-3 py-2">الكمية</th>
                      <th className="px-3 py-2">سعر الوحدة</th>
                      <th className="px-3 py-2">الإجمالي</th>
                      <th className="px-3 py-2">الجهة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => {
                      const item = items.find((i) => i.id === m.itemId);
                      return (
                        <tr key={m.id} className="border-t">
                          <td className="px-3 py-2">{m.date}</td>
                          <td className="px-3 py-2">{item?.name ?? "-"}</td>
                          <td className="px-3 py-2">
                            {m.kind === "in" ? "وارد" : "صرف"}
                          </td>
                          <td className="px-3 py-2">
                            {m.qty} {item?.unit ?? ""}
                          </td>
                          <td className="px-3 py-2">
                            {m.unitPrice.toLocaleString()}
                          </td>
                          <td className="px-3 py-2">
                            {m.total.toLocaleString()}
                          </td>
                          <td className="px-3 py-2">{m.party}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {active === "projects" && (
        <section className="space-y-4">
          {/* Add project occupies full width */}
          <div className="">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
              <h3 className="font-semibold mb-3">إضافة مشروع عقاري</h3>
              <div className="grid gap-3">
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="اسم المشروع"
                  value={newProject.name}
                  onChange={(e) =>
                    setNewProject({ ...newProject, name: e.target.value })
                  }
                />
                <input
                  className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                  placeholder="الموقع"
                  value={newProject.location}
                  onChange={(e) =>
                    setNewProject({ ...newProject, location: e.target.value })
                  }
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                    placeholder="عدد الأدوار"
                    value={newProject.floors}
                    onChange={(e) =>
                      setNewProject({ ...newProject, floors: e.target.value })
                    }
                  />
                  <input
                    className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                    placeholder="عدد الوحدات"
                    value={newProject.units}
                    onChange={(e) =>
                      setNewProject({ ...newProject, units: e.target.value })
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void addProject()}
                    disabled={savingProject}
                    className="rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingProject ? "جاري الحفظ..." : "حفظ المشروع"}
                  </button>
                  <button
                    onClick={() =>
                      setNewProject({
                        name: "",
                        location: "",
                        floors: "",
                        units: "",
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

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">المشروعات</h3>
              <div className="flex items-center gap-2">
                <input
                  placeholder="ابحث عن مشروع أو موقع"
                  className="rounded-md border-2 border-slate-200 px-3 py-2 outline-none focus:border-indigo-500"
                  value={projQuery}
                  onChange={(e) => setProjQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects
                .filter((p) =>
                  projQuery
                    ? (p.name + " " + p.location)
                        .toLowerCase()
                        .includes(projQuery.toLowerCase())
                    : true,
                )
                .map((p) => {
                  const t = projectTotals(p.id);
                  return (
                    <div
                      key={p.id}
                      className="rounded-lg border p-4 bg-white shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-lg">{p.name}</div>
                          <div className="text-sm text-slate-500">
                            {p.location}
                          </div>
                        </div>
                        <div className="text-sm text-slate-400">
                          {p.floors} طوابق
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-slate-500">الوحدات</div>
                          <div className="font-medium">{p.units}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">مباعة</div>
                          <div className="font-medium">{t.sold}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">التكاليف</div>
                          <div className="font-medium">
                            {t.costs.toLocaleString()} ج.م
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">المبيعات</div>
                          <div className="font-medium">
                            {t.sales.toLocaleString()} ج.م
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-sm text-slate-500">
                          الربح:{" "}
                          <span className="font-semibold text-slate-700">
                            {t.profit.toLocaleString()} ج.م
                          </span>
                        </div>
                        <button
                          className="rounded-md bg-slate-900 text-white px-3 py-1"
                          onClick={() => navigate(`/projects/${p.id}`)}
                        >
                          فتح
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {projects.length === 0 && (
              <div className="py-6 text-center text-sm text-slate-500">
                لا توجد مشروعات مسجلة بعد.
              </div>
            )}
          </div>
        </section>
      )}

      {active === "reports" && (
        <ReportsSection
          transactions={transactions}
          projects={projects}
          items={items}
          costs={costs}
          sales={sales}
        />
      )}

      {active === "users" && (
        <section>
          {isManager ? (
            <UserManagement />
          ) : (
            <div className="rounded-xl p-6 bg-white border border-slate-200 shadow">
              ليس لديك صلاحية لعرض إدارة المستخدمين
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  color,
  icon,
}: {
  value: number;
  label: string;
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-4 bg-white border border-slate-200 shadow flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br ${color ?? "from-slate-100 to-slate-50"}`}
        >
          {icon ?? <DollarSign className="h-5 w-5 text-slate-700" />}
        </div>
        <div>
          <div className="text-lg sm:text-xl font-extrabold">
            {value.toLocaleString()}
          </div>
          <div className="text-sm text-slate-500 mt-1">{label}</div>
        </div>
      </div>
      <div className="text-sm text-slate-400">ج.م</div>
    </div>
  );
}

function ReportsSection({
  transactions,
  projects,
  items,
  costs,
  sales,
}: {
  transactions: Transaction[];
  projects: Project[];
  items: InventoryItem[];
  costs: ProjectCost[];
  sales: ProjectSale[];
}) {
  const [reportType, setReportType] = useState("profit-loss");
  const [selectedProject, setSelectedProject] = useState("");
  const [dateFrom, setDateFrom] = useState(() =>
    new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    ).toLocaleDateString("en-CA"),
  );
  const [dateTo, setDateTo] = useState(() => today());

  const filtered = useMemo(
    () => transactions.filter((t) => t.date >= dateFrom && t.date <= dateTo),
    [transactions, dateFrom, dateTo],
  );

  const formatDateLabel = (d: string) => {
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleDateString("ar-EG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return d;
    }
  };

  const buildReport = useCallback(() => {
    if (reportType === "profit-loss") {
      const rev = filtered
        .filter((t) => t.type === "revenue")
        .reduce((a, b) => a + b.amount, 0);
      const exp = filtered
        .filter((t) => t.type === "expense")
        .reduce((a, b) => a + b.amount, 0);
      return {
        title: "تقرير الأرباح والخسائر",
        headers: ["البند", "القيمة"],
        rows: [
          ["إجمالي الإيرادات", rev.toLocaleString() + " ج.م"],
          ["إجمالي المصروفات", exp.toLocaleString() + " ج.م"],
          ["صافي الربح", (rev - exp).toLocaleString() + " ج.م"],
        ],
      };
    }
    if (reportType === "revenue") {
      return {
        title: "تقرير الإيرادات",
        headers: ["التاريخ", "الوصف", "المبلغ"],
        rows: filtered
          .filter((t) => t.type === "revenue")
          .map((t) => [
            t.date,
            t.description,
            t.amount.toLocaleString() + " ج.م",
          ]),
      };
    }
    if (reportType === "expense") {
      return {
        title: "تقرير المصروفات",
        headers: ["التاريخ", "الوصف", "المبلغ"],
        rows: filtered
          .filter((t) => t.type === "expense")
          .map((t) => [
            t.date,
            t.description,
            t.amount.toLocaleString() + " ج.م",
          ]),
      };
    }
    if (reportType === "salary") {
      const sal = filtered.filter(
        (t) =>
          t.type === "expense" &&
          /(راتب|salary|مرتبات|موظف)/i.test(t.description),
      );
      return {
        title: "تقرير المرتبات",
        headers: ["التاريخ", "الوصف", "المبلغ"],
        rows: sal.map((t) => [
          t.date,
          t.description,
          t.amount.toLocaleString() + " ج.م",
        ]),
      };
    }
    if (reportType === "inventory") {
      const rows = items.map((i) => [
        i.name,
        i.quantity.toLocaleString() + " " + i.unit,
        i.min.toLocaleString(),
        i.quantity < i.min ? "منخفض" : "جيد",
      ]);
      return {
        title: "تقرير المخزون",
        headers: ["المادة", "الكمية", "الحد الأدنى", "الحالة"],
        rows,
      };
    }
    if (reportType === "project") {
      const project = projects.find((p) => p.id === selectedProject);
      const costRows = costs.filter(
        (x) =>
          x.projectId === selectedProject &&
          x.date >= dateFrom &&
          x.date <= dateTo,
      );
      const saleRows = sales.filter(
        (x) =>
          x.projectId === selectedProject &&
          x.date >= dateFrom &&
          x.date <= dateTo,
      );
      const totalC = costRows.reduce((a, b) => a + b.amount, 0);
      const totalS = saleRows.reduce((a, b) => a + b.price, 0);
      const rows: string[][] = [
        ["المشروع", project?.name || "-"],
        ["الموقع", project?.location || "-"],
        ["عدد الأدوار", String(project?.floors ?? "-")],
        ["عدد الوحدات", String(project?.units ?? "-")],
        ["إجمالي التكاليف", totalC.toLocaleString() + " ج.م"],
        ["إجمالي المبيعات", totalS.toLocaleString() + " ج.م"],
        ["الربح/الخسارة", (totalS - totalC).toLocaleString() + " ج.م"],
      ];
      return {
        title: "تقرير مشروع عقاري",
        headers: ["البند", "القيمة"],
        rows,
      };
    }
    return { title: "تقرير", headers: [], rows: [] };
  }, [
    reportType,
    filtered,
    items,
    projects,
    selectedProject,
    costs,
    sales,
    dateFrom,
    dateTo,
  ]);

  const exportCsv = () => {
    const rep = buildReport();
    const rows = [rep.headers, ...rep.rows];
    const csv = rows
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${rep.title}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const rep = buildReport();
    const table = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"></head><body><table border="1">${[
      "<tr>" + rep.headers.map((h) => `<th>${h}</th>`).join("") + "</tr>",
      ...rep.rows.map(
        (r) => "<tr>" + r.map((c) => `<td>${c}</td>`).join("") + "</tr>",
      ),
    ].join("")}</table></body></html>`;
    const blob = new Blob([table], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${rep.title}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const rep = buildReport();
    const win = window.open("", "_blank");
    if (!win) return;
    const fromLabel = formatDateLabel(dateFrom);
    const toLabel = formatDateLabel(dateTo);
    win.document
      .write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${rep.title}</title>
      <style>body{font-family:Arial,system-ui;padding:24px} h1{font-size:20px;margin-bottom:12px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px} th{background:#f1f5f9}</style>
    </head><body>
      <h1>${rep.title}</h1>
      <div>الفترة: من ${fromLabel} إلى ${toLabel}</div>
      <table><thead><tr>${rep.headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>
        ${rep.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}
      </tbody></table>
      <script>window.print()</script>
    </body></html>`);
    win.document.close();
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 shadow space-y-4">
      <h3 className="font-semibold">التقارير</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 items-end">
        <div className="flex flex-col">
          <label className="text-sm text-slate-600 mb-1">نوع التقرير</label>
          <select
            className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
          >
            <option value="profit-loss">الأرباح والخسائر</option>
            <option value="revenue">الإيرادات</option>
            <option value="expense">المصروفات</option>
            <option value="salary">المرتبات</option>
            <option value="project">تقرير مشروع</option>
            <option value="inventory">تقرير المخزون</option>
          </select>
        </div>

        {reportType === "project" && (
          <div className="flex flex-col">
            <label className="text-sm text-slate-600 mb-1">المشروع</label>
            <select
              className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              <option value="">اختر المشروع</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-sm text-slate-600 mb-1 inline-block">
              من
            </label>
            <input
              type="date"
              className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="تاريخ من"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm text-slate-600 mb-1 inline-block">
              إلى
            </label>
            <input
              type="date"
              className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="تاريخ إلى"
            />
          </div>
        </div>

        <div className="flex gap-2 col-span-3 sm:col-auto sm:justify-end">
          <button
            onClick={exportPDF}
            className="rounded-md bg-indigo-600 px-4 py-2 text-white transition-colors"
          >
            تصدير PDF
          </button>
          <button
            onClick={exportExcel}
            className="rounded-md bg-emerald-600 px-4 py-2 text-white transition-colors"
          >
            تصدير Excel
          </button>
        </div>
      </div>
      <div className="border rounded-lg p-3">
        <div className="font-semibold mb-2">نتيجة التقرير</div>
        <div className="text-sm text-slate-600">
          الفترة: من {formatDateLabel(dateFrom)} إلى {formatDateLabel(dateTo)}
        </div>
        <div className="mt-3 grid md:grid-cols-3 gap-3">
          <Stat
            value={transactions
              .filter((t) => t.type === "revenue")
              .reduce((a, b) => a + b.amount, 0)}
            label="إجمالي الإيرادات"
            color="text-emerald-600"
          />
          <Stat
            value={transactions
              .filter((t) => t.type === "expense")
              .reduce((a, b) => a + b.amount, 0)}
            label="إجمالي المصروفات"
            color="text-rose-600"
          />
          <Stat
            value={transactions.reduce(
              (a, b) => (b.type === "revenue" ? a + b.amount : a - b.amount),
              0,
            )}
            label="صافي الربح (ج.م)"
            color="text-indigo-700"
          />
        </div>
      </div>
    </section>
  );
}
