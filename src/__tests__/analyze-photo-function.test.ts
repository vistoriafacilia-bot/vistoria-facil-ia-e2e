import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-ignore Netlify functions are authored as plain ESM JavaScript.
import { handler } from '../../netlify/functions/analyze-photo.mjs';

const originalEnv = { ...process.env };

const event = (body: Record<string, unknown> = {}) => ({
  httpMethod: 'POST',
  body: JSON.stringify({
    imageBase64: 'data:image/jpeg;base64,ZmFrZS1pbWFnZQ==',
    roomName: 'Sala',
    ...body,
  }),
});

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name: string) => headers[name.toLowerCase()] || null,
  },
  json: vi.fn(async () => body),
});

const parsedBody = (response: { body: string }) => JSON.parse(response.body);

describe('analyze-photo Netlify function AI execution mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.AI_EXECUTION_MODE;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_VISION_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('disabled does not call OpenAI', async () => {
    process.env.AI_EXECUTION_MODE = 'disabled';
    process.env.OPENAI_API_KEY = 'sk-disabled-should-not-be-used';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(event());

    expect(response.statusCode).toBe(503);
    expect(parsedBody(response).error).toBe('ai_execution_disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('real calls OpenAI with mocked fetch', async () => {
    process.env.AI_EXECUTION_MODE = 'real';
    process.env.OPENAI_API_KEY = 'sk-real-mocked';
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, {
      output_text: JSON.stringify({
        descricao_objetiva: 'Parede interna',
        avarias_visiveis: ['Mancha aparente'],
        observacao_sugerida: 'Parede com mancha aparente em trecho visivel.',
        condicao_sugerida: 'Atenção',
        confianca: 'média',
        requer_revisao_humana: true,
      }),
      usage: { total_tokens: 42 },
    }, { 'x-request-id': 'req_success_mock' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(event());
    const body = parsedBody(response);

    expect(response.statusCode).toBe(200);
    expect(body.descricao_objetiva).toBe('Parede interna');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
  });

  it('missing or invalid AI_EXECUTION_MODE fails closed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const missing = await handler(event());
    expect(missing.statusCode).toBe(503);
    expect(parsedBody(missing).error).toBe('ai_execution_mode_missing');

    process.env.AI_EXECUTION_MODE = 'mock';
    const invalid = await handler(event());
    expect(invalid.statusCode).toBe(503);
    expect(parsedBody(invalid).error).toBe('ai_execution_mode_invalid');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('OpenAI error creates sanitized observability log', async () => {
    process.env.AI_EXECUTION_MODE = 'real';
    process.env.OPENAI_API_KEY = 'sk-secret-value-must-not-appear';
    process.env.OPENAI_VISION_MODEL = 'gpt-test-model';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(429, {
      error: {
        code: 'insufficient_quota',
        type: 'billing_error',
        message: 'Quota failed for key sk-secret-value-must-not-appear with data:image/jpeg;base64,ZmFrZS1pbWFnZQ==',
      },
    }, { 'x-request-id': 'req_failure_mock' })));

    const response = await handler(event({ imageBase64: 'data:image/jpeg;base64,ZmFrZS1pbWFnZQ==' }));
    const logText = JSON.stringify(consoleError.mock.calls);

    expect(response.statusCode).toBe(429);
    expect(logText).toContain('insufficient_quota');
    expect(logText).toContain('billing_error');
    expect(logText).toContain('req_failure_mock');
    expect(logText).toContain('gpt-test-model');
    expect(logText).toContain('"openaiApiKeyPresent":true');
    expect(logText).toContain('"aiExecutionMode":"real"');
    expect(logText).not.toContain('sk-secret-value-must-not-appear');
    expect(logText).not.toContain('data:image');
    expect(logText).not.toContain('ZmFrZS1pbWFnZQ');
    expect(logText).not.toContain('Voce e um assistente');
    expect(logText).not.toContain('Analise a imagem');
  });
});
