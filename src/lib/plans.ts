import { EntitlementPlan, PlanDefinition } from '../types';

export const FREE_PLAN_ID: EntitlementPlan = 'free_10';
export const PAID_BETA_PLAN_ID: EntitlementPlan = 'beta_paid_4990';

export const PLAN_DEFINITIONS: Record<EntitlementPlan, PlanDefinition> = {
  free_10: {
    id: FREE_PLAN_ID,
    name: 'Gratuito',
    description: 'Teste inicial com até 10 fotos por vistoria.',
    priceCents: 0,
    currency: 'BRL',
    maxPhotosPerInspection: 10,
    pdfEnabled: true,
    paymentRequired: false,
    badge: 'Teste controlado'
  },
  beta_paid_4990: {
    id: PAID_BETA_PLAN_ID,
    name: 'Beta pago',
    description: 'Vistoria ampliada com pagamento integrado e relatório PDF.',
    priceCents: 4990,
    currency: 'BRL',
    maxPhotosPerInspection: 50,
    pdfEnabled: true,
    paymentRequired: true,
    badge: 'R$ 49,90'
  }
};

export const SORTED_PLANS = [PLAN_DEFINITIONS.free_10, PLAN_DEFINITIONS.beta_paid_4990];

export const formatPlanPrice = (priceCents: number, currency = 'BRL') => {
  if (priceCents === 0) return 'Gratuito';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(priceCents / 100);
};
