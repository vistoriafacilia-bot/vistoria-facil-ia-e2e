import React from 'react';
import { AppUser, Entitlement } from '../types';

interface PaymentQuarantineGateProps {
  user?: AppUser;
  onReady: (entitlement: Entitlement) => void;
  autoContinueOnActiveEntitlement?: boolean;
}

export default function PaymentQuarantineGate({ user, onReady, autoContinueOnActiveEntitlement }: PaymentQuarantineGateProps) {
  void user;
  void onReady;
  void autoContinueOnActiveEntitlement;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-lg shadow-sm p-6 text-center space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Relatorio beta</h1>
        <p className="text-sm text-gray-700">
          Pagamento em reestruturação. Para liberar relatório beta, entre em contato.
        </p>
      </div>
    </div>
  );
}
