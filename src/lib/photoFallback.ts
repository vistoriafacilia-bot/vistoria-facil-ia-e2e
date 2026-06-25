/**
 * Generates fallback structure when AI analysis fails or is not available.
 */
export function buildPhotoFallback(roomName: string): { displayTitle: string; description: string } {
  const safeRoom = roomName || 'Cômodo';
  return {
    displayTitle: `Foto registrada na ${safeRoom}`,
    description: 'A foto foi salva com sucesso, mas a análise automática não pôde ser concluída. Revise manualmente a imagem ou tente gerar a sugestão novamente.'
  };
}

/**
 * Sanitizes the display title of a photo, preventing empty strings and "undefined" outputs.
 */
export function sanitizePhotoTitle(title: string | undefined | null, roomName: string): string {
  const safeRoom = roomName || 'Cômodo';
  if (!title || typeof title !== 'string' || title.trim() === '' || title.toLowerCase().includes('undefined')) {
    return `Foto registrada na ${safeRoom}`;
  }
  return title.trim();
}

/**
 * Sanitizes the description of a photo, preventing empty strings and "undefined" outputs.
 */
export function sanitizePhotoDescription(description: string | undefined | null, roomName: string): string {
  if (!description || typeof description !== 'string' || description.trim() === '' || description.toLowerCase().includes('undefined')) {
    return 'A foto foi salva com sucesso, mas a análise automática não pôde ser concluída. Revise manualmente a imagem ou tente gerar a sugestão novamente.';
  }
  return description.trim();
}
