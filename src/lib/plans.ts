import { EntitlementPlan, PlanDefinition, ReportCreditPlan, ReportCreditPlanId } from '../types';

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

export const REPORT_CREDIT_PLAN_DEFINITIONS: Record<ReportCreditPlanId, ReportCreditPlan> = {
  report_50_beta_4990: {
    id: 'report_50_beta_4990',
    name: 'Relatorio 50',
    description: 'Credito avulso para 1 relatorio com ate 50 analises de IA. Preco promocional de beta.',
    priceCents: 4990,
    regularPriceCents: 6990,
    currency: 'BRL',
    analysisLimit: 50,
    badge: 'Beta R$ 49,90',
    active: true,
  },
  report_100_9990: {
    id: 'report_100_9990',
    name: 'Relatorio 100',
    description: 'Credito avulso para 1 relatorio com ate 100 analises de IA.',
    priceCents: 9990,
    regularPriceCents: null,
    currency: 'BRL',
    analysisLimit: 100,
    badge: 'R$ 99,90',
    active: true,
  },
  report_150_14990: {
    id: 'report_150_14990',
    name: 'Relatorio 150',
    description: 'Credito avulso para 1 relatorio com ate 150 analises de IA.',
    priceCents: 14990,
    regularPriceCents: null,
    currency: 'BRL',
    analysisLimit: 150,
    badge: 'R$ 149,90',
    active: true,
  },
};

export const SORTED_REPORT_CREDIT_PLANS = [
  REPORT_CREDIT_PLAN_DEFINITIONS.report_50_beta_4990,
  REPORT_CREDIT_PLAN_DEFINITIONS.report_100_9990,
  REPORT_CREDIT_PLAN_DEFINITIONS.report_150_14990,
];

export const formatPlanPrice = (priceCents: number, currency = 'BRL') => {
  if (priceCents === 0) return 'Gratuito';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(priceCents / 100);
};
