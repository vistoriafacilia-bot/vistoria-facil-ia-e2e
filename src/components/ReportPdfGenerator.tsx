import React, { useState, useEffect } from 'react';
import { db, auth, storage, OperationType, handleFirestoreError } from '../firebase';
import { collection, getDocs, updateDoc, doc, addDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Property, Inspection, Room, Photo, Entitlement } from '../types';
import { jsPDF } from 'jspdf';
import { 
  ArrowLeft, 
  FileText, 
  Download, 
  MessageSquare, 
  Share2, 
  Check, 
  AlertTriangle, 
  Info, 
  Signature, 
  Building2, 
  Compass, 
  FileCheck 
} from 'lucide-react';
import { buildReportFilename, buildReportStoragePath, buildReportId } from '../lib/reporting';
import { safeCreateAuditEvent } from '../lib/auditEvents';
import { validateReportGenerationGate, QaGateResult } from '../lib/qaGates';
import { getPhotoLimitForEntitlement } from '../lib/entitlements';
import { APP_VERSION } from '../lib/appVersion';

interface ReportPdfGeneratorProps {
  property: Property;
  inspection: Inspection;
  onBack: () => void;
  entitlement?: Entitlement | null;
}

export default function ReportPdfGenerator({ property, inspection, onBack, entitlement }: ReportPdfGeneratorProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);
  const [gateResult, setGateResult] = useState<QaGateResult | null>(null);
  const [generalSummary, setGeneralSummary] = useState(
    inspection.summary || 
    'Vistoria de rotina realizada de forma organizada com verificação detalhada das instalações elétricas, hidráulicas, pintura de paredes, portas, janelas e pisos dos principais cômodos.'
  );

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Rooms
      const roomsRef = collection(db, 'inspections', inspection.id, 'rooms');
      const roomsSnap = await getDocs(roomsRef);
      const roomsList: Room[] = [];
      roomsSnap.forEach(doc => {
        roomsList.push({ id: doc.id, ...doc.data() } as Room);
      });
      roomsList.sort((a, b) => a.order - b.order);
      setRooms(roomsList);

      // Photos
      const photosRef = collection(db, 'inspections', inspection.id, 'photos');
      const photosSnap = await getDocs(photosRef);
      const photosList: Photo[] = [];
      photosSnap.forEach(doc => {
        photosList.push({ id: doc.id, ...doc.data() } as Photo);
      });
      setPhotos(photosList);

      const gate = validateReportGenerationGate({
        inspection,
        property,
        rooms: roomsList,
        photos: photosList,
        photoLimit: getPhotoLimitForEntitlement(entitlement),
        userId: auth.currentUser?.uid,
        entitlement
      });
      setGateResult(gate);
    } catch (error) {
      console.error('Error fetching details for PDF:', error);
    } finally {
      setLoading(false);
    }
  };

  // Build the WhatsApp/Email Share Message
  const shareMessage = `Olá, estou enviando o relatório de vistoria de ${
    inspection.inspectionType === 'entrada' ? 'entrada' : 'saída'
  } do imóvel (${property.nickname} - ${property.address.street}, Nº ${property.address.number}), com registros fotográficos e observações realizadas na data indicada. Peço, por gentileza, confirmação de recebimento para fins de registro.`;

  const handleShareWhatsApp = () => {
    const encoded = encodeURIComponent(shareMessage);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent(`Relatório de Vistoria de ${inspection.inspectionType === 'entrada' ? 'Entrada' : 'Saída'} - ${property.nickname}`);
    const body = encodeURIComponent(shareMessage);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  // Render PDF using jsPDF
  const generatePDF = async () => {
    if (pdfGenerating) return;

    // Gate validation check
    const currentGate = validateReportGenerationGate({
      inspection,
      property,
      rooms,
      photos,
      photoLimit: getPhotoLimitForEntitlement(entitlement),
      userId: auth.currentUser?.uid,
      entitlement
    });

    if (!currentGate.passed) {
      const errorMsg = currentGate.issues.map(e => e.message).join('\n');
      alert(`Impossível gerar relatório devido aos seguintes bloqueios:\n\n${errorMsg}`);
      return;
    }

    setPdfGenerating(true);
    try {
      const docPdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const primaryColor = [79, 70, 229]; // Indigo Hex: #4f46e5
      const secondaryColor = [30, 41, 59]; // Slate Hex: #1e293b
      const neutralLight = [248, 250, 252]; // Slate-50

      // Add fonts support and custom styles helper
      const addHeaderFooter = (pageNum: number, totalPages: number) => {
        docPdf.setFillColor(241, 245, 249);
        docPdf.rect(0, 287, 210, 10, 'F');
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(8);
        docPdf.setTextColor(148, 163, 184);
        docPdf.text(`Vistoria Fácil IA - ${APP_VERSION} - Relatório Organizacional Autônomo`, 12, 293);
        docPdf.text(`Página ${pageNum} de ${totalPages}`, 180, 293);
      };

      // PAGE 1: CAPA (Cover Page)
      docPdf.setFillColor(30, 41, 59); // Slate-800 background band
      docPdf.rect(0, 0, 210, 110, 'F');

      // Title & Product Name
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(36);
      docPdf.setTextColor(255, 255, 255);
      docPdf.text('Vistoria Fácil IA', 20, 45);

      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(14);
      docPdf.setTextColor(199, 210, 254);
      docPdf.text('Relatório Inteligente de Vistoria Imobiliária', 20, 56);

      // Label (Entrada / Saída)
      const typeLabel = inspection.inspectionType === 'entrada' ? 'VISTORIA DE ENTRADA' : 'VISTORIA DE SAÍDA';
      docPdf.setFillColor(79, 70, 229); // Indigo Tag
      docPdf.rect(20, 68, 65, 10, 'F');
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(11);
      docPdf.setTextColor(255, 255, 255);
      docPdf.text(typeLabel, 24, 74.5);

      // Property Address Block
      docPdf.setTextColor(30, 41, 59);
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(18);
      docPdf.text(property.nickname, 20, 135);

      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(10);
      docPdf.setTextColor(71, 85, 105);

      const addressLine1 = `${property.address.street}, Nº ${property.address.number}${property.address.complement ? `, ${property.address.complement}` : ''}`;
      const addressLine2 = `${property.address.neighborhood} - ${property.address.city}/${property.address.state}`;
      const addressLine3 = `CEP: ${property.address.zipCode} | Ref: ${property.address.reference || 'Não informado'}`;

      docPdf.text(addressLine1, 20, 145);
      docPdf.text(addressLine2, 20, 151);
      docPdf.text(addressLine3, 20, 157);

      // Metadata Info
      docPdf.setDrawColor(226, 232, 240);
      docPdf.line(20, 170, 190, 170);

      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(10);
      docPdf.setTextColor(30, 41, 59);
      docPdf.text('Data de Realização:', 20, 182);
      docPdf.setFont('helvetica', 'normal');
      docPdf.text(new Date(inspection.startedAt).toLocaleDateString('pt-BR'), 60, 182);

      docPdf.setFont('helvetica', 'bold');
      docPdf.text('Vistoriador Responsável:', 20, 190);
      docPdf.setFont('helvetica', 'normal');
      docPdf.text(auth.currentUser?.displayName || auth.currentUser?.email || 'Usuário Autenticado', 68, 190);

      docPdf.setFont('helvetica', 'bold');
      docPdf.text('Código de Segurança:', 20, 198);
      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(9);
      docPdf.text(inspection.id, 62, 198);

      // Mandatory Legal Notice
      docPdf.setFillColor(254, 243, 199); // Soft Amber background
      docPdf.setDrawColor(251, 191, 36); // Amber border
      docPdf.rect(20, 215, 170, 28, 'FD');

      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(9);
      docPdf.setTextColor(146, 64, 14); // Dark Amber
      docPdf.text('AVISO DE RESPONSABILIDADE OBRIGATÓRIO:', 24, 222);

      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(8);
      docPdf.setTextColor(180, 83, 9); // Amber text
      const disclaimerLines = docPdf.splitTextToSize(
        'Este relatório é um registro organizacional de vistoria feito pelo usuário com apoio de inteligência artificial. Não substitui laudo técnico, parecer jurídico, vistoria profissional ou avaliação especializada.',
        162
      );
      docPdf.text(disclaimerLines, 24, 228);

      // PAGE 2: RESUMO GERAL
      docPdf.addPage();
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(20);
      docPdf.setTextColor(30, 41, 59);
      docPdf.text('Resumo Geral da Vistoria', 20, 30);

      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(10);
      docPdf.setTextColor(71, 85, 105);
      const summaryLines = docPdf.splitTextToSize(generalSummary, 170);
      docPdf.text(summaryLines, 20, 42);

      // Room Overview Table
      let currentY = 100;
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(14);
      docPdf.setTextColor(30, 41, 59);
      docPdf.text('Quadro de Cômodos Analisados', 20, currentY);
      currentY += 10;

      // Draw table header
      docPdf.setFillColor(241, 245, 249);
      docPdf.rect(20, currentY, 170, 8, 'F');
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(9);
      docPdf.setTextColor(71, 85, 105);
      docPdf.text('Cômodo', 24, currentY + 5.5);
      docPdf.text('Mídias Registradas', 100, currentY + 5.5);
      docPdf.text('Situação Geral', 150, currentY + 5.5);
      currentY += 8;

      rooms.forEach((room) => {
        const roomPhotos = photos.filter(p => p.roomId === room.id);
        const hasWarning = roomPhotos.some(p => p.aiAnalysis?.condicao_sugerida === 'Atenção');
        const hasProblem = roomPhotos.some(p => p.aiAnalysis?.condicao_sugerida === 'Problema');

        let statusText = 'OK';
        if (hasProblem) statusText = 'Problema';
        else if (hasWarning) statusText = 'Atenção';

        docPdf.setDrawColor(241, 245, 249);
        docPdf.line(20, currentY + 8, 190, currentY + 8);
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(9);
        docPdf.setTextColor(30, 41, 59);
        docPdf.text(room.name, 24, currentY + 5);
        docPdf.text(`${roomPhotos.length} foto(s)`, 100, currentY + 5);
        
        // Style status text
        if (statusText === 'Problema') docPdf.setTextColor(220, 38, 38); // Red
        else if (statusText === 'Atenção') docPdf.setTextColor(217, 119, 6); // Amber
        else docPdf.setTextColor(22, 163, 74); // Green

        docPdf.text(statusText, 150, currentY + 5);
        currentY += 8;
      });

      // PAGES FOR ROOM PHOTO DETAILS
      rooms.forEach((room) => {
        const roomPhotos = photos.filter(p => p.roomId === room.id);
        if (roomPhotos.length === 0) return;

        docPdf.addPage();
        currentY = 30;

        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(18);
        docPdf.setTextColor(30, 41, 59);
        docPdf.text(`Cômodo: ${room.name}`, 20, currentY);
        currentY += 15;

        roomPhotos.forEach((photo, idx) => {
          // If we are reaching bottom, add new page
          if (currentY > 210) {
            docPdf.addPage();
            currentY = 30;
          }

          // Draw Divider
          if (idx > 0) {
            docPdf.setDrawColor(241, 245, 249);
            docPdf.line(20, currentY, 190, currentY);
            currentY += 10;
          }

          // Print image box
          try {
            const imageSource = photo.url?.startsWith('data:image')
              ? photo.url
              : photo.imageUrl?.startsWith('data:image')
              ? photo.imageUrl
              : '';
            if (imageSource) {
              docPdf.addImage(imageSource, 'JPEG', 20, currentY, 40, 30, undefined, 'FAST');
            }
          } catch (e) {
            console.error('Error rendering image in PDF:', e);
            docPdf.setDrawColor(226, 232, 240);
            docPdf.rect(20, currentY, 40, 30);
            docPdf.setFont('helvetica', 'normal');
            docPdf.setFontSize(7);
            docPdf.text('[Erro ao renderizar imagem]', 22, currentY + 15);
          }

          // Metadata beside image
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(10);
          docPdf.setTextColor(30, 41, 59);
          docPdf.text(photo.caption, 66, currentY + 4);

          // Condition Tag
          const condition = photo.aiAnalysis?.condicao_sugerida || 'OK';
          docPdf.setFontSize(8);
          if (condition === 'OK') {
            docPdf.setFillColor(240, 253, 244);
            docPdf.setDrawColor(74, 222, 128);
            docPdf.rect(66, currentY + 7, 25, 5, 'FD');
            docPdf.setTextColor(21, 128, 61);
            docPdf.text('CONDIÇÃO: OK', 68.5, currentY + 10.8);
          } else if (condition === 'Atenção') {
            docPdf.setFillColor(255, 251, 235);
            docPdf.setDrawColor(252, 211, 77);
            docPdf.rect(66, currentY + 7, 34, 5, 'FD');
            docPdf.setTextColor(180, 83, 9);
            docPdf.text('CONDIÇÃO: ATENÇÃO', 68.5, currentY + 10.8);
          } else {
            docPdf.setFillColor(254, 242, 242);
            docPdf.setDrawColor(248, 113, 113);
            docPdf.rect(66, currentY + 7, 36, 5, 'FD');
            docPdf.setTextColor(185, 28, 28);
            docPdf.text('CONDIÇÃO: PROBLEMA', 68.5, currentY + 10.8);
          }

          // Description Neutra
          docPdf.setFont('helvetica', 'normal');
          docPdf.setFontSize(9);
          docPdf.setTextColor(71, 85, 105);
          const descLines = docPdf.splitTextToSize(photo.aiAnalysis?.descricao_neutra || 'Nenhuma descrição neutra adicionada.', 124);
          docPdf.text(descLines, 66, currentY + 17);

          currentY += 36;
        });
      });

      // LAST PAGE: SIGNATURES & TERM
      docPdf.addPage();
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(18);
      docPdf.setTextColor(30, 41, 59);
      docPdf.text('Termo de Encerramento & Assinaturas', 20, 30);

      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(9);
      docPdf.setTextColor(71, 85, 105);
      const conclusionTerm = 'Declaram as partes estarem cientes das condições relatadas e registradas fotograficamente neste documento na data de conclusão indicada. Fica estabelecido o presente como registro fático das condições físicas de conservação do imóvel.';
      const termLines = docPdf.splitTextToSize(conclusionTerm, 170);
      docPdf.text(termLines, 20, 42);

      // Signature Blocks
      docPdf.setDrawColor(148, 163, 184);
      docPdf.line(20, 100, 95, 100);
      docPdf.text('Locador ou Proprietário', 20, 105);

      docPdf.line(115, 100, 190, 100);
      docPdf.text('Locatário ou Inquilino', 115, 105);

      docPdf.line(20, 140, 95, 140);
      docPdf.text('Testemunha 1', 20, 145);

      docPdf.line(115, 140, 190, 140);
      docPdf.text('Testemunha 2', 115, 145);

      // Add Headers/Footers on all pages
      const totalPages = (docPdf as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        docPdf.setPage(i);
        addHeaderFooter(i, totalPages);
      }

      // Generate filename and storage path
      const filename = buildReportFilename({
        propertyNickname: property.nickname,
        inspectionType: inspection.inspectionType,
        inspectionId: inspection.id
      });

      // Save PDF Local
      docPdf.save(filename);

      // Upload to Firebase Storage
      const pdfBlob = docPdf.output('blob');
      const userId = auth.currentUser?.uid;
      let downloadUrl = '';
      const nowIso = new Date().toISOString();

      if (userId) {
        const storagePath = buildReportStoragePath({
          userId,
          propertyId: property.id,
          inspectionId: inspection.id,
          filename
        });
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, pdfBlob, {
          contentType: 'application/pdf',
          customMetadata: {
            userId,
            propertyId: property.id,
            inspectionId: inspection.id,
            appVersion: APP_VERSION
          }
        });

        downloadUrl = await getDownloadURL(storageRef);

        const reportId = buildReportId(inspection.id, nowIso);
        const reportData = {
          id: reportId,
          userId,
          propertyId: property.id,
          inspectionId: inspection.id,
          pdfUrl: downloadUrl,
          storagePath,
          filename,
          generalSummary,
          generatedAt: nowIso,
          appVersion: APP_VERSION
        };

        // Save report metadata under inspections/{inspectionId}/reports/{reportId}
        const reportDocRef = doc(db, 'inspections', inspection.id, 'reports', reportId);
        await setDoc(reportDocRef, reportData);

        // Update Inspection Document with latest report details
        const inspectionRef = doc(db, 'inspections', inspection.id);
        await updateDoc(inspectionRef, {
          status: 'pdf_gerado',
          summary: generalSummary,
          pdfUrl: downloadUrl,
          reportId: reportId
        }).catch(err => 
          handleFirestoreError(err, OperationType.UPDATE, `inspections/${inspection.id}`)
        );
      } else {
        // Fallback update without user auth
        const inspectionRef = doc(db, 'inspections', inspection.id);
        await updateDoc(inspectionRef, {
          status: 'pdf_gerado',
          summary: generalSummary
        }).catch(err => 
          handleFirestoreError(err, OperationType.UPDATE, `inspections/${inspection.id}`)
        );
      }

      // Record Audit Event
      await safeCreateAuditEvent(auth.currentUser?.uid || 'unknown', 'pdf_generation', { propertyId: property.id, inspectionId: inspection.id });

      setPdfDownloaded(true);
    } catch (err) {
      console.error('Error creating PDF Document:', err);
      alert('Erro ao gerar relatório em PDF.');
    } finally {
      setPdfGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium text-sm mt-4">Organizando dados da vistoria...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      
      {/* Back button header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={onBack} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Visualizar Relatório</h2>
            <p className="text-xs text-slate-500">{property.nickname} • Vistoria Concluída</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Summary & Revision Content */}
        <div className="md:col-span-2 space-y-6">
          
          {/* General Summary editor card */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-indigo-600" /> Resumo Geral da Vistoria
            </h3>
            <p className="text-xs text-slate-500">
              Escreva observações globais de entrada/saída que farão parte da folha de introdução do PDF.
            </p>
            <textarea
              rows={4}
              value={generalSummary}
              onChange={(e) => setGeneralSummary(e.target.value)}
              className="w-full text-xs border border-slate-200 focus:border-indigo-500 rounded-xl p-3 outline-none resize-none leading-relaxed"
            />
          </div>

          {/* Mandatory Aviso display */}
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 text-xs text-amber-800 space-y-2">
            <p className="font-bold flex items-center gap-1.5 text-amber-900">
              <Info className="w-4 h-4" /> Aviso de Responsabilidade Legal
            </p>
            <p className="leading-relaxed">
              “Este relatório é um registro organizacional de vistoria feito pelo usuário com apoio de inteligência artificial. Não substitui laudo técnico, parecer jurídico, vistoria profissional ou avaliação especializada.”
            </p>
          </div>

          {/* Table preview */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-sm text-slate-800">Itens e fotos catalogados</h3>
            
            <div className="divide-y divide-slate-100">
              {rooms.map((room) => {
                const roomPhotos = photos.filter(p => p.roomId === room.id);
                if (roomPhotos.length === 0) return null;

                return (
                  <div key={room.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800">{room.name}</span>
                      <p className="text-[10px] text-slate-500 mt-0.5">{roomPhotos.length} foto(s) com análise de IA</p>
                    </div>
                    <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
                      Revisado
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right 1 Column: Action sidebar */}
        <div className="md:col-span-1 space-y-6">
          
          {/* Download & Actions card */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4 text-center">
            <div className="bg-indigo-50 text-indigo-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto shadow-xs">
              <FileText className="w-6 h-6" />
            </div>
            
            {gateResult && !gateResult.passed ? (
              <div className="bg-rose-50 text-rose-800 p-4 rounded-xl border border-rose-200 text-left text-xs space-y-2">
                <p className="font-bold flex items-center gap-1.5 text-rose-900">
                  <AlertTriangle className="w-4 h-4 text-rose-600" /> Geração de PDF Bloqueada
                </p>
                <ul className="list-disc pl-4 space-y-1 text-rose-700">
                  {gateResult.issues.map((err, idx) => (
                    <li key={idx}>{err.message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Pronto para gerar</h4>
                <p className="text-xs text-slate-400 mt-1">Gere o documento final e envie para as partes interessadas.</p>
              </div>
            )}

            <button
              type="button"
              onClick={generatePDF}
              disabled={pdfGenerating || (gateResult !== null && !gateResult.passed)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold text-xs py-2.5 rounded-xl shadow-md transition-all active:scale-98 cursor-pointer h-10 flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              {pdfGenerating ? 'Gerando PDF...' : 'Baixar Relatório PDF'}
            </button>

            {pdfDownloaded && (
              <div className="bg-emerald-50 text-emerald-700 p-2.5 rounded-xl border border-emerald-100 text-[10px] font-semibold">
                Relatório gerado com sucesso!
              </div>
            )}
          </div>

          {/* Ready to send templates */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5 text-indigo-600" /> Mensagem para Envio
            </h4>
            
            <div className="bg-slate-50 p-3 rounded-xl text-[11px] text-slate-600 leading-relaxed italic border border-slate-100">
              "{shareMessage}"
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[10px] font-bold py-2 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                WhatsApp
              </button>

              <button
                type="button"
                onClick={handleShareEmail}
                className="bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-[10px] font-bold py-2 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                E-mail
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
