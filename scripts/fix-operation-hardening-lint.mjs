import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const detailsPath = 'src/components/Details.tsx';
let source = readFileSync(detailsPath, 'utf8');
source = source.replace(
  "import { toLatinDigits } from '../utils/numerals';",
  "import { toLatinDigits, formatYemenDate, formatYemenTime } from '../utils/numerals';"
);
writeFileSync(detailsPath, source);

for (const path of [
  'scripts/fix-operation-hardening-lint.mjs',
  '.github/workflows/fix-operation-hardening-lint.yml',
  '.github/workflows/capture-operation-hardening-lint.yml',
  'operation-hardening-lint.txt'
]) {
  try { unlinkSync(path); } catch {}
}
