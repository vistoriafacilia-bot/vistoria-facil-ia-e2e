import React, { useState, useEffect } from 'react';
import { Property, PropertyType, PropertyAddress } from '../types';
import { Plus, Home, Edit2, Trash2, MapPin, ClipboardPlus, FolderOpen, ArrowRight, X, Sparkles, HelpCircle, ShieldAlert } from 'lucide-react';
import { validatePropertyRequiredFields } from '../lib/validation';
import { safeCreateAuditEvent } from '../lib/auditEvents';
import { getCurrentUser } from '../lib/services/authService';
import { createProperty, deleteProperty, listProperties, updateProperty } from '../lib/services/propertyService';

interface PropertyManagerProps {
  onSelectPropertyForInspection: (property: Property) => void;
  onViewHistory: (property: Property) => void;
}

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'apartamento', label: 'Apartamento' },
  { value: 'casa', label: 'Casa' },
  { value: 'sala comercial', label: 'Sala Comercial' },
  { value: 'outro', label: 'Outro' },
];

export default function PropertyManager({ onSelectPropertyForInspection, onViewHistory }: PropertyManagerProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Saving states
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Form states
  const [nickname, setNickname] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('apartamento');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [reference, setReference] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');

  // Delete Confirmation State
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    const currentUser = await getCurrentUser();
    if (!currentUser) return;
    setLoading(true);
    try {
      setProperties(await listProperties(currentUser.uid));
    } catch (error) {
      console.error('Error fetching properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setSelectedProperty(null);
    setNickname('');
    setPropertyType('apartamento');
    setStreet('');
    setNumber('');
    setComplement('');
    setNeighborhood('');
    setCity('');
    setState('');
    setZipCode('');
    setReference('');
    setGeneralNotes('');
    setSaveError(null);
    setSaveSuccess(null);
    setIsSaving(false);
    setIsEditing(true);
  };

  const handleOpenEdit = (property: Property) => {
    setSelectedProperty(property);
    setNickname(property.nickname);
    setPropertyType(property.propertyType);
    setStreet(property.address.street);
    setNumber(property.address.number);
    setComplement(property.address.complement || '');
    setNeighborhood(property.address.neighborhood);
    setCity(property.address.city);
    setState(property.address.state);
    setZipCode(property.address.zipCode);
    setReference(property.address.reference || '');
    setGeneralNotes(property.generalNotes || '');
    setSaveError(null);
    setSaveSuccess(null);
    setIsSaving(false);
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      setSaveError('Sessão expirada. Faça login novamente.');
      return;
    }

    setSaveError(null);
    setSaveSuccess(null);

    // Validate fields
    const validation = validatePropertyRequiredFields({
      nickname,
      street,
      number,
      neighborhood,
      city,
      state,
      zipCode,
    });

    if (!propertyType) {
      validation.isValid = false;
      validation.missingFields.push('Tipo');
    }

    if (!validation.isValid) {
      setSaveError(`Por favor, preencha os campos obrigatórios: ${validation.missingFields.join(', ')}.`);
      return;
    }

    const address: PropertyAddress = {
      street: street.trim(),
      number: number.trim(),
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      state: state.trim().toUpperCase(),
      zipCode: zipCode.trim(),
    };
    if (complement.trim()) {
      address.complement = complement.trim();
    }
    if (reference.trim()) {
      address.reference = reference.trim();
    }

    setIsSaving(true);

    try {
      if (selectedProperty) {
        // Edit existing
        const updatedData: Partial<Property> = {
          nickname: nickname.trim(),
          propertyType,
          address,
          updatedAt: new Date().toISOString(),
        };
        if (generalNotes.trim()) {
          updatedData.generalNotes = generalNotes.trim();
        } else {
          updatedData.generalNotes = '';
        }

        await updateProperty(selectedProperty.id, updatedData);

        // Record audit event (doesn't block the property save)
        await safeCreateAuditEvent(currentUser.uid, 'property_update', { propertyId: selectedProperty.id, nickname: nickname.trim() });
      } else {
        // Create new
        const newId = crypto.randomUUID();
        const newProperty: Property = {
          id: newId,
          userId: currentUser.uid,
          nickname: nickname.trim(),
          propertyType,
          address,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (generalNotes.trim()) {
          newProperty.generalNotes = generalNotes.trim();
        }

        await createProperty(newProperty);

        // Record audit event (doesn't block the property save)
        await safeCreateAuditEvent(currentUser.uid, 'property_create', { propertyId: newId, nickname: nickname.trim() });
      }

      setSaveSuccess('Imóvel salvo com sucesso!');
      setIsEditing(false);
      fetchProperties();
    } catch (error: any) {
      console.error('Error saving property:', error);
      let userFriendlyMsg = 'Ocorreu um erro ao salvar o imovel. Verifique as politicas RLS do Supabase.';
      
      const errorStr = error instanceof Error ? error.message : String(error);
      const isPermissionError = errorStr.toLowerCase().includes('permission') || errorStr.toLowerCase().includes('insufficient');
      
      if (isPermissionError) {
        userFriendlyMsg = 'Erro de permissao no Supabase ao criar imovel. Verifique se as politicas RLS foram aplicadas.';
      } else if (error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed && parsed.error) {
            if (parsed.error.toLowerCase().includes('permission') || parsed.error.toLowerCase().includes('insufficient')) {
              userFriendlyMsg = 'Erro de permissao no Supabase ao criar imovel. Verifique se as politicas RLS foram aplicadas.';
            } else {
              userFriendlyMsg = `Erro: ${parsed.error}`;
            }
          } else {
            userFriendlyMsg = error.message;
          }
        } catch (e) {
          userFriendlyMsg = error.message;
        }
      }
      setSaveError(userFriendlyMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const currentUser = await getCurrentUser();
    if (!currentUser) return;
    try {
      await deleteProperty(id);

      // Record audit event (doesn't block deletion)
      await safeCreateAuditEvent(currentUser.uid, 'property_delete', { propertyId: id });

      setPropertyToDelete(null);
      fetchProperties();
    } catch (error) {
      console.error('Error deleting property:', error);
      setSaveError('Erro ao excluir imovel. Tente novamente.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium text-sm mt-4">Buscando seus imóveis cadastrados...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header action */}
      {!isEditing && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Meus Imóveis</h2>
            <p className="text-xs text-slate-500">Cadastre e gerencie os imóveis para realizar vistorias de locação.</p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreate}
            id="btn-cadastrar-imovel"
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-98 cursor-pointer h-11"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Imóvel
          </button>
        </div>
      )}

      {/* Editing or Creating Form */}
      {isEditing ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden max-w-2xl mx-auto">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">
              {selectedProperty ? 'Editar Imóvel' : 'Cadastrar Novo Imóvel'}
            </h3>
            <button 
              type="button"
              onClick={() => setIsEditing(false)}
              className="p-1.5 text-slate-400 hover:bg-slate-150 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSave} className="p-6 space-y-5">
            {saveError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-xs font-medium flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{saveError}</span>
              </div>
            )}
            {saveSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-xs font-medium flex items-start gap-2">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                <span>{saveSuccess}</span>
              </div>
            )}
            
            {/* General Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Apelido do Imóvel * (Ex: Apê Pinheiros, Casa de Praia)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Apelido curto e reconhecível"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full text-sm border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 outline-none bg-slate-50 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Tipo de Imóvel *
                </label>
                <select
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value as PropertyType)}
                  className="w-full text-sm border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 outline-none bg-slate-50 focus:bg-white transition-colors h-[42px]"
                >
                  {PROPERTY_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Address Info */}
            <div className="border-t border-slate-100 pt-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-indigo-600" /> Endereço Completo
              </h4>
              
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    CEP *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="00000-000"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    className="w-full text-sm border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 outline-none bg-slate-50 focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    UF / Estado *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    placeholder="SP"
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    className="w-full text-sm border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 outline-none bg-slate-50 focus:bg-white transition-colors text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="col-span-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Logradouro / Rua *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Avenida Paulista, Rua Augusta..."
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="w-full text-sm border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 outline-none bg-slate-50 focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Número *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="123"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className="w-full text-sm border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 outline-none bg-slate-50 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Complemento <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Apto 42, Bloco B"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    className="w-full text-sm border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 outline-none bg-slate-50 focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Bairro *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Centro, Jardim América..."
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    className="w-full text-sm border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 outline-none bg-slate-50 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Cidade *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="São Paulo, Rio de Janeiro..."
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full text-sm border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 outline-none bg-slate-50 focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Ponto de Referência <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Próximo ao metrô ou mercado..."
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="w-full text-sm border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 outline-none bg-slate-50 focus:bg-white transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Optional Notes */}
            <div className="border-t border-slate-100 pt-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Observações Gerais do Imóvel <span className="text-slate-400 font-normal">(Opcional)</span>
              </label>
              <textarea
                rows={3}
                placeholder="Insira observações estruturais, restrições ou detalhes que se aplicam a todo o imóvel..."
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                className="w-full text-sm border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 outline-none bg-slate-50 focus:bg-white transition-colors resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className={`text-slate-600 hover:bg-slate-100 font-semibold text-sm px-4 py-2.5 rounded-xl cursor-pointer ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className={`bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-md active:scale-98 cursor-pointer h-11 flex items-center justify-center min-w-[120px] ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Salvando...
                  </>
                ) : (
                  'Salvar Imóvel'
                )}
              </button>
            </div>

          </form>
        </div>
      ) : (
        /* Properties List */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {properties.length === 0 ? (
            <div className="col-span-full bg-white rounded-2xl border border-slate-100 shadow-xs p-12 flex flex-col items-center justify-center text-center">
              <div className="bg-indigo-50 text-indigo-600 p-4 rounded-full mb-4">
                <Home className="w-8 h-8" />
              </div>
              <h3 className="font-sans font-bold text-slate-800 text-lg mb-1">Nenhum imóvel cadastrado</h3>
              <p className="text-slate-500 text-sm max-w-sm mb-6 leading-relaxed">
                Para iniciar vistorias de entrada ou saída, cadastre o endereço e apelido do imóvel primeiro.
              </p>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-98 cursor-pointer"
              >
                Cadastrar Primeiro Imóvel
              </button>
            </div>
          ) : (
            properties.map((property) => (
              <div 
                key={property.id} 
                data-testid={`property-card-${property.id}`}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between hover:border-slate-200 transition-colors"
              >
                <div className="p-5 space-y-4">
                  {/* Card Title & Type */}
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="inline-block text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-md mb-1.5">
                        {property.propertyType}
                      </span>
                      <h3 className="font-sans font-bold text-slate-800 text-base leading-tight">
                        {property.nickname}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(property)}
                        title="Editar imóvel"
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPropertyToDelete(property.id)}
                        title="Excluir imóvel"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Address Section */}
                  <div className="text-xs text-slate-600 space-y-1">
                    <p className="font-medium flex items-center gap-1.5 text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      {property.address.street}, Nº {property.address.number}
                      {property.address.complement && ` - ${property.address.complement}`}
                    </p>
                    <p className="pl-5 text-slate-500">
                      {property.address.neighborhood}, {property.address.city} - {property.address.state}
                    </p>
                    <p className="pl-5 text-slate-400 font-mono">
                      CEP: {property.address.zipCode}
                    </p>
                    {property.address.reference && (
                      <p className="pl-5 text-indigo-600/80 font-medium">
                        Ref: {property.address.reference}
                      </p>
                    )}
                  </div>

                  {/* General Notes if present */}
                  {property.generalNotes && (
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs text-slate-500 leading-relaxed italic">
                      "{property.generalNotes}"
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    aria-label="Histórico - Vistorias iniciadas"
                    onClick={() => onViewHistory(property)}
                    data-testid={`property-history-${property.id}`}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Vistorias iniciadas
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectPropertyForInspection(property)}
                    data-testid={`property-start-${property.id}`}
                    className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg shadow-sm transition-all active:scale-98 cursor-pointer h-9"
                  >
                    <ClipboardPlus className="w-4 h-4" />
                    Nova Vistoria
                    <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {propertyToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-sm w-full p-6 space-y-4">
            <h4 className="font-bold text-slate-900 text-base">Deseja excluir este imóvel?</h4>
            <p className="text-slate-500 text-sm leading-relaxed">
              Esta ação é irreversível e removerá o cadastro do imóvel. Vistorias já concluídas ou em andamento não serão removidas automaticamente, mas perderão a referência visual.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPropertyToDelete(null)}
                className="text-slate-600 hover:bg-slate-100 font-semibold text-xs px-3.5 py-2 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDelete(propertyToDelete)}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs px-4 py-2.5 rounded-lg cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
