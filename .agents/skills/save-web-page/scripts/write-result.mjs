#!/usr/bin/env node
// Extract the HTML string from a saved CDP Runtime.evaluate response and write it.
// Usage: node write-result.mjs <cdp-response.json> <output.html> [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [input, output, flag] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node write-result.mjs <cdp-response.json> <output.html> [--force]');
  process.exit(2);
}

const target = resolve(output);
if (existsSync(target) && flag !== '--force') {
  console.error(`Refusing to overwrite existing file: ${target} (pass --force)`);
  process.exit(3);
}

const response = JSON.parse(readFileSync(input, 'utf8'));
if (response.exceptionDetails) {
  console.error('Page script threw:', JSON.stringify(response.exceptionDetails, null, 2));
  process.exit(1);
}
const value = response.result?.value ?? response.value;
if (typeof value !== 'string' || !/<html[\s>]/i.test(value)) {
  console.error('No HTML string found at result.value');
  process.exit(1);
}

const html = value.trimEnd() + '\n';
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, html, 'utf8');
console.log(JSON.stringify({ path: target, bytes: Buffer.byteLength(html) }));
