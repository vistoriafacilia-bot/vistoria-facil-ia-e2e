import { getCurrentAccessToken } from './authService';

export type AdminRole = 'owner' | 'operation' | 'support' | 'finance' | 'read_only';

export interface AdminDashboard {
  metrics: {
    customers: number;
    orders: number;
    payments: number;
    credits: number;
    inspections: number;
  };
  recentFailures: any[];
}

export interface AdminPlan {
  id: string;
  code: string | null;
  name: string;
  description: string;
  priceCents: number;
  regularPriceCents?: number | null;
  currency: string;
  analysisLimit: number;
  badge: string;
  active: boolean;
  visible: boolean;
  availableForPurchase: boolean;
  version: number;
}

export interface AdminCustomer {
  id: string;
  name?: string;
  email?: string;
  plan?: string;
  admin_status?: string;
  blocked_at?: string | null;
  deactivated_at?: string | null;
  created_at?: string;
  last_login_at?: string;
}

const getAccessToken = async () => {
  const token = await getCurrentAccessToken();
  if (!token) throw new Error('Sessao administrativa ausente.');
  return token;
};

const requestAdmin = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = await getAccessToken();
  const response = await fetch(`/.netlify/functions/${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error || 'Acao administrativa falhou.';
    const debugCode = body?.debugCode ? ` debugCode=${body.debugCode}` : '';
    throw new Error(`${message}${debugCode}`);
  }
  return body as T;
};

const qs = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

const postAdmin = <T>(path: string, body: Record<string, unknown>) => requestAdmin<T>(path, {
  method: 'POST',
  body: JSON.stringify(body),
});

export const getAdminDashboard = async () => {
  const body = await requestAdmin<{ dashboard: AdminDashboard }>('admin-dashboard');
  return body.dashboard;
};

export const listAdminCustomers = async (search = '') => {
  const body = await requestAdmin<{ customers: AdminCustomer[] }>(`admin-customers${qs({ search })}`);
  return body.customers;
};

export const getAdminCustomer = async (id: string) => {
  const body = await requestAdmin<{ customer: any }>(`admin-customers${qs({ id })}`);
  return body.customer;
};

export const setAdminCustomerStatus = (customerId: string, status: string, reason: string) => postAdmin<{ customer: AdminCustomer }>('admin-customers', {
  action: 'set_status',
  customerId,
  status,
  reason,
});

export const addAdminCustomerNote = (customerId: string, note: string, reason: string) => postAdmin<{ note: any }>('admin-customers', {
  action: 'add_note',
  customerId,
  note,
  reason,
});

export const sendAdminPasswordReset = (customerId: string, email: string, reason: string) => postAdmin<{ passwordReset: any }>('admin-customers', {
  action: 'send_password_reset',
  customerId,
  email,
  reason,
});

export const listAdminPlans = async () => {
  const body = await requestAdmin<{ plans: AdminPlan[] }>('admin-plans');
  return body.plans;
};

export const saveAdminPlan = (payload: Record<string, unknown>) => postAdmin<{ plan: AdminPlan }>('admin-plans', payload);

export const getAdminTrial = async () => {
  const body = await requestAdmin<{ trial: any }>('admin-trial');
  return body.trial;
};

export const updateAdminTrial = (enabled: boolean, photoLimit: number, reason: string) => postAdmin<{ trial: any }>('admin-trial', {
  action: 'update',
  enabled,
  photoLimit,
  reason,
});

export const grantAdminTrial = (customerId: string, photoLimit: number, reason: string) => postAdmin<{ entitlement: any }>('admin-trial', {
  action: 'manual_grant',
  customerId,
  photoLimit,
  reason,
});

export const listAdminOrders = async (status = '') => {
  const body = await requestAdmin<{ orders: any[] }>(`admin-orders${qs({ status })}`);
  return body.orders;
};

export const getAdminOrder = async (id: string) => {
  const body = await requestAdmin<{ order: any }>(`admin-orders${qs({ id })}`);
  return body.order;
};

export const reprocessAdminOrder = (orderId: string, reason: string) => postAdmin<{ result: any }>('admin-orders', {
  action: 'reprocess_entitlement',
  orderId,
  reason,
});

export const getAdminCredits = async (customerId = '') => {
  const body = await requestAdmin<{ credits: any }>(`admin-credits${qs({ customerId })}`);
  return body.credits;
};

export const adjustAdminCredits = (payload: Record<string, unknown>) => postAdmin<{ credits: any }>('admin-credits', payload);

export const listAdminInspections = async (customerId = '') => {
  const body = await requestAdmin<{ inspections: any[] }>(`admin-inspections${qs({ customerId })}`);
  return body.inspections;
};

export const getAdminInspection = async (id: string) => {
  const body = await requestAdmin<{ inspection: any }>(`admin-inspections${qs({ id })}`);
  return body.inspection;
};

export const listAdminUsers = async () => {
  const body = await requestAdmin<{ adminUsers: any[] }>('admin-users');
  return body.adminUsers;
};

export const saveAdminUser = (payload: Record<string, unknown>) => postAdmin<{ adminUser: any }>('admin-users', payload);

export const listAdminAudit = async (params: Record<string, string> = {}) => {
  const body = await requestAdmin<{ audit: any[] }>(`admin-audit${qs(params)}`);
  return body.audit;
};
