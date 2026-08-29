'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const client = getSupabase();
    let alive = true;
    client.auth.getSession()
      .then(({ data }) => { if (alive) { setSession(data.session); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { alive = false; subscription.subscription.unsubscribe(); };
  }, []);
  return { session, user: session?.user ?? null, loading };
}

export async function signIn(email: string, password: string) {
  return getSupabase().auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string) {
  return getSupabase().auth.signUp({ email, password });
}

export async function signOut() {
  return getSupabase().auth.signOut();
}

const DEMO_EMAIL = 'demo@suiyue.local';
const DEMO_PASSWORD = 'suiyue-demo-2026';

// MVP 演示模式：所有访客共用同一演示账号，静默登录，无登录界面。
export async function signInDemo(): Promise<void> {
  const client = getSupabase();
  const { error } = await client.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (error) throw error;
}

export async function currentAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
