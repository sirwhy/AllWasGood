/**
 * Lightweight HTTP helpers shared by provider implementations.
 * Uses the global fetch (Node 20+ has native fetch, no extra dep needed).
 */

export interface HttpJsonOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function httpJson<T = unknown>(url: string, opts: HttpJsonOptions = {}): Promise<T> {
  const ctrl = new AbortController();
  const timeout = opts.timeoutMs ?? 120_000;
  const t = setTimeout(() => ctrl.abort(), timeout);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers ?? {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) return (await res.json()) as T;
    return (await res.text()) as unknown as T;
  } finally {
    clearTimeout(t);
  }
}

export async function httpBytes(url: string, opts: HttpJsonOptions = {}): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: opts.headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
  const buf = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(buf),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

export async function pollUntil<T>(
  fn: () => Promise<{ done: boolean; value?: T; error?: string }>,
  opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const interval = opts.intervalMs ?? 3000;
  const timeout = opts.timeoutMs ?? 600_000; // 10 min default
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (opts.signal?.aborted) throw new Error("Aborted");
    const r = await fn();
    if (r.error) throw new Error(r.error);
    if (r.done && r.value !== undefined) return r.value;
    await new Promise((res) => setTimeout(res, interval));
  }
  throw new Error("Polling timed out");
}
