// Writes _headers (read by Cloudflare and Netlify): a Content-Security-Policy for the app's pages that allows the app's inline script by
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
// The exact library files the page loads, not all of cdnjs: a whole-host allowance would let injected markup pull in
// any old library on cdnjs as a script gadget. Read from the page, so upgrading a library updates the policy.
export function libs(html) {
  const scripts = [...html.matchAll(/<script src="(https:\/\/cdnjs\.cloudflare\.com\/[^"]+)"/g)].map(m => m[1]);
  const pdfjs = (html.match(/const PDFJS='(https:\/\/cdnjs\.cloudflare\.com\/[^']+\/)'/) || [])[1];
  if (!scripts.length || !pdfjs) throw new Error('library URLs not found in index.html');
  return { scripts: [...scripts, pdfjs + 'pdf.min.js'], pdfjs };   // the pdf.js worker is fetched from its folder, then run as a blob
}
// Cloudflare Web Analytics, which Cloudflare injects into page loads as .../beacon.min.js/<version> (with its own
// integrity hash). The trailing slash matters: without it the entry matches only the bare file, not the versioned
// path. Its reports go to /cdn-cgi/rum on this site, which connect-src 'self' covers.
const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js/';
const connect = ["'self'", 'https://api.anthropic.com', 'https://api.openalex.org', 'https://en.wikipedia.org', 'https://arxiv.org', 'https://export.arxiv.org',
  'https://api.dropboxapi.com', 'https://content.dropboxapi.com', 'https://www.googleapis.com', 'https://oauth2.googleapis.com',
  'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
export const csp = (hash, lib) => [
  "default-src 'self'",
  `script-src 'self' 'sha256-${hash}' ${lib.scripts.join(' ')} ${BEACON}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://upload.wikimedia.org",
  `connect-src ${[...connect, lib.pdfjs].join(' ')}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');

function main() {
  let root = process.argv[2] || 'public';
  if (existsSync(root) && statSync(root).isFile()) root = join(root, '..');   // older call style: path to index.html
  // HSTS: browsers that have seen the site once never load it over plain HTTP again (the zone also redirects HTTP).
  const rules = [['/*', ['X-Content-Type-Options: nosniff', 'Referrer-Policy: strict-origin-when-cross-origin', 'Strict-Transport-Security: max-age=31536000']]];
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const app = csp(scriptHash(html, 'index.html'), libs(html));
  for (const path of ['/', '/index.html', '/privacy', '/privacy.html']) rules.push([path, [`Content-Security-Policy: ${app}`]]);
  process.stdout.write(rules.map(([p, hs]) => `${p}\n${hs.map(x => '  ' + x).join('\n')}\n`).join('\n'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
