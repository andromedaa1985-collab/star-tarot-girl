import { AsyncLocalStorage } from "node:async_hooks";
import { AI_UPSTREAM_TIMEOUT_MS } from "../src/lib/aiRequestBudget.js";

export const PERSISTENT_STORE_TIMEOUT_MS = 3_000;
export const CHAT_REQUEST_TOTAL_TIMEOUT_MS = AI_UPSTREAM_TIMEOUT_MS + PERSISTENT_STORE_TIMEOUT_MS;

type RequestDeadline = { expiresAt: number; signal?: AbortSignal };
const requestDeadlines = new AsyncLocalStorage<RequestDeadline>();

export class RequestDeadlineError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
    this.name = "RequestDeadlineError";
  }
}

export function runWithRequestDeadline<T>(deadline: RequestDeadline, operation: () => T): T {
  return requestDeadlines.run(deadline, operation);
}

// AsyncLocalStorage keeps the deadline and cancellation scoped to the current
// request. Concurrent Vercel invocations must never share an abort controller.
export async function runStorageOperation<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = PERSISTENT_STORE_TIMEOUT_MS,
): Promise<T> {
  const request = requestDeadlines.getStore();
  if (request?.signal?.aborted) throw new RequestDeadlineError(499, "请求已取消。", "REQUEST_CANCELLED");
  const remainingMs = Math.min(timeoutMs, (request?.expiresAt ?? Infinity) - Date.now());
  if (remainingMs <= 0) throw new RequestDeadlineError(504, "云端存储响应超时，请刷新账户后重试。", "STORE_REQUEST_TIMEOUT");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let cancel: () => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new RequestDeadlineError(504, "云端存储响应超时，请刷新账户后重试。", "STORE_REQUEST_TIMEOUT"));
      controller.abort();
    }, remainingMs);
    cancel = () => {
      reject(new RequestDeadlineError(499, "请求已取消。", "REQUEST_CANCELLED"));
      controller.abort();
    };
    request?.signal?.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    clearTimeout(timer!);
    request?.signal?.removeEventListener("abort", cancel!);
  }
}
