import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { useAuth } from "@/providers/AuthProvider";

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      navigate(user ? "/dashboard" : "/login", { replace: true });
    }
  }, [loading, user, navigate]);

  return (
    <Layout>
      <section className="text-center py-20">
        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">نظام المحاسبة العقارية</h1>
        <p className="mt-4 text-slate-600">واجهة حديثة. تسجيل دخول فقط. المدير يدير المستخدمين.</p>
      </section>
    </Layout>
  );
}
