import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, CreditCard, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AppUser, Entitlement } from '../types';
import {
  createPaymentV1Checkout,
  formatPaymentV1PlanPrice,
  getPaymentV1DebugStatus,
  getPaymentV1Status,
  hasPaymentV1AuthSession,
  listPaymentV1Plans,
  reconcilePaymentV1,
} from '../lib/services/paymentV1Service';
import { buildPaymentV1Entitlement } from '../lib/paymentV1EntitlementBridge';
import type {
  PaymentV1DebugStatusResponse,
  PaymentV1PlanCode,
  PaymentV1StatusResponse,
} from '../lib/services/paymentV1Service';

export const PAYMENT_RETURN_POLL_INTERVAL_MS = 2_000;
export const PAYMENT_RETURN_POLL_TIMEOUT_MS = 30_000;

interface PaymentV1GateProps {
  user?: AppUser;
  onReady: (entitlement: Entitlement) => void;
  onEntitlementSync?: (entitlement: Entitlement) => void;
  autoContinueOnActiveEntitlement?: boolean;
}

const loginAgainMessage = 'Faça login novamente para comprar crédito.';
const authDebugCodes = new Set([
  'missing_auth_session',
  'missing_auth_token',
  'missing_auth_header',
  'invalid_auth_header_format',
  'invalid_auth_token',
]);

const isAuthSessionError = (error: any) => authDebugCodes.has(String(error?.debugCode || ''));

const buildStatusWarning = (error: any) => {
  if (isAuthSessionError(error)) return loginAgainMessage;
  return `Não foi possível confirmar pagamentos anteriores agora. Os planos continuam disponíveis. debugCode=${error?.debugCode || 'payment_v1_status_failed'}`;
};

const buildDiagnosticMessage = (status: PaymentV1StatusResponse | null, debug?: PaymentV1DebugStatusResponse | null) => {
  const activeCreditCount = (status?.activeCredits?.length || 0) + (debug?.counts.activeCreditsCount || 0);
  if (status?.hasActiveCredit || activeCreditCount > 0) return 'Crédito ativo encontrado; relatório liberado';

  const pendingOrderCount = (status?.pendingOrders?.length || 0) || (debug?.counts.pendingOrdersCount || 0);
  const paidOrderCount = (status?.paidOrders?.length || 0) || (debug?.counts.paidOrdersCount || 0);
  const orderCount = (status?.pendingOrders?.length || 0) + (status?.paidOrders?.length || 0) + (debug?.counts.ordersCount || 0);
  const eventsCount = debug?.counts.eventsCount;

  if (paidOrderCount > 0) return 'Pagamento recebido, crédito ainda não criado';
  if (pendingOrderCount > 0 && eventsCount === 0) return 'Webhook ainda não recebido';
  if (pendingOrderCount > 0) return 'Pedido pendente; aguardando confirmação do gateway';
  if (orderCount === 0) return 'Pedido não encontrado';
  return 'Pedido pendente; aguardando confirmação do gateway';
};

const mergeDebugIntoStatus = (status: PaymentV1StatusResponse, debug: PaymentV1DebugStatusResponse): PaymentV1StatusResponse => {
  const activeCredits = debug.latestCredits.filter((credit) => credit.status === 'active');
  if (activeCredits.length === 0) return status;
  return {
    ...status,
    hasActiveCredit: true,
    activeCredits,
    pendingOrders: debug.latestOrders.filter((order) => order.status === 'pending'),
    paidOrders: debug.latestOrders.filter((order) => order.status === 'paid'),
    requestId: debug.requestId || status.requestId,
  };
};

const hasPaymentSuccessReturn = () => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('payment') === 'success';
};

const removePaymentSuccessReturnFromUrl = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (url.searchParams.get('payment') !== 'success') return;
  url.searchParams.delete('payment');
  const nextUrl = `${url.pathname}${url.search}${url.hash}` || '/';
  window.history.replaceState(window.history.state, document.title, nextUrl);
};

export default function PaymentV1Gate({ user, onReady, onEntitlementSync, autoContinueOnActiveEntitlement }: PaymentV1GateProps) {
  const [paymentReturnDetected] = useState(hasPaymentSuccessReturn);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof listPaymentV1Plans>>>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<PaymentV1PlanCode | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [returnConfirming, setReturnConfirming] = useState(paymentReturnDetected);
  const [paymentStatus, setPaymentStatus] = useState<PaymentV1StatusResponse | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [statusWarning, setStatusWarning] = useState<string | null>(null);
  const [paymentDiagnostic, setPaymentDiagnostic] = useState<string | null>(null);
  const [paymentReturnMessage, setPaymentReturnMessage] = useState<string | null>(() => (
    paymentReturnDetected ? 'Confirmando pagamento...' : null
  ));

  const buildEntitlementFromStatus = useCallback((status: PaymentV1StatusResponse) => {
    const firstCredit = status.activeCredits?.[0];
    return firstCredit ? buildPaymentV1Entitlement(firstCredit, user) : null;
  }, [user]);

  const syncEntitlementIfAvailable = useCallback((status: PaymentV1StatusResponse) => {
    const paymentEntitlement = buildEntitlementFromStatus(status);
    if (paymentEntitlement) onEntitlementSync?.(paymentEntitlement);
    return paymentEntitlement;
  }, [buildEntitlementFromStatus, onEntitlementSync]);

  const notifyReadyIfAllowed = useCallback((status: PaymentV1StatusResponse) => {
    const paymentEntitlement = buildEntitlementFromStatus(status);
    if (!autoContinueOnActiveEntitlement || !paymentEntitlement) return;
    onReady(paymentEntitlement);
  }, [autoContinueOnActiveEntitlement, buildEntitlementFromStatus, onReady]);

  useEffect(() => {
    let active = true;
    setPlansLoading(true);
    setPlansError(null);
    listPaymentV1Plans()
      .then((loadedPlans) => {
        if (!active) return;
        setPlans(loadedPlans);
        if (loadedPlans.length === 0) {
          setPlansError('Nenhum plano disponivel para compra agora.');
        }
      })
      .catch((error: any) => {
        if (!active) return;
        const debugCode = error?.debugCode || 'payment_v1_plans_failed';
        setPlansError(`${error?.message || 'Nao foi possivel carregar os planos.'} debugCode=${debugCode}`);
      })
      .finally(() => {
        if (active) setPlansLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const applyStatus = useCallback((status: PaymentV1StatusResponse) => {
    setPaymentStatus(status);
    setStatusWarning(null);
    if (status.hasActiveCredit) {
      setReturnConfirming(false);
      setPaymentReturnMessage(null);
      syncEntitlementIfAvailable(status);
      setPaymentDiagnostic(buildDiagnosticMessage(status));
      notifyReadyIfAllowed(status);
    }
  }, [notifyReadyIfAllowed, syncEntitlementIfAvailable]);

  const refreshPaymentStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await getPaymentV1Status();
      applyStatus(status);
    } catch (error: any) {
      setStatusWarning(buildStatusWarning(error));
    } finally {
      setStatusLoading(false);
    }
  }, [applyStatus]);

  const verifyPayment = useCallback(async () => {
    setStatusLoading(true);
    setDebugLoading(false);
    try {
      const status = await getPaymentV1Status();
      applyStatus(status);
      if (status.hasActiveCredit) {
        setPaymentDiagnostic(buildDiagnosticMessage(status));
        return;
      }

      await reconcilePaymentV1();
      const reconciledStatus = await getPaymentV1Status();
      applyStatus(reconciledStatus);
      if (reconciledStatus.hasActiveCredit) {
        setPaymentDiagnostic(buildDiagnosticMessage(reconciledStatus));
        return;
      }

      setDebugLoading(true);
      const debugStatus = await getPaymentV1DebugStatus();
      const mergedStatus = mergeDebugIntoStatus(reconciledStatus, debugStatus);
      applyStatus(mergedStatus);
      setPaymentDiagnostic(buildDiagnosticMessage(mergedStatus, debugStatus));
    } catch (error: any) {
      setStatusWarning(buildStatusWarning(error));
    } finally {
      setStatusLoading(false);
      setDebugLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    if (!paymentReturnDetected) return;

    let active = true;
    let pollTimer: number | null = null;

    const waitForNextPoll = (delayMs: number) => new Promise<void>((resolve) => {
      pollTimer = window.setTimeout(resolve, delayMs);
    });

    const finishSuccess = (status: PaymentV1StatusResponse) => {
      applyStatus(status);
      setReturnConfirming(false);
      setPaymentReturnMessage(null);
      setPaymentDiagnostic(buildDiagnosticMessage(status));
      removePaymentSuccessReturnFromUrl();
    };

    void (async () => {
      setReturnConfirming(true);
      setStatusWarning(null);
      setPaymentReturnMessage('Confirmando pagamento...');
      const deadline = Date.now() + PAYMENT_RETURN_POLL_TIMEOUT_MS;

      try {
        while (active && Date.now() <= deadline) {
          const status = await getPaymentV1Status();
          if (!active) return;
          if (status.hasActiveCredit) {
            finishSuccess(status);
            return;
          }
          applyStatus(status);

          await reconcilePaymentV1();
          if (!active) return;

          const reconciledStatus = await getPaymentV1Status();
          if (!active) return;
          if (reconciledStatus.hasActiveCredit) {
            finishSuccess(reconciledStatus);
            return;
          }
          applyStatus(reconciledStatus);

          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0) break;
          await waitForNextPoll(Math.min(PAYMENT_RETURN_POLL_INTERVAL_MS, remainingMs));
        }

        if (active) {
          setPaymentDiagnostic('Pedido pendente; aguardando confirmação do gateway');
          setPaymentReturnMessage('Seu pagamento ainda está sendo processado. Aguarde alguns instantes.');
        }
      } catch (error: any) {
        if (active) setStatusWarning(buildStatusWarning(error));
      } finally {
        if (active) setReturnConfirming(false);
      }
    })();

    return () => {
      active = false;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
    };
  }, [applyStatus, paymentReturnDetected]);

  useEffect(() => {
    if (paymentReturnDetected) return;
    let active = true;
    setStatusLoading(true);
    getPaymentV1Status()
      .then((status) => {
        if (!active) return;
        applyStatus(status);
      })
      .catch((error: any) => {
        if (!active) return;
        setStatusWarning(buildStatusWarning(error));
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyStatus, paymentReturnDetected]);

  const handleCheckout = async (planCode: PaymentV1PlanCode) => {
    setLoadingPlan(planCode);
    setCheckoutError(null);
    try {
      const hasSession = await hasPaymentV1AuthSession();
      if (!hasSession) {
        setCheckoutError(loginAgainMessage);
        return;
      }
      const checkout = await createPaymentV1Checkout(planCode);
      window.location.href = checkout.checkoutUrl;
    } catch (error: any) {
      if (isAuthSessionError(error)) {
        setCheckoutError(loginAgainMessage);
        return;
      }
      const debugCode = error?.debugCode || 'payment_v1_checkout_failed';
      setCheckoutError(`${error?.message || 'Não foi possível iniciar o pagamento.'} debugCode=${debugCode}`);
    } finally {
      setLoadingPlan(null);
    }
  };

  const hasActiveCredit = Boolean(paymentStatus?.hasActiveCredit);
  const statusText = hasActiveCredit
    ? 'Pagamento confirmado. Relatório liberado.'
    : 'Pagamento em confirmação.';
  const verifyingPayment = statusLoading || debugLoading || returnConfirming;
  const showPaymentReturnMessage = Boolean(paymentReturnMessage && !hasActiveCredit);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
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
        <button
          type="button"
          onClick={verifyPayment}
          disabled={verifyingPayment}
          className="shrink-0 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${verifyingPayment ? 'animate-spin' : ''}`} />
          Verificar pagamento
        </button>
      </div>

      {(hasActiveCredit || paymentReturnDetected) && (
        <div className={`border rounded-lg px-3 py-2 text-sm flex items-start justify-between gap-3 ${
          hasActiveCredit
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <div className="flex items-start gap-2">
            {hasActiveCredit ? (
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <Loader2 className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span>{statusText}</span>
          </div>
          <button
            type="button"
            onClick={refreshPaymentStatus}
            disabled={statusLoading || returnConfirming}
            className="shrink-0 text-xs font-semibold hover:underline disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      )}

      {showPaymentReturnMessage && (
        <div className={`border rounded-lg px-3 py-2 text-sm flex items-start gap-2 ${
          'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <Loader2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{paymentReturnMessage}</span>
        </div>
      )}

      {paymentDiagnostic && (
        <div className={`border rounded-lg px-3 py-2 text-xs flex items-start gap-2 ${
          hasActiveCredit
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          {hasActiveCredit ? (
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span>{paymentDiagnostic}</span>
        </div>
      )}

      {statusWarning && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs flex items-start justify-between gap-3">
          <span>{statusWarning}</span>
          <button
            type="button"
            onClick={refreshPaymentStatus}
            disabled={statusLoading || returnConfirming}
            className="shrink-0 font-semibold hover:underline disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      )}

      {checkoutError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{checkoutError}</span>
        </div>
      )}

      {plansError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{plansError}</span>
        </div>
      )}

      {plansLoading && (
        <div className="border border-slate-200 rounded-lg px-3 py-4 text-sm text-slate-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Carregando planos...</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {plans.map((plan) => {
          const loading = loadingPlan === plan.code;
          return (
            <div key={plan.code} className="border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
              <div>
                <h4 className="font-semibold text-slate-900">{plan.name}</h4>
                <p className="text-xs text-slate-500 mt-1">{plan.description}</p>
              </div>
              <div className="text-2xl font-bold text-slate-900">{formatPaymentV1PlanPrice(plan)}</div>
              <div className="text-xs text-slate-500">{plan.analysisLimit} análises de IA</div>
              <button
                type="button"
                onClick={() => handleCheckout(plan.code)}
                disabled={Boolean(loadingPlan) || plansLoading}
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
