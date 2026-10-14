import { AI_UPSTREAM_TIMEOUT_MS } from "../src/lib/aiRequestBudget.js";

export const CHAT_UPSTREAM_TIMEOUT_MS = AI_UPSTREAM_TIMEOUT_MS;

export class ChatProxyError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
    this.name = "ChatProxyError";
  }
}

type ChatProxyOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export async function runOptionalSearchWithDeadline<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
  timeoutMs = 4_000,
): Promise<T> {
  if (signal?.aborted) throw new ChatProxyError(499, "请求已取消。", "REQUEST_CANCELLED");
  if (timeoutMs <= 0) throw new ChatProxyError(504, "联网参考搜索超时。", "SEARCH_TIMEOUT");
  let timer: ReturnType<typeof setTimeout>;
  let rejectOnAbort: () => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ChatProxyError(504, "联网参考搜索超时。", "SEARCH_TIMEOUT")), Math.max(0, timeoutMs));
    rejectOnAbort = () => reject(new ChatProxyError(499, "请求已取消。", "REQUEST_CANCELLED"));
    signal?.addEventListener("abort", rejectOnAbort, { once: true });
  });
  try {
    return await Promise.race([operation(), deadline]);
  } finally {
    clearTimeout(timer!);
    signal?.removeEventListener("abort", rejectOnAbort!);
  }
}

// The app consumes one complete JSON response. Keep this contract even when a
// caller supplies stream:true, and keep the deadline active while reading it.
export async function requestChatCompletion(
  payload: Record<string, unknown>,
  apiKey: string,
  options: ChatProxyOptions = {},
): Promise<{ status: number; data: any }> {
  if ((options.timeoutMs ?? CHAT_UPSTREAM_TIMEOUT_MS) <= 0) {
    throw new ChatProxyError(504, "AI 服务响应超时，请稍后重试。", "AI_UPSTREAM_TIMEOUT");
  }
  const controller = new AbortController();
  let timedOut = false;
  const abortForClient = () => controller.abort();
  options.signal?.addEventListener("abort", abortForClient, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? CHAT_UPSTREAM_TIMEOUT_MS);
  let rejectOnAbort: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = () => reject(new ChatProxyError(
      timedOut ? 504 : 499,
      timedOut ? "AI 服务响应超时，请稍后重试。" : "请求已取消。",
      timedOut ? "AI_UPSTREAM_TIMEOUT" : "REQUEST_CANCELLED",
    ));
    controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
    if (controller.signal.aborted) rejectOnAbort();
  });

  const body = { ...payload, stream: false };
  delete (body as Record<string, unknown>).stream_options;
  const operation = async () => {
    if (controller.signal.aborted) {
      throw new ChatProxyError(499, "请求已取消。", "REQUEST_CANCELLED");
    }
    const response = await (options.fetchImpl ?? fetch)("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      if (!response.ok) {
        return { status: response.status, data: { error: { message: "AI 服务暂时不可用，请稍后重试。", code: "AI_UPSTREAM_ERROR" } } };
      }
      throw new ChatProxyError(502, "AI 服务返回了不完整或无效的内容，请重新生成。", "AI_RESPONSE_INVALID");
    }
    if (!response.ok) return { status: response.status, data };
    if (data?.error) return { status: 502, data };
    const choice = data?.choices?.[0];
    if (choice?.finish_reason !== "stop" || typeof choice?.message?.content !== "string" || !choice.message.content.trim()) {
      throw new ChatProxyError(502, "AI 解读未完整生成，请重新生成；本次不会扣除权益。", "AI_RESPONSE_INCOMPLETE");
    }
    return { status: response.status, data };
  };

  try {
    return await Promise.race([operation(), aborted]);
  } catch (error) {
    if (error instanceof ChatProxyError) throw error;
    if (controller.signal.aborted) {
      throw new ChatProxyError(timedOut ? 504 : 499, timedOut ? "AI 服务响应超时，请稍后重试。" : "请求已取消。", timedOut ? "AI_UPSTREAM_TIMEOUT" : "REQUEST_CANCELLED");
    }
    throw new ChatProxyError(502, "AI 服务连接失败，请稍后重试。", "AI_UPSTREAM_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", rejectOnAbort!);
    options.signal?.removeEventListener("abort", abortForClient);
  }
}
