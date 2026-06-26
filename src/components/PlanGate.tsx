import React, { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { AppUser, Entitlement, EntitlementPlan } from '../types';
import { FREE_PLAN_ID, PAID_BETA_PLAN_ID, SORTED_PLANS, formatPlanPrice } from '../lib/plans';
import { selectBestActiveEntitlement } from '../lib/entitlements';
import { createFreeEntitlement, listEntitlements, saveEntitlement } from '../lib/services/entitlementService';
import { getCurrentUser } from '../lib/services/authService';

interface PlanGateProps {
  user?: AppUser;
  onReady: (entitlement: Entitlement) => void;
  autoContinueOnActiveEntitlement?: boolean;
}

const getPaymentReturnMessage = (status: string, orderId?: string | null) => {
  const suffix = orderId ? ` Pedido: ${orderId}.` : '';
  if (status === 'success') return `Pagamento retornou como aprovado no checkout. Estamos aguardando a confirmação segura do backend.${suffix}`;
  if (status === 'pending') return `Pagamento retornou como pendente. O acesso será liberado somente após confirmação do provedor.${suffix}`;
  if (status === 'failure') return `Pagamento não foi concluído. Você pode tentar novamente ou escolher o plano gratuito.${suffix}`;
  return `Retorno de pagamento recebido. Verificando liberação segura.${suffix}`;
};

export default function PlanGate({ user, onReady, autoContinueOnActiveEntitlement = true }: PlanGateProps) {
  const [resolvedUser, setResolvedUser] = useState<AppUser | null>(user || null);
  const activeUser = user || resolvedUser;
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<EntitlementPlan | null>(null);
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

  const loadEntitlement = async (options?: { silent?: boolean }) => {
    if (!activeUser) {
      setLoading(false);
      return;
    }
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const best = selectBestActiveEntitlement(await listEntitlements(activeUser.uid));
      if (best && autoContinueOnActiveEntitlement) {
        onReady(best);
      }
    } catch (err) {
      console.error('Erro ao carregar plano/entitlement:', err);
      setError('Não foi possível verificar seu plano agora. Tente novamente.');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (activeUser) {
      void loadEntitlement();
    }
  }, [activeUser?.uid]);

  useEffect(() => {
    if (!activeUser) return;
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment_status');
    const orderId = params.get('order_id');
    if (!paymentStatus) return;

    setMessage(getPaymentReturnMessage(paymentStatus, orderId));

    // The checkout redirect alone does not release access. Poll entitlement briefly
    // because Mercado Pago confirmation can arrive through webhook seconds later.
    let attempts = 0;
    const maxAttempts = paymentStatus === 'success' ? 8 : 4;
    const interval = window.setInterval(() => {
      attempts += 1;
      void loadEntitlement({ silent: true });
      if (attempts >= maxAttempts) {
        window.clearInterval(interval);
        if (paymentStatus === 'success') {
          setMessage('Pagamento recebido pelo checkout. Se o acesso ainda não liberou, clique em “Já paguei, verificar liberação” em alguns segundos.');
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
      setError('Nao foi possivel ativar o plano gratuito. Verifique as politicas RLS do Supabase.');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePaidPlan = async () => {
    if (!activeUser) return;
    setActionLoading(PAID_BETA_PLAN_ID);
    setError(null);
    setMessage(null);
    try {
      setMessage('Upgrade em beta assistido. Entre em contato para ativacao.');
      return;
      /*
      const token = '';
      const response = await fetch('removed-paid-checkout-endpoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ planId: PAID_BETA_PLAN_ID })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Falha ao iniciar pagamento.');
      }

      if (payload.checkoutUrl) {
        window.location.assign(payload.checkoutUrl);
        return;
      }

      if (payload.entitlement) {
        onReady(payload.entitlement);
        return;
      }

      throw new Error('Checkout não retornou URL de pagamento.');
      */
    } catch (err: any) {
      console.error('Erro ao criar checkout:', err);
      setError(err?.message || 'Não foi possível abrir o pagamento.');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        <p className="text-slate-500 font-semibold text-sm mt-4">Verificando seu plano...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 flex items-center justify-center p-5 text-slate-100">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-6 items-stretch">
        <section className="bg-slate-900/70 border border-slate-800 rounded-3xl p-7 shadow-2xl flex flex-col justify-between">
          <div className="space-y-5">
            <div className="inline-flex bg-indigo-600 text-white p-3 rounded-2xl shadow-xl shadow-indigo-600/10">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Escolha seu acesso</h1>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Consulte os limites do beta. Upgrade pago esta em ativacao assistida, sem checkout automatico nesta versao.
              </p>
            </div>
            <div className="bg-slate-800/50 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 space-y-2">
              <p className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> Cadastro de imóvel e vistoria dentro do app.</p>
              <p className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> Fotos vinculadas por cômodo e relatório PDF.</p>
              <p className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> Upgrade beta assistido para ampliar o limite de fotos.</p>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-3xl p-5 sm:p-7 shadow-2xl border border-slate-200 text-slate-800 space-y-4">
          <div>
            <h2 className="font-bold text-xl">Planos disponíveis</h2>
            <p className="text-xs text-slate-500 mt-1">Comece grátis ou libere a vistoria ampliada beta.</p>
          </div>

          {error && <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold rounded-xl p-3">{error}</div>}
          {message && <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl p-3">{message}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SORTED_PLANS.map(plan => {
              const isPaid = plan.paymentRequired;
              const busy = actionLoading === plan.id;
              return (
                <article key={plan.id} className={`rounded-2xl border p-5 flex flex-col justify-between gap-5 ${isPaid ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-base">{plan.name}</h3>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isPaid ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{plan.badge}</span>
                    </div>
                    <p className="text-[10px] font-mono font-bold uppercase tracking-wide text-slate-400">{plan.id}</p>
                    <p className="text-2xl font-bold">{formatPlanPrice(plan.priceCents, plan.currency)}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{plan.description}</p>
                    <ul className="text-xs text-slate-600 space-y-2">
                      <li>• Até {plan.maxPhotosPerInspection} fotos por vistoria</li>
                      <li>• Relatório PDF {plan.pdfEnabled ? 'habilitado' : 'indisponível'}</li>
                      <li>• {isPaid ? 'Upgrade em beta assistido. Entre em contato para ativacao.' : 'Ativação imediata para teste'}</li>
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={isPaid ? handlePaidPlan : handleFreePlan}
                    disabled={!!actionLoading}
                    className={`h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 ${isPaid ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-800'}`}
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : isPaid ? <CreditCard className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                    {isPaid ? 'Solicitar upgrade' : 'Ativar Grátis'}
                  </button>
                </article>
              );
            })}
          </div>

          <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <p className="text-[11px] text-slate-500 max-w-xl">
              Upgrade automatico e pagamento online nao fazem parte deste UAT zero-cost. A ativacao beta paga e assistida.
            </p>
            <button
              type="button"
              onClick={() => {
                setMessage('Verificando liberação...');
                void loadEntitlement();
              }}
              className="text-xs font-bold text-indigo-700 hover:text-indigo-900"
            >
              Já paguei, verificar liberação
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
