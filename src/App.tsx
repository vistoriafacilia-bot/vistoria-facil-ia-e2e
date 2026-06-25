import React, { useState, useEffect } from 'react';
import { auth, loginWithGoogle, db, OperationType, handleFirestoreError } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { Property, Inspection, Entitlement } from './types';
import Navbar from './components/Navbar';
import PropertyManager from './components/PropertyManager';
import InspectionWizard from './components/InspectionWizard';
import ReportPdfGenerator from './components/ReportPdfGenerator';
import DashboardMetrics from './components/DashboardMetrics';
import PlanGate from './components/PlanGate';
import { ClipboardList, Plus, History, Trash2, FileText, Play, ChevronLeft, ArrowRight, ShieldCheck, Sparkles, Building2 } from 'lucide-react';
import { APP_VERSION } from './lib/appVersion';
import { getOrCreateUserEntitlement } from './lib/entitlements';
import { safeCreateAuditEvent } from './lib/auditEvents';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Entitlement states
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [entitlementLoading, setEntitlementLoading] = useState(false);

  // Routing states
  // 'properties' | 'inspections_history' | 'inspection_wizard' | 'pdf_generator' | 'plans'
  const [currentView, setCurrentView] = useState<'properties' | 'inspections_history' | 'inspection_wizard' | 'pdf_generator' | 'plans'>('properties');
  
  // Selected Contexts
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Admin and Metrics Control
  const [showAdminMetrics, setShowAdminMetrics] = useState(false);
  const isAdminUser = user?.email === 'vistoriafacil.ia@gmail.com';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);

      if (firebaseUser) {
        // Create/Update user profile in Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            await updateDoc(userRef, {
              lastLoginAt: new Date().toISOString()
            });
          } else {
            await setDoc(userRef, {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || 'Vistoriador',
              email: firebaseUser.email || '',
              createdAt: new Date().toISOString(),
              lastLoginAt: new Date().toISOString(),
              plan: 'gratuito'
            });
          }
        } catch (err) {
          console.warn('Alerta: Erro ao salvar/atualizar o perfil do usuário no Firestore (as regras podem não estar totalmente propagadas ou o login foi realizado sem permissão de escrita):', err);
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

  const loadPropertyInspections = async (property: Property): Promise<Inspection[]> => {
    if (!user) return [];
    const q = query(
      collection(db, 'inspections'),
      where('userId', '==', user.uid),
      where('propertyId', '==', property.id)
    );
    const snap = await getDocs(q);
    const list: Inspection[] = [];
    snap.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() } as Inspection);
    });
    list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return list;
  };

  const findMostRecentDraftInspection = (list: Inspection[]): Inspection | null => {
    return list.find(insp => insp.status === 'em_andamento' || insp.status === 'rascunho') || null;
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
      await deleteDoc(doc(db, 'inspections', id)).catch(err => 
        handleFirestoreError(err, OperationType.DELETE, `inspections/${id}`)
      );

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

          {/* Social login action */}
          <button
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
        </div>

        {/* Humble Footer */}
        <footer className="text-center text-slate-500 text-[10px] space-y-1">
          <p>Vistoria Fácil IA © 2026 | Versão {APP_VERSION}</p>
          <p className="max-w-xs mx-auto">Desenvolvido em conformidade com as diretrizes do Google AI Studio & Firebase</p>
        </footer>

      </div>
    );
  }

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
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" /> Versão Beta Limitada a 10 Fotos
                  </h3>
                  <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                    Sua conta atual permite vistorias de até 10 fotos no total. Faça o upgrade para a versão premium e gere relatórios de até 50 fotos com PDFs em alta definição e suporte dedicado.
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

              <button
                type="button"
                onClick={() => handleStartNewInspection(selectedProperty)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3.5 py-2.5 rounded-xl shadow-xs transition-all active:scale-98 cursor-pointer h-10"
              >
                <Plus className="w-4 h-4" />
                Nova Vistoria
              </button>
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
                          insp.status === 'pdf_gerado' 
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : insp.status === 'concluida'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {insp.status === 'pdf_gerado' ? 'PDF Disponível' : insp.status === 'concluida' ? 'Concluída' : 'Rascunho'}
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

                      {insp.status === 'pdf_gerado' || insp.status === 'concluida' ? (
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
            entitlement={entitlement}
          />
        )}

        {/* VIEW 5: PLANS & PAYMENT GATEWAY */}
        {currentView === 'plans' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <button 
                type="button"
                onClick={() => setCurrentView('properties')}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-slate-800 leading-none">Planos de Assinatura</h2>
                <p className="text-xs text-slate-500">Escolha a melhor opção para seu negócio imobiliário</p>
              </div>
            </div>
            {user && (
              <PlanGate 
                user={user}
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
