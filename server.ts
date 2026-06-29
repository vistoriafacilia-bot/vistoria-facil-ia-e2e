import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { APP_VERSION, APP_VERSION_METADATA } from './src/lib/appVersion';

// Load env variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Set payload size limits for image base64 transfer
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize Gemini API
const geminiApiKey = process.env.GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

const firebaseConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8')
);

const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)';

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    geminiConfigured: !!geminiApiKey,
    firestoreProjectId: firebaseProjectId,
    firestoreDatabaseId,
    appVersion: APP_VERSION,
    release: APP_VERSION_METADATA
  });
});

// AI Image analysis endpoint
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { imageBase64, roomName } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Nenhuma imagem base64 enviada.' });
    }

    if (!ai) {
      return res.status(503).json({ 
        error: 'Chave do Gemini API não configurada no servidor. Por favor, adicione GEMINI_API_KEY nas configurações.' 
      });
    }

    // Clean base64 string
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const promptText = `
      Você é uma Inteligência Artificial assistente de vistorias de imóveis (entrada e saída de locação).
      Analise visualmente a imagem fornecida, correspondente ao cômodo "${roomName || 'Geral'}", para identificar os itens presentes e sua condição física de conservação.
      
      Siga RIGOROSAMENTE estas regras de conduta técnica e neutra:
      1. Descreva apenas o que é visivelmente constatável na foto (ex: manchas, furos, trincas, sujeiras, bom estado, conservado).
      2. NUNCA emita laudo técnico estrutural ou parecer jurídico (ex: não use "infiltração grave", "vício oculto", "ilegal").
      3. NÃO afirme a causa definitiva do problema (ex: ao invés de "vazamento do cano", use "aparente marca de umidade").
      4. NÃO culpe nenhuma das partes (inquilino, proprietário ou imobiliária). Use frases na voz passiva e termos neutros.
      5. Em caso de dúvida ou se o detalhe for pequeno, use expressões como "aparenta", "possível", "sugere visualmente" ou "recomenda-se registrar para acompanhamento".
      6. Se a imagem estiver muito escura, desfocada, ou impossível de analisar, retorne a condicao_sugerida como "Atenção", confianca como "baixa" e na descricao_neutra diga: "Imagem com nitidez comprometida. Recomenda-se registrar nova foto sob melhor iluminação para fins de auditoria."

      O resultado deve ser EXCLUSIVAMENTE um objeto JSON válido, estruturado da seguinte forma:
      {
        "item_observado": "Nome claro do objeto analisado (ex: Pintura da parede, Piso cerâmico, Cuba da pia, Guarnição da porta)",
        "condicao_sugerida": "OK" ou "Atenção" ou "Problema",
        "descricao_neutra": "Texto descritivo imparcial focado no estado visual do item.",
        "pontos_de_atencao": ["Lista de 1 a 3 pontos notados na imagem que merecem registro, ou lista vazia se tudo estiver OK"],
        "confianca": "baixa" ou "média" ou "alta"
      }
    `;

    // Call Gemini 2.5 Flash
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: cleanBase64
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const textResult = response.text;
    if (!textResult) {
      throw new Error('Retorno vazio da API do Gemini.');
    }

    // Parse safety check
    const jsonResult = JSON.parse(textResult.trim());
    return res.json(jsonResult);

  } catch (error: any) {
    console.error('Erro na análise do Gemini:', error);
    return res.status(500).json({ 
      error: 'Falha ao analisar a foto com Inteligência Artificial.',
      details: error?.message || String(error)
    });
  }
});

// Vite middleware configuration for full-stack integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
