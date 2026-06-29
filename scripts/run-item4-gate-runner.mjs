#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const REPORT_DATE = '20260627';
const REPORT_DIR = 'qa';
const NODE = process.execPath;
const NPM = resolveNpmCommand();

function resolveNpmCommand() {
  const npmExecPath = process.env.npm_execpath || '';
  if (/npm-cli\.js$/i.test(npmExecPath) && existsSync(npmExecPath)) {
    return { command: NODE, argsPrefix: [npmExecPath], display: 'npm' };
  }
  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      argsPrefix: ['/d', '/s', '/c', 'npm'],
      display: 'npm',
    };
  }
  return { command: 'npm', argsPrefix: [], display: 'npm' };
}

function readArg(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sanitize(value) {
  const text = redactSecrets(value).replace(/\s+/g, ' ');
  if (/token|key|password|service_role|authorization|secret/i.test(text)) return '[redacted sensitive message]';
  return text.slice(0, 900);
}

function redactSecrets(value) {
  return String(value || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[redacted-openai-key]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-jwt]')
    .replace(/\b(Bearer\s+)[^\s'"]+/gi, '$1[redacted-token]')
    .replace(
      /((?:token|api[_-]?key|key|password|service_role|authorization|secret|supabase_[a-z_]*key|openai_api_key)[^:=\n]*\s*[:=]\s*)(['"]?)[^\s'",}]+(\2)/gi,
      '$1$2[redacted]$3',
    );
}

function redactStream(value) {
  return redactSecrets(value)
    .split(/(\r?\n)/)
    .map((part) => {
      if (/^\r?\n$/.test(part)) return part;
      if (/token|key|password|service_role|authorization|secret/i.test(part) && !/\[redacted/i.test(part)) {
        return '[redacted sensitive line]';
      }
      return part;
    })
    .join('');
}

function commandSpec(command, args) {
  if (typeof command === 'string') {
    return {
      command,
      args,
      display: `${command} ${args.join(' ')}`.trim(),
    };
  }
  return {
    command: command.command,
    args: [...command.argsPrefix, ...args],
    display: `${command.display} ${args.join(' ')}`.trim(),
  };
}

function childError(message, exitCode = 1, signal = null) {
  const error = new Error(message);
  error.childExitCode = exitCode;
  error.childSignal = signal;
  return error;
}

function exitCodeFor(result, error, fallback = 1) {
  if (result.status === 'BLOCKED_GATE_COVERAGE' || result.status === 'COST_GUARD') return 2;
  if (Number.isInteger(error?.childExitCode) && error.childExitCode > 0) return error.childExitCode;
  return fallback;
}

function reportPaths(gate) {
  const slug = gate.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
  return {
    json: `${REPORT_DIR}/vf_item4_${slug}_runner_${REPORT_DATE}.json`,
    md: `${REPORT_DIR}/vf_item4_${slug}_runner_${REPORT_DATE}.md`,
  };
}

function baseResult(gate, patch = {}) {
  return {
    gate,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    executionPlan: [],
    antiFalsePass: [
      'This runner never returns PASS only because a contract was generated.',
      'Any missing executable coverage returns BLOCKED_GATE_COVERAGE.',
      'Any failed mandatory child gate prevents success.',
    ],
    steps: [],
    openAiAllowed: false,
    openAiCallsObserved: 0,
    touchesSupabaseOrStorage: false,
    reports: null,
    ...patch,
  };
}

function writeReport(result) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const paths = reportPaths(result.gate);
  result.reports = paths;
  writeFileSync(paths.json, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const md = [
    `# Item 4 Gate Runner - ${result.gate}`,
    '',
    `Status: ${result.status}`,
    '',
    '## Real Execution Mapping',
    ...result.executionPlan.map((item) => `- ${item}`),
    '',
    '## Anti-False-Pass Guard',
    ...result.antiFalsePass.map((item) => `- ${item}`),
    '',
    '## Runtime Summary',
    `- OpenAI calls allowed in this gate: ${result.openAiAllowed ? 'yes' : 'no'}`,
    `- OpenAI calls observed by this wrapper: ${result.openAiCallsObserved}`,
    `- Supabase/Storage may be touched when executed: ${result.touchesSupabaseOrStorage ? 'yes' : 'no'}`,
    `- Product code changed by this gate: no`,
    '',
    '## Steps',
    ...result.steps.map((step) => `- ${step.name}: ${step.status}${step.detail ? ` - ${step.detail}` : ''}`),
    '',
  ].join('\n');
  writeFileSync(paths.md, md, 'utf8');
}

function finish(result, exitCode) {
  result.finishedAt = new Date().toISOString();
  writeReport(result);
  console.log(JSON.stringify({
    status: result.status,
    gate: result.gate,
    report: result.reports.md,
    reportJson: result.reports.json,
  }, null, 2));
  process.exitCode = exitCode;
}

function runCommand(result, name, command, args, envPatch = {}) {
  const spec = commandSpec(command, args);
  result.steps.push({ name, status: 'RUNNING', detail: spec.display });
  const run = spawnSync(spec.command, spec.args, {
    cwd: process.cwd(),
    env: { ...process.env, ...envPatch },
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    shell: false,
  });
  if (run.stdout) process.stdout.write(redactStream(run.stdout));
  if (run.stderr) process.stderr.write(redactStream(run.stderr));
  const latest = result.steps[result.steps.length - 1];
  if (run.error) {
    latest.status = 'FAIL';
    latest.detail = sanitize(run.error.message);
    throw childError(`${name} failed to start: ${sanitize(run.error.message)}`, run.status || 1, run.signal);
  }
  if (run.status !== 0) {
    latest.status = run.status === 2 ? 'BLOCKED' : 'FAIL';
    latest.detail = run.signal ? `signal=${run.signal}` : `exitCode=${run.status}`;
    throw childError(`${name} ${latest.status} ${latest.detail}`, run.status || 1, run.signal);
  }
  latest.status = 'PASS';
  latest.detail = 'exitCode=0';
}

function blockCoverage(gate, message, extra = {}) {
  const result = baseResult(gate, {
    status: 'BLOCKED_GATE_COVERAGE',
    executionPlan: extra.executionPlan || [],
    touchesSupabaseOrStorage: Boolean(extra.touchesSupabaseOrStorage),
    openAiAllowed: Boolean(extra.openAiAllowed),
  });
  result.steps.push({ name: 'coverage-check', status: 'BLOCKED_GATE_COVERAGE', detail: message });
  finish(result, 2);
}

function runAppInvariantsCore() {
  const result = baseResult('app-invariants-core-p0', {
    executionPlan: [
      'Run npm run qa:uat-core-certification as the executable no-cost core invariant gate.',
      'Fail immediately if the core gate fails, blocks, or reports unexpected cost.',
      'Do not call OpenAI in this gate.',
    ],
    touchesSupabaseOrStorage: true,
  });

  try {
    runCommand(result, 'qa:uat-core-certification', NPM, ['run', 'qa:uat-core-certification']);
    result.status = 'PASS';
    finish(result, 0);
  } catch (error) {
    result.status = /BLOCKED/i.test(error.message) ? 'BLOCKED_GATE_COVERAGE' : 'FAIL_CORE';
    result.steps.push({ name: 'app-invariants-core-p0', status: result.status, detail: sanitize(error.message) });
    finish(result, exitCodeFor(result, error));
  }
}

function runPhotoStorageNoAi() {
  const result = baseResult('photo-storage-no-ai-p0', {
    executionPlan: [
      'Run scripts/run-photo-storage-no-ai-p0.mjs.',
      'Fail if the photo runner detects any OpenAI/IA request.',
      'Fail if upload/listing/link/delete/cleanup cannot be validated.',
    ],
    touchesSupabaseOrStorage: true,
  });

  try {
    runCommand(result, 'qa:photo-storage-no-ai-p0.real-runner', NODE, ['scripts/run-photo-storage-no-ai-p0.mjs']);
    result.status = 'PASS';
    finish(result, 0);
  } catch (error) {
    result.status = /COST_GUARD/i.test(error.message)
      ? 'COST_GUARD'
      : /BLOCKED/i.test(error.message)
        ? 'BLOCKED_GATE_COVERAGE'
        : 'FAIL_CORE';
    result.steps.push({ name: 'qa:photo-storage-no-ai-p0', status: result.status, detail: sanitize(error.message) });
    finish(result, exitCodeFor(result, error));
  }
}

function runAiReview() {
  const result = baseResult('ai-review-p0', {
    executionPlan: [
      'Run scripts/run-uat-ai-controlled-contract.mjs with UAT_AI_CONTROLLED_MAX_PHOTOS=3.',
      'Use approved dataset path from UAT_AI_CONTROLLED_DATASET_PATH or the script default.',
      'Fail on more than 3 photos, more than 3 OpenAI calls, fallback, missing useful suggestion, missing persistence, or cleanup failure.',
    ],
    antiFalsePass: [
      'The child IA runner performs dataset governance before upload.',
      'The wrapper forces the Item 4 limit to 3 photos/calls.',
      'The gate cannot pass in dry-run mode because this wrapper does not pass --dry.',
    ],
    openAiAllowed: true,
    touchesSupabaseOrStorage: true,
  });

  try {
    runCommand(result, 'qa:ai-review-p0.real-runner', NODE, ['scripts/run-uat-ai-controlled-contract.mjs'], {
      UAT_AI_CONTROLLED_MAX_PHOTOS: '3',
      ITEM4_AI_REVIEW_P0: 'true',
    });
    result.status = 'PASS';
    finish(result, 0);
  } catch (error) {
    result.status = /COST_GUARD/i.test(error.message)
      ? 'COST_GUARD'
      : /BLOCKED/i.test(error.message)
        ? 'BLOCKED_GATE_COVERAGE'
        : 'FAIL_CORE';
    result.steps.push({ name: 'qa:ai-review-p0', status: result.status, detail: sanitize(error.message) });
    finish(result, exitCodeFor(result, error));
  }
}

function parseDate(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

function validateReportEvidence() {
  const gate = 'report-p0-certification';
  const result = baseResult(gate, {
    executionPlan: [
      'Validate fresh report evidence emitted by the authorized IA/review gate.',
      'Require reportWorked=true, status=PASS, cleanupOk=true, and no cost guard breach.',
      'Reject stale evidence unless ITEM4_ALLOW_REPORT_EVIDENCE_REUSE=true is explicitly set.',
    ],
    touchesSupabaseOrStorage: false,
  });

  const evidencePath = process.env.ITEM4_REPORT_EVIDENCE_JSON || 'qa/vf_uat_ai_controlled_20260627.json';
  const rcStartedAt = process.env.ITEM4_RC_STARTED_AT || '';
  const allowReuse = process.env.ITEM4_ALLOW_REPORT_EVIDENCE_REUSE === 'true';

  try {
    if (!existsSync(evidencePath)) throw new Error(`REPORT_EVIDENCE_MISSING: ${evidencePath}`);
    if (!rcStartedAt && !allowReuse) {
      throw new Error('REPORT_EVIDENCE_FRESHNESS_REQUIRED: run through qa:uat-release-candidate or set ITEM4_RC_STARTED_AT');
    }

    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    const evidenceFinishedAt = parseDate(evidence.finishedAt);
    const rcStartedTime = parseDate(rcStartedAt);
    const mtime = statSync(evidencePath).mtimeMs;

    if (rcStartedTime && Math.max(evidenceFinishedAt || 0, mtime) < rcStartedTime) {
      throw new Error('REPORT_EVIDENCE_STALE_FOR_CURRENT_RC_RUN');
    }
    if (evidence.status !== 'PASS') throw new Error(`REPORT_UPSTREAM_STATUS_NOT_PASS: ${evidence.status || 'missing'}`);
    if (evidence.reportWorked !== true) throw new Error('REPORT_NOT_CONFIRMED_BY_AI_REVIEW_GATE');
    if (evidence.cleanupOk !== true) throw new Error('REPORT_GATE_CLEANUP_NOT_CONFIRMED');
    if (Number(evidence.openAiRequestCount || 0) > 3) throw new Error('REPORT_EVIDENCE_COST_GUARD_OPENAI_CALLS_GT_3');
    if (Number(evidence.photosAnalyzedByIa || 0) > 3) throw new Error('REPORT_EVIDENCE_COST_GUARD_PHOTOS_GT_3');

    result.steps.push({ name: 'fresh-report-evidence', status: 'PASS', detail: evidencePath });
    result.status = 'PASS';
    finish(result, 0);
  } catch (error) {
    result.status = /MISSING|FRESHNESS|STALE|COST_GUARD/i.test(error.message) ? 'BLOCKED_GATE_COVERAGE' : 'FAIL_CORE';
    result.steps.push({ name: 'fresh-report-evidence', status: result.status, detail: sanitize(error.message) });
    finish(result, exitCodeFor(result, error));
  }
}

function runReleaseCandidate() {
  const gate = 'uat-release-candidate';
  const startedAt = new Date().toISOString();
  const result = baseResult(gate, {
    executionPlan: [
      'Run npm run lint.',
      'Run npm run build.',
      'Run npm run qa:app-invariants-core-p0.',
      'Run npm run qa:inspection-lifecycle-p0.',
      'Run npm run qa:photo-storage-no-ai-p0.',
      'Run npm run qa:ai-review-p0.',
      'Run npm run qa:report-p0-certification.',
      'Stop on first failing or blocked mandatory gate.',
    ],
    touchesSupabaseOrStorage: true,
    openAiAllowed: true,
  });
  const env = { ITEM4_RC_STARTED_AT: startedAt };

  try {
    runCommand(result, 'lint', NPM, ['run', 'lint'], env);
    runCommand(result, 'build', NPM, ['run', 'build'], env);
    runCommand(result, 'qa:app-invariants-core-p0', NPM, ['run', 'qa:app-invariants-core-p0'], env);
    runCommand(result, 'qa:inspection-lifecycle-p0', NPM, ['run', 'qa:inspection-lifecycle-p0'], env);
    runCommand(result, 'qa:photo-storage-no-ai-p0', NPM, ['run', 'qa:photo-storage-no-ai-p0'], env);
    runCommand(result, 'qa:ai-review-p0', NPM, ['run', 'qa:ai-review-p0'], env);
    runCommand(result, 'qa:report-p0-certification', NPM, ['run', 'qa:report-p0-certification'], env);
    result.status = 'PASS';
    finish(result, 0);
  } catch (error) {
    result.status = /BLOCKED|COST_GUARD/i.test(error.message) ? 'BLOCKED_GATE_COVERAGE' : 'FAIL_CORE';
    result.steps.push({ name: 'qa:uat-release-candidate', status: result.status, detail: sanitize(error.message) });
    finish(result, exitCodeFor(result, error));
  }
}

const gate = readArg('gate');

if (gate === 'app-invariants-core-p0') runAppInvariantsCore();
else if (gate === 'photo-storage-no-ai-p0') runPhotoStorageNoAi();
else if (gate === 'ai-review-p0') runAiReview();
else if (gate === 'report-p0-certification') validateReportEvidence();
else if (gate === 'uat-release-candidate') runReleaseCandidate();
else {
  console.error('Unknown or missing gate. Expected app-invariants-core-p0, photo-storage-no-ai-p0, ai-review-p0, report-p0-certification, or uat-release-candidate.');
  process.exitCode = 1;
}
