import React from 'react';
import { logout } from '../lib/services/authService';
import { LogOut, ClipboardList, ShieldAlert } from 'lucide-react';
import { APP_VERSION } from '../lib/appVersion';
import { PLAN_DEFINITIONS } from '../lib/plans';
import { AppUser, Entitlement } from '../types';

interface NavbarProps {
  user: AppUser | null;
  onNavigateHome: () => void;
  isAdminUser: boolean;
  showAdminMetrics: boolean;
  onToggleAdminMetrics: () => void;
  entitlement?: Entitlement | null;
}

export default function Navbar({ user, onNavigateHome, isAdminUser, showAdminMetrics, onToggleAdminMetrics, entitlement }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 px-4 py-3.5 shadow-xs">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        
        {/* Brand Logo & Name */}
        <button 
          type="button"
          onClick={onNavigateHome}
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 active:scale-98 transition-all border-0 bg-transparent text-left p-0"
        >
          <div className="bg-indigo-600 text-white p-1.5 rounded-lg shadow-sm">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-sans font-bold text-base tracking-tight text-slate-900 leading-tight">
              Vistoria Fácil IA
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">{APP_VERSION}</p>
          </div>
        </button>

        {/* User Info & Settings */}
        {user && (
          <div className="flex items-center gap-2 sm:gap-4">
            
            {/* Admin Badge/Toggle */}
            {isAdminUser && (
              <button
                type="button"
                onClick={onToggleAdminMetrics}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all border ${
                  showAdminMetrics 
                    ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-xs' 
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{showAdminMetrics ? 'Ocultar Admin' : 'Painel Admin'}</span>
              </button>
            )}

            {/* Profile Avatar & Name */}
            <div className="flex items-center gap-2">
              {user.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt={user.displayName || 'Usuário'} 
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full border border-slate-200 shadow-xs"
                />
              ) : (
                <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-sm shadow-xs">
                  {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-800 leading-none">
                  {user.displayName || 'Vistoriador'}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[150px]">
                  {user.email}
                </span>
                {entitlement && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full w-max mt-1 ${entitlement.planId === 'beta_paid_4990' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                    {PLAN_DEFINITIONS[entitlement.planId]?.name || entitlement.planId}
                  </span>
                )}
              </div>
            </div>

            {/* Logout Button */}
            <button
              type="button"
              onClick={() => logout()}
              title="Sair do aplicativo"
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors duration-150"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
