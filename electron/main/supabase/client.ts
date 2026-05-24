import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export type AuthSessionPlaceholder = {
  signedIn: boolean;
  userId: string | null;
  email: string | null;
};

/**
 * Supabase foundation — auth client only; sync logic deferred to Phase 2.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

  if (!url || !anonKey) {
    return null;
  }

  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: true },
    });
  }
  return client;
}

export async function getSessionPlaceholder(): Promise<AuthSessionPlaceholder> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { signedIn: false, userId: null, email: null };
  }
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    return {
      signedIn: Boolean(session),
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
    };
  } catch {
    return { signedIn: false, userId: null, email: null };
  }
}

export async function signInPlaceholder(
  email: string,
): Promise<AuthSessionPlaceholder> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { signedIn: false, userId: null, email: null };
  }
  void email;
  return { signedIn: false, userId: null, email: null };
}
