import React, { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { AppUser, Entitlement, ReportCredit, ReportCreditPlanId } from '../types';
import { FREE_PLAN_ID, SORTED_REPORT_CREDIT_PLANS, formatPlanPrice } from '../lib/plans';
import { selectBestActiveEntitlement } from '../lib/entitlements';
import { createFreeEntitlement, listEntitlements, saveEntitlement } from '../lib/services/entitlementService';
import { createLocalReportCredit, listReportCredits } from '../lib/services/reportCreditService';
import { getCurrentAccessToken, getCurrentUser } from '../lib/services/authService';
import { isLocalE2EMode } from '../lib/supabaseClient';

interface ReportCreditGateProps {
  user?: AppUser;
  onReady: (entitlement: Entitlement) => void;
  autoContinueOnActiveEntitlement?: boolean;
}

const getPaymentReturnMessage = (status: string, orderId?: string | null) => {
  const suffix = orderId ? ` Pedido: ${orderId}.` : '';
  if (status === 'success') return `Pagamento retornou como aprovado no checkout. Estamos aguardando a confirmacao segura do webhook.${suffix}`;
  if (status === 'pending') return `Pagamento pendente. O credito sera liberado somente apos confirmacao do webhook.${suffix}`;
  if (status === 'cancel' || status === 'failure') return `Pagamento nao foi concluido. Nenhum credito foi liberado.${suffix}`;
  if (status === 'expired') return `Checkout expirado. Nenhum credito foi liberado.${suffix}`;
  return `Retorno de pagamento recebido. Verificando credito.${suffix}`;
};

export default function ReportCreditGate({ user, onReady, autoContinueOnActiveEntitlement = true }: ReportCreditGateProps) {
  const [resolvedUser, setResolvedUser] = useState<AppUser | null>(user || null);
  const activeUser = user || resolvedUser;
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reportCredits, setReportCredits] = useState<ReportCredit[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setResolvedUser(user);
      return;
    }

    let mounted = true;
    void getCurrentUser()
      .then(currentUser => {
        if (mounted) {
          setResolvedUser(currentUser);
          if (!currentUser) setLoading(false);
        }
      })
      .catch(err => {
        console.error('Erro ao resolver usuario atual:', err);
        if (mounted) {
          setError('Nao foi possivel verificar seu usuario agora. Entre novamente.');
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  const refreshAccess = async (options?: { silent?: boolean }) => {
    if (!activeUser) {
      setLoading(false);
      return;
    }
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const [entitlements, credits] = await Promise.all([
        listEntitlements(activeUser.uid),
        listReportCredits(activeUser.uid),
      ]);
      setReportCredits(credits);
      const best = selectBestActiveEntitlement(entitlements);
      if (best && autoContinueOnActiveEntitlement) onReady(best);
    } catch (err) {
      console.error('Erro ao carregar acesso:', err);
      setError('Nao foi possivel verificar seus creditos agora. Tente novamente.');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (activeUser) void refreshAccess();
  }, [activeUser?.uid]);

  useEffect(() => {
    if (!activeUser) return;
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment_status');
    const orderId = params.get('order_id');
    if (!paymentStatus) return;

    setMessage(getPaymentReturnMessage(paymentStatus, orderId));

    let attempts = 0;
    const maxAttempts = paymentStatus === 'success' ? 8 : 4;
    const interval = window.setInterval(() => {
      attempts += 1;
      void refreshAccess({ silent: true });
      if (attempts >= maxAttempts) {
        window.clearInterval(interval);
        if (paymentStatus === 'success') {
          setMessage('Pagamento recebido pelo checkout. Se o credito ainda nao apareceu, clique em "Ja paguei, verificar liberacao" em alguns segundos.');
        }
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [activeUser?.uid]);

  const handleFreePlan = async () => {
    if (!activeUser) return;
    setActionLoading(FREE_PLAN_ID);
    setError(null);
    setMessage(null);
    try {
      const entitlement = createFreeEntitlement(activeUser.uid);
      await saveEntitlement(entitlement);
      onReady(entitlement);
    } catch (err) {
      console.error('Erro ao ativar plano gratuito:', err);
      setError('Nao foi possivel ativar a degustacao gratuita. Verifique as politicas RLS do Supabase.');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePaidCredit = async (planId: ReportCreditPlanId) => {
    if (!activeUser) return;
    setActionLoading(planId);
    setError(null);
    setMessage(null);
    try {
      if (isLocalE2EMode()) {
        await createLocalReportCredit(activeUser.uid, planId);
        setReportCredits(await listReportCredits(activeUser.uid));
        setMessage('Credito local criado para teste E2E.');
        return;
      }

      const token = await getCurrentAccessToken();
      if (!token) throw new Error('Sessao expirada. Entre novamente para pagar.');

      const response = await fetch('/.netlify/functions/create-asaas-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planId, origin: window.location.origin }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Falha ao iniciar pagamento.');
      if (!payload.checkoutUrl) throw new Error('Checkout nao retornou URL de pagamento.');
      window.location.assign(payload.checkoutUrl);
    } catch (err: any) {
      console.error('Erro ao criar checkout:', err);
      setError(err?.message || 'Nao foi possivel abrir o pagamento.');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        <p className="text-slate-500 font-semibold text-sm mt-4">Verificando seu acesso...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 flex items-center justify-center p-5 text-slate-100">
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-6 items-stretch">
        <section className="bg-slate-900/70 border border-slate-800 rounded-3xl p-7 shadow-2xl flex flex-col justify-between">
          <div className="space-y-5">
            <div className="inline-flex bg-indigo-600 text-white p-3 rounded-2xl shadow-xl shadow-indigo-600/10">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Creditos de relatorio</h1>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Compre um credito avulso para gerar 1 relatorio final. Nao e mensalidade nem assinatura.
              </p>
            </div>
            <div className="bg-slate-800/50 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 space-y-2">
              <p className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> Pagamento online via Asaas Checkout.</p>
              <p className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> Cada credito vale para uma vistoria e nao pode ser reutilizado.</p>
              <p className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> Relatorio fechado permanece disponivel para consulta e download.</p>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-3xl p-5 sm:p-7 shadow-2xl border border-slate-200 text-slate-800 space-y-4">
          <div>
            <h2 className="font-bold text-xl">Pacotes avulsos</h2>
            <p className="text-xs text-slate-500 mt-1">Use a degustacao gratuita ou compre um credito para ampliar o limite de analises.</p>
          </div>

          {error && <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold rounded-xl p-3">{error}</div>}
          {message && <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl p-3">{message}</div>}

          {reportCredits.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-3 text-xs space-y-1">
              <p className="font-bold">Creditos encontrados</p>
              {reportCredits.map(credit => (
                <p key={credit.id}>
                  {credit.planId}: {credit.status} - Analises usadas {credit.analysisUsed}/{credit.analysisLimit}
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <article className="rounded-2xl border p-5 flex flex-col justify-between gap-5 border-slate-200 bg-slate-50">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-base">Degustacao gratuita</h3>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-200 text-slate-700">R$ 0</span>
                </div>
                <p className="text-[10px] font-mono font-bold uppercase tracking-wide text-slate-400">free_10</p>
                <p className="text-2xl font-bold">Gratuito</p>
                <p className="text-xs text-slate-600 leading-relaxed">Acesso inicial com ate 10 analises/fotos.</p>
                <ul className="text-xs text-slate-600 space-y-2">
                  <li>- Ate 10 fotos por vistoria</li>
                  <li>- Relatorio PDF habilitado</li>
                  <li>- Ativacao imediata para teste</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={handleFreePlan}
                disabled={!!actionLoading}
                className="h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800"
              >
                {actionLoading === FREE_PLAN_ID ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Ativar gratis
              </button>
            </article>

            {SORTED_REPORT_CREDIT_PLANS.map(plan => {
              const busy = actionLoading === plan.id;
              return (
                <article key={plan.id} className="rounded-2xl border p-5 flex flex-col justify-between gap-5 border-indigo-200 bg-indigo-50/50">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-base">{plan.name}</h3>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-600 text-white">{plan.badge}</span>
                    </div>
                    <p className="text-[10px] font-mono font-bold uppercase tracking-wide text-slate-400">{plan.id}</p>
                    <p className="text-2xl font-bold">{formatPlanPrice(plan.priceCents, plan.currency)}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{plan.description}</p>
                    <ul className="text-xs text-slate-600 space-y-2">
                      <li>- Ate {plan.analysisLimit} analises de IA</li>
                      <li>- 1 relatorio final por credito</li>
                      <li>- Pagamento avulso via Asaas Checkout</li>
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePaidCredit(plan.id)}
                    disabled={!!actionLoading}
                    className="h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                    Comprar credito
                  </button>
                </article>
              );
            })}
          </div>

          <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <p className="text-[11px] text-slate-500 max-w-xl">
              Pagamento pendente, recusado ou cancelado nao libera credito. O credito pago aparece somente apos confirmacao segura do webhook.
            </p>
            <button
              type="button"
              onClick={() => {
                setMessage('Verificando liberacao...');
                void refreshAccess();
              }}
              className="text-xs font-bold text-indigo-700 hover:text-indigo-900"
            >
              Ja paguei, verificar liberacao
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
