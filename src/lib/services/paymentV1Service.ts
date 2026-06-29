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
  planCode: PaymentV1PlanCode;
  requestId?: string;
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

export const createPaymentV1Checkout = async (planCode: PaymentV1PlanCode): Promise<PaymentV1CheckoutResponse> => {
  const response = await fetch('/.netlify/functions/payment-v1-create-checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ planCode }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorBody = body as Partial<PaymentV1ErrorResponse>;
    const error = new Error(errorBody.error || 'Não foi possível iniciar o checkout.') as Error & PaymentV1ErrorResponse;
    error.debugCode = errorBody.debugCode || 'payment_v1_frontend_checkout_failed';
    error.requestId = errorBody.requestId;
    error.asaasStatus = errorBody.asaasStatus;
    throw error;
  }

  if (!body.checkoutUrl || !body.checkoutId || !body.planCode) {
    const error = new Error('Resposta de checkout incompleta.') as Error & PaymentV1ErrorResponse;
    error.debugCode = 'payment_v1_frontend_invalid_response';
    error.requestId = body.requestId;
    throw error;
  }

  return body as PaymentV1CheckoutResponse;
};
