import localforage from "localforage";

// Ensure a stable store; if already configured elsewhere, this is idempotent
localforage.config({ name: "accounting-app", storeName: "state" });

export type QueuedRequest = {
  id: string;
  url: string;
  method: "POST" | "PUT" | "DELETE";
  headers: Record<string, string>;
  body: any;
  createdAt: number;
  retryCount: number;
};

const QUEUE_KEY = "offline_queue_v1";
const CACHE_PREFIX = "offline_cache_v1:";

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

function getTokenForCache(): string | null {
  try {
    return localStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

export function cacheKeyFor(url: string): string {
  const token = getTokenForCache();
  return `${CACHE_PREFIX}GET:${url}:t=${token ? token.slice(0, 16) : "anon"}`;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const v = await localforage.getItem<{ ts: number; data: T }>(key);
  return v ? v.data : null;
}

export async function setCached<T>(key: string, data: T): Promise<void> {
  await localforage.setItem(key, { ts: Date.now(), data });
}

async function loadQueue(): Promise<QueuedRequest[]> {
  const q = await localforage.getItem<QueuedRequest[]>(QUEUE_KEY);
  return q ?? [];
}

async function saveQueue(q: QueuedRequest[]): Promise<void> {
  await localforage.setItem(QUEUE_KEY, q);
}

export async function enqueue(
  req: Omit<QueuedRequest, "id" | "createdAt" | "retryCount">,
) {
  const q = await loadQueue();
  const item: QueuedRequest = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    retryCount: 0,
    ...req,
  };
  q.push(item);
  await saveQueue(q);
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function processQueue(): Promise<void> {
  if (!isOnline()) return;
  let q = await loadQueue();
  if (!q.length) return;

  const remaining: QueuedRequest[] = [];
  for (const item of q) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { "Content-Type": "application/json", ...item.headers },
        body: item.body != null ? JSON.stringify(item.body) : undefined,
      });
      if (!res.ok) {
        // Drop non-retryable 4xx errors to avoid blocking the queue
        if (res.status >= 400 && res.status < 500) {
          continue;
        }
        // Retryable
        item.retryCount += 1;
        if (item.retryCount <= 5) remaining.push(item);
      } else {
        // Optionally: trigger cache invalidation for known collections
        // Keep generic: remove cached GET for same origin path
        const listKey = cacheKeyFor("/api/admin/users");
        await localforage.removeItem(listKey);
      }
    } catch {
      // Network failure -> keep for retry with backoff
      item.retryCount += 1;
      if (item.retryCount <= 5) remaining.push(item);
    }
  }
  await saveQueue(remaining);
  if (remaining.length) {
    const backoff = Math.min(
      30000,
      1000 * Math.pow(2, remaining[0].retryCount),
    );
    await wait(backoff);
    // Try again in background
    processQueue();
  }
}

let started = false;
export function startOfflineSync() {
  if (started) return;
  started = true;
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      processQueue().catch(() => {});
    });
  }
  // Background interval
  setInterval(() => {
    processQueue().catch(() => {});
  }, 15000);
}
