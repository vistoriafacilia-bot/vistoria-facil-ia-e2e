import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Ban,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileSearch,
  Loader2,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  Search,
  Settings,
  Shield,
  UserCog,
  Users,
} from 'lucide-react';
import type { AppUser } from '../../types';
import { onAuthStateChanged } from '../../lib/services/authService';
import {
  addAdminCustomerNote,
  adjustAdminCredits,
  getAdminCredits,
  getAdminCustomer,
  getAdminDashboard,
  getAdminInspection,
  getAdminOrder,
  getAdminTrial,
  grantAdminTrial,
  listAdminAudit,
  listAdminCustomers,
  listAdminInspections,
  listAdminOrders,
  listAdminPlans,
  listAdminUsers,
  reprocessAdminOrder,
  saveAdminPlan,
  saveAdminUser,
  sendAdminPasswordReset,
  setAdminCustomerStatus,
  updateAdminTrial,
  type AdminCustomer,
  type AdminDashboard,
  type AdminPlan,
} from '../../lib/services/adminService';
import { formatBrazilianMobilePhone } from '../../lib/validation';

type AdminTab = 'dashboard' | 'customers' | 'plans' | 'trial' | 'orders' | 'credits' | 'inspections' | 'admins' | 'audit';

const tabs: { id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'plans', label: 'Planos', icon: CreditCard },
  { id: 'trial', label: 'Degustacao', icon: Settings },
  { id: 'orders', label: 'Pedidos', icon: Activity },
  { id: 'credits', label: 'Creditos', icon: CheckCircle2 },
  { id: 'inspections', label: 'Vistorias', icon: FileSearch },
  { id: 'admins', label: 'Admins', icon: UserCog },
  { id: 'audit', label: 'Auditoria', icon: Shield },
];

const money = (value: number, currency = 'BRL') => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency,
}).format((Number(value) || 0) / 100);

const dateTime = (value?: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const askReason = (label: string) => {
  const reason = window.prompt(`${label} - motivo`);
  return reason?.trim() || '';
};

const isAdminAuthorizationError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return [
    'admin_user_not_found',
    'admin_role_invalid',
    'admin_permission_denied',
  ].some((code) => message.includes(`debugCode=${code}`));
};

function StatusPill({ value }: { value?: string | boolean | null }) {
  const text = String(value ?? '-');
  const active = value === true || ['active', 'paid', 'success', 'available'].includes(text);
  const blocked = ['blocked', 'deactivated', 'failed', 'refused', 'revoked', 'canceled', 'expired'].includes(text);
  return (
    <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-semibold ${
      active
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : blocked
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-slate-200 bg-slate-50 text-slate-600'
    }`}>
      {text}
    </span>
  );
}

function DataTable({ columns, rows, empty = 'Sem registros.' }: { columns: string[]; rows: React.ReactNode[][]; empty?: string }) {
  return (
    <div className="overflow-x-auto border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
          <tr>{columns.map((column) => <th key={column} className="px-3 py-2 font-bold">{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-5 text-center text-sm text-slate-500">{empty}</td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={index} className="align-top">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 text-slate-700">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminApp() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [trial, setTrial] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [credits, setCredits] = useState<any | null>(null);
  const [inspections, setInspections] = useState<any[]>([]);
  const [selectedInspection, setSelectedInspection] = useState<any | null>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedReportPlanId, setSelectedReportPlanId] = useState('');

  useEffect(() => onAuthStateChanged((currentUser) => {
    setUser(currentUser);
    setAuthLoading(false);
  }), []);

  const run = useCallback(async (task: () => Promise<void>, successMessage?: string) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await task();
      if (successMessage) setNotice(successMessage);
    } catch (err) {
      if (isAdminAuthorizationError(err)) {
        setAccessDenied(true);
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTab = useCallback(async (target: AdminTab = tab) => {
    await run(async () => {
      if (target === 'dashboard') setDashboard(await getAdminDashboard());
      if (target === 'customers') setCustomers(await listAdminCustomers(customerSearch));
      if (target === 'plans') setPlans(await listAdminPlans());
      if (target === 'trial') setTrial(await getAdminTrial());
      if (target === 'orders') setOrders(await listAdminOrders());
      if (target === 'credits') {
        const [creditSummary, catalogPlans] = await Promise.all([
          getAdminCredits(selectedCustomerId),
          listAdminPlans(),
        ]);
        setCredits(creditSummary);
        setPlans(catalogPlans);
      }
      if (target === 'inspections') setInspections(await listAdminInspections(selectedCustomerId));
      if (target === 'admins') setAdminUsers(await listAdminUsers());
      if (target === 'audit') setAudit(await listAdminAudit());
    });
  }, [customerSearch, run, selectedCustomerId, tab]);

  useEffect(() => {
    if (!authLoading && user) void loadTab(tab);
  }, [authLoading, loadTab, tab, user]);

  const metrics = useMemo(() => dashboard?.metrics || {
    customers: 0,
    orders: 0,
    payments: 0,
    credits: 0,
    inspections: 0,
  }, [dashboard]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="border border-slate-800 bg-slate-900 p-6 text-center">
          <LockKeyhole className="mx-auto mb-3 h-6 w-6 text-slate-400" />
          <h1 className="text-lg font-bold">Admin V1</h1>
          <p className="mt-1 text-sm text-slate-400">Sessao obrigatoria.</p>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="border border-slate-800 bg-slate-900 p-6 text-center">
          <LockKeyhole className="mx-auto mb-3 h-6 w-6 text-slate-400" />
          <h1 className="text-lg font-bold">Acesso não autorizado</h1>
          <p className="mt-1 text-sm text-slate-400">Sua conta não possui permissão para acessar o Admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-white">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">Vistoria Facil IA Admin</h1>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadTab(tab)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[220px_1fr]">
        <aside className="border border-slate-200 bg-white p-2">
          <nav className="grid gap-1">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex h-9 items-center gap-2 rounded-md px-3 text-left text-sm font-semibold ${
                    tab === item.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="space-y-4">
          {(error || notice) && (
            <div className={`border px-3 py-2 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {error || notice}
            </div>
          )}

          {tab === 'dashboard' && (
            <section className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {[
                  ['Clientes', metrics.customers],
                  ['Pedidos', metrics.orders],
                  ['Pagamentos aprovados', metrics.payments],
                  ['Creditos de uso', metrics.credits],
                  ['Vistorias', metrics.inspections],
                ].map(([label, value]) => (
                  <div key={String(label)} className="border border-slate-200 bg-white p-4">
                    <div className="text-xs font-bold uppercase text-slate-500">{label}</div>
                    <div className="mt-2 text-2xl font-bold">{value}</div>
                  </div>
                ))}
              </div>
              <DataTable
                columns={['Tipo', 'Entidade', 'Status', 'Data']}
                rows={(dashboard?.recentFailures || []).map((item) => [
                  item.type,
                  item.id || item.entity_id || item.inspection_id || '-',
                  <StatusPill value={item.status || item.result} />,
                  dateTime(item.updated_at || item.created_at),
                ])}
              />
            </section>
          )}

          {tab === 'customers' && (
            <section className="space-y-3">
              <div className="flex flex-col gap-2 bg-white p-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    className="h-9 w-full border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-slate-500"
                    placeholder="Buscar cliente"
                  />
                </div>
                <button type="button" onClick={() => loadTab('customers')} className="h-9 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white">Buscar</button>
              </div>
              <DataTable
                columns={['Cliente', 'E-mail', 'Celular', 'Status', 'Login', 'Acoes']}
                rows={customers.map((customer) => [
                  customer.name || customer.id,
                  customer.email || '-',
                  formatBrazilianMobilePhone(customer.phone) || '-',
                  <StatusPill value={customer.admin_status || 'active'} />,
                  dateTime(customer.last_login_at),
                  <div className="flex flex-wrap gap-1">
                    <button className="rounded-md border px-2 py-1 text-xs" onClick={() => run(async () => setSelectedCustomer(await getAdminCustomer(customer.id)))}>Consultar</button>
                    <button className="rounded-md border px-2 py-1 text-xs" onClick={() => {
                      const reason = askReason('Bloquear cliente');
                      if (reason) void run(async () => { await setAdminCustomerStatus(customer.id, 'blocked', reason); await loadTab('customers'); }, 'Cliente bloqueado.');
                    }}><Ban className="inline h-3 w-3" /> Bloquear</button>
                    <button className="rounded-md border px-2 py-1 text-xs" onClick={() => {
                      const reason = askReason('Desbloquear cliente');
                      if (reason) void run(async () => { await setAdminCustomerStatus(customer.id, 'active', reason); await loadTab('customers'); }, 'Cliente ativo.');
                    }}>Desbloquear</button>
                    <button className="rounded-md border px-2 py-1 text-xs" onClick={() => {
                      const reason = askReason('Redefinir senha');
                      if (reason) void run(async () => { await sendAdminPasswordReset(customer.id, customer.email || '', reason); }, 'Redefinicao enviada.');
                    }}>Senha</button>
                  </div>,
                ])}
              />
              {selectedCustomer && (
                <div className="border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="font-bold">{selectedCustomer.customer?.email || selectedCustomer.customer?.id}</h2>
                    <button className="rounded-md border px-2 py-1 text-xs" onClick={() => {
                      const note = window.prompt('Observacao interna')?.trim();
                      const reason = note ? askReason('Registrar observacao') : '';
                      if (note && reason) void run(async () => {
                        await addAdminCustomerNote(selectedCustomer.customer.id, note, reason);
                        setSelectedCustomer(await getAdminCustomer(selectedCustomer.customer.id));
                      }, 'Observacao registrada.');
                    }}><MessageSquare className="inline h-3 w-3" /> Nota</button>
                  </div>
                  <DataTable
                    columns={['Campo', 'Valor']}
                    rows={[
                      ['Nome', selectedCustomer.customer?.name || '-'],
                      ['E-mail', selectedCustomer.customer?.email || '-'],
                      ['Celular', formatBrazilianMobilePhone(selectedCustomer.customer?.phone) || '-'],
                    ]}
                  />
                  <DataTable
                    columns={['Grupo', 'Total']}
                    rows={[
                      ['Planos', selectedCustomer.entitlements?.length || 0],
                      ['Pedidos', selectedCustomer.orders?.length || 0],
                      ['Creditos de uso', (selectedCustomer.paymentCredits?.length || 0) + (selectedCustomer.reportCredits?.length || 0)],
                      ['Vistorias', selectedCustomer.inspections?.length || 0],
                      ['Notas', selectedCustomer.notes?.length || 0],
                    ]}
                  />
                </div>
              )}
            </section>
          )}

          {tab === 'plans' && (
            <section className="space-y-3">
              <DataTable
                columns={['Plano', 'Codigo', 'Preco em R$', 'Limite de fotos', 'Ativo', 'Compra', 'Versao', 'Acoes']}
                rows={plans.map((plan) => [
                  plan.name,
                  plan.code || '-',
                  money(plan.priceCents, plan.currency),
                  plan.analysisLimit,
                  <StatusPill value={plan.active} />,
                  <StatusPill value={plan.availableForPurchase} />,
                  plan.version,
                  <div className="flex gap-1">
                    <button className="rounded-md border px-2 py-1 text-xs" onClick={() => {
                      const reason = askReason(plan.active ? 'Desativar plano' : 'Ativar plano');
                      if (reason) void run(async () => { await saveAdminPlan({ action: 'update', planId: plan.id, active: !plan.active, reason }); await loadTab('plans'); }, 'Plano atualizado.');
                    }}>{plan.active ? 'Desativar' : 'Ativar'}</button>
                    <button className="rounded-md border px-2 py-1 text-xs" onClick={() => {
                      const reason = askReason(plan.availableForPurchase ? 'Ocultar compra' : 'Disponibilizar compra');
                      if (reason) void run(async () => { await saveAdminPlan({ action: 'update', planId: plan.id, availableForPurchase: !plan.availableForPurchase, reason }); await loadTab('plans'); }, 'Disponibilidade atualizada.');
                    }}>Compra</button>
                  </div>,
                ])}
              />
            </section>
          )}

          {tab === 'trial' && (
            <section className="grid gap-3 md:grid-cols-2">
              <div className="border border-slate-200 bg-white p-4">
                <h2 className="mb-3 font-bold">Degustacao global</h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><span>Status</span><StatusPill value={trial?.enabled} /></div>
                  <div className="flex items-center justify-between"><span>Fotos</span><strong>{trial?.photoLimit || 0}</strong></div>
                  <button className="h-9 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white" onClick={() => {
                    const nextLimit = Number(window.prompt('Quantidade de fotos', String(trial?.photoLimit || '')) || trial?.photoLimit || 0);
                    const reason = askReason('Atualizar degustacao');
                    if (reason) void run(async () => { await updateAdminTrial(!trial?.enabled, nextLimit, reason); await loadTab('trial'); }, 'Degustacao atualizada.');
                  }}>Alternar</button>
                </div>
              </div>
              <div className="border border-slate-200 bg-white p-4">
                <h2 className="mb-3 font-bold">Concessao manual</h2>
                <div className="grid gap-2">
                  <input className="h-9 border px-3 text-sm" placeholder="ID do cliente" value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} />
                  <button className="h-9 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white" onClick={() => {
                    const limit = Number(window.prompt('Quantidade de fotos', String(trial?.photoLimit || '')) || 0);
                    const reason = askReason('Conceder degustacao');
                    if (selectedCustomerId && limit > 0 && reason) void run(async () => { await grantAdminTrial(selectedCustomerId, limit, reason); }, 'Degustacao concedida.');
                  }}>Conceder</button>
                </div>
              </div>
            </section>
          )}

          {tab === 'orders' && (
            <section className="space-y-3">
              <DataTable
                columns={['Pedido', 'Cliente', 'Plano', 'Status', 'Valor do pagamento (R$)', 'Pago em', 'Acoes']}
                rows={orders.map((order) => [
                  order.id,
                  order.user_id,
                  order.plan_code,
                  <StatusPill value={order.status} />,
                  money(order.amount_cents),
                  dateTime(order.paid_at),
                  <div className="flex gap-1">
                    <button className="rounded-md border px-2 py-1 text-xs" onClick={() => run(async () => setSelectedOrder(await getAdminOrder(order.id)))}>Consultar</button>
                    <button className="rounded-md border px-2 py-1 text-xs" onClick={() => {
                      const reason = askReason('Reprocessar entitlement');
                      if (reason) void run(async () => { await reprocessAdminOrder(order.id, reason); await loadTab('orders'); }, 'Reprocessamento concluido.');
                    }}>Reprocessar</button>
                  </div>,
                ])}
              />
              {selectedOrder && (
                <DataTable
                  columns={['Campo', 'Valor']}
                  rows={[
                    ['Pagamento aprovado sem credito de uso', selectedOrder.approvedWithoutCredit ? 'sim' : 'nao'],
                    ['Creditos de uso vinculados', selectedOrder.credits?.length || 0],
                    ['Eventos', selectedOrder.events?.length || 0],
                  ]}
                />
              )}
            </section>
          )}

          {tab === 'credits' && (
            <section className="space-y-3">
              <div className="flex flex-col gap-2 bg-white p-3 lg:flex-row">
                <input className="h-9 flex-1 border px-3 text-sm" placeholder="ID do cliente" value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} />
                <button className="h-9 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white" onClick={() => loadTab('credits')}>Consultar</button>
                <button className="h-9 rounded-md border px-3 text-sm font-semibold" onClick={() => {
                  const usageUnits = Number(window.prompt('Novo limite de fotos por vistoria') || 0);
                  const reason = askReason('Conceder limite manual de fotos');
                  if (selectedCustomerId && usageUnits > 0 && reason) void run(async () => {
                    await adjustAdminCredits({ action: 'grant', customerId: selectedCustomerId, creditTable: 'entitlements', usageUnits, reason });
                    await loadTab('credits');
                  }, 'Limite manual de fotos concedido.');
                }}>Conceder fotos</button>
                <select className="h-9 min-w-48 border px-2 text-sm" value={selectedReportPlanId} onChange={(event) => setSelectedReportPlanId(event.target.value)}>
                  <option value="">Plano para credito de relatorio</option>
                  {plans.filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} ({plan.analysisLimit} fotos)</option>)}
                </select>
                <button className="h-9 rounded-md border px-3 text-sm font-semibold" onClick={() => {
                  const reason = askReason('Conceder credito de relatorio');
                  if (selectedCustomerId && selectedReportPlanId && reason) void run(async () => {
                    await adjustAdminCredits({ action: 'grant', customerId: selectedCustomerId, creditTable: 'report_credits', planId: selectedReportPlanId, usageUnits: 1, reason });
                    await loadTab('credits');
                  }, 'Credito de relatorio concedido.');
                }}>Conceder relatorio</button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="border border-slate-200 bg-white p-4">
                  <div className="text-xs font-bold uppercase text-slate-500">Limite efetivo de fotos por vistoria</div>
                  <div className="mt-2 text-2xl font-bold">{credits?.photoUsage?.effectiveLimitPerInspection ?? 0}</div>
                </div>
                <div className="border border-slate-200 bg-white p-4">
                  <div className="text-xs font-bold uppercase text-slate-500">Creditos de relatorio disponiveis</div>
                  <div className="mt-2 text-2xl font-bold">{credits?.reportUsage?.availableCredits ?? 0}</div>
                </div>
              </div>
              <DataTable
                columns={['Direito de uso', 'ID', 'Status', 'Limite de fotos', 'Fotos usadas', 'Acoes']}
                rows={[
                  ...(credits?.photoUsage?.paymentCredits || []).map((credit: any) => ['Fotos adquiridas', credit.id, <StatusPill value={credit.status} />, credit.analysis_limit, credit.analysis_used, <button className="rounded-md border px-2 py-1 text-xs" onClick={() => {
                    const reason = askReason('Remover credito');
                    if (reason) void run(async () => { await adjustAdminCredits({ action: 'remove', customerId: credit.user_id, usageUnits: Math.max((credit.analysis_limit || 0) - (credit.analysis_used || 0), 1), creditTable: 'payment_v1_credits', creditId: credit.id, reason }); await loadTab('credits'); }, 'Credito de uso removido.');
                  }}>Remover</button>]),
                  ...(credits?.reportUsage?.reportCredits || []).map((credit: any) => ['Credito de relatorio', credit.id, <StatusPill value={credit.status} />, credit.analysis_limit, credit.analysis_used, <button className="rounded-md border px-2 py-1 text-xs" onClick={() => {
                    const reason = askReason('Remover credito');
                    if (reason) void run(async () => { await adjustAdminCredits({ action: 'remove', customerId: credit.user_id, usageUnits: 1, creditTable: 'report_credits', creditId: credit.id, reason }); await loadTab('credits'); }, 'Credito de uso removido.');
                  }}>Remover</button>]),
                  ...(credits?.photoUsage?.manualPhotoLimits || []).map((credit: any) => ['Limite manual de fotos', credit.id, <StatusPill value={credit.status} />, credit.max_photos_per_inspection, '-', <button className="rounded-md border px-2 py-1 text-xs" onClick={() => {
                    const reason = askReason('Remover limite manual de fotos');
                    if (reason) void run(async () => { await adjustAdminCredits({ action: 'remove', customerId: credit.user_id, usageUnits: credit.max_photos_per_inspection || 1, creditTable: 'entitlements', creditId: credit.id, reason }); await loadTab('credits'); }, 'Limite manual removido.');
                  }}>Remover</button>]),
                ]}
              />
            </section>
          )}

          {tab === 'inspections' && (
            <section className="space-y-3">
              <div className="flex gap-2 bg-white p-3">
                <input className="h-9 flex-1 border px-3 text-sm" placeholder="ID do cliente" value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} />
                <button className="h-9 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white" onClick={() => loadTab('inspections')}>Consultar</button>
              </div>
              <DataTable
                columns={['Vistoria', 'Cliente', 'Imovel', 'Status', 'Inicio', 'Acoes']}
                rows={inspections.map((inspection) => [
                  inspection.id,
                  inspection.user_id,
                  inspection.property_id,
                  <StatusPill value={inspection.status} />,
                  dateTime(inspection.started_at),
                  <button className="rounded-md border px-2 py-1 text-xs" onClick={() => run(async () => setSelectedInspection(await getAdminInspection(inspection.id)))}>Consultar</button>,
                ])}
              />
              {selectedInspection && (
                <DataTable
                  columns={['Grupo', 'Total']}
                  rows={[
                    ['Fotos', selectedInspection.photos?.length || 0],
                    ['PDFs', selectedInspection.reports?.length || 0],
                    ['Creditos vinculados', selectedInspection.reportCredits?.length || 0],
                    ['Erros IA', (selectedInspection.photos || []).filter((photo: any) => photo.analysis_error).length],
                  ]}
                />
              )}
            </section>
          )}

          {tab === 'admins' && (
            <section className="space-y-3">
              <div className="bg-white p-3">
                <button className="h-9 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white" onClick={() => {
                  const email = window.prompt('E-mail do administrador')?.trim();
                  const role = window.prompt('Perfil: owner, operation, support, finance, read_only')?.trim();
                  const reason = askReason('Criar administrador');
                  if (email && role && reason) void run(async () => { await saveAdminUser({ action: 'create', email, role, reason }); await loadTab('admins'); }, 'Administrador criado.');
                }}>Novo administrador</button>
              </div>
              <DataTable
                columns={['E-mail', 'Perfil', 'Ativo', 'Criado', 'Acoes']}
                rows={adminUsers.map((admin) => [
                  admin.email,
                  admin.role,
                  <StatusPill value={admin.active} />,
                  dateTime(admin.created_at),
                  <button className="rounded-md border px-2 py-1 text-xs" onClick={() => {
                    const reason = askReason(admin.active ? 'Desativar administrador' : 'Ativar administrador');
                    if (reason) void run(async () => { await saveAdminUser({ action: 'update', adminUserId: admin.id, active: !admin.active, reason }); await loadTab('admins'); }, 'Administrador atualizado.');
                  }}>{admin.active ? 'Desativar' : 'Ativar'}</button>,
                ])}
              />
            </section>
          )}

          {tab === 'audit' && (
            <section>
              <DataTable
                columns={['Data', 'Admin', 'Acao', 'Entidade', 'Resultado', 'Motivo']}
                rows={audit.map((item) => [
                  dateTime(item.created_at),
                  item.admin_email || '-',
                  item.action,
                  `${item.entity_type}:${item.entity_id || '-'}`,
                  <StatusPill value={item.result} />,
                  item.reason || '-',
                ])}
              />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
