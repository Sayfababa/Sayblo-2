/**
 * Builds the game for the claude.ai artifact page: no service worker, and index.html without its own
 * <html>/<head>/<body> (the artifact host adds those). Output: dist-artifact/
 *   node scripts/build-artifact.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

execSync('npx vite build --mode artifact --outDir dist-artifact --emptyOutDir', { stdio: 'inherit' });
let html = readFileSync('dist-artifact/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keep = head.split('\n').filter(l => /<title>|<script|<link rel="stylesheet"|<link rel="modulepreload"/.test(l)).join('\n');
writeFileSync('dist-artifact/index.html', `${keep}\n${body}`);
console.log('dist-artifact/index.html rewritten');
