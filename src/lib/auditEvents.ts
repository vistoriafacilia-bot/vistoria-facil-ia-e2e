import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

export async function safeCreateAuditEvent(userId: string, eventName: string, metadata: any = {}): Promise<null> {
  const eventId = `event-${Math.random().toString(36).substring(2, 11)}`;
  const eventRef = doc(db, 'events', eventId);
  const eventDoc = {
    id: eventId,
    userId,
    event: eventName,
    createdAt: new Date().toISOString(),
    metadata
  };

  try {
    // Audit events are intentionally non-blocking and safe
    await setDoc(eventRef, eventDoc);
  } catch (error) {
    console.warn('Error writing audit event:', error);
  }
  return null;
}
