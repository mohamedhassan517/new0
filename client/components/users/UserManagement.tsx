import { useEffect, useMemo, useState } from "react";
import type { Role, User } from "@shared/api";
import * as usersApi from "@/services/users";

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "employee" as Role,
    password: "",
    active: true,
  });

  const [editing, setEditing] = useState<User | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await usersApi.listUsers();
      setUsers(data);
    } catch (e: any) {
      setError(e?.message || "فشل التحميل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () =>
    setForm({
      name: "",
      email: "",
      role: "employee",
      password: "",
      active: true,
    });

  const generateUsername = (name: string, email: string) => {
    if (name && name.trim()) return name.replace(/\s+/g, "").toLowerCase();
    return (email || "").split("@")[0];
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic client-side validation to avoid server 400 "Missing fields"
    const name = (form.name || "").trim();
    const email = (form.email || "").trim();
    const password = form.password || "";
    const role = form.role;
    const emailOk = /.+@.+\..+/.test(email);

    if (!name || !email || !emailOk || !password || !role) {
      setError(
        !emailOk
          ? "صيغة البريد الإلكتروني غير صحيحة"
          : "الرجاء تعبئة الاسم، البريد الإلكتروني، كلمة المرور، وتحديد الدور",
      );
      return;
    }

    try {
      const payload = {
        username: generateUsername(name, email),
        name,
        email,
        role,
        password,
        active: form.active,
      };
      await usersApi.createUser(payload);
      resetForm();
      await load();
    } catch (e: any) {
      setError(e?.message || "فشل الإضافة");
    }
  };

  const onUpdate = async (user: User) => {
    setEditing(user);
  };

  const onSaveUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await usersApi.updateUser(editing.id, {
        name: editing.name,
        email: editing.email,
        role: editing.role,
        active: editing.active,
      });
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "فشل التعديل");
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف المستخدم؟")) return;
    try {
      await usersApi.deleteUserApi(id);
      await load();
    } catch (e: any) {
      setError(e?.message || "فشل الحذف");
    }
  };

  const roleLabel = useMemo(
    () => ({ manager: "مدير", accountant: "محاسب", employee: "موظف" }),
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">إدارة المستخدمين</h2>
      </div>

      {error && <div className="text-red-600">{error}</div>}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
          <h3 className="font-semibold mb-3">إضافة مستخدم جديد</h3>
          <form onSubmit={onCreate} className="grid gap-3">
            <input
              required
              className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
              placeholder="الاسم"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              type="email"
              required
              className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
              placeholder="البريد الإلكتروني"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <select
              required
              className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as Role })
              }
            >
              <option value="manager">مدير</option>
              <option value="accountant">محاسب</option>
              <option value="employee">موظف</option>
            </select>
            <input
              type="password"
              required
              className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
              placeholder="كلمة المرور"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <label className="text-sm text-slate-600">
              <input
                type="checkbox"
                className="mr-2"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />{" "}
              نشط
            </label>
            <button
              className="rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-2"
              type="submit"
            >
              حفظ
            </button>
          </form>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
          <h3 className="font-semibold mb-3">المستخدمون</h3>
          {loading ? (
            <div>جار التحميل...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-auto border-collapse text-sm text-right">
                <thead>
                  <tr className="text-right bg-slate-50">
                    <th className="px-3 py-2">الاسم</th>
                    <th className="px-3 py-2">البريد</th>
                    <th className="px-3 py-2">الدور</th>
                    <th className="px-3 py-2">الحالة</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t">
                      <td className="px-3 py-2">{u.name}</td>
                      <td className="px-3 py-2">{u.email}</td>
                      <td className="px-3 py-2">{roleLabel[u.role]}</td>
                      <td className="px-3 py-2">{u.active ? "نشط" : "معطل"}</td>
                      <td className="px-3 py-2 text-right space-x-2">
                        <button
                          className="rounded-md bg-slate-900 text-white px-3 py-2"
                          onClick={() => onUpdate(u)}
                        >
                          تعديل
                        </button>
                        <button
                          className="rounded-md bg-red-600 text-white px-3 py-2"
                          onClick={() => onDelete(u.id)}
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
          <h3 className="font-semibold mb-3">تعديل المستخدم</h3>
          <form onSubmit={onSaveUpdate} className="grid gap-3 md:grid-cols-2">
            <input
              className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <input
              className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
              value={editing.email}
              onChange={(e) =>
                setEditing({ ...editing, email: e.target.value })
              }
            />
            <select
              className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
              value={editing.role}
              onChange={(e) =>
                setEditing({ ...editing, role: e.target.value as Role })
              }
            >
              <option value="manager">مدير</option>
              <option value="accountant">محاسب</option>
              <option value="employee">موظف</option>
            </select>
            <label className="text-sm text-slate-600 mt-2">
              <input
                type="checkbox"
                className="mr-2"
                checked={editing.active}
                onChange={(e) =>
                  setEditing({ ...editing, active: e.target.checked })
                }
              />{" "}
              نشط
            </label>
            <div className="md:col-span-2 flex gap-2">
              <button
                className="rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-2"
                type="submit"
              >
                حفظ التغييرات
              </button>
              <button
                className="rounded-md bg-slate-900 text-white px-3 py-2"
                type="button"
                onClick={() => setEditing(null)}
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
