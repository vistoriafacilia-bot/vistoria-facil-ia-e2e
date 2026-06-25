import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { buildMercadoPagoWebhookEventId, normalizeMercadoPagoPaymentSnapshot, validateApprovedPaymentForEntitlement } from './src/lib/paymentGuards';
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

const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
const mercadoPagoAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)';
const firebaseApiKey = process.env.FIREBASE_API_KEY || firebaseConfig.apiKey;

const SERVER_PLANS = {
  free_10: {
    id: 'free_10',
    title: 'Vistoria Fácil IA - Gratuito',
    amountCents: 0,
    maxPhotosPerInspection: 10,
    pdfEnabled: true,
    paymentRequired: false
  },
  beta_paid_4990: {
    id: 'beta_paid_4990',
    title: 'Vistoria Fácil IA - Beta Pago',
    amountCents: 4990,
    maxPhotosPerInspection: 50,
    pdfEnabled: true,
    paymentRequired: true
  }
} as const;

type ServerPlanId = keyof typeof SERVER_PLANS;

type VerifiedUser = {
  uid: string;
  email?: string;
  name?: string;
};

const getAuthTokenFromRequest = (req: express.Request) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
};

const verifyFirebaseIdToken = async (idToken: string): Promise<VerifiedUser> => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });

  if (!response.ok) {
    throw new Error(`Firebase token inválido ou expirado (${response.status}).`);
  }

  const payload: any = await response.json();
  const user = payload?.users?.[0];
  if (!user?.localId) throw new Error('Firebase token sem usuário associado.');

  return {
    uid: user.localId,
    email: user.email,
    name: user.displayName
  };
};

const requireVerifiedUser = async (req: express.Request) => {
  const token = getAuthTokenFromRequest(req);
  if (!token) throw new Error('Token de autenticação ausente.');
  return verifyFirebaseIdToken(token);
};

const getGoogleAccessToken = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: controller.signal
      }
    );
    if (!response.ok) throw new Error(`Metadata server indisponível (${response.status}).`);
    const payload: any = await response.json();
    if (!payload.access_token) throw new Error('Metadata server não retornou access_token.');
    return payload.access_token as string;
  } finally {
    clearTimeout(timeout);
  }
};

const firestoreDocumentName = (documentPath: string) => (
  `projects/${firebaseProjectId}/databases/${firestoreDatabaseId}/documents/${documentPath}`
);

const firestoreRestBase = () => (
  `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/${firestoreDatabaseId}/documents`
);

const toFirestoreValue = (value: any): any => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, toFirestoreValue(nested)]))
      }
    };
  }
  return { stringValue: String(value) };
};

const toFirestoreFields = (data: Record<string, any>) => (
  Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]))
);

const fromFirestoreValue = (value: any): any => {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, nested]) => [key, fromFirestoreValue(nested)])
    );
  }
  return undefined;
};

const fromFirestoreDocument = (docPayload: any) => {
  const fields = docPayload?.fields || {};
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
};

const firestoreCommit = async (writes: any[]) => {
  const token = await getGoogleAccessToken();
  const response = await fetch(`${firestoreRestBase()}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ writes })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore commit falhou (${response.status}): ${text}`);
  }

  return response.json();
};

const firestoreSetDoc = async (documentPath: string, data: Record<string, any>) => {
  return firestoreCommit([
    {
      update: {
        name: firestoreDocumentName(documentPath),
        fields: toFirestoreFields(data)
      }
    }
  ]);
};

const firestorePatchDoc = async (documentPath: string, data: Record<string, any>) => {
  return firestoreCommit([
    {
      update: {
        name: firestoreDocumentName(documentPath),
        fields: toFirestoreFields(data)
      },
      updateMask: {
        fieldPaths: Object.keys(data)
      }
    }
  ]);
};

const firestoreGetDoc = async (documentPath: string) => {
  const token = await getGoogleAccessToken();
  const response = await fetch(`${firestoreRestBase()}/${documentPath}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore get falhou (${response.status}): ${text}`);
  }
  return fromFirestoreDocument(await response.json());
};

const createShortId = () => Math.random().toString(36).slice(2, 10);

const createEntitlementPayload = (userId: string, planId: ServerPlanId, source: 'mercado_pago' | 'manual_admin' | 'free_self_service', ids: { orderId?: string; paymentId?: string; preferenceId?: string } = {}) => {
  const now = new Date().toISOString();
  const plan = SERVER_PLANS[planId];
  return {
    id: `${userId}_${planId}`,
    userId,
    planId,
    status: 'active',
    source,
    maxPhotosPerInspection: plan.maxPhotosPerInspection,
    pdfEnabled: plan.pdfEnabled,
    orderId: ids.orderId || null,
    paymentId: ids.paymentId || null,
    preferenceId: ids.preferenceId || null,
    createdAt: now,
    updatedAt: now
  };
};

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    geminiConfigured: !!geminiApiKey,
    mercadoPagoConfigured: !!mercadoPagoAccessToken,
    firestoreProjectId: firebaseProjectId,
    firestoreDatabaseId,
    appVersion: APP_VERSION,
    release: APP_VERSION_METADATA
  });
});

app.post('/api/payments/create-checkout', async (req, res) => {
  try {
    const user = await requireVerifiedUser(req);
    const planId = req.body?.planId as ServerPlanId;
    const plan = SERVER_PLANS[planId];

    if (!plan) {
      return res.status(400).json({ error: 'Plano inválido.' });
    }

    if (!plan.paymentRequired) {
      const entitlement = createEntitlementPayload(user.uid, planId, 'free_self_service');
      await firestoreSetDoc(`entitlements/${entitlement.id}`, entitlement);
      return res.json({ status: 'approved', entitlement });
    }

    if (!mercadoPagoAccessToken) {
      return res.status(503).json({
        error: 'Mercado Pago não configurado. Configure MERCADOPAGO_ACCESS_TOKEN antes de habilitar pagamento real.'
      });
    }

    const now = new Date().toISOString();
    const orderId = `ord_${user.uid}_${Date.now()}_${createShortId()}`;
    const order = {
      id: orderId,
      userId: user.uid,
      userEmail: user.email || null,
      planId,
      status: 'created',
      amountCents: plan.amountCents,
      currency: 'BRL',
      provider: 'mercado_pago',
      createdAt: now,
      updatedAt: now
    };

    await firestoreSetDoc(`orders/${orderId}`, order);

    const preferencePayload = {
      items: [
        {
          id: plan.id,
          title: plan.title,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: plan.amountCents / 100
        }
      ],
      external_reference: orderId,
      metadata: {
        order_id: orderId,
        user_id: user.uid,
        plan_id: planId
      },
      back_urls: {
        success: `${appUrl}/?payment_status=success&order_id=${encodeURIComponent(orderId)}`,
        pending: `${appUrl}/?payment_status=pending&order_id=${encodeURIComponent(orderId)}`,
        failure: `${appUrl}/?payment_status=failure&order_id=${encodeURIComponent(orderId)}`
      },
      notification_url: `${appUrl}/api/payments/mercadopago/webhook`,
      auto_return: 'approved',
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }]
      }
    };

    const preferenceResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mercadoPagoAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preferencePayload)
    });

    const preference = await preferenceResponse.json();
    if (!preferenceResponse.ok) {
      await firestorePatchDoc(`orders/${orderId}`, {
        status: 'failed',
        providerError: preference,
        updatedAt: new Date().toISOString()
      });
      return res.status(502).json({ error: 'Falha ao criar checkout no Mercado Pago.', details: preference });
    }

    const checkoutUrl = preference.init_point || preference.sandbox_init_point;
    await firestorePatchDoc(`orders/${orderId}`, {
      status: 'pending',
      preferenceId: preference.id,
      checkoutUrl,
      updatedAt: new Date().toISOString()
    });

    return res.json({ orderId, preferenceId: preference.id, checkoutUrl });
  } catch (error: any) {
    console.error('Erro ao criar checkout:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao criar checkout.' });
  }
});

app.post('/api/payments/mercadopago/webhook', async (req, res) => {
  try {
    const paymentId = String(req.query.id || req.body?.data?.id || req.body?.id || '');
    const eventType = String(req.query.topic || req.body?.type || req.body?.action || 'unknown');

    if (!paymentId) {
      return res.status(200).json({ received: true, ignored: 'missing_payment_id' });
    }

    if (!mercadoPagoAccessToken) {
      return res.status(200).json({ received: true, ignored: 'mercado_pago_not_configured' });
    }

    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${mercadoPagoAccessToken}` }
    });

    const payment = await paymentResponse.json();
    if (!paymentResponse.ok) {
      console.warn('Webhook Mercado Pago: falha ao consultar pagamento', payment);
      return res.status(200).json({ received: true, ignored: 'payment_lookup_failed' });
    }

    const normalizedPayment = normalizeMercadoPagoPaymentSnapshot(payment);
    const orderId = normalizedPayment.externalReference || normalizedPayment.metadata?.order_id;
    const order = orderId ? await firestoreGetDoc(`orders/${orderId}`) : null;
    const eventId = buildMercadoPagoWebhookEventId({
      paymentId: String(payment.id || paymentId),
      eventType,
      status: normalizedPayment.status
    });

    await firestoreSetDoc(`webhook_events/${eventId}`, {
      id: eventId,
      provider: 'mercado_pago',
      paymentId: String(payment.id),
      orderId: orderId || null,
      eventType,
      status: normalizedPayment.status || null,
      receivedAt: new Date().toISOString(),
      raw: {
        action: req.body?.action || null,
        type: req.body?.type || null,
        queryTopic: req.query.topic || null
      }
    });

    if (!order) {
      return res.status(200).json({ received: true, ignored: 'order_not_found' });
    }

    const userId = order.userId || normalizedPayment.metadata?.user_id;
    const planId = (order.planId || normalizedPayment.metadata?.plan_id) as ServerPlanId;
    if (!userId || !SERVER_PLANS[planId]) {
      return res.status(200).json({ received: true, ignored: 'invalid_order_metadata' });
    }

    const now = new Date().toISOString();
    const validation = validateApprovedPaymentForEntitlement({
      order: {
        id: orderId,
        userId: order.userId,
        planId: order.planId,
        status: order.status,
        amountCents: order.amountCents,
        currency: order.currency,
        preferenceId: order.preferenceId
      },
      payment: normalizedPayment,
      allowedPlanIds: Object.keys(SERVER_PLANS)
    });

    await firestoreSetDoc(`payments/${payment.id}`, {
      id: String(payment.id),
      userId,
      orderId,
      planId,
      provider: 'mercado_pago',
      status: normalizedPayment.status || 'unknown',
      statusDetail: normalizedPayment.statusDetail || null,
      paymentMethodId: normalizedPayment.paymentMethodId || null,
      paymentTypeId: normalizedPayment.paymentTypeId || null,
      amount: normalizedPayment.amount || null,
      currency: normalizedPayment.currency || 'BRL',
      approvedAt: payment.date_approved || null,
      createdAt: payment.date_created || now,
      updatedAt: now,
      validationStatus: normalizedPayment.status === 'approved' ? (validation.passed ? 'passed' : 'blocked') : 'not_applicable',
      validationBlockers: validation.blockers,
      validationWarnings: validation.warnings
    });

    if (normalizedPayment.status === 'approved' && !validation.passed) {
      await firestorePatchDoc(`orders/${orderId}`, {
        status: 'payment_validation_blocked',
        paymentId: String(payment.id),
        paymentStatusDetail: normalizedPayment.statusDetail || null,
        paymentValidationBlockers: validation.blockers,
        updatedAt: now
      });
      return res.status(200).json({ received: true, status: normalizedPayment.status, entitlementGranted: false, validation });
    }

    await firestorePatchDoc(`orders/${orderId}`, {
      status: normalizedPayment.status === 'approved' ? 'approved' : (normalizedPayment.status || 'pending'),
      paymentId: String(payment.id),
      paymentStatusDetail: normalizedPayment.statusDetail || null,
      updatedAt: now
    });

    if (normalizedPayment.status === 'approved') {
      const entitlement = createEntitlementPayload(userId, planId, 'mercado_pago', {
        orderId,
        paymentId: String(payment.id),
        preferenceId: order.preferenceId
      });
      await firestoreSetDoc(`entitlements/${entitlement.id}`, entitlement);
    }

    return res.status(200).json({ received: true, status: normalizedPayment.status, entitlementGranted: normalizedPayment.status === 'approved' });
  } catch (error: any) {
    console.error('Erro no webhook Mercado Pago:', error);
    return res.status(200).json({ received: true, error: error?.message || 'webhook_error' });
  }
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
