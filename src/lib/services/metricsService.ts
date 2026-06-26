import { SystemMetrics } from '../../types';
import { isLocalE2EMode, supabase, throwIfSupabaseError } from '../supabaseClient';
import { localCountEvents, localList } from '../supabaseLocalStore';

export async function getUserMetrics(userId: string): Promise<SystemMetrics> {
  if (isLocalE2EMode()) {
    const properties = localList<any>('properties', item => item.userId === userId);
    const inspections = localList<any>('inspections', item => item.userId === userId);
    const photos = localList<any>('photos', item => item.userId === userId);
    const eventCounts = localCountEvents(userId);
    return {
      totalUsers: 1,
      totalProperties: properties.length,
      totalInspections: inspections.length,
      totalPhotos: photos.length,
      totalAiAnalyses: eventCounts.ai,
      totalPdfsGenerated: eventCounts.pdf,
    };
  }

  const [properties, inspections, photos, events] = await Promise.all([
    supabase.from('properties').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('inspections').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('photos').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('events').select('event').eq('user_id', userId),
  ]);

  throwIfSupabaseError(properties.error, 'Supabase metrics properties');
  throwIfSupabaseError(inspections.error, 'Supabase metrics inspections');
  throwIfSupabaseError(photos.error, 'Supabase metrics photos');
  throwIfSupabaseError(events.error, 'Supabase metrics events');

  const eventRows = events.data || [];
  return {
    totalUsers: 1,
    totalProperties: properties.count || 0,
    totalInspections: inspections.count || 0,
    totalPhotos: photos.count || 0,
    totalAiAnalyses: eventRows.filter(row => row.event === 'ai_analysis').length,
    totalPdfsGenerated: eventRows.filter(row => row.event === 'pdf_generation').length,
  };
}
