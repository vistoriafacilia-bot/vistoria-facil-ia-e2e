import { describe, it, expect } from 'vitest';
import { validatePropertyRequiredFields } from '../lib/validation';

describe('Property Validation', () => {
  it('fails if nickname is missing', () => {
    const res = validatePropertyRequiredFields({
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310-100',
    });
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain('Apelido');
  });

  it('fails if street is missing', () => {
    const res = validatePropertyRequiredFields({
      nickname: 'Apartamento Jardins',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310-100',
    });
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain('Logradouro/Rua');
  });

  it('fails if number is missing', () => {
    const res = validatePropertyRequiredFields({
      nickname: 'Apartamento Jardins',
      street: 'Av. Paulista',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310-100',
    });
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain('Número');
  });

  it('fails if neighborhood is missing', () => {
    const res = validatePropertyRequiredFields({
      nickname: 'Apartamento Jardins',
      street: 'Av. Paulista',
      number: '1000',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310-100',
    });
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain('Bairro');
  });

  it('fails if city is missing', () => {
    const res = validatePropertyRequiredFields({
      nickname: 'Apartamento Jardins',
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      state: 'SP',
      zipCode: '01310-100',
    });
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain('Cidade');
  });

  it('fails if state is missing', () => {
    const res = validatePropertyRequiredFields({
      nickname: 'Apartamento Jardins',
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      zipCode: '01310-100',
    });
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain('UF / Estado');
  });

  it('fails if zipCode is missing', () => {
    const res = validatePropertyRequiredFields({
      nickname: 'Apartamento Jardins',
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    });
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain('CEP');
  });

  it('passes if all fields are valid', () => {
    const res = validatePropertyRequiredFields({
      nickname: 'Apartamento Jardins',
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310-100',
    });
    expect(res.isValid).toBe(true);
    expect(res.missingFields.length).toBe(0);
  });
});
