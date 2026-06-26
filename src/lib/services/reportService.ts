import { isLocalE2EMode, supabase, throwIfSupabaseError } from '../supabaseClient';
import { localList, localUpsert } from '../supabaseLocalStore';

export type ReportRecord = {
  id: string;
  inspectionId: string;
  userId: string;
  propertyId: string;
  pdfUrl: string;
  storagePath: string;
  filename: string;
  generalSummary?: string;
  generatedAt: string;
  appVersion: string;
};

export async function saveReport(report: ReportRecord) {
  if (isLocalE2EMode()) return localUpsert('reports', report);
  const { data, error } = await supabase.from('reports').upsert({
    id: report.id,
    inspection_id: report.inspectionId,
    user_id: report.userId,
    property_id: report.propertyId,
    pdf_url: report.pdfUrl,
    storage_path: report.storagePath,
    filename: report.filename,
    general_summary: report.generalSummary || null,
    generated_at: report.generatedAt,
    app_version: report.appVersion,
  }, { onConflict: 'id' }).select().single();
  throwIfSupabaseError(error, 'Supabase save report');
  return data;
}

export async function listReports(inspectionId: string) {
  if (isLocalE2EMode()) {
    return localList<ReportRecord>('reports', report => report.inspectionId === inspectionId);
  }
  const { data, error } = await supabase.from('reports').select('*').eq('inspection_id', inspectionId);
  throwIfSupabaseError(error, 'Supabase list reports');
  return data || [];
}
