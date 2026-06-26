import { createAuditEvent } from './services/auditService';

export async function safeCreateAuditEvent(userId: string, eventName: string, metadata: any = {}): Promise<null> {
  try {
    await createAuditEvent(userId, eventName, metadata);
  } catch (error) {
    console.warn('Error writing audit event:', error);
  }
  return null;
}
