import React, { useState, useEffect } from 'react';
import { Property, Inspection, Entitlement, AppUser } from './types';
import Navbar from './components/Navbar';
import PropertyManager from './components/PropertyManager';
import InspectionWizard from './components/InspectionWizard';
import ReportPdfGenerator from './components/ReportPdfGenerator';
import DashboardMetrics from './components/DashboardMetrics';
import PaymentQuarantineGate from './components/PaymentQuarantineGate';
import { ClipboardList, Plus, History, Trash2, FileText, Play, ChevronLeft, ArrowRight, ShieldCheck, Sparkles, Building2 } from 'lucide-react';
import { APP_VERSION } from './lib/appVersion';
import { getOrCreateUserEntitlement } from './lib/entitlements';
import { isEmptyInspectionDraft } from './lib/inspectionLifecycle';
import { safeCreateAuditEvent } from './lib/auditEvents';
import { loginWithEmailPassword, loginWithGoogle, onAuthStateChanged, resetPasswordForEmail, signUpWithEmailPassword, upsertProfile } from './lib/services/authService';
import { deleteInspection, listInspections } from './lib/services/inspectionService';
import { listPhotos } from './lib/services/photoService';
import { listReports } from './lib/services/reportService';
import { listRooms } from './lib/services/roomService';

type HistoryInspection = Inspection & {
  roomCount?: number;
  photoCount?: number;
};

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const isGoogleAuthEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true';
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [emailAuthEmail, setEmailAuthEmail] = useState('');
  const [emailAuthPassword, setEmailAuthPassword] = useState('');
  const [emailAuthConfirmPassword, setEmailAuthConfirmPassword] = useState('');
  const [emailAuthSubmitting, setEmailAuthSubmitting] = useState(false);
  const [emailAuthError, setEmailAuthError] = useState<string | null>(null);
  const [emailAuthMessage, setEmailAuthMessage] = useState<string | null>(null);

  // Entitlement states
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [entitlementLoading, setEntitlementLoading] = useState(false);

  // Routing states
  // 'properties' | 'inspections_history' | 'inspection_wizard' | 'pdf_generator' | 'plans'
  const [currentView, setCurrentView] = useState<'properties' | 'inspections_history' | 'inspection_wizard' | 'pdf_generator' | 'plans'>('properties');
  
  // Selected Contexts
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [inspections, setInspections] = useState<HistoryInspection[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Admin and Metrics Control
  const [showAdminMetrics, setShowAdminMetrics] = useState(false);
  const isAdminUser = user?.email === 'vistoriafacil.ia@gmail.com';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        try {
          await upsertProfile(currentUser);
        } catch (err) {
          console.warn('Alerta: Erro ao salvar/atualizar o perfil do usuario no Supabase (as politicas RLS podem nao estar aplicadas):', err);
        }
      } else {
        // Reset state
        setCurrentView('properties');
        setSelectedProperty(null);
        setSelectedInspection(null);
        setInspections([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync active user entitlement
  useEffect(() => {
    if (user) {
      setEntitlementLoading(true);
      getOrCreateUserEntitlement(user.uid)
        .then(ent => {
          setEntitlement(ent);
          setEntitlementLoading(false);
        })
        .catch(err => {
          console.error('Error fetching entitlement:', err);
          setEntitlementLoading(false);
        });
    } else {
      setEntitlement(null);
    }
  }, [user]);

  const loadPropertyInspections = async (property: Property): Promise<HistoryInspection[]> => {
    if (!user) return [];
    const list = await listInspections(user.uid, property.id);
    const enriched = await Promise.all(list.map(async (inspection) => {
      const [rooms, photos, reports] = await Promise.all([
        listRooms(inspection.id),
        listPhotos(inspection.id),
        listReports(inspection.id),
      ]);
      return {
        ...inspection,
        roomCount: rooms.length,
        photoCount: photos.length,
        reportCount: reports.length,
        isEmptyDraft: isEmptyInspectionDraft({
          inspection,
          rooms,
          photoCount: photos.length,
          reportCount: reports.length,
        }),
      };
    }));
    return enriched.filter((inspection) => !inspection.isEmptyDraft);
  };

  // Fetch past inspections for selected property
  const fetchPropertyInspections = async (property: Property) => {
    setHistoryLoading(true);
    try {
      const list = await loadPropertyInspections(property);
      setInspections(list);
      return list;
    } catch (err) {
      console.error('Error fetching inspections:', err);
      setInspections([]);
      return [];
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleStartNewInspection = (property: Property) => {
    // Product/UX rule: Nova Vistoria must always start in the explicit
    // inspection-type selection screen. Existing drafts are resumed only via
    // Historico -> Continuar Rascunho, never silently from the Nova Vistoria CTA.
    setSelectedProperty(property);
    setSelectedInspection(null);
    setCurrentView('inspection_wizard');
  };

  const handleOpenHistory = (property: Property) => {
    setSelectedProperty(property);
    fetchPropertyInspections(property);
    setCurrentView('inspections_history');
  };

  const handleDeleteInspection = async (id: string) => {
    if (!window.confirm('Tem certeza de que deseja excluir esta vistoria? Todos os registros de fotos associados serão perdidos.')) return;
    try {
      await deleteInspection(id);

      // Record audit event
      await safeCreateAuditEvent(user?.uid || 'unknown', 'inspection_delete', { inspectionId: id });

      if (selectedProperty) {
        fetchPropertyInspections(selectedProperty);
      }
    } catch (err) {
      console.error('Error deleting inspection:', err);
    }
  };

  const handleOpenDraft = (inspection: Inspection) => {
    setSelectedInspection(inspection);
    setCurrentView('inspection_wizard');
  };

  const handleOpenPdfView = (inspection: Inspection) => {
    setSelectedInspection(inspection);
    setCurrentView('pdf_generator');
  };

  const handleEmailLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailAuthSubmitting(true);
    setEmailAuthError(null);
    setEmailAuthMessage(null);

    try {
      const email = emailAuthEmail.trim();
      if (authMode === 'signup') {
        if (emailAuthPassword.length < 6) {
          setEmailAuthError('A senha precisa ter pelo menos 6 caracteres.');
          return;
        }
        if (emailAuthPassword !== emailAuthConfirmPassword) {
          setEmailAuthError('As senhas informadas nao conferem.');
          return;
        }

        const result = await signUpWithEmailPassword(email, emailAuthPassword);
        if (result.needsEmailConfirmation) {
          setEmailAuthMessage('Conta criada. Verifique seu e-mail para confirmar o acesso.');
          setAuthMode('login');
          setEmailAuthPassword('');
          setEmailAuthConfirmPassword('');
        } else {
          setEmailAuthMessage('Conta criada com sucesso. Entrando...');
        }
        return;
      }

      await loginWithEmailPassword(email, emailAuthPassword);
    } catch (error) {
      console.error('Email/password login failed:', error);
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (authMode === 'signup') {
        if (message.includes('already') || message.includes('registered')) {
          setEmailAuthError('Este e-mail ja possui uma conta. Tente entrar ou recuperar a senha.');
        } else if (message.includes('rate limit')) {
          setEmailAuthError('Muitas tentativas de criacao de conta agora. Aguarde alguns minutos e tente novamente.');
        } else if (message.includes('invalid') && message.includes('email')) {
          setEmailAuthError('Informe um e-mail valido para criar sua conta.');
        } else {
          setEmailAuthError('Nao foi possivel criar a conta. Verifique o e-mail e a senha.');
        }
      } else {
        setEmailAuthError('E-mail ou senha invalidos. Se voce ainda nao tem conta, escolha Criar conta.');
      }
    } finally {
      setEmailAuthSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    const email = emailAuthEmail.trim();
    setEmailAuthError(null);
    setEmailAuthMessage(null);
    if (!email) {
      setEmailAuthError('Informe seu e-mail para recuperar a senha.');
      return;
    }

    setEmailAuthSubmitting(true);
    try {
      await resetPasswordForEmail(email);
      setEmailAuthMessage('Se houver uma conta para este e-mail, enviaremos as instrucoes de recuperacao.');
    } catch (error) {
      console.error('Password reset request failed:', error);
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      setEmailAuthError(message.includes('rate limit')
        ? 'Muitas tentativas de recuperacao agora. Aguarde alguns minutos e tente novamente.'
        : 'Nao foi possivel solicitar a recuperacao agora. Verifique o e-mail e tente novamente.');
    } finally {
      setEmailAuthSubmitting(false);
    }
  };

  const switchAuthMode = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setEmailAuthError(null);
    setEmailAuthMessage(null);
    setEmailAuthPassword('');
    setEmailAuthConfirmPassword('');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-11 h-11 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-semibold text-sm mt-4">Conectando ao Vistoria Fácil...</p>
      </div>
    );
  }

  // 1. LOGIN SCREEN
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 flex flex-col justify-between p-6 text-slate-100">
        
        {/* Empty space to balance */}
        <div></div>

        {/* Center Card */}
        <div className="max-w-md w-full mx-auto space-y-8 bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-8 sm:p-10 rounded-3xl shadow-2xl text-center">
          
          {/* Logo */}
          <div className="inline-flex bg-indigo-600 text-white p-4 rounded-2xl shadow-xl shadow-indigo-600/10 mb-2">
            <ClipboardList className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="font-sans font-bold text-2xl tracking-tight leading-none text-white sm:text-3xl">
              Vistoria Fácil IA
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm max-w-xs mx-auto">
              Realize vistorias de entrada e saída de imóveis de forma automatizada com auxílio de Inteligência Artificial.
            </p>
          </div>

          {/* Core App Pitch */}
          <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800 text-left space-y-3 text-xs text-slate-300">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>Gere relatórios organizados com registros fotográficos para facilitar o envio à imobiliária ou proprietário.</span>
            </div>
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>Análise assistida por IA para sugerir descrições neutras de pontos observáveis nas fotos.</span>
            </div>
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>Geração de PDF organizado para revisar, baixar e enviar.</span>
            </div>
          </div>

          {isGoogleAuthEnabled && (
            <button
              type="button"
              onClick={loginWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-800 font-bold text-sm py-3.5 px-4 rounded-xl shadow-md transition-all active:scale-98 cursor-pointer h-12"
            >
              {/* Minimal google SVG */}
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5.04c1.61 0 3.05.56 4.19 1.64l3.12-3.12C17.43 1.84 14.93 1 12 1 7.35 1 3.4 3.65 1.5 7.5l3.86 3C6.35 7.64 8.95 5.04 12 5.04z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.25c0-.82-.07-1.61-.21-2.38H12v4.5h6.48c-.28 1.48-1.12 2.73-2.38 3.58l3.7 2.87c2.16-2 3.7-4.94 3.7-8.57z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.36 14.5c-.24-.72-.38-1.5-.38-2.3s.14-1.58.38-2.3L1.5 6.9C.54 8.84 0 11.02 0 13.3c0 2.28.54 4.46 1.5 6.4l3.86-3.2z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.24 0 5.97-1.08 7.96-2.93l-3.7-2.87c-1.03.69-2.34 1.1-3.9 1.1-3.05 0-5.65-2.6-6.58-5.46L1.86 16.1C3.76 20.01 7.59 23 12 23z"
                />
              </svg>
              Entrar com o Google
            </button>
          )}

            <form
              onSubmit={handleEmailLogin}
              data-testid="public-email-auth-form"
              className="border-t border-slate-800 pt-5 space-y-4 text-left"
            >
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">
                  {authMode === 'login' ? 'Acesse sua conta' : 'Novo acesso'}
                </p>
                <h2 className="text-lg font-bold text-white">
                  {authMode === 'login' ? 'Entrar' : 'Criar conta'}
                </h2>
                <p className="text-xs leading-relaxed text-slate-400">
                  {authMode === 'login'
                    ? 'Use seu e-mail e senha para continuar suas vistorias.'
                    : 'Crie uma conta para salvar imoveis, vistorias e relatorios.'}
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="email-auth-email" className="block text-[11px] font-semibold text-slate-300">
                  E-mail
                </label>
                <input
                  id="email-auth-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={emailAuthEmail}
                  onChange={(event) => setEmailAuthEmail(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="email-auth-password" className="block text-[11px] font-semibold text-slate-300">
                  Senha
                </label>
                <input
                  id="email-auth-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={emailAuthPassword}
                  onChange={(event) => setEmailAuthPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              {authMode === 'signup' && (
                <div className="space-y-1.5">
                  <label htmlFor="email-auth-confirm-password" className="block text-[11px] font-semibold text-slate-300">
                    Confirmar senha
                  </label>
                  <input
                    id="email-auth-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={emailAuthConfirmPassword}
                    onChange={(event) => setEmailAuthConfirmPassword(event.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              )}
              {emailAuthMessage && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200">
                  {emailAuthMessage}
                </div>
              )}
              {emailAuthError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200">
                  {emailAuthError}
                </div>
              )}
              <button
                type="submit"
                disabled={emailAuthSubmitting}
                className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {emailAuthSubmitting ? 'Aguarde...' : (authMode === 'login' ? 'Entrar' : 'Criar conta')}
              </button>
              {authMode === 'login' && (
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={emailAuthSubmitting}
                  className="w-full text-center text-xs font-semibold text-indigo-200 transition-colors hover:text-white disabled:text-slate-600"
                >
                  Esqueci minha senha
                </button>
              )}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-3 text-center text-xs text-slate-400">
                {authMode === 'login' ? 'Ainda nao tem conta?' : 'Ja tem conta?'}
                <button
                  type="button"
                  onClick={() => switchAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  disabled={emailAuthSubmitting}
                  className="ml-1 font-bold text-indigo-200 transition-colors hover:text-white disabled:text-slate-600"
                >
                  {authMode === 'login' ? 'Criar conta' : 'Entrar'}
                </button>
              </div>
            </form>
        </div>

        {/* Humble Footer */}
        <footer className="text-center text-slate-500 text-[10px] space-y-1">
          <p>Vistoria Fácil IA © 2026 | Versão {APP_VERSION}</p>
          <p className="max-w-xs mx-auto">Desenvolvido para frontend estatico com Supabase Free</p>
        </footer>

      </div>
    );
  }

  const activeDraftInspection = inspections.find((inspection) => (
    inspection.propertyId === selectedProperty?.id
    && (inspection.status === 'rascunho' || inspection.status === 'em_andamento')
  ));

  // 2. DASHBOARD (LOGGED IN APP STATE)
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      
      {/* Dynamic Polished Navigation Header */}
      <Navbar 
        user={user}
        onNavigateHome={() => setCurrentView('properties')} 
        isAdminUser={isAdminUser}
        showAdminMetrics={showAdminMetrics}
        onToggleAdminMetrics={() => setShowAdminMetrics(prev => !prev)}
        entitlement={entitlement}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">

        {/* Dashboard Metrics Panel if active (Admin or selected) */}
        {showAdminMetrics && (
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs transition-all">
            <DashboardMetrics isAdminUser={isAdminUser} entitlement={entitlement} />
          </div>
        )}

        {/* VIEW 1: PROPERTY LIST & PROPERTY MANAGER */}
        {currentView === 'properties' && (
          <div className="space-y-6">
            {/* Quick link to plans if on free tier */}
            {entitlement && entitlement.planId === 'free_10' && (
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-4 sm:p-5 border border-indigo-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="font-bold text-xs text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" /> Degustacao limitada a 10 fotos
                  </h3>
                  <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                    Sua conta atual permite ate 10 analises/fotos. Compre um credito avulso para gerar 1 relatorio final com limite ampliado.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentView('plans')}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md shrink-0 h-9 flex items-center justify-center cursor-pointer active:scale-98 transition-all"
                >
                  Ver Planos
                </button>
              </div>
            )}
            <PropertyManager 
              onSelectPropertyForInspection={handleStartNewInspection} 
              onViewHistory={handleOpenHistory}
            />
          </div>
        )}

        {/* VIEW 2: INSPECTION HISTORY FOR SELECTED PROPERTY */}
        {currentView === 'inspections_history' && selectedProperty && (
          <div className="space-y-6">
            
            {/* Header / Back Action */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  aria-label="Voltar para imóveis"
                  onClick={() => setCurrentView('properties')}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 leading-tight">Histórico de Vistorias</h2>
                  <p className="text-xs text-slate-500">Imóvel: {selectedProperty.nickname}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeDraftInspection && (
                  <button
                    type="button"
                    onClick={() => handleOpenDraft(activeDraftInspection)}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3.5 py-2.5 rounded-xl shadow-xs transition-all active:scale-98 cursor-pointer h-10"
                  >
                    <Play className="w-4 h-4" />
                    Continuar Vistoria em Andamento
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleStartNewInspection(selectedProperty)}
                  className={`flex items-center gap-1.5 font-semibold text-xs px-3.5 py-2.5 rounded-xl transition-all active:scale-98 cursor-pointer h-10 ${
                    activeDraftInspection
                      ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  Nova Vistoria
                </button>
              </div>
            </div>

            {/* Inspections Table / List */}
            {historyLoading ? (
              <div className="flex flex-col items-center justify-center p-12">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-400 text-xs mt-3">Carregando vistorias...</p>
              </div>
            ) : inspections.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center flex flex-col items-center justify-center">
                <div className="bg-slate-50 text-slate-400 p-3.5 rounded-full mb-3">
                  <History className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm mb-1">Nenhuma vistoria neste imóvel</h3>
                <p className="text-slate-500 text-xs max-w-xs mb-5">
                  Inicie uma vistoria de entrada ou saída para registrar fotograficamente as condições do imóvel alugado.
                </p>
                <button
                  type="button"
                  onClick={() => handleStartNewInspection(selectedProperty)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-sm transition-all active:scale-98 cursor-pointer"
                >
                  Criar Primeira Vistoria
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {inspections.map((insp) => (
                  <div 
                    key={insp.id} 
                    className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 flex flex-col justify-between hover:border-slate-200 transition-colors"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`inline-block text-[9px] font-bold uppercase px-2 py-0.5 rounded ${
                          insp.inspectionType === 'entrada' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }`}>
                          Vistoria de {insp.inspectionType === 'entrada' ? 'Entrada' : 'Saída'}
                        </span>

                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          insp.status === 'pdf_gerado' || insp.status === 'finalizado'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : insp.status === 'concluida'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {insp.status === 'pdf_gerado' || insp.status === 'finalizado' ? 'PDF Disponível' : insp.status === 'concluida' ? 'Concluída' : 'Rascunho'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 space-y-1">
                        <p>
                          <span className="font-semibold text-slate-700">Iniciada em:</span>{' '}
                          {new Date(insp.startedAt).toLocaleDateString('pt-BR')} às{' '}
                          {new Date(insp.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {insp.completedAt && (
                          <p>
                            <span className="font-semibold text-slate-700">Concluída em:</span>{' '}
                            {new Date(insp.completedAt).toLocaleDateString('pt-BR')}
                          </p>
                        )}
                        <p>
                          <span className="font-semibold text-slate-700">Conteudo:</span>{' '}
                          {insp.roomCount ?? 0} comodos - {insp.photoCount ?? 0} fotos
                        </p>
                        <p className="text-[10px] font-mono text-slate-400 truncate max-w-[250px]">
                          Código: {insp.id}
                        </p>
                      </div>
                    </div>

                    {/* Actions on past inspection */}
                    <div className="border-t border-slate-100 mt-4 pt-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteInspection(insp.id)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 cursor-pointer"
                        title="Excluir vistoria"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {insp.status === 'pdf_gerado' || insp.status === 'finalizado' || insp.status === 'concluida' ? (
                        <button
                          type="button"
                          onClick={() => handleOpenPdfView(insp)}
                          className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg cursor-pointer h-8 shadow-sm"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Ver PDF / Compartilhar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenDraft(insp)}
                          className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-3.5 py-2 rounded-lg cursor-pointer h-8"
                        >
                          <Play className="w-3.5 h-3.5 text-slate-500" />
                          Continuar Rascunho
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* VIEW 3: ACTIVE INSPECTION WIZARD & ROOMS CHECKLIST */}
        {currentView === 'inspection_wizard' && selectedProperty && (
          <InspectionWizard 
            key={`${selectedProperty.id}:${selectedInspection?.id ?? 'new'}`}
            property={selectedProperty}
            inspection={selectedInspection}
            onBack={() => {
              fetchPropertyInspections(selectedProperty);
              setCurrentView('inspections_history');
            }}
            onInspectionCreated={(created) => {
              setSelectedInspection(created);
            }}
            onProceedToReport={(completed) => {
              setSelectedInspection(completed);
              setCurrentView('pdf_generator');
            }}
            entitlement={entitlement}
          />
        )}

        {/* VIEW 4: PDF REPORT GENERATION & SIGNING */}
        {currentView === 'pdf_generator' && selectedProperty && selectedInspection && (
          <ReportPdfGenerator 
            property={selectedProperty}
            inspection={selectedInspection}
            onBack={() => {
              fetchPropertyInspections(selectedProperty);
              setCurrentView('inspections_history');
            }}
            onReopenInspection={(reopened) => {
              setSelectedInspection(reopened);
              setCurrentView('inspection_wizard');
            }}
            entitlement={entitlement}
          />
        )}

        {/* VIEW 5: PLANS & PAYMENT GATEWAY */}
        {currentView === 'plans' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <button 
                type="button"
                aria-label="Voltar para imóveis"
                onClick={() => setCurrentView('properties')}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-slate-800 leading-none">Creditos de relatorio</h2>
                <p className="text-xs text-slate-500">Compre um credito avulso para liberar analises de IA neste relatorio</p>
              </div>
            </div>
            {user && (
              <PaymentQuarantineGate 
                user={user}
                autoContinueOnActiveEntitlement={false}
                onReady={(updatedEnt) => {
                  setEntitlement(updatedEnt);
                  setCurrentView('properties');
                }}
              />
            )}
          </div>
        )}

      </main>
    </div>
  );
}
