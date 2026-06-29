const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4.1-mini';

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

function sanitizeError(error) {
  const message = String(error?.message || error || 'unknown error');
  if (/key|token|authorization|secret|password/i.test(message)) {
    return 'OpenAI request failed with a sensitive error.';
  }
  return message.slice(0, 500);
}

function normalizeDataUrl(imageBase64) {
  const value = String(imageBase64 || '').trim();
  if (!value) return '';
  if (value.startsWith('data:image/')) return value;
  return `data:image/jpeg;base64,${value.replace(/^data:[^,]+,/, '')}`;
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        return content.text;
      }
    }
  }
  return '';
}

function parseAiJson(text) {
  const parsed = JSON.parse(text);
  return {
    descricao_objetiva: String(parsed.descricao_objetiva || '').trim(),
    avarias_visiveis: Array.isArray(parsed.avarias_visiveis)
      ? parsed.avarias_visiveis.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
      : [],
    observacao_sugerida: String(parsed.observacao_sugerida || '').trim(),
    condicao_sugerida: ['OK', 'Atenção', 'Problema'].includes(parsed.condicao_sugerida)
      ? parsed.condicao_sugerida
      : 'Atenção',
    confianca: ['baixa', 'média', 'alta'].includes(parsed.confianca) ? parsed.confianca : 'média',
    requer_revisao_humana: Boolean(parsed.requer_revisao_humana),
  };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(503, { error: 'openai_api_key_missing' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const imageUrl = normalizeDataUrl(payload.imageBase64);
  const roomName = String(payload.roomName || 'comodo nao informado').slice(0, 80);
  if (!imageUrl) return json(400, { error: 'image_required' });
  if (imageUrl.length > 4_500_000) return json(413, { error: 'image_too_large' });

  const model = process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL;
  const startedAt = Date.now();

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_output_tokens: 450,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: [
                  'Voce e um assistente de vistoria imobiliaria no Brasil.',
                  'Analise a imagem como evidencia fotografica de vistoria, com linguagem observacional, neutra e objetiva.',
                  'Descreva apenas o que for visivel na imagem, sem recomendar acao, obra, reparo, manutencao, solucao, orcamento ou providencia.',
                  'Nao use termos prescritivos como "recomenda-se", "deve", "necessario reparar", "corrigir" ou "evitar danos maiores".',
                  'Nao afirme causa definitiva, risco tecnico definitivo ou consequencia futura.',
                  'Quando houver incerteza, use termos como "aparente", "possivel" ou "visivel na imagem".',
                  'Mantenha o foco em estado de conservacao, danos visiveis, ausencia de acabamento, manchas, trincas, furos, desgaste, umidade aparente, fiacao aparente e outros elementos observaveis.',
                  'A observacao_sugerida deve ser propria para relatorio de vistoria e nunca deve orientar o usuario sobre o que fazer.',
                  'A observacao_sugerida deve ter qualidade profissional, com 2 a 4 frases completas, evitando texto raso, generico ou repetitivo.',
                  'Estruture a observacao_sugerida contemplando: ambiente ou elemento principal visivel; localizacao do ponto observado; condicao visual aparente; detalhes relevantes ao redor; e ressalva quando o enquadramento for limitado.',
                  'Nao repita o mesmo achado em frases diferentes. Se a imagem for parcial, nao afirme ausencia geral de problemas; diga que nao ha danos relevantes claramente identificaveis neste enquadramento.',
                  'A descricao_objetiva deve ser curta e especifica, nomeando o elemento principal observado sem virar recomendacao.',
                  'A lista avarias_visiveis deve conter apenas achados visuais distintos e concretos, sem solucoes ou acoes.',
                  'Responda somente JSON valido no schema solicitado.',
                  'Se nao houver avaria visivel, informe condicao OK e uma observacao objetiva.',
                  `Comodo informado: ${roomName}.`,
                ].join(' '),
              },
              {
                type: 'input_image',
                image_url: imageUrl,
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'vistoria_photo_analysis',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: [
                'descricao_objetiva',
                'avarias_visiveis',
                'observacao_sugerida',
                'condicao_sugerida',
                'confianca',
                'requer_revisao_humana',
              ],
              properties: {
                descricao_objetiva: { type: 'string' },
                avarias_visiveis: {
                  type: 'array',
                  maxItems: 6,
                  items: { type: 'string' },
                },
                observacao_sugerida: { type: 'string' },
                condicao_sugerida: {
                  type: 'string',
                  enum: ['OK', 'Atenção', 'Problema'],
                },
                confianca: {
                  type: 'string',
                  enum: ['baixa', 'média', 'alta'],
                },
                requer_revisao_humana: { type: 'boolean' },
              },
            },
          },
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || data?.error || `OpenAI HTTP ${response.status}`;
      return json(response.status === 401 ? 503 : response.status, {
        error: 'openai_request_failed',
        status: response.status,
        message: sanitizeError(message),
      });
    }

    const outputText = extractOutputText(data);
    if (!outputText) return json(502, { error: 'openai_empty_response' });

    const analysis = parseAiJson(outputText);
    if (!analysis.descricao_objetiva || !analysis.observacao_sugerida) {
      return json(502, { error: 'openai_invalid_analysis' });
    }

    return json(200, {
      ...analysis,
      model,
      usage: data.usage || null,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (error) {
    return json(500, {
      error: 'openai_function_error',
      message: sanitizeError(error),
    });
  }
}
