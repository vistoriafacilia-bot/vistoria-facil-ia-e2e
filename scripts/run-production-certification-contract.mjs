import { writeFileSync } from 'node:fs';

const REPORT_PATH = 'qa/vf_production_certification_contract_20260627.md';
const REPORT_JSON_PATH = 'qa/vf_production_certification_contract_20260627.json';

const contract = {
  status: 'CONTRACT_READY_NOT_EXECUTED',
  gate: 'qa:production-certification',
  executed: false,
  openAiCalls: 0,
  tokens: 0,
  estimatedCostBrl: 0,
  scope: [
    'login',
    'imovel',
    'vistoria',
    'poucos comodos',
    'poucas fotos',
    'IA',
    'revisao',
    'relatorio',
    'cleanup',
  ],
  requiredPrerequisite: 'Discovery, Certification core sem custo e IA controlada devem passar antes da producao assistida.',
  blockedByDefault: true,
};

const md = [
  '# VF Production Certification Contract - 2026-06-27',
  '',
  `STATUS: ${contract.status}`,
  '',
  'Este contrato documenta a jornada curta final e nao executa custo por padrao.',
  '',
  '## Pre-requisito',
  '',
  `- ${contract.requiredPrerequisite}`,
  '',
  '## Jornada curta',
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
