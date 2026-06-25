import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('critical static regression guards', () => {
  it('does not use addDoc to write audit events because Firestore rules require id == eventId', () => {
    const files = ['src/App.tsx', 'src/components/InspectionWizard.tsx', 'src/components/PropertyManager.tsx', 'src/components/ReportPdfGenerator.tsx', 'src/lib/auditEvents.ts'];
    for (const file of files) {
      const source = read(file);
      expect(source, `${file} must not directly addDoc to events`).not.toMatch(/addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*['\"]events['\"]/);
    }
  });

  it('routes all audit event writes through safeCreateAuditEvent and keeps it non-blocking', () => {
    const helper = read('src/lib/auditEvents.ts');
    expect(helper).toContain('export async function safeCreateAuditEvent');
    expect(helper).toContain('setDoc(eventRef, eventDoc)');
    expect(helper).toContain('id: eventId');
    expect(helper).toContain('return null');
    expect(helper).toContain('console.warn');
  });

  it('Firestore rules allow only owned entitlement reads and controlled free entitlement creation', () => {
    const rules = read('firestore.rules');
    expect(rules).toContain('match /entitlements/{entitlementId}');
    expect(rules).toContain('resource.data.userId == request.auth.uid');
    expect(rules).toContain("request.resource.data.planId == 'free_10'");
    expect(rules).toContain("request.resource.data.source == 'free_self_service'");
    expect(rules).toContain('request.resource.data.maxPhotosPerInspection <= 10');
    expect(rules).toContain('allow update, delete: if false');
  });

  it('Firestore rules require ownership on inspections, nested rooms, nested photos and reports', () => {
    const rules = read('firestore.rules');
    expect(rules).toContain('match /inspections/{inspectionId}');
    expect(rules).toContain('request.resource.data.userId == request.auth.uid');
    expect(rules).toContain('get(/databases/$(database)/documents/properties/$(request.resource.data.propertyId)).data.userId == request.auth.uid');
    expect(rules).toContain('match /rooms/{roomId}');
    expect(rules).toContain('match /photos/{photoId}');
    expect(rules).toContain('match /reports/{reportId}');
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
