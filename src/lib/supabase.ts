import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = !!(url && key);

export const supabase: SupabaseClient = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  // Implicit flow so email links (signup, invites, password reset) work on any device/browser.
  // The app reads the tokens from the URL fragment itself (see AuthProvider), because routing also uses the hash.
  auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/** Turns Postgres/Supabase errors into a readable sentence. */
export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  return m.replace(/^.*?ERROR:\s*/, '').replace(/\s*\(SQLSTATE.*$/, '');
}
