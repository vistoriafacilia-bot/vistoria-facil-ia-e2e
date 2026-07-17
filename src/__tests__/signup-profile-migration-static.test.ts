import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('signup profile phone migration', () => {
  it('adds nullable phone to profiles without changing RLS or existing rows', () => {
    const migration = read('supabase/migrations/202607171000_signup_profile_phone.sql').toLowerCase();

    expect(migration).toContain('alter table public.profiles');
    expect(migration).toContain('add column if not exists phone text');
    expect(migration).toContain('phone is null');
    expect(migration).not.toMatch(/phone\s+text\s+not\s+null/);
    expect(migration).not.toMatch(/\bdrop\s+table\b|\bdelete\s+from\b|\btruncate\b|\balter\s+column\b.*\bnot\s+null\b/);
  });
});
