import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, CreditCard, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AppUser, Entitlement } from '../types';
import {
  createPaymentV1Checkout,
  getPaymentV1Status,
  PAYMENT_V1_PLANS,
} from '../lib/services/paymentV1Service';
import type { PaymentV1PlanCode, PaymentV1StatusResponse } from '../lib/services/paymentV1Service';

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
  const [statusLoading, setStatusLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentV1StatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshPaymentStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await getPaymentV1Status();
      setPaymentStatus(status);
      setErrorMessage(null);
    } catch (error: any) {
      const debugCode = error?.debugCode || 'payment_v1_status_failed';
      setErrorMessage(`${error?.message || 'Não foi possível consultar o pagamento.'} debugCode=${debugCode}`);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setStatusLoading(true);
    getPaymentV1Status()
      .then((status) => {
        if (active) {
          setPaymentStatus(status);
          setErrorMessage(null);
        }
      })
      .catch((error: any) => {
        if (!active) return;
        const debugCode = error?.debugCode || 'payment_v1_status_failed';
        setErrorMessage(`${error?.message || 'Não foi possível consultar o pagamento.'} debugCode=${debugCode}`);
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCheckout = async (planCode: PaymentV1PlanCode) => {
    setLoadingPlan(planCode);
    setErrorMessage(null);
    try {
      const checkout = await createPaymentV1Checkout(planCode);
      await refreshPaymentStatus();
      window.location.href = checkout.checkoutUrl;
    } catch (error: any) {
      const debugCode = error?.debugCode || 'payment_v1_checkout_failed';
      setErrorMessage(`${error?.message || 'Não foi possível iniciar o pagamento.'} debugCode=${debugCode}`);
    } finally {
      setLoadingPlan(null);
    }
  };

  const hasActiveCredit = Boolean(paymentStatus?.hasActiveCredit);
  const hasPendingOrder = Boolean(paymentStatus?.pendingOrders?.length);
  const statusText = hasActiveCredit
    ? 'Pagamento confirmado. Relatório liberado.'
    : hasPendingOrder
      ? 'Pagamento em confirmação.'
      : 'Consultando pagamento...';

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

      {(hasActiveCredit || hasPendingOrder || statusLoading) && (
        <div className={`border rounded-lg px-3 py-2 text-sm flex items-start justify-between gap-3 ${
          hasActiveCredit
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <div className="flex items-start gap-2">
            {hasActiveCredit ? (
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <Loader2 className={`w-4 h-4 mt-0.5 shrink-0 ${statusLoading ? 'animate-spin' : ''}`} />
            )}
            <span>
              {statusText}
            </span>
          </div>
          <button
            type="button"
            onClick={refreshPaymentStatus}
            disabled={statusLoading}
            className="shrink-0 text-xs font-semibold hover:underline disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      )}

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