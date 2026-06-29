import { ReportCredit, ReportCreditPlanId } from '../../types';
import { REPORT_CREDIT_PLAN_DEFINITIONS } from '../plans';
import { isLocalE2EMode, requireSupabaseConfigured, supabase, throwIfSupabaseError } from '../supabaseClient';
import { localList, localPatch, localUpsert, nextLocalId } from '../supabaseLocalStore';

const fromRow = (row: any): ReportCredit => ({
  id: row.id,
  userId: row.user_id,
  planId: row.plan_id,
  orderId: row.order_id || null,
  paymentId: row.payment_id || null,
  preferenceId: row.preference_id || null,
  inspectionId: row.inspection_id || null,
  status: row.status,
  analysisLimit: row.analysis_limit,
  analysisUsed: row.analysis_used,
  priceCents: row.price_cents,
  currency: row.currency,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  assignedAt: row.assigned_at || null,
  finalizedAt: row.finalized_at || null,
});

export async function listReportCredits(userId: string): Promise<ReportCredit[]> {
  if (isLocalE2EMode()) {
    return localList<ReportCredit>('reportCredits', credit => credit.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  requireSupabaseConfigured();
  const { data, error } = await supabase
    .from('report_credits')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  throwIfSupabaseError(error, 'Supabase list report credits');
  return (data || []).map(fromRow);
}

export async function createLocalReportCredit(userId: string, planId: ReportCreditPlanId): Promise<ReportCredit> {
  if (!isLocalE2EMode()) throw new Error('Local report credit creation is only available in E2E mode.');
  const plan = REPORT_CREDIT_PLAN_DEFINITIONS[planId];
  const now = new Date().toISOString();
  const credit: ReportCredit = {
    id: nextLocalId('report-credit'),
    userId,
    planId,
    status: 'available',
    analysisLimit: plan.analysisLimit,
    analysisUsed: 0,
    priceCents: plan.priceCents,
    currency: plan.currency,
    createdAt: now,
    updatedAt: now,
  };
  return localUpsert('reportCredits', credit);
}

export async function assignReportCredit(creditId: string, inspectionId: string): Promise<ReportCredit> {
  if (isLocalE2EMode()) {
    const credit = localList<ReportCredit>('reportCredits', item => item.id === creditId)[0];
    if (!credit) throw new Error('REPORT_CREDIT_NOT_FOUND');
    if (credit.status !== 'available' && credit.inspectionId !== inspectionId) throw new Error('REPORT_CREDIT_NOT_AVAILABLE');
    return localPatch<ReportCredit>('reportCredits', creditId, {
      inspectionId,
      status: credit.analysisUsed > 0 ? 'in_progress' : 'assigned',
      assignedAt: credit.assignedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const { data, error } = await supabase.rpc('assign_report_credit', {
    p_credit_id: creditId,
    p_inspection_id: inspectionId,
  });
  throwIfSupabaseError(error, 'Supabase assign report credit');
  return fromRow(data);
}

export async function consumeReportCreditAnalysis(inspectionId: string): Promise<ReportCredit> {
  if (isLocalE2EMode()) {
    const credit = localList<ReportCredit>('reportCredits', item =>
      item.inspectionId === inspectionId && (item.status === 'assigned' || item.status === 'in_progress')
    )[0];
    if (!credit) throw new Error('REPORT_CREDIT_NOT_ASSIGNED');
    if (credit.analysisUsed >= credit.analysisLimit) throw new Error('REPORT_CREDIT_LIMIT_REACHED');
    return localPatch<ReportCredit>('reportCredits', credit.id, {
      analysisUsed: credit.analysisUsed + 1,
      status: 'in_progress',
      updatedAt: new Date().toISOString(),
    });
  }

  const { data, error } = await supabase.rpc('consume_report_credit_analysis', {
    p_inspection_id: inspectionId,
  });
  throwIfSupabaseError(error, 'Supabase consume report credit analysis');
  return fromRow(data);
}

export async function finalizeReportCredit(inspectionId: string): Promise<ReportCredit> {
  if (isLocalE2EMode()) {
    const credit = localList<ReportCredit>('reportCredits', item =>
      item.inspectionId === inspectionId && (item.status === 'assigned' || item.status === 'in_progress')
    )[0];
    if (!credit) throw new Error('REPORT_CREDIT_NOT_ASSIGNED');
    return localPatch<ReportCredit>('reportCredits', credit.id, {
      status: 'finalized',
      finalizedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const { data, error } = await supabase.rpc('finalize_report_credit', {
    p_inspection_id: inspectionId,
  });
  throwIfSupabaseError(error, 'Supabase finalize report credit');
  return fromRow(data);
}
