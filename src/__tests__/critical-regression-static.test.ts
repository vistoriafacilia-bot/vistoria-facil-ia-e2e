import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('critical static regression guards', () => {
  it('does not import Firebase SDKs in production source after Supabase migration', () => {
    const files = [
      'src/App.tsx',
      'src/components/InspectionWizard.tsx',
      'src/components/PropertyManager.tsx',
      'src/components/ReportPdfGenerator.tsx',
      'src/components/PlanGate.tsx',
      'src/lib/auditEvents.ts',
      'src/lib/entitlements.ts',
      'src/lib/supabaseClient.ts',
    ];
    for (const file of files) {
      const source = read(file);
      expect(source, `${file} must not import firebase`).not.toMatch(/from ['"]firebase\/|from ['"]\.\.\/firebase|from ['"]\.\/firebase/);
    }
  });

  it('routes audit event writes through the Supabase audit service and keeps it non-blocking', () => {
    const helper = read('src/lib/auditEvents.ts');
    const service = read('src/lib/services/auditService.ts');
    expect(helper).toContain('export async function safeCreateAuditEvent');
    expect(helper).toContain('createAuditEvent');
    expect(helper).toContain('return null');
    expect(helper).toContain('console.warn');
    expect(service).toContain("supabase.from('events').insert");
  });

  it('Supabase migration enables RLS and controlled free entitlement creation', () => {
    const migration = read('supabase/migrations/202606250001_vistoria_facil_foundation.sql');
    expect(migration).toContain('alter table public.entitlements enable row level security');
    expect(migration).toContain('create policy "entitlements controlled free insert"');
    expect(migration).toContain("plan_id = 'free_10'");
    expect(migration).toContain("source = 'free_self_service'");
    expect(migration).toContain('max_photos_per_inspection <= 10');
  });

  it('Supabase migration requires ownership on core tables and storage objects', () => {
    const migration = read('supabase/migrations/202606250001_vistoria_facil_foundation.sql');
    for (const table of ['properties', 'inspections', 'rooms', 'photos', 'reports']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain('create policy "photos owner all"');
    expect(migration).toContain('create policy "inspection photos owner insert"');
    expect(migration).toContain("bucket_id = 'inspection-photos'");
    expect(migration).toContain("(storage.foldername(name))[1] = (select auth.uid()::text)");
  });

  it('production app version is the release candidate and no V0.1.0 marker remains in source files', () => {
    const appVersion = read('src/lib/appVersion.ts');
    expect(appVersion).toContain('V0.4.0-rc2');

    const productionFiles = [
      'src/App.tsx',
      'src/components/Navbar.tsx',
      'src/components/InspectionWizard.tsx',
      'src/components/PlanGate.tsx',
      'src/components/PropertyManager.tsx',
      'src/components/ReportPdfGenerator.tsx',
    ];
    for (const file of productionFiles) {
      expect(read(file), `${file} should not display stale V0.1.0`).not.toContain('V0.1.0');
    }
  });
});
