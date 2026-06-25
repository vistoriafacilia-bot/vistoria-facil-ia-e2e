export interface PropertyValidationInput {
  nickname?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
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
