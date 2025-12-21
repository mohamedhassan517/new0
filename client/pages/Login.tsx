import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { useAuth } from "@/providers/AuthProvider";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err?.message || "تعذر تسجيل الدخول");
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-md">
        <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg border border-slate-200">
          <h1 className="text-2xl font-bold text-center mb-1">تسجيل الدخول</h1>
          
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                اسم المستخدم
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                placeholder="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                كلمة المرور
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2"
                placeholder="••••••••"
              />
            </div>
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <button
              type="submit"
              className="w-full rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-2.5 font-medium hover:opacity-90"
            >
              دخول
            </button>
            
          </form>
        </div>
      </div>
    </Layout>
  );
}
