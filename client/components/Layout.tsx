import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100"
    >
      <header className="backdrop-blur bg-white/70 border-b border-slate-200 sticky top-0 z-20">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold">
              A
            </div>
            <Link
              to={user ? "/dashboard" : "/"}
              className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent"
            >
              نظام المحاسبة | Accounting
            </Link>
          </div>
          <nav className="flex w-full flex-col items-stretch gap-2 text-sm sm:w-auto sm:flex-row sm:items-center sm:gap-4">
            {user && (
              <>
                <Link
                  className={navClass(location.pathname === "/dashboard")}
                  to="/dashboard"
                >
                  لوحة التحكم
                </Link>
              </>
            )}
            {!user && (
              <Link
                className={navClass(location.pathname === "/login")}
                to="/login"
              >
                تسجيل الدخول
              </Link>
            )}
            {user && (
              <button
                onClick={async () => {
                  await logout();
                  navigate("/login");
                }}
                className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-center text-white transition-colors hover:bg-slate-800 sm:w-auto"
              >
                خروج
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}

function navClass(active: boolean) {
  return `inline-flex w-full items-center justify-center rounded-md px-3 py-1.5 text-center transition-colors sm:w-auto ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:text-slate-900"}`;
}
