import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const authService = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn((callback: (user: any) => void) => {
    callback({
      uid: 'non-admin-user',
      email: 'customer@example.com',
      displayName: 'Customer',
    });
    return () => undefined;
  }),
}));

const adminService = vi.hoisted(() => ({
  addAdminCustomerNote: vi.fn(),
  adjustAdminCredits: vi.fn(),
  getAdminCredits: vi.fn(),
  getAdminCustomer: vi.fn(),
  getAdminDashboard: vi.fn(async () => {
    throw new Error('Authenticated user is not an active administrator. debugCode=admin_user_not_found');
  }),
  getAdminInspection: vi.fn(),
  getAdminOrder: vi.fn(),
  getAdminTrial: vi.fn(),
  grantAdminTrial: vi.fn(),
  listAdminAudit: vi.fn(),
  listAdminCustomers: vi.fn(),
  listAdminInspections: vi.fn(),
  listAdminOrders: vi.fn(),
  listAdminPlans: vi.fn(),
  listAdminUsers: vi.fn(),
  reprocessAdminOrder: vi.fn(),
  saveAdminPlan: vi.fn(),
  saveAdminUser: vi.fn(),
  sendAdminPasswordReset: vi.fn(),
  setAdminCustomerStatus: vi.fn(),
  updateAdminTrial: vi.fn(),
}));

vi.mock('../lib/services/authService', () => authService);
vi.mock('../lib/services/adminService', () => adminService);

import AdminApp from '../components/admin/AdminApp';

describe('Admin access permission', () => {
  it('shows an unauthorized message for an authenticated user without Admin permission', async () => {
    render(<AdminApp />);

    expect(await screen.findByRole('heading', { name: 'Acesso não autorizado' })).toBeInTheDocument();
    expect(screen.queryByText(/Authenticated user is not an active administrator/i)).not.toBeInTheDocument();
  });
});
