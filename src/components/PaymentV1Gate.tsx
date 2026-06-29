import React, { useState } from 'react';
import { AlertTriangle, CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { AppUser, Entitlement } from '../types';
import { createPaymentV1Checkout, PAYMENT_V1_PLANS, PaymentV1PlanCode } from '../lib/services/paymentV1Service';

interface PaymentV1GateProps {
  user?: AppUser;
  onReady: (entitlement: Entitlement) => void;
  autoContinueOnActiveEntitlement?: boolean;
}

export default function PaymentV1Gate({ user, onReady, autoContinueOnActiveEntitlement }: PaymentV1GateProps) {
  void user;
  void onReady;
  void autoContinueOnActiveEntitlement;

  const [loadingPlan, setLoadingPlan] = useState<PaymentV1PlanCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCheckout = async (planCode: PaymentV1PlanCode) => {
    setLoadingPlan(planCode);
    setErrorMessage(null);
    try {
      const checkout = await createPaymentV1Checkout(planCode);
      window.location.href = checkout.checkoutUrl;
    } catch (error: any) {
      const debugCode = error?.debugCode || 'payment_v1_checkout_failed';
      setErrorMessage(`${error?.message || 'Não foi possível iniciar o pagamento.'} debugCode=${debugCode}`);
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="bg-emerald-50 text-emerald-700 rounded-lg p-2">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900">Comprar crédito de relatório</h3>
          <p className="text-sm text-slate-600">
            Pagamento em ambiente seguro. Após a confirmação, seu relatório beta será liberado no fluxo assistido.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PAYMENT_V1_PLANS.map((plan) => {
          const loading = loadingPlan === plan.code;
          return (
            <div key={plan.code} className="border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
              <div>
                <h4 className="font-semibold text-slate-900">{plan.name}</h4>
                <p className="text-xs text-slate-500 mt-1">{plan.description}</p>
              </div>
              <div className="text-2xl font-bold text-slate-900">{plan.priceLabel}</div>
              <div className="text-xs text-slate-500">{plan.analysisLimit} análises de IA</div>
              <button
                type="button"
                onClick={() => handleCheckout(plan.code)}
                disabled={Boolean(loadingPlan)}
                className="mt-auto h-10 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                {loading ? 'Abrindo checkout...' : 'Comprar'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
