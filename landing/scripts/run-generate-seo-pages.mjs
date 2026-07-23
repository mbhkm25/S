import { readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const originalPath = fileURLToPath(new URL('./generate-seo-pages.mjs', import.meta.url));
const runtimePath = join(dirname(originalPath), '.generate-seo-pages.runtime.mjs');

const originalSource = await readFile(originalPath, 'utf8');
const portableSource = originalSource
  .replace(
    "import { join } from 'node:path';",
    "import { join } from 'node:path';\nimport { fileURLToPath } from 'node:url';"
  )
  .replace(
    "const outputDir = new URL('../dist/', import.meta.url).pathname;",
    "const outputDir = fileURLToPath(new URL('../dist/', import.meta.url));"
  )
  .replaceAll(
    '<link rel="icon" href="/sanad_logo.png">',
    '<link rel="icon" type="image/svg+xml" href="/sanad-favicon.svg">'
  );

if (portableSource === originalSource) {
  throw new Error('SEO generator portability patch did not match the expected source.');
}

try {
  await writeFile(runtimePath, portableSource, 'utf8');
  await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
} finally {
  await unlink(runtimePath).catch(() => undefined);
}
