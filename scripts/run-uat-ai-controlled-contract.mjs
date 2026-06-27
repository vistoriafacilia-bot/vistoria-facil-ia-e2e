import { writeFileSync } from 'node:fs';

const REPORT_PATH = 'qa/vf_uat_ai_controlled_contract_20260627.md';
const REPORT_JSON_PATH = 'qa/vf_uat_ai_controlled_contract_20260627.json';

const contract = {
  status: 'CONTRACT_READY_NOT_EXECUTED',
  gate: 'qa:uat-ai-controlled',
  phase: 'FASE B - IA controlada',
  executed: false,
  openAiCalls: 0,
  tokens: 0,
  estimatedCostBaseBrl: 0,
  estimatedCostStressBrl: 0,
  limits: {
    maxPhotosTotal: 50,
    maxPhotosPerRoom: 5,
    maxAnalysesPerPhoto: 1,
    costBasePerPhotoBrl: 0.15,
    costStressPerPhotoBrl: 0.25,
  },
  requiredPrerequisite: 'qa:uat-core-discovery or qa:uat-core-certification must pass with zero OpenAI usage before this gate is enabled.',
  scope: [
    'upload de fotos reais somente apos core sem custo passar',
    'analise IA com no maximo 50 fotos e 5 por comodo',
    'registrar sugestao visivel, utilidade, tokens e custo estimado',
    'confirmar/editar/rejeitar quando suportado',
    'validar persistencia apos reload/logout/login',
    'validar relatorio com IA',
    'cleanup total',
  ],
  blockedByDefault: true,
};

const md = [
  '# VF UAT AI Controlled Contract - 2026-06-27',
  '',
  `STATUS: ${contract.status}`,
  '',
  'Este contrato nao executa upload, OpenAI, IA ou custo por padrao.',
  '',
  '## Limites',
  '',
  `- Maximo total de fotos: ${contract.limits.maxPhotosTotal}`,
  `- Maximo por comodo: ${contract.limits.maxPhotosPerRoom}`,
  `- Analises por foto: ${contract.limits.maxAnalysesPerPhoto}`,
  `- Base: R$ ${contract.limits.costBasePerPhotoBrl.toFixed(2)}/foto`,
  `- Stress: R$ ${contract.limits.costStressPerPhotoBrl.toFixed(2)}/foto`,
  '',
  '## Pre-requisito',
  '',
  `- ${contract.requiredPrerequisite}`,
  '',
  '## Escopo',
  '',
  ...contract.scope.map((item) => `- ${item}`),
  '',
  'OpenAI chamada: 0',
  'Tokens: 0',
  'Custo OpenAI: R$ 0.00',
  '',
].join('\n');

writeFileSync(REPORT_PATH, md, 'utf8');
writeFileSync(REPORT_JSON_PATH, JSON.stringify(contract, null, 2), 'utf8');
console.log(JSON.stringify({
  status: contract.status,
  report: REPORT_PATH,
  reportJson: REPORT_JSON_PATH,
  openAiCalls: 0,
  tokens: 0,
}, null, 2));
process.exitCode = 2;
