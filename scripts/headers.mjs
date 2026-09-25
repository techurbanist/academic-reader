// Writes Netlify's _headers: a Content-Security-Policy for the app's pages that allows the app's inline script by
// hash, its pinned libraries, and connections only to the services the app uses; plus nosniff and a referrer policy.
// Run by build.sh after stamping: node scripts/headers.mjs public
// Shared pages ("web page for readers" exports) are hosted on a separate subdomain, never on the app's origin:
// anything served here can read the app's browser storage, including the encrypted key vault.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';


export function scriptHash(html, where) {
  const at = html.indexOf('<script>\n"use strict";');
  if (at < 0) throw new Error(`inline app script not found in ${where}`);
  const body = html.slice(at + '<script>'.length, html.indexOf('</script>', at));
  return createHash('sha256').update(body, 'utf8').digest('base64');
}
const connect = ["'self'", 'https://api.anthropic.com', 'https://api.openalex.org', 'https://en.wikipedia.org', 'https://arxiv.org', 'https://export.arxiv.org',
  'https://api.dropboxapi.com', 'https://content.dropboxapi.com', 'https://www.googleapis.com', 'https://oauth2.googleapis.com',
  'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
export const csp = hash => [
  "default-src 'self'",
  `script-src 'self' 'sha256-${hash}' https://cdnjs.cloudflare.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://upload.wikimedia.org",
  `connect-src ${connect.join(' ')}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');

function main() {
  let root = process.argv[2] || 'public';
  if (existsSync(root) && statSync(root).isFile()) root = join(root, '..');   // older call style: path to index.html
  const rules = [['/*', ['X-Content-Type-Options: nosniff', 'Referrer-Policy: strict-origin-when-cross-origin']]];
  const app = csp(scriptHash(readFileSync(join(root, 'index.html'), 'utf8'), 'index.html'));
  for (const path of ['/', '/index.html', '/privacy', '/privacy.html']) rules.push([path, [`Content-Security-Policy: ${app}`]]);
  process.stdout.write(rules.map(([p, hs]) => `${p}\n${hs.map(x => '  ' + x).join('\n')}\n`).join('\n'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
