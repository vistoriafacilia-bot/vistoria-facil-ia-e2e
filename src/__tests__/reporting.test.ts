import { describe, expect, it } from 'vitest';
import { buildReportFilename, buildReportId, buildReportStoragePath, sanitizeReportFilenamePart } from '../lib/reporting';

describe('reporting helpers', () => {
  it('sanitizes filename parts without accents, spaces or unsafe characters', () => {
    expect(sanitizeReportFilenamePart('Apto 101 - São João / Bloco A')).toBe('Apto_101_-_Sao_Joao_Bloco_A');
  });

  it('builds deterministic PDF filename with property, inspection type and short id', () => {
    expect(buildReportFilename({
      propertyNickname: 'Meu Apartamento',
      inspectionType: 'entrada',
      inspectionId: 'insp_1234567890abcdef'
    })).toBe('Vistoria_Meu_Apartamento_entrada_insp_1234567.pdf');
  });

  it('builds owner-scoped storage path for persisted PDF reports', () => {
    expect(buildReportStoragePath({
      userId: 'user-1',
      propertyId: 'prop/unsafe',
      inspectionId: 'insp 01',
      filename: 'Vistoria_Meu_Apartamento_entrada_insp_1234567.pdf'
    })).toBe('reports/user-1/prop_unsafe/insp_01/Vistoria_Meu_Apartamento_entrada_insp_1234567.pdf');
  });

  it('builds stable report id from inspection id and timestamp', () => {
    expect(buildReportId('insp-abc', '2026-06-25T13:20:30.000Z')).toBe('rpt_insp-abc_20260625132030');
  });
});
