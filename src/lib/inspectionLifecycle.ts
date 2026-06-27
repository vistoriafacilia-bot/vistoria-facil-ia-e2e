import { Inspection, Photo, Room } from '../types';

export const DEFAULT_INSPECTION_ROOMS = [
  'Sala',
  'Quarto 1',
  'Quarto 2',
  'Banheiro',
  'Cozinha',
  'Área de Serviço',
  'Varanda',
  'Garagem',
  'Outros',
];

type LifecycleRoom = Pick<Room, 'name' | 'order' | 'isDefault'>;
type LifecyclePhoto = Pick<Photo, 'id'>;

export function isDraftStatus(status: Inspection['status']) {
  return status === 'rascunho' || status === 'em_andamento';
}

export function hasDefaultRoomSetOnly(rooms: LifecycleRoom[]) {
  if (rooms.length !== DEFAULT_INSPECTION_ROOMS.length) return false;
  const ordered = [...rooms].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return DEFAULT_INSPECTION_ROOMS.every((name, index) => {
    const room = ordered[index];
    return Boolean(room) && room.name === name && room.isDefault !== false;
  });
}

export function hasMeaningfulInspectionContent(params: {
  inspection: Inspection;
  rooms: LifecycleRoom[];
  photos?: LifecyclePhoto[];
  photoCount?: number;
  reportCount?: number;
}) {
  if (!isDraftStatus(params.inspection.status)) return true;
  if ((params.inspection.summary || '').trim()) return true;
  const photoCount = params.photoCount ?? params.photos?.length ?? 0;
  if (photoCount > 0) return true;
  if ((params.reportCount ?? 0) > 0) return true;
  return !hasDefaultRoomSetOnly(params.rooms);
}

export function isEmptyInspectionDraft(params: {
  inspection: Inspection;
  rooms: LifecycleRoom[];
  photos?: LifecyclePhoto[];
  photoCount?: number;
  reportCount?: number;
}) {
  return isDraftStatus(params.inspection.status) && !hasMeaningfulInspectionContent(params);
}
