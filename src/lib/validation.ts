export interface PropertyValidationInput {
  nickname?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

const BRAZILIAN_MOBILE_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

export function normalizeFullName(value?: string | null): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function isValidFullName(value?: string | null): boolean {
  const parts = normalizeFullName(value).split(' ').filter(Boolean);
  return parts.length >= 2 && parts.every((part) => /\p{L}/u.test(part));
}

export function normalizeBrazilianMobilePhone(value?: string | null): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) return digits.slice(2);
  return digits;
}

export function isValidBrazilianMobilePhone(value?: string | null): boolean {
  const digits = normalizeBrazilianMobilePhone(value);
  if (!/^\d{11}$/.test(digits)) return false;
  return BRAZILIAN_MOBILE_DDDS.has(digits.slice(0, 2)) && digits[2] === '9';
}

export function formatBrazilianMobilePhone(value?: string | null): string {
  const digits = normalizeBrazilianMobilePhone(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/**
 * Validates the required fields of a property.
 * Returns an object indicating whether the property is valid and lists any missing fields.
 */
export function validatePropertyRequiredFields(input: PropertyValidationInput): { isValid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  if (!input.nickname || !input.nickname.trim()) missingFields.push('Apelido');
  if (!input.street || !input.street.trim()) missingFields.push('Logradouro/Rua');
  if (!input.number || !input.number.trim()) missingFields.push('Número');
  if (!input.neighborhood || !input.neighborhood.trim()) missingFields.push('Bairro');
  if (!input.city || !input.city.trim()) missingFields.push('Cidade');
  if (!input.state || !input.state.trim()) missingFields.push('UF / Estado');
  if (!input.zipCode || !input.zipCode.trim()) missingFields.push('CEP');

  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}
