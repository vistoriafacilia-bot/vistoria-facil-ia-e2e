import { createAdminStore } from '../_admin/adminStore.mjs';

export const getPaymentV1Plan = async (planCode, { store = null, env = process.env } = {}) => {
  const resolvedStore = store || createAdminStore({ env });
  return resolvedStore.getPaymentV1PlanByCode(String(planCode || '').trim());
};

export const listPaymentV1Plans = async ({ store = null, env = process.env } = {}) => {
  const resolvedStore = store || createAdminStore({ env });
  return resolvedStore.listPublicPaymentPlans();
};
