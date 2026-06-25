export const MAX_PHOTOS_V0 = 10;

/**
 * Calculates remaining available slots for photos.
 */
export function getRemainingPhotoSlots(totalPhotos: number, limit = MAX_PHOTOS_V0): number {
  return Math.max(0, limit - totalPhotos);
}

/**
 * Checks whether a batch of files can be added without exceeding the photo limit.
 */
export function canAddPhotoBatch(currentTotal: number, selectedCount: number, limit = MAX_PHOTOS_V0): boolean {
  return (currentTotal + selectedCount) <= limit;
}

/**
 * Filters a list of files to keep only images.
 */
export function filterImageFiles(files: File[] | any[]): any[] {
  return files.filter(file => file && file.type && file.type.startsWith('image/'));
}
