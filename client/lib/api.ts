function runtimeApiBase(): string | null {
  try {
    const w = (window as any) || undefined;
    if (w && typeof w.__API_BASE__ === "string" && w.__API_BASE__) {
      return w.__API_BASE__ as string;
    }
    const params = new URLSearchParams(window.location.search);
    const p = params.get("apiBase");
    if (p) return p;
  } catch {}
  return null;
}

export function apiUrl(path: string): string {
  const override = runtimeApiBase();
  const base = (override ||
    ((import.meta as any).env?.VITE_API_BASE as string | undefined)) as
    | string
    | undefined;
  if (!base) return path;
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${b}${path}`;
}
