import { AppUser } from '../../types';
import { isLocalE2EMode, requireSupabaseConfigured, supabase, throwIfSupabaseError, toAppUser } from '../supabaseClient';
import { localTestUser, localUpsert } from '../supabaseLocalStore';

export function onAuthStateChanged(callback: (user: AppUser | null) => void) {
  if (isLocalE2EMode()) {
    window.setTimeout(() => callback(localTestUser), 0);
    return () => undefined;
  }

  requireSupabaseConfigured();
  void supabase.auth.getUser().then(({ data }) => callback(toAppUser(data.user)));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(toAppUser(session?.user));
  });
  return () => data.subscription.unsubscribe();
}

export async function getCurrentUser(): Promise<AppUser | null> {
  if (isLocalE2EMode()) return localTestUser;
  requireSupabaseConfigured();
  const { data, error } = await supabase.auth.getUser();
  throwIfSupabaseError(error, 'Supabase Auth getUser');
  return toAppUser(data.user);
}

export async function getCurrentAccessToken(): Promise<string | null> {
  if (isLocalE2EMode()) return 'local-e2e-token';
  requireSupabaseConfigured();
  const { data, error } = await supabase.auth.getSession();
  throwIfSupabaseError(error, 'Supabase Auth getSession');
  return data.session?.access_token || null;
}

export async function loginWithEmailPassword(email: string, password: string): Promise<AppUser> {
  if (isLocalE2EMode()) return localTestUser;
  requireSupabaseConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  throwIfSupabaseError(error, 'Supabase Email/Password login');
  const user = toAppUser(data.user);
  if (!user) throw new Error('Supabase login did not return a user.');
  return user;
}

export async function signUpWithEmailPassword(email: string, password: string): Promise<{ user: AppUser | null; needsEmailConfirmation: boolean }> {
  if (isLocalE2EMode()) return { user: localTestUser, needsEmailConfirmation: false };
  requireSupabaseConfigured();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });
  throwIfSupabaseError(error, 'Supabase Email/Password signup');
  return {
    user: toAppUser(data.user),
    needsEmailConfirmation: !data.session,
  };
}

export async function resetPasswordForEmail(email: string): Promise<void> {
  if (isLocalE2EMode()) return;
  requireSupabaseConfigured();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  throwIfSupabaseError(error, 'Supabase reset password');
}

export async function loginWithGoogle(): Promise<void> {
  if (isLocalE2EMode()) return;
  requireSupabaseConfigured();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  throwIfSupabaseError(error, 'Supabase Google login');
}

export async function logout() {
  if (isLocalE2EMode()) return;
  const { error } = await supabase.auth.signOut();
  throwIfSupabaseError(error, 'Supabase logout');
}

export async function upsertProfile(user: AppUser) {
  const now = new Date().toISOString();
  const profile = {
    id: user.uid,
    uid: user.uid,
    name: user.displayName || 'Vistoriador',
    email: user.email || '',
    lastLoginAt: now,
    plan: 'gratuito',
  };

  if (isLocalE2EMode()) {
    localUpsert('profiles', { ...profile, createdAt: now });
    return;
  }

  requireSupabaseConfigured();
  const { error } = await supabase.from('profiles').upsert({
    id: user.uid,
    name: profile.name,
    email: profile.email,
    last_login_at: now,
    plan: 'gratuito',
  }, { onConflict: 'id' });
  throwIfSupabaseError(error, 'Supabase profile upsert');
}
