import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const landingDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(landingDir, 'dist');

const faviconMarkup = [
  '<link rel="icon" href="/favicon.ico" sizes="any">',
  '<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">',
  '<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png">',
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">'
].join('');

const legacyPatterns = [
  /<link rel="icon" type="image\/svg\+xml" href="\/sanad-favicon\.svg"\s*\/>\s*/g,
  /<link rel="alternate icon" type="image\/png" href="\/sanad_logo\.png"\s*\/>\s*/g,
  /<link rel="icon" href="\/sanad_logo\.png">/g
];

async function collectHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectHtmlFiles(fullPath));
    if (entry.isFile() && entry.name === 'index.html') files.push(fullPath);
  }

  return files;
}

for (const asset of ['favicon.ico', 'favicon-48.png', 'favicon-96.png', 'apple-touch-icon.png']) {
  const info = await stat(path.join(distDir, asset));
  if (!info.isFile() || info.size === 0) throw new Error(`Missing or empty favicon asset: ${asset}`);
}

const htmlFiles = await collectHtmlFiles(distDir);

for (const file of htmlFiles) {
  let html = await readFile(file, 'utf8');
  for (const pattern of legacyPatterns) html = html.replace(pattern, '');

  if (!html.includes('/favicon-48.png')) {
    html = html.replace('</head>', `${faviconMarkup}</head>`);
  }

  await writeFile(file, html, 'utf8');
}

console.log(`Applied production favicon assets to ${htmlFiles.length} HTML pages.`);
