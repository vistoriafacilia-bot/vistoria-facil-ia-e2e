import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppUser } from '../types';

export const SUPABASE_PHOTO_BUCKET = 'inspection-photos';

export const isLocalE2EMode = () =>
  import.meta.env.MODE === 'test'
  || import.meta.env.VITE_E2E_MODE === 'true'
  || import.meta.env.E2E_MODE === 'true';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);

const placeholderUrl = 'https://example.supabase.co';
const placeholderKey = 'public-anon-key-for-local-builds';

export const supabase: SupabaseClient = createClient(
  supabaseUrl || placeholderUrl,
  supabaseAnonKey || placeholderKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export function requireSupabaseConfigured() {
  if (!isSupabaseConfigured() && !isLocalE2EMode()) {
    throw new Error('SUPABASE_CONFIG_MISSING: configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
}

export function throwIfSupabaseError(error: unknown, context: string): asserts error is null | undefined {
  if (!error) return;
  const message = error instanceof Error ? error.message : String((error as any)?.message || error);
  throw new Error(`${context}: ${message}`);
}

export function toAppUser(user: any | null | undefined): AppUser | null {
  if (!user) return null;
  const metadata = user.user_metadata || {};
  return {
    uid: user.id,
    id: user.id,
    email: user.email || metadata.email || null,
    displayName: metadata.full_name || metadata.name || user.email || 'Vistoriador',
    photoURL: metadata.avatar_url || metadata.picture || null,
  };
}
