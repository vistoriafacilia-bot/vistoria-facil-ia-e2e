import { getCurrentAccessToken } from './authService';
import { supabase } from '../supabaseClient';

export type PaymentV1PlanCode = 'report_50_beta' | 'report_100' | 'report_150';

export interface PaymentV1PlanOption {
  code: PaymentV1PlanCode;
  name: string;
  description: string;
  priceLabel: string;
  analysisLimit: number;
}

export interface PaymentV1CheckoutResponse {
  checkoutUrl: string;
  checkoutId: string;
  orderId: string;
  externalReference: string;
  planCode: PaymentV1PlanCode;
  requestId?: string;
}

export interface PaymentV1CreditStatus {
  id: string;
  orderId: string;
  planCode: PaymentV1PlanCode;
  analysisLimit: number;
  analysisUsed: number;
  status: 'active' | 'finalized' | 'revoked';
  createdAt?: string;
  finalizedAt?: string | null;
}

export interface PaymentV1OrderStatus {
  id: string;
  planCode: PaymentV1PlanCode;
  providerCheckoutId?: string | null;
  checkoutUrl?: string | null;
  externalReference: string;
  status: 'pending' | 'paid' | 'canceled' | 'expired' | 'refused' | 'failed';
  amountCents: number;
  analysisLimit: number;
  paidAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentV1StatusResponse {
  hasActiveCredit: boolean;
  activeCredits: PaymentV1CreditStatus[];
  pendingOrders: PaymentV1OrderStatus[];
  paidOrders: PaymentV1OrderStatus[];
  requestId?: string;
  authRequired?: boolean;
}

export interface PaymentV1DebugEvent {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  providerCheckoutId?: string | null;
  externalReference?: string | null;
  processedAt?: string | null;
  createdAt?: string;
}

export interface PaymentV1DebugCounts {
  ordersCount: number;
  pendingOrdersCount: number;
  paidOrdersCount: number;
  creditsCount: number;
  activeCreditsCount: number;
  eventsCount: number;
}

export interface PaymentV1DebugStatusResponse {
  userId?: string;
  latestOrders: PaymentV1OrderStatus[];
  latestCredits: PaymentV1CreditStatus[];
  latestEvents: PaymentV1DebugEvent[];
  counts: PaymentV1DebugCounts;
  requestId?: string;
  authRequired?: boolean;
}

export interface PaymentV1ReconcileResponse {
  pendingOrders: PaymentV1OrderStatus[];
  reconciledOrders: PaymentV1OrderStatus[];
  activeCredits: PaymentV1CreditStatus[];
  requestId?: string;
  authRequired?: boolean;
}

export interface PaymentV1ErrorResponse {
  error: string;
  debugCode: string;
  requestId?: string;
  asaasStatus?: number;
}

export const PAYMENT_V1_PLANS: PaymentV1PlanOption[] = [
  {
    code: 'report_50_beta',
    name: 'Relatório 50',
    description: 'Relatório beta com até 50 análises',
    priceLabel: 'R$ 49,90',
    analysisLimit: 50,
  },
  {
    code: 'report_100',
    name: 'Relatório 100',
    description: 'Relatório beta com até 100 análises',
    priceLabel: 'R$ 99,90',
    analysisLimit: 100,
  },
  {
    code: 'report_150',
    name: 'Relatório 150',
    description: 'Relatório beta com até 150 análises',
    priceLabel: 'R$ 149,90',
    analysisLimit: 150,
  },
];

const EMPTY_PAYMENT_V1_STATUS: PaymentV1StatusResponse = {
  hasActiveCredit: false,
  activeCredits: [],
  pendingOrders: [],
  paidOrders: [],
};

const EMPTY_PAYMENT_V1_DEBUG_STATUS: PaymentV1DebugStatusResponse = {
  latestOrders: [],
  latestCredits: [],
  latestEvents: [],
  counts: {
    ordersCount: 0,
    pendingOrdersCount: 0,
    paidOrdersCount: 0,
    creditsCount: 0,
    activeCreditsCount: 0,
    eventsCount: 0,
  },
};

const EMPTY_PAYMENT_V1_RECONCILE: PaymentV1ReconcileResponse = {
  pendingOrders: [],
  reconciledOrders: [],
  activeCredits: [],
};

const buildMissingSessionError = () => {
  const error = new Error('Faça login novamente para comprar crédito.') as Error & PaymentV1ErrorResponse;
  error.debugCode = 'missing_auth_session';
  return error;
};

const normalizeAccessToken = (value: string | null | undefined) => {
  const token = String(value || '').trim();
  const lowerToken = token.toLowerCase();
  if (!token || lowerToken === 'null' || lowerToken === 'undefined') return null;
  if (lowerToken.startsWith('bearer ')) return token.slice(7).trim() || null;
  if (token === 'local-e2e-token') return null;
  return token;
};

const refreshAccessTokenOnce = async () => {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return normalizeAccessToken(data.session?.access_token);
  } catch {
    return null;
  }
};

const getOptionalAccessToken = async () => {
  const accessToken = normalizeAccessToken(await getCurrentAccessToken());
  if (accessToken) return accessToken;
  return refreshAccessTokenOnce();
};

const getRequiredAccessToken = async () => {
  const accessToken = await getOptionalAccessToken();
  if (!accessToken) {
    const error = buildMissingSessionError();
    error.debugCode = 'missing_auth_token';
    throw error;
  }
  return accessToken;
};

export const hasPaymentV1AuthSession = async () => Boolean(await getOptionalAccessToken());

const buildPaymentV1Error = (body: Partial<PaymentV1ErrorResponse>, fallbackMessage: string, fallbackDebugCode: string) => {
  const error = new Error(body.error || fallbackMessage) as Error & PaymentV1ErrorResponse;
  error.debugCode = body.debugCode || fallbackDebugCode;
  error.requestId = body.requestId;
  error.asaasStatus = body.asaasStatus;
  return error;
};

export const createPaymentV1Checkout = async (planCode: PaymentV1PlanCode): Promise<PaymentV1CheckoutResponse> => {
  const accessToken = await getRequiredAccessToken();

  const response = await fetch('/.netlify/functions/payment-v1-create-checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ planCode }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw buildPaymentV1Error(body, 'Não foi possível iniciar o checkout.', 'payment_v1_frontend_checkout_failed');
  }

  if (!body.checkoutUrl || !body.checkoutId || !body.orderId || !body.externalReference || !body.planCode) {
    const error = new Error('Resposta de checkout incompleta.') as Error & PaymentV1ErrorResponse;
    error.debugCode = 'payment_v1_frontend_invalid_response';
    error.requestId = body.requestId;
    throw error;
  }

  return body as PaymentV1CheckoutResponse;
};

const normalizeDebugCounts = (counts: any): PaymentV1DebugCounts => ({
  ordersCount: Number(counts?.ordersCount || 0),
  pendingOrdersCount: Number(counts?.pendingOrdersCount || 0),
  paidOrdersCount: Number(counts?.paidOrdersCount || 0),
  creditsCount: Number(counts?.creditsCount || 0),
  activeCreditsCount: Number(counts?.activeCreditsCount || 0),
  eventsCount: Number(counts?.eventsCount || 0),
});

export const getPaymentV1Status = async (): Promise<PaymentV1StatusResponse> => {
  const accessToken = await getOptionalAccessToken();
  if (!accessToken) {
    return {
      ...EMPTY_PAYMENT_V1_STATUS,
      authRequired: true,
    };
  }

  const response = await fetch('/.netlify/functions/payment-v1-status', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw buildPaymentV1Error(body, 'Não foi possível consultar o pagamento.', 'payment_v1_frontend_status_failed');
  }

  if (!Array.isArray(body.activeCredits) || !Array.isArray(body.pendingOrders) || !Array.isArray(body.paidOrders)) {
    const error = new Error('Resposta de status incompleta.') as Error & PaymentV1ErrorResponse;
    error.debugCode = 'payment_v1_frontend_invalid_status_response';
    error.requestId = body.requestId;
    throw error;
  }

  return {
    hasActiveCredit: Boolean(body.hasActiveCredit),
    activeCredits: body.activeCredits,
    pendingOrders: body.pendingOrders,
    paidOrders: body.paidOrders,
    requestId: body.requestId,
  } as PaymentV1StatusResponse;
};

export const getPaymentV1DebugStatus = async (): Promise<PaymentV1DebugStatusResponse> => {
  const accessToken = await getOptionalAccessToken();
  if (!accessToken) {
    return {
      ...EMPTY_PAYMENT_V1_DEBUG_STATUS,
      authRequired: true,
    };
  }

  const response = await fetch('/.netlify/functions/payment-v1-debug-status', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw buildPaymentV1Error(body, 'Não foi possível consultar o diagnóstico do pagamento.', 'payment_v1_frontend_debug_status_failed');
  }

  if (!Array.isArray(body.latestOrders) || !Array.isArray(body.latestCredits) || !Array.isArray(body.latestEvents) || !body.counts) {
    const error = new Error('Resposta de diagnóstico incompleta.') as Error & PaymentV1ErrorResponse;
    error.debugCode = 'payment_v1_frontend_invalid_debug_status_response';
    error.requestId = body.requestId;
    throw error;
  }

  return {
    userId: body.userId,
    latestOrders: body.latestOrders,
    latestCredits: body.latestCredits,
    latestEvents: body.latestEvents,
    counts: normalizeDebugCounts(body.counts),
    requestId: body.requestId,
  };
};

export const reconcilePaymentV1 = async (): Promise<PaymentV1ReconcileResponse> => {
  const accessToken = await getOptionalAccessToken();
  if (!accessToken) {
    return {
      ...EMPTY_PAYMENT_V1_RECONCILE,
      authRequired: true,
    };
  }

  const response = await fetch('/.netlify/functions/payment-v1-reconcile', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw buildPaymentV1Error(body, 'Não foi possível verificar o pagamento.', 'payment_v1_frontend_reconcile_failed');
  }

  if (!Array.isArray(body.pendingOrders) || !Array.isArray(body.reconciledOrders) || !Array.isArray(body.activeCredits)) {
    const error = new Error('Resposta de reconciliação incompleta.') as Error & PaymentV1ErrorResponse;
    error.debugCode = 'payment_v1_frontend_invalid_reconcile_response';
    error.requestId = body.requestId;
    throw error;
  }

  return {
    pendingOrders: body.pendingOrders,
    reconciledOrders: body.reconciledOrders,
    activeCredits: body.activeCredits,
    requestId: body.requestId,
  };
};
