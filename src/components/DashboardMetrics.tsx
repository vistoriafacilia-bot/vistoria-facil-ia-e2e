import React, { useEffect, useState } from 'react';
import { BarChart3, Users, Building2, ClipboardList, Camera, Cpu, FileText } from 'lucide-react';
import { APP_VERSION } from '../lib/appVersion';
import { getPhotoLimitForEntitlement } from '../lib/entitlements';
import { Entitlement } from '../types';
import { getCurrentUser } from '../lib/services/authService';
import { getUserMetrics } from '../lib/services/metricsService';

interface MetricsProps {
  isAdminUser: boolean;
  entitlement?: Entitlement | null;
}

export default function DashboardMetrics({ isAdminUser, entitlement }: MetricsProps) {
  const [metrics, setMetrics] = useState({
    totalUsers: 1, // Default self
    totalProperties: 0,
    totalInspections: 0,
    totalPhotos: 0,
    totalAiAnalyses: 0,
    totalPdfsGenerated: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      const currentUser = await getCurrentUser();
      if (!currentUser) return;
      setLoading(true);
      try {
        setMetrics(await getUserMetrics(currentUser.uid));
      } catch (error) {
        console.error('Error fetching metrics:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, [isAdminUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 bg-white rounded-2xl border border-slate-100 shadow-sm animate-pulse">
        <div className="text-slate-400 text-sm font-medium">Carregando indicadores de custo e uso...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          <h2 className="text-base font-semibold text-slate-800">
            {isAdminUser ? 'Painel de Custos & Uso Global (Admin)' : 'Seu Painel de Uso & Custos'}
          </h2>
        </div>
        <span className="text-[11px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
          {APP_VERSION}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Users - Show only if admin */}
        {isAdminUser && (
          <div className="bg-gradient-to-br from-indigo-50 to-white p-3.5 rounded-xl border border-indigo-100 shadow-sm">
            <div className="flex items-center gap-2 text-indigo-600 mb-1.5">
              <Users className="w-4 h-4" />
              <span className="text-xs font-medium">Usuários</span>
            </div>
            <div className="text-xl font-bold text-slate-900">{metrics.totalUsers}</div>
          </div>
        )}

        {/* Total Properties */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 mb-1.5">
            <Building2 className="w-4 h-4" />
            <span className="text-xs font-medium">Imóveis</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{metrics.totalProperties}</div>
        </div>

        {/* Total Inspections */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 mb-1.5">
            <ClipboardList className="w-4 h-4" />
            <span className="text-xs font-medium">Vistorias</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{metrics.totalInspections}</div>
        </div>

        {/* Total Photos */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 mb-1.5">
            <Camera className="w-4 h-4" />
            <span className="text-xs font-medium">Fotos Enviadas</span>
          </div>
          <div className="text-xl font-bold text-slate-900">
            {metrics.totalPhotos}
            <span className="text-[10px] text-slate-400 font-normal ml-1">/{getPhotoLimitForEntitlement(entitlement)} limite</span>
          </div>
        </div>

        {/* AI Analyses */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-600 mb-1.5">
            <Cpu className="w-4 h-4" />
            <span className="text-xs font-medium">Análises de IA</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{metrics.totalAiAnalyses}</div>
        </div>

        {/* PDFs Generated */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 text-blue-600 mb-1.5">
            <FileText className="w-4 h-4" />
            <span className="text-xs font-medium">PDFs Gerados</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{metrics.totalPdfsGenerated}</div>
        </div>
      </div>
    </div>
  );
}
