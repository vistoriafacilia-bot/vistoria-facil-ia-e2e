import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Admin V1 static architecture', () => {
  it('mounts /admin through a separate admin app', () => {
    const appSource = read('src/App.tsx');
    expect(appSource).toContain("window.location.pathname.replace(/\\/+$/, '') === '/admin'");
    expect(appSource).toContain('<AdminApp />');
    expect(appSource).not.toMatch(/vistoriafacil\.ia@gmail\.com/i);
  });

  it('keeps service role usage inside Netlify functions only', () => {
    const adminServiceSource = read('src/lib/services/adminService.ts');
    expect(adminServiceSource).toContain("Authorization: `Bearer ${token}`");
    expect(adminServiceSource).not.toMatch(/SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY/i);

    const serverAuthSource = read('netlify/functions/_admin/adminSupabase.mjs');
    expect(serverAuthSource).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('defines additive admin database structures', () => {
    const migration = read('supabase/migrations/202607160900_admin_v1.sql').toLowerCase();
    for (const table of ['admin_users', 'admin_audit_log', 'admin_customer_notes', 'app_settings', 'admin_credit_adjustments']) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }
    expect(migration).not.toMatch(/\bdrop\s+table\b|\bdelete\s+from\b|\btruncate\b|\balter\s+column\b.*\bdrop\b/);
  });

  it('uses database-backed Payment V1 plan catalog', () => {
    const plansSource = read('netlify/functions/_paymentV1/paymentPlans.mjs');
    const checkoutSource = read('netlify/functions/payment-v1-create-checkout.mjs');
    const frontendSource = read('src/lib/services/paymentV1Service.ts');
    expect(plansSource).toContain('getPaymentV1PlanByCode');
    expect(checkoutSource).toContain('await getPaymentV1Plan');
    expect(frontendSource).toContain('payment-v1-plans');
    expect(plansSource).not.toMatch(/49\.9|99\.9|149\.9|4990|9990|14990/);
  });

  it('records administrative mutations with real outcomes and makes usage-credit changes transactional', () => {
    const storeSource = read('netlify/functions/_admin/adminStore.mjs');
    const migration = read('supabase/migrations/202607160900_admin_v1.sql');
    expect(storeSource).toContain("result: 'pending'");
    expect(storeSource).toContain("result: 'success'");
    expect(storeSource).toContain("result: 'failed'");
    expect(storeSource).toContain("client.rpc('admin_adjust_usage_credit'");
    expect(migration).toContain('create or replace function public.admin_adjust_usage_credit');
    expect(migration).toContain('previous_usage_units');
    expect(migration).toContain('next_usage_units');
  });

  it('limits bootstrap access to the first owner and keeps prices distinct from usage credits', () => {
    const authSource = read('netlify/functions/_admin/adminAuth.mjs');
    const paymentSource = read('netlify/functions/_paymentV1/paymentOrders.mjs');
    const adminAppSource = read('src/components/admin/AdminApp.tsx');
    expect(authSource).toContain('getBootstrapOwnerEmail');
    expect(authSource).toContain("rest.rpc('admin_bootstrap_owner'");
    expect(paymentSource).not.toContain('plan?.value');
    expect(adminAppSource).toContain('Valor do pagamento (R$)');
    expect(adminAppSource).not.toContain('>Saldo<');
  });
});
