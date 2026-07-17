import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  upsert: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  isLocalE2EMode: () => false,
  requireSupabaseConfigured: vi.fn(),
  supabase: {
    auth: {
      signUp: supabaseMocks.signUp,
    },
    from: supabaseMocks.from,
  },
  throwIfSupabaseError: (error: unknown, context: string) => {
    if (error) throw new Error(`${context}: ${(error as any)?.message || String(error)}`);
  },
  toAppUser: (user: any) => user ? ({
    uid: user.id,
    id: user.id,
    email: user.email,
    displayName: user.user_metadata?.full_name || user.email,
    phone: user.user_metadata?.phone || null,
  }) : null,
}));

vi.mock('../lib/supabaseLocalStore', () => ({
  localTestUser: {
    uid: 'local-user',
    id: 'local-user',
    email: 'local@example.test',
    displayName: 'Local User',
    phone: null,
  },
  localUpsert: vi.fn(),
}));

import { signUpWithEmailPassword, upsertProfile } from '../lib/services/authService';

describe('auth profile signup persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.signUp.mockResolvedValue({
      data: {
        user: {
          id: 'signup-user-1',
          email: 'maria@example.com',
          user_metadata: {
            full_name: 'Maria Oliveira',
            phone: '11987654321',
          },
        },
        session: { access_token: 'token' },
      },
      error: null,
    });
    supabaseMocks.upsert.mockResolvedValue({ error: null });
    supabaseMocks.from.mockReturnValue({ upsert: supabaseMocks.upsert });
  });

  it('sends full name and normalized phone in signup metadata', async () => {
    const result = await signUpWithEmailPassword('maria@example.com', 'secret123', {
      fullName: '  Maria   Oliveira  ',
      phone: '(11) 98765-4321',
    });

    expect(result.user?.displayName).toBe('Maria Oliveira');
    expect(result.user?.phone).toBe('11987654321');
    expect(supabaseMocks.signUp).toHaveBeenCalledWith({
      email: 'maria@example.com',
      password: 'secret123',
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: 'Maria Oliveira',
          name: 'Maria Oliveira',
          phone: '11987654321',
        },
      },
    });
  });

  it('persists normalized phone through the shared profile upsert', async () => {
    await upsertProfile({
      uid: 'signup-user-1',
      id: 'signup-user-1',
      email: 'maria@example.com',
      displayName: 'Maria Oliveira',
      phone: '(11) 98765-4321',
    });

    expect(supabaseMocks.from).toHaveBeenCalledWith('profiles');
    expect(supabaseMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'signup-user-1',
        name: 'Maria Oliveira',
        email: 'maria@example.com',
        phone: '11987654321',
      }),
      { onConflict: 'id' },
    );
  });

  it('keeps existing customers without phone compatible', async () => {
    await upsertProfile({
      uid: 'legacy-user-1',
      id: 'legacy-user-1',
      email: 'legacy@example.com',
      displayName: 'Cliente Antigo',
    });

    const payload = supabaseMocks.upsert.mock.calls[0][0];
    expect(payload).toMatchObject({
      id: 'legacy-user-1',
      name: 'Cliente Antigo',
      email: 'legacy@example.com',
    });
    expect(payload).not.toHaveProperty('phone');
  });
});
