import { describe, it, expect } from 'vitest';
import { buildPhotoFallback, sanitizePhotoTitle, sanitizePhotoDescription } from '../lib/photoFallback';

describe('Photo Fallback and Sanitization', () => {
  it('builds a beautiful fallback for AI errors', () => {
    const fb = buildPhotoFallback('Cozinha');
    expect(fb.displayTitle).toBe('Foto registrada na Cozinha');
    expect(fb.description).toContain('análise automática não pôde ser concluída');
  });

  it('sanitizes undefined, null, or blank titles', () => {
    expect(sanitizePhotoTitle(undefined, 'Sala')).toBe('Foto registrada na Sala');
    expect(sanitizePhotoTitle('', 'Banheiro')).toBe('Foto registrada na Banheiro');
    expect(sanitizePhotoTitle('undefined - undefined', 'Suíte')).toBe('Foto registrada na Suíte');
    expect(sanitizePhotoTitle('Aparelho de Ar Condicionado', 'Suíte')).toBe('Aparelho de Ar Condicionado');
  });

  it('sanitizes undefined, null, or blank descriptions', () => {
    const defaultDesc = 'A foto foi salva com sucesso, mas a análise automática não pôde ser concluída. Revise manualmente a imagem ou tente gerar a sugestão novamente.';
    expect(sanitizePhotoDescription(undefined, 'Copa')).toBe(defaultDesc);
    expect(sanitizePhotoDescription('', 'Copa')).toBe(defaultDesc);
    expect(sanitizePhotoDescription('undefined', 'Copa')).toBe(defaultDesc);
    expect(sanitizePhotoDescription('Paredes pintadas de branco em bom estado.', 'Copa')).toBe('Paredes pintadas de branco em bom estado.');
  });
});
