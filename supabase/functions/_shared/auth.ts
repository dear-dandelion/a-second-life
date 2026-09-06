import { createClient } from "npm:@supabase/supabase-js@2";
import { ApiError } from "./http.ts";
import type { AuthContext, Profile, UserType } from "./types.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new ApiError("SERVER_NOT_CONFIGURED", `缺少服务端配置 ${name}`, 503);
  return value;
}

export async function authenticate(request: Request, options: { requireSelfUser?: boolean } = {}): Promise<AuthContext> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    throw new ApiError("AUTH_REQUIRED", "请先登录", 401);
  }
  const accessToken = authorization.slice(7).trim();
  const url = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) throw new ApiError("AUTH_REQUIRED", "登录状态已失效", 401);

  const { data: profileData, error: profileError } = await adminClient
    .from("profiles")
    .select("id,user_type,birth_year,height_cm,menopausal_status,medical_history,surgery_history,allergy_history,regular_medications,pregnancy_history,family_history,screening_history")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) throw new ApiError("INTERNAL_ERROR", "无法读取用户资料", 500);

  let profile = profileData as Profile | null;
  if (!profile) {
    const requested = userData.user.user_metadata?.user_type === "supporter" ? "supporter" : "self_user";
    const { data, error } = await adminClient
      .from("profiles")
      .upsert({ id: userData.user.id, user_type: requested }, { onConflict: "id" })
      .select("id,user_type,birth_year,height_cm,menopausal_status,medical_history,surgery_history,allergy_history,regular_medications,pregnancy_history,family_history,screening_history")
      .single();
    if (error) throw new ApiError("INTERNAL_ERROR", "无法初始化用户资料", 500);
    profile = data as Profile;
  }

  if (options.requireSelfUser && profile.user_type !== "self_user") {
    throw new ApiError("ROLE_NOT_ALLOWED", "当前账号暂不支持此功能", 403);
  }
  return { userId: userData.user.id, accessToken, profile, userClient, adminClient };
}

export function isSelfUser(userType: UserType): boolean {
  return userType === "self_user";
}
