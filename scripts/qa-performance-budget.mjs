import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const assetsDir = path.join(root, 'dist', 'assets');
const failures = [];
const warnings = [];
const pass = message => console.log(`PASS ${message}`);
const fail = message => failures.push(message);
const warn = message => warnings.push(message);

const bytesToKb = bytes => Number((bytes / 1024).toFixed(2));

if (!fs.existsSync(assetsDir)) {
  fail('dist/assets não encontrado. Execute npm run build antes de npm run qa:performance.');
} else {
  const files = fs.readdirSync(assetsDir)
    .filter(file => file.endsWith('.js'))
    .map(file => {
      const fullPath = path.join(assetsDir, file);
      const sizeKb = bytesToKb(fs.statSync(fullPath).size);
      return { file, sizeKb };
    })
    .sort((a, b) => b.sizeKb - a.sizeKb);

  const largest = files[0];
  const mainIndexChunks = files.filter(item => item.file.startsWith('index-'));
  const oversized = files.filter(item => item.sizeKb > 500);
  const expectedVendorChunks = ['vendor-react', 'vendor-supabase', 'vendor-ui'];

  if (!files.length) fail('nenhum bundle JS encontrado em dist/assets.');
  else pass(`bundles JS encontrados: ${files.length}. Maior chunk: ${largest.file} (${largest.sizeKb} KB).`);

  for (const chunk of expectedVendorChunks) {
    files.some(item => item.file.startsWith(`${chunk}-`))
      ? pass(`chunk manual presente: ${chunk}`)
      : fail(`chunk manual ausente: ${chunk}`);
  }

  if (mainIndexChunks.length === 0) {
    fail('chunk principal index-*.js não encontrado.');
  } else {
    const largestIndex = mainIndexChunks[0];
    largestIndex.sizeKb <= 650
      ? pass(`chunk principal dentro do orçamento: ${largestIndex.file} (${largestIndex.sizeKb} KB <= 650 KB).`)
      : fail(`chunk principal acima do orçamento: ${largestIndex.file} (${largestIndex.sizeKb} KB > 650 KB).`);
  }

  if (largest && largest.sizeKb <= 900) {
    pass(`maior chunk dentro do limite de segurança: ${largest.file} (${largest.sizeKb} KB <= 900 KB).`);
  } else if (largest) {
    fail(`maior chunk acima do limite de segurança: ${largest.file} (${largest.sizeKb} KB > 900 KB).`);
  }

  if (oversized.length) {
    warn(`chunks acima de 500 KB ainda exigem monitoramento: ${oversized.map(item => `${item.file}=${item.sizeKb}KB`).join(', ')}`);
  } else {
    pass('nenhum chunk acima de 500 KB.');
  }
}

if (warnings.length) {
  console.log('\nWARNINGS');
  for (const item of warnings) console.log(`WARN ${item}`);
}

if (failures.length) {
  console.error('\nPERFORMANCE BUDGET FAILED');
  for (const item of failures) console.error(`FAIL ${item}`);
  process.exit(1);
}

console.log('\nPERFORMANCE BUDGET PASSED');
