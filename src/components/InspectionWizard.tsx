import React, { useState, useEffect, useRef } from 'react';
import { db, auth, OperationType, handleFirestoreError } from '../firebase';
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where 
} from 'firebase/firestore';
import { Property, Inspection, Room, Photo, AiAnalysis, ReviewedStatus, Entitlement } from '../types';
import { safeCreateAuditEvent } from '../lib/auditEvents';
import { 
  ArrowLeft, 
  UploadCloud, 
  Sparkles, 
  Check, 
  Edit3, 
  Trash2, 
  ChevronRight, 
  Camera, 
  Info, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Save, 
  Plus, 
  HelpCircle 
} from 'lucide-react';
import { getPhotoLimitForEntitlement } from '../lib/entitlements';
import { getRemainingPhotoSlots, canAddPhotoBatch } from '../lib/photoRules';
import { APP_VERSION } from '../lib/appVersion';
import { formatQaGateIssues, validateInspectionCompletionGate } from '../lib/qaGates';

interface InspectionWizardProps {
  property: Property;
  inspection: Inspection | null; // null if creating
  onBack: () => void;
  onInspectionCreated: (inspection: Inspection) => void;
  onProceedToReport: (inspection: Inspection) => void;
  entitlement?: Entitlement | null;
}

const DEFAULT_ROOMS = [
  'Sala',
  'Quarto 1',
  'Quarto 2',
  'Banheiro',
  'Cozinha',
  'Área de Serviço',
  'Varanda',
  'Garagem',
  'Outros'
];

export default function InspectionWizard({ 
  property, 
  inspection, 
  onBack, 
  onInspectionCreated,
  onProceedToReport,
  entitlement
}: InspectionWizardProps) {
  
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(inspection);
  const [inspectionType, setInspectionType] = useState<'entrada' | 'saida'>('entrada');
  
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  
  // Room modification states
  const [newRoomName, setNewRoomName] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomName, setEditingRoomName] = useState('');

  // Loading & uploading states
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzingPhotoId, setAnalyzingPhotoId] = useState<string | null>(null);
  const [retryingPhotoId, setRetryingPhotoId] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [roomFeedbackMessage, setRoomFeedbackMessage] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  // Refs for camera and gallery file inputs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Manual Photo Edit state
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editCondition, setEditCondition] = useState<'OK' | 'Atenção' | 'Problema'>('OK');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    if (activeInspection) {
      fetchRoomsAndPhotos(activeInspection.id);
    }
  }, [activeInspection]);

  const fetchRoomsAndPhotos = async (inspectionId: string) => {
    setLoading(true);
    try {
      // Fetch Rooms
      const roomsRef = collection(db, 'inspections', inspectionId, 'rooms');
      const roomsSnap = await getDocs(roomsRef);
      
      let roomsList: Room[] = [];
      roomsSnap.forEach(doc => {
        roomsList.push({ id: doc.id, ...doc.data() } as Room);
      });
      roomsList.sort((a, b) => a.order - b.order);

      // If no rooms exist, create default ones once and save to Firestore
      if (roomsList.length === 0 && auth.currentUser) {
        const batchPromises = DEFAULT_ROOMS.map((name, index) => {
          const roomId = doc(collection(db, 'inspections', inspectionId, 'rooms')).id;
          const roomDoc: Room = {
            id: roomId,
            inspectionId,
            userId: auth.currentUser!.uid,
            name,
            order: index,
            isDefault: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          return setDoc(doc(db, 'inspections', inspectionId, 'rooms', roomId), roomDoc).then(() => roomDoc);
        });
        roomsList = await Promise.all(batchPromises);
      }

      setRooms(roomsList);

      // Fetch Photos
      const photosRef = collection(db, 'inspections', inspectionId, 'photos');
      const photosSnap = await getDocs(photosRef);

      const photosList: Photo[] = [];
      photosSnap.forEach(doc => {
        photosList.push({ id: doc.id, ...doc.data() } as Photo);
      });
      photosList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setPhotos(photosList);

      // Keep selectedRoom state coherent
      if (roomsList.length > 0) {
        if (!selectedRoom) {
          setSelectedRoom(roomsList[0]);
        } else {
          const exists = roomsList.find(r => r.id === selectedRoom.id);
          if (!exists) {
            setSelectedRoom(roomsList[0]);
          } else {
            setSelectedRoom(exists);
          }
        }
      } else {
        setSelectedRoom(null);
      }
    } catch (error) {
      console.error('Error fetching room/photos data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Create the Inspection Object
  const handleCreateInspection = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const inspectionId = doc(collection(db, 'inspections')).id;
      const newInspection: Inspection = {
        id: inspectionId,
        userId: auth.currentUser.uid,
        propertyId: property.id,
        inspectionType,
        status: 'em_andamento',
        startedAt: new Date().toISOString(),
        appVersion: 'V0.4.0-rc2'
      };

      // Set Inspection Doc
      await setDoc(doc(db, 'inspections', inspectionId), newInspection).catch(err => 
        handleFirestoreError(err, OperationType.CREATE, `inspections/${inspectionId}`)
      );

      // Create initial rooms in the subcollection
      const batchPromises = DEFAULT_ROOMS.map((name, index) => {
        const roomId = doc(collection(db, 'inspections', inspectionId, 'rooms')).id;
        const roomDoc: Room = { 
          id: roomId, 
          inspectionId,
          userId: auth.currentUser!.uid,
          name, 
          order: index,
          isDefault: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        return setDoc(doc(db, 'inspections', inspectionId, 'rooms', roomId), roomDoc);
      });
      await Promise.all(batchPromises);

      // Record Event
      await safeCreateAuditEvent(auth.currentUser.uid, 'inspection_create', { propertyId: property.id, inspectionType, inspectionId });

      setActiveInspection(newInspection);
      onInspectionCreated(newInspection);
    } catch (error) {
      console.error('Error creating inspection:', error);
      alert('Falha ao criar vistoria.');
    } finally {
      setLoading(false);
    }
  };

  // Add Room
  const handleAddRoom = async () => {
    if (!activeInspection || !newRoomName.trim() || !auth.currentUser) return;
    setRoomError(null);
    setRoomFeedbackMessage('Salvando cômodo...');
    try {
      const roomId = doc(collection(db, 'inspections', activeInspection.id, 'rooms')).id;
      const roomDoc: Room = { 
        id: roomId, 
        inspectionId: activeInspection.id,
        userId: auth.currentUser.uid,
        name: newRoomName.trim(), 
        order: rooms.length > 0 ? Math.max(...rooms.map(room => room.order ?? 0)) + 1 : 0,
        isDefault: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'inspections', activeInspection.id, 'rooms', roomId), roomDoc).catch(err => 
        handleFirestoreError(err, OperationType.CREATE, `inspections/${activeInspection.id}/rooms/${roomId}`)
      );

      setNewRoomName('');
      await fetchRoomsAndPhotos(activeInspection.id);
    } catch (error) {
      console.error('Error adding room:', error);
      setRoomError('Não foi possível salvar o cômodo. Tente novamente.');
    } finally {
      setRoomFeedbackMessage(null);
    }
  };

  // Rename Room
  const handleRenameRoom = async () => {
    if (!activeInspection || !editingRoomId || !editingRoomName.trim() || !auth.currentUser) return;
    setRoomError(null);
    setRoomFeedbackMessage('Atualizando cômodo...');
    try {
      const roomRef = doc(db, 'inspections', activeInspection.id, 'rooms', editingRoomId);
      await updateDoc(roomRef, { 
        name: editingRoomName.trim(),
        updatedAt: new Date().toISOString()
      }).catch(err => 
        handleFirestoreError(err, OperationType.UPDATE, `inspections/${activeInspection.id}/rooms/${editingRoomId}`)
      );

      // Maintain selectedRoom coherence if this is the one being renamed
      if (selectedRoom?.id === editingRoomId) {
        setSelectedRoom(prev => prev ? { ...prev, name: editingRoomName.trim(), updatedAt: new Date().toISOString() } : null);
      }

      setEditingRoomId(null);
      setEditingRoomName('');
      await fetchRoomsAndPhotos(activeInspection.id);
    } catch (error) {
      console.error('Error renaming room:', error);
      setRoomError('Não foi possível salvar o cômodo. Tente novamente.');
    } finally {
      setRoomFeedbackMessage(null);
    }
  };

  // Delete Room
  const handleDeleteRoom = async (roomId: string) => {
    if (!activeInspection) return;
    setRoomError(null);
    const roomPhotos = photos.filter(p => p.roomId === roomId);
    if (roomPhotos.length > 0) {
      alert('Este cômodo possui fotos. Remova as fotos antes de excluir o cômodo.');
      return;
    }

    try {
      await deleteDoc(doc(db, 'inspections', activeInspection.id, 'rooms', roomId)).catch(err => 
        handleFirestoreError(err, OperationType.DELETE, `inspections/${activeInspection.id}/rooms/${roomId}`)
      );

      const remainingRooms = rooms.filter(r => r.id !== roomId);
      if (selectedRoom?.id === roomId) {
        setSelectedRoom(remainingRooms.length > 0 ? remainingRooms[0] : null);
      }
      setRooms(remainingRooms); // immediate update
      
      await fetchRoomsAndPhotos(activeInspection.id);
    } catch (error) {
      console.error('Error deleting room:', error);
      setRoomError('Não foi possível excluir o cômodo. Tente novamente.');
    }
  };

  // Compress Image client side
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1000;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Highly compressed JPG
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.65);
          resolve(compressedBase64);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Resilient parse of the AI Analysis response
  const parseAndValidateAiAnalysis = (result: any): AiAnalysis => {
    if (!result || typeof result !== 'object') {
      throw new Error('Retorno da IA não é um objeto válido.');
    }
    const item_observado = typeof result.item_observado === 'string' && result.item_observado.trim() !== ''
      ? result.item_observado
      : 'Item observado';
    
    let condicao_sugerida: 'OK' | 'Atenção' | 'Problema' = 'OK';
    if (['OK', 'Atenção', 'Problema'].includes(result.condicao_sugerida)) {
      condicao_sugerida = result.condicao_sugerida;
    } else if (result.condicao_sugerida === 'atencao' || result.condicao_sugerida === 'Ateção' || result.condicao_sugerida === 'atencão' || result.condicao_sugerida === 'Atenção') {
      condicao_sugerida = 'Atenção';
    } else if (result.condicao_sugerida === 'problema' || result.condicao_sugerida === 'Falha') {
      condicao_sugerida = 'Problema';
    }
    
    const descricao_neutra = typeof result.descricao_neutra === 'string' && result.descricao_neutra.trim() !== ''
      ? result.descricao_neutra
      : 'Análise realizada com sucesso.';
    
    let pontos_de_atencao: string[] = [];
    if (Array.isArray(result.pontos_de_atencao)) {
      pontos_de_atencao = result.pontos_de_atencao.map((p: any) => String(p));
    }
    
    let confianca: 'baixa' | 'média' | 'alta' = 'média';
    if (['baixa', 'média', 'alta'].includes(result.confianca)) {
      confianca = result.confianca;
    }

    return {
      item_observado,
      condicao_sugerida,
      descricao_neutra,
      pontos_de_atencao,
      confianca
    };
  };

  // Handle multiple Image uploads & Analysis in a loop
  const handlePhotoFiles = async (files: File[]) => {
    console.log("Arquivos recebidos:", files.length);
    if (!activeInspection || !selectedRoom || !auth.currentUser) return;

    setUploadError(null);

    // Filter only images
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setUploadError("Nenhum arquivo de imagem válido foi selecionado.");
      return;
    }

    // Limit calculation
    const photoLimit = getPhotoLimitForEntitlement(entitlement);
    const remainingSlots = getRemainingPhotoSlots(photos.length, photoLimit);
    if (remainingSlots <= 0) {
      const msg = `Limite da ${APP_VERSION} atingido: Máximo de ${photoLimit} fotos por vistoria para controle de custos.`;
      setUploadError(msg);
      alert(msg);
      return;
    }

    if (!canAddPhotoBatch(photos.length, imageFiles.length, photoLimit)) {
      const msg = `Você selecionou ${imageFiles.length} fotos, mas o limite restante é de ${remainingSlots} fotos. O lote foi bloqueado para evitar exceder o limite de ${photoLimit} fotos.`;
      setUploadError(msg);
      alert(msg);
      return;
    }

    setUploading(true);

    try {
      let currentIdx = 0;
      for (const file of imageFiles) {
        currentIdx++;
        setProcessingMessage(`Processando foto ${currentIdx} de ${imageFiles.length}...`);

        // 1. Compress Image client side
        let compressedBase64 = '';
        try {
          compressedBase64 = await compressImage(file);
        } catch (compressErr) {
          console.error('Erro ao comprimir imagem:', compressErr);
          setUploadError(`Erro ao comprimir a foto ${currentIdx}.`);
          continue; // Try next image
        }

        // Create new photo item
        const photoId = doc(collection(db, 'inspections', activeInspection.id, 'photos')).id;

        const roomNameVal = selectedRoom.name;
        const defaultCaption = `Foto registrada na ${roomNameVal}`;

        const newPhoto: Photo = {
          id: photoId,
          inspectionId: activeInspection.id,
          roomId: selectedRoom.id,
          roomName: roomNameVal,
          userId: auth.currentUser.uid,
          url: compressedBase64,
          imageUrl: compressedBase64,
          storagePath: `inspections/${activeInspection.id}/photos/${photoId}`,
          caption: defaultCaption,
          displayTitle: defaultCaption,
          description: 'Aguardando processamento de análise de IA...',
          reviewedStatus: 'pendente',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          uploadStatus: 'uploaded',
          analysisStatus: 'pending',
          reviewStatus: 'pending',
          fallbackApplied: false
        };

        // 2. Save compressed photo metadata to Firestore
        try {
          await setDoc(doc(db, 'inspections', activeInspection.id, 'photos', photoId), newPhoto);
          
          // Update state immediately so the photo appears in the UI
          setPhotos(prev => [...prev, newPhoto]);
        } catch (err: any) {
          console.error('Erro ao salvar foto no Storage/Firestore:', err);
          const errStr = String(err);
          if (errStr.toLowerCase().includes('permission') || errStr.toLowerCase().includes('insufficient')) {
            setUploadError('Erro ao salvar foto no Storage. Verifique permissões de armazenamento.');
          } else {
            setUploadError(`Erro ao salvar foto no banco de dados: ${err.message || errStr}`);
          }
          continue; // Keep processing next files in the batch
        }

        // 3. Trigger IA analysis on server side
        setAnalyzingPhotoId(photoId);

        // Log event (doesn't block)
        await safeCreateAuditEvent(auth.currentUser?.uid || 'unknown', 'ai_analysis_request', { photoId, roomName: roomNameVal, inspectionId: activeInspection.id });

        try {
          const response = await fetch('/api/analyze-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              imageBase64: compressedBase64,
              roomName: roomNameVal
            })
          });

          if (!response.ok) {
            throw new Error('Falha na resposta do servidor para análise de IA.');
          }

          const rawResult = await response.json();
          const aiResult = parseAndValidateAiAnalysis(rawResult);

          const updateData: Partial<Photo> = {
            aiAnalysis: aiResult,
            caption: `${aiResult.item_observado} - ${aiResult.descricao_neutra}`,
            displayTitle: `${aiResult.item_observado} - ${aiResult.descricao_neutra}`,
            description: aiResult.descricao_neutra,
            updatedAt: new Date().toISOString(),
            analysisStatus: 'completed',
            conditionSuggested: aiResult.condicao_sugerida,
            itemObserved: aiResult.item_observado,
            descriptionSuggested: aiResult.descricao_neutra,
            fallbackApplied: false
          };

          await updateDoc(doc(db, 'inspections', activeInspection.id, 'photos', photoId), updateData);

          // Record successful AI event (doesn't block)
          await safeCreateAuditEvent(auth.currentUser?.uid || 'unknown', 'ai_analysis', { photoId, roomName: roomNameVal, inspectionId: activeInspection.id });

          // Trigger local state sync for this specific photo in our photos list
          setPhotos(prev => prev.map(p => p.id === photoId ? {
            ...p,
            ...updateData
          } : p));

        } catch (error: any) {
          console.error(`Erro ao analisar a foto ${photoId}:`, error);
          setUploadError('Algumas fotos foram salvas, mas a análise automática falhou em parte delas. Você pode revisar manualmente ou tentar novamente.');

          const fallbackUpdate: Partial<Photo> = {
            caption: defaultCaption,
            displayTitle: defaultCaption,
            description: 'A foto foi salva com sucesso, mas a análise automática não pôde ser concluída. Revise manualmente a imagem ou tente gerar a sugestão novamente.',
            updatedAt: new Date().toISOString(),
            analysisStatus: 'failed',
            fallbackApplied: true,
            analysisError: error?.message || String(error),
            conditionSuggested: undefined,
            itemObserved: defaultCaption,
            descriptionSuggested: 'A foto foi salva com sucesso, mas a análise automática não pôde ser concluída. Revise manualmente a imagem ou tente gerar a sugestão novamente.'
          };

          try {
            await updateDoc(doc(db, 'inspections', activeInspection.id, 'photos', photoId), fallbackUpdate);
          } catch (writeErr) {
            console.error('Falha ao gravar dados de fallback da foto:', writeErr);
          }

          setPhotos(prev => prev.map(p => p.id === photoId ? {
            ...p,
            ...fallbackUpdate
          } : p));
        } finally {
          setAnalyzingPhotoId(null);
        }
      }

      // Fetch fresh list to make sure everything matches perfectly
      fetchRoomsAndPhotos(activeInspection.id);

    } catch (error) {
      console.error('Error in batch photo upload/analysis:', error);
      setUploadError('Ocorreu um erro ao processar o lote de fotos.');
    } finally {
      setUploading(false);
      setProcessingMessage(null);
      setAnalyzingPhotoId(null);
    }
  };

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;

    if (!selectedFiles || selectedFiles.length === 0) {
      setProcessingMessage("Nenhuma foto foi capturada.");
      return;
    }

    const filesArray = Array.from(selectedFiles);

    setProcessingMessage("Foto capturada. Iniciando processamento...");

    await handlePhotoFiles(filesArray);

    e.target.value = "";
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;

    if (!selectedFiles || selectedFiles.length === 0) {
      setProcessingMessage("Nenhuma foto foi selecionada.");
      return;
    }

    const filesArray = Array.from(selectedFiles);

    setProcessingMessage(`${filesArray.length} foto(s) selecionada(s). Iniciando processamento...`);

    await handlePhotoFiles(filesArray);

    e.target.value = "";
  };

  // Open Edit Mode for Photo
  const handleStartEditPhoto = (photo: Photo) => {
    setEditingPhotoId(photo.id);
    setEditCaption(photo.caption);
    setEditCondition(photo.aiAnalysis?.condicao_sugerida || 'OK');
    setEditDescription(photo.aiAnalysis?.descricao_neutra || '');
  };

  // Save manual Photo edits
  const handleSavePhotoEdit = async (photoId: string) => {
    if (!activeInspection) return;
    try {
      const photoRef = doc(db, 'inspections', activeInspection.id, 'photos', photoId);
      
      const photo = photos.find(p => p.id === photoId);
      if (!photo) return;

      const roomNameVal = selectedRoom?.name || photo.roomName || 'Cômodo não especificado';
      const displayTitleVal = editCaption.trim() || photo.caption || `Foto registrada na ${roomNameVal}`;
      const descriptionVal = editDescription.trim() || 'Descrição manual.';

      const originalAi = photo.aiAnalysis;

      const updatedAnalysis: AiAnalysis = {
        item_observado: originalAi?.item_observado || photo.itemObserved || 'Item Manual',
        condicao_sugerida: editCondition,
        descricao_neutra: descriptionVal,
        pontos_de_atencao: originalAi?.pontos_de_atencao || [],
        confianca: originalAi?.confianca || 'alta'
      };

      const editData: Partial<Photo> = {
        caption: displayTitleVal,
        displayTitle: displayTitleVal,
        description: descriptionVal,
        aiAnalysis: updatedAnalysis,
        reviewedStatus: 'editated',
        reviewStatus: 'edited',
        roomName: roomNameVal,
        updatedAt: new Date().toISOString(),
        itemObserved: originalAi?.item_observado || photo.itemObserved || 'Item Manual',
        conditionSuggested: editCondition,
        descriptionSuggested: descriptionVal,
        fallbackApplied: photo.fallbackApplied || false
      };

      await updateDoc(photoRef, editData as any).catch(err => 
        handleFirestoreError(err, OperationType.UPDATE, `inspections/${activeInspection.id}/photos/${photoId}`)
      );

      setEditingPhotoId(null);
      fetchRoomsAndPhotos(activeInspection.id);
    } catch (error) {
      console.error('Error saving photo edits:', error);
    }
  };

  // Approve AI suggestion directly
  const handleApprovePhotoAi = async (photoId: string) => {
    if (!activeInspection) return;
    try {
      const photo = photos.find(p => p.id === photoId);
      if (!photo) return;

      const roomNameVal = selectedRoom?.name || photo.roomName || 'Cômodo não especificado';
      const displayTitleVal = photo.displayTitle || photo.caption || `Foto registrada na ${roomNameVal}`;
      const descriptionVal = photo.description || photo.aiAnalysis?.descricao_neutra || 'Descrição confirmada.';

      const photoRef = doc(db, 'inspections', activeInspection.id, 'photos', photoId);
      await updateDoc(photoRef, {
        reviewedStatus: 'confirmado',
        reviewStatus: 'confirmed',
        roomName: roomNameVal,
        displayTitle: displayTitleVal,
        description: descriptionVal,
        updatedAt: new Date().toISOString()
      }).catch(err => 
        handleFirestoreError(err, OperationType.UPDATE, `inspections/${activeInspection.id}/photos/${photoId}`)
      );

      fetchRoomsAndPhotos(activeInspection.id);
    } catch (error) {
      console.error('Error approving AI analysis:', error);
    }
  };

  // Retry AI Analysis for a photo
  const handleRetryAnalysis = async (photo: Photo) => {
    if (!activeInspection) return;
    const retryRoomName = rooms.find(room => room.id === photo.roomId)?.name || photo.roomName || selectedRoom?.name || 'Cômodo não especificado';
    setRetryingPhotoId(photo.id);
    setUploadError(null);
    try {
      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imageBase64: photo.url,
          roomName: retryRoomName
        })
      });

      if (!response.ok) {
        throw new Error('Falha na resposta do servidor para análise de IA.');
      }

      const rawResult = await response.json();
      const aiResult = parseAndValidateAiAnalysis(rawResult);

      const updateData: Partial<Photo> = {
        aiAnalysis: aiResult,
        caption: `${aiResult.item_observado} - ${aiResult.descricao_neutra}`,
        displayTitle: `${aiResult.item_observado} - ${aiResult.descricao_neutra}`,
        description: aiResult.descricao_neutra,
        updatedAt: new Date().toISOString(),
        analysisStatus: 'completed',
        conditionSuggested: aiResult.condicao_sugerida,
        itemObserved: aiResult.item_observado,
        descriptionSuggested: aiResult.descricao_neutra,
        fallbackApplied: false,
        analysisError: undefined
      };

      await updateDoc(doc(db, 'inspections', activeInspection.id, 'photos', photo.id), updateData);

      // Record successful AI event (doesn't block)
      await safeCreateAuditEvent(auth.currentUser?.uid || 'unknown', 'ai_analysis_retry', { photoId: photo.id, roomName: retryRoomName, inspectionId: activeInspection.id });

      setPhotos(prev => prev.map(p => p.id === photo.id ? {
        ...p,
        ...updateData
      } : p));

    } catch (error: any) {
      console.error(`Erro ao analisar novamente a foto ${photo.id}:`, error);
      setUploadError('Falha ao gerar sugestão novamente. Verifique a conexão ou tente outra imagem.');
      
      const fallbackUpdate: Partial<Photo> = {
        analysisStatus: 'failed',
        fallbackApplied: true,
        analysisError: error?.message || String(error)
      };

      try {
        await updateDoc(doc(db, 'inspections', activeInspection.id, 'photos', photo.id), fallbackUpdate);
      } catch (e) {}

      setPhotos(prev => prev.map(p => p.id === photo.id ? {
        ...p,
        ...fallbackUpdate
      } : p));
    } finally {
      setRetryingPhotoId(null);
    }
  };

  // Delete Photo
  const handleDeletePhoto = async (photoId: string) => {
    if (!activeInspection) return;
    try {
      await deleteDoc(doc(db, 'inspections', activeInspection.id, 'photos', photoId)).catch(err => 
        handleFirestoreError(err, OperationType.DELETE, `inspections/${activeInspection.id}/photos/${photoId}`)
      );

      fetchRoomsAndPhotos(activeInspection.id);
    } catch (error) {
      console.error('Error deleting photo:', error);
    }
  };

  const handleFinishInspection = async () => {
    if (!activeInspection) return;
    const completionGate = validateInspectionCompletionGate({
      inspection: activeInspection,
      property,
      rooms,
      photos,
      photoLimit: getPhotoLimitForEntitlement(entitlement),
      userId: auth.currentUser?.uid,
    });

    if (!completionGate.passed) {
      alert(`ImpossÃ­vel concluir a vistoria:\n\n${formatQaGateIssues(completionGate)}`);
      return;
    }

    try {
      const inspectionRef = doc(db, 'inspections', activeInspection.id);
      await updateDoc(inspectionRef, {
        status: 'concluida',
        completedAt: new Date().toISOString()
      }).catch(err => 
        handleFirestoreError(err, OperationType.UPDATE, `inspections/${activeInspection.id}`)
      );

      onProceedToReport({
        ...activeInspection,
        status: 'concluida',
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error completing inspection:', error);
    }
  };

  // Get photos for current room
  const currentRoomPhotos = selectedRoom ? photos.filter(p => p.roomId === selectedRoom.id) : [];

  // Initial State: Prompt for inspection type
  if (!activeInspection) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm max-w-md mx-auto overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <button 
            type="button"
            aria-label="Voltar para histórico"
            onClick={onBack} 
            className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Iniciar Nova Vistoria</h3>
            <p className="text-[10px] text-slate-500">{property.nickname}</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600">Selecione o tipo de vistoria:</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setInspectionType('entrada')}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all cursor-pointer ${
                  inspectionType === 'entrada'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold ring-2 ring-indigo-500/25'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <span className="text-sm">Vistoria de Entrada</span>
                <span className="text-[10px] opacity-75 font-normal mt-1">Ao receber as chaves</span>
              </button>

              <button
                type="button"
                onClick={() => setInspectionType('saida')}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all cursor-pointer ${
                  inspectionType === 'saida'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold ring-2 ring-indigo-500/25'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <span className="text-sm">Vistoria de Saída</span>
                <span className="text-[10px] opacity-75 font-normal mt-1">Ao entregar o imóvel</span>
              </button>
            </div>
          </div>

          <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-100 text-xs text-amber-800 leading-relaxed space-y-2">
            <p className="font-semibold flex items-center gap-1.5">
              <Info className="w-4 h-4" /> Importante (V0.4.0-rc2)
            </p>
            <p>
              Ao iniciar, configuraremos uma checklist inicial com {DEFAULT_ROOMS.length} cômodos clássicos para você registrar fotos e analisar as condições de paredes, pisos, mobílias e instalações de forma rápida e segura.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCreateInspection}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold text-sm py-3 rounded-xl shadow-md transition-all active:scale-98 cursor-pointer h-11 flex items-center justify-center"
          >
            {loading ? 'Preparando vistoria...' : 'Começar Vistoria'}
          </button>
        </div>
      </div>
    );
  }

  // Active Wizard state
  return (
    <div className="space-y-6">
      
      {/* Top sticky navigation status */}
      <div className="bg-white border border-slate-100 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            type="button"
            aria-label="Voltar para histórico"
            onClick={onBack} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800 leading-none">
                Vistoria de {activeInspection.inspectionType === 'entrada' ? 'Entrada' : 'Saída'}
              </h2>
              <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 uppercase tracking-wide">
                Em Andamento
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Imóvel: {property.nickname}</p>
          </div>
        </div>

        {/* Cost Control Tracker */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Mídia total</span>
            <span className="text-sm font-bold text-slate-800">
              {photos.length} <span className="text-xs text-slate-400 font-medium">/ {getPhotoLimitForEntitlement(entitlement)} fotos</span>
            </span>
          </div>

          <button
            type="button"
            onClick={handleFinishInspection}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-98 cursor-pointer h-10 flex items-center justify-center"
          >
            Concluir & Revisar
            <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Left Side: Room Navigation Checklist */}
        <div className="lg:col-span-1 bg-white border border-slate-100 rounded-2xl shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Cômodos</h3>
            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">
              {rooms.length}
            </span>
          </div>

          {roomFeedbackMessage && (
            <div className="text-[11px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-1.5 rounded-lg animate-pulse">
              {roomFeedbackMessage}
            </div>
          )}
          {roomError && (
            <div className="text-[11px] bg-rose-50 border border-rose-100 text-rose-700 px-2.5 py-1.5 rounded-lg">
              {roomError}
            </div>
          )}

          {/* Room checklist buttons */}
          <div className="space-y-1 max-h-[280px] lg:max-h-[380px] overflow-y-auto pr-1">
            {rooms.map((room) => {
              const count = photos.filter(p => p.roomId === room.id).length;
              return (
                <div key={room.id} className="group flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRoom(room);
                      setEditingRoomId(null);
                    }}
                    className={`flex-1 text-left text-xs px-3 py-2.5 rounded-xl transition-all flex items-center justify-between cursor-pointer ${
                      selectedRoom?.id === room.id
                        ? 'bg-indigo-50 text-indigo-700 font-semibold border-l-4 border-indigo-600'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="truncate">{room.name}</span>
                    {count > 0 && (
                      <span className="text-[10px] font-bold bg-slate-200 text-slate-700 rounded-full w-5 h-5 flex items-center justify-center">
                        {count}
                      </span>
                    )}
                  </button>

                  {/* Room Quick Actions (Inline renaming & deleting) */}
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRoomId(room.id);
                        setEditingRoomName(room.name);
                      }}
                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded"
                      title="Renomear"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRoom(room.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-50 rounded"
                      title="Excluir"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add / Rename Room Forms */}
          <div className="border-t border-slate-100 pt-3 space-y-2">
            {editingRoomId ? (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editingRoomName.trim()) {
                    handleRenameRoom();
                  }
                }}
                className="space-y-2"
              >
                <input
                  type="text"
                  placeholder="Novo nome do cômodo"
                  value={editingRoomName}
                  onChange={(e) => setEditingRoomName(e.target.value)}
                  className="w-full text-xs border border-slate-200 focus:border-indigo-500 rounded-lg px-2.5 py-2 outline-none"
                />
                <div className="flex gap-1">
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 text-white text-[10px] font-bold py-1.5 rounded-lg hover:bg-indigo-700 cursor-pointer"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingRoomId(null)}
                    className="flex-1 bg-slate-100 text-slate-600 text-[10px] font-bold py-1.5 rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newRoomName.trim()) {
                    handleAddRoom();
                  }
                }}
                className="flex gap-1.5 w-full"
              >
                <input
                  type="text"
                  placeholder="Novo cômodo..."
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 focus:border-indigo-500 rounded-lg px-2.5 py-2 outline-none min-w-0"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 shrink-0 cursor-pointer"
                  title="Adicionar cômodo"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right Side: Photos Upload and AI analysis block for selected room */}
        <div className="lg:col-span-3 space-y-6">
          
          {selectedRoom ? (
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              {/* Header of Room Detail */}
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h3 className="font-sans font-bold text-slate-800 text-sm">Registro de Fotos: {selectedRoom.name}</h3>
                  <p className="text-[11px] text-slate-500">Insira imagens representativas deste cômodo.</p>
                </div>

                {/* Hidden File Inputs */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCameraCapture}
                  className="hidden"
                  disabled={photos.length >= getPhotoLimitForEntitlement(entitlement) || uploading}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleGalleryUpload}
                  className="hidden"
                  disabled={photos.length >= getPhotoLimitForEntitlement(entitlement) || uploading}
                />

                {/* Upload Trigger Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={photos.length >= getPhotoLimitForEntitlement(entitlement) || uploading}
                    className={`flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-all active:scale-98 cursor-pointer h-9 ${
                      photos.length >= getPhotoLimitForEntitlement(entitlement) || uploading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    {uploading ? 'Processando...' : 'Tirar Foto'}
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={photos.length >= getPhotoLimitForEntitlement(entitlement) || uploading}
                    className={`flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-all active:scale-98 cursor-pointer h-9 ${
                      photos.length >= getPhotoLimitForEntitlement(entitlement) || uploading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
                    }`}
                  >
                    <UploadCloud className="w-4 h-4" />
                    {uploading ? 'Processando...' : 'Escolher da Galeria'}
                  </button>
                </div>
              </div>

              {/* Photos Panel */}
              <div className="p-6">
                {processingMessage && (
                  <div className="mb-6 bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-pulse">
                    <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 animate-spin" />
                    <span>{processingMessage}</span>
                  </div>
                )}
                {uploadError && (
                  <div className="mb-6 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}
                
                {currentRoomPhotos.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center text-center">
                    <div className="bg-slate-50 text-slate-400 p-3 rounded-full mb-3">
                      <Camera className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold text-slate-700 text-sm mb-1">Nenhuma foto enviada neste cômodo</h4>
                    <p className="text-slate-500 text-xs max-w-md mb-6 leading-relaxed">
                      Durante a vistoria, tire fotos pelo celular ou selecione várias imagens já existentes. Cada foto será analisada individualmente pela IA e ficará vinculada ao cômodo selecionado.
                    </p>
                    {photos.length < getPhotoLimitForEntitlement(entitlement) && (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          disabled={uploading}
                          className={`bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                            uploading ? 'pointer-events-none' : ''
                          }`}
                        >
                          <Camera className="w-4 h-4" />
                          {uploading ? 'Processando...' : 'Tirar Foto'}
                        </button>
                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          disabled={uploading}
                          className={`bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-indigo-700 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                            uploading ? 'pointer-events-none' : ''
                          }`}
                        >
                          <UploadCloud className="w-4 h-4" />
                          {uploading ? 'Processando...' : 'Escolher da Galeria'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {currentRoomPhotos.map((photo) => {
                      const isPhotoAnalyzing = analyzingPhotoId === photo.id || retryingPhotoId === photo.id;
                      const isPhotoEditing = editingPhotoId === photo.id;

                      const roomName = selectedRoom?.name || photo.roomName || 'Cômodo';
                      
                      // Avoid concatenating undefined or blank fields, implement fallback
                      let safeTitle = photo.displayTitle || photo.caption || `Foto registrada na ${roomName}`;
                      if (!safeTitle || safeTitle.trim() === '' || safeTitle.includes('undefined')) {
                        safeTitle = `Foto registrada na ${roomName}`;
                      }

                      let safeDescription = photo.description || photo.aiAnalysis?.descricao_neutra || '';
                      if ((!safeDescription || safeDescription.trim() === '') && (photo.fallbackApplied || photo.analysisStatus === 'failed')) {
                        safeDescription = 'A foto foi salva com sucesso, mas a análise automática não pôde ser concluída. Revise manualmente a imagem ou tente gerar a sugestão novamente.';
                      } else if (!safeDescription || safeDescription.trim() === '') {
                        safeDescription = 'Aguardando processamento de análise de IA...';
                      }

                      // Check status layers
                      const uploadStatus = photo.uploadStatus || 'uploaded';
                      const analysisStatus = photo.analysisStatus || (photo.aiAnalysis ? 'completed' : 'failed');
                      const reviewStatus = photo.reviewStatus || (photo.reviewedStatus === 'editated' ? 'edited' : photo.reviewedStatus === 'confirmado' ? 'confirmed' : 'pending');

                      return (
                        <div 
                          key={photo.id} 
                          className="bg-slate-50 rounded-xl border border-slate-100 p-4 grid grid-cols-1 md:grid-cols-4 gap-4"
                        >
                          {/* Left: Image thumbnail */}
                          <div className="md:col-span-1 flex flex-col items-center justify-center relative">
                            <img 
                              src={photo.url} 
                              alt={safeTitle} 
                              className="w-full max-h-[140px] rounded-lg object-cover border border-slate-200 shadow-xs"
                            />
                            {photo.reviewedStatus === 'confirmado' && (
                              <span className="absolute top-1.5 right-1.5 bg-emerald-500 text-white p-1 rounded-full shadow-sm">
                                <Check className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>

                          {/* Right: metadata & IA analysis */}
                          <div className="md:col-span-3 space-y-3 flex flex-col justify-between">
                            
                            {/* Photo Header info */}
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className={`inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded mr-1.5 ${
                                  photo.reviewedStatus === 'pendente' 
                                    ? 'bg-amber-100 text-amber-800' 
                                    : photo.reviewedStatus === 'editated'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {photo.reviewedStatus === 'pendente' ? 'Revisão Pendente' : photo.reviewedStatus === 'editated' ? 'Editado' : 'Confirmado'}
                                </span>
                              </div>
                              
                              {/* Remove / edit buttons */}
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleStartEditPhoto(photo)}
                                  className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                                  title="Editar descrição manual"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeletePhoto(photo.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                  title="Excluir foto"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Main edit form OR viewer content */}
                            {isPhotoEditing ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  handleSavePhotoEdit(photo.id);
                                }}
                                className="space-y-3 bg-white p-3.5 rounded-lg border border-slate-100 shadow-xs"
                              >
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Título/Legenda da Foto</label>
                                  <input
                                    type="text"
                                    value={editCaption}
                                    onChange={(e) => setEditCaption(e.target.value)}
                                    className="w-full text-xs border border-slate-200 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 outline-none"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Condição Física</label>
                                    <select
                                      value={editCondition}
                                      onChange={(e) => setEditCondition(e.target.value as any)}
                                      className="w-full text-xs border border-slate-200 focus:border-indigo-500 rounded-lg px-2 py-1.5 outline-none h-[30px]"
                                    >
                                      <option value="OK">OK</option>
                                      <option value="Atenção">Atenção</option>
                                      <option value="Problema">Problema</option>
                                    </select>
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Descrição Neutra</label>
                                  <textarea
                                    rows={2}
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    className="w-full text-xs border border-slate-200 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 outline-none resize-none"
                                  />
                                </div>

                                <div className="flex items-center justify-end gap-1.5 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingPhotoId(null)}
                                    className="text-[10px] text-slate-500 hover:bg-slate-50 px-2.5 py-1.5 rounded-md font-semibold cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="submit"
                                    className="bg-indigo-600 text-white text-[10px] font-semibold px-3 py-1.5 rounded-md shadow-xs cursor-pointer"
                                  >
                                    Salvar Alterações
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <div className="space-y-2">
                                {/* Photo caption */}
                                <h4 className="text-xs font-semibold text-slate-800">
                                  {safeTitle}
                                </h4>

                                {/* IA analysis panel */}
                                {isPhotoAnalyzing ? (
                                  <div className="flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs px-3 py-2 rounded-lg border border-indigo-100 animate-pulse">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>Gemini IA analisando a imagem visualmente...</span>
                                  </div>
                                ) : (analysisStatus === 'completed' && photo.aiAnalysis) ? (
                                  <div className="bg-white border border-slate-150 rounded-xl p-3 space-y-2 text-xs">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                        <Sparkles className="w-3 h-3 text-indigo-600" /> IA Recomendação
                                      </span>
                                      
                                      {/* Status display badge */}
                                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                        photo.aiAnalysis.condicao_sugerida === 'OK'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : photo.aiAnalysis.condicao_sugerida === 'Atenção'
                                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}>
                                        {photo.aiAnalysis.condicao_sugerida === 'OK' && <CheckCircle className="w-3 h-3" />}
                                        {photo.aiAnalysis.condicao_sugerida === 'Atenção' && <AlertTriangle className="w-3 h-3" />}
                                        {photo.aiAnalysis.condicao_sugerida === 'Problema' && <XCircle className="w-3 h-3" />}
                                        Condição: {photo.aiAnalysis.condicao_sugerida}
                                      </span>
                                    </div>

                                    <p className="text-slate-600 leading-relaxed text-[11px]">
                                      {safeDescription}
                                    </p>

                                    {photo.aiAnalysis.pontos_de_atencao && photo.aiAnalysis.pontos_de_atencao.length > 0 && (
                                      <div className="space-y-1 pt-1 border-t border-slate-100">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Pontos Notados:</span>
                                        <ul className="list-disc pl-4 text-[10px] text-slate-500 space-y-0.5">
                                          {photo.aiAnalysis.pontos_de_atencao.map((pt, idx) => (
                                            <li key={idx}>{pt}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {/* Action row */}
                                    {photo.reviewedStatus === 'pendente' && (
                                      <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditPhoto(photo)}
                                          className="text-[10px] font-medium text-slate-500 hover:bg-slate-100 px-2.5 py-1.5 rounded-md cursor-pointer"
                                        >
                                          Editar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleApprovePhotoAi(photo.id)}
                                          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-md shadow-xs cursor-pointer"
                                        >
                                          <Check className="w-3 h-3" />
                                          Confirmar Sugestão
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="bg-white border border-slate-150 rounded-xl p-3 space-y-2 text-xs">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3 text-amber-500" /> Sem Análise de IA
                                      </span>
                                      
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                        Sem análise
                                      </span>
                                    </div>

                                    <p className="text-slate-600 leading-relaxed text-[11px]">
                                      {safeDescription}
                                    </p>

                                    <div className="space-y-1 pt-1 border-t border-slate-100">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Pontos Notados:</span>
                                      <div className="text-[10px] text-slate-500 italic">Revisão necessária</div>
                                    </div>

                                    {/* Action row with Retry, Edit, and Confirm */}
                                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-100">
                                      <div>
                                        <button
                                          type="button"
                                          onClick={() => handleRetryAnalysis(photo)}
                                          disabled={isPhotoAnalyzing}
                                          className="flex items-center gap-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[10px] font-bold px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
                                        >
                                          <Sparkles className="w-3 h-3 text-indigo-600 animate-pulse" />
                                          Gerar sugestão novamente
                                        </button>
                                      </div>
                                      
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditPhoto(photo)}
                                          className="text-[10px] font-medium text-slate-500 hover:bg-slate-100 px-2.5 py-1.5 rounded-md cursor-pointer"
                                        >
                                          Editar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleApprovePhotoAi(photo.id)}
                                          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-md shadow-xs cursor-pointer"
                                        >
                                          <Check className="w-3 h-3" />
                                          Confirmar Revisão
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-12 text-center text-slate-400">
              Selecione um cômodo na checklist para carregar fotos e analisar detalhes estruturais.
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
