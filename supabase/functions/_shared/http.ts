const DEFAULT_LOCAL_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

function allowedOrigins(): string[] {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...configured, ...DEFAULT_LOCAL_ORIGINS])];
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  const allowOrigin = allowedOrigins().includes(origin) ? origin : allowedOrigins()[0] ?? "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key, x-request-id",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Expose-Headers": "content-type, x-request-id",
    Vary: "Origin",
  };
}

export function handleOptions(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response("ok", { headers: corsHeaders(request) });
}

export function json(request: Request, body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function errorResponse(request: Request, error: unknown): Response {
  if (error instanceof ApiError) {
    return json(request, {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    }, error.status);
  }
  console.error("Unhandled request error", error instanceof Error ? error.message : String(error));
  return json(request, { code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后再试" }, 500);
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "请求内容格式不正确", 400);
  }
}

export function requireMethod(request: Request, ...methods: string[]): void {
  if (!methods.includes(request.method)) {
    throw new ApiError("METHOD_NOT_ALLOWED", "请求方法不支持", 405);
  }
}
