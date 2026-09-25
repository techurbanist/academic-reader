// Writes Netlify's _headers for the app: a Content-Security-Policy that allows the app's own inline script (by
// hash), its pinned libraries, and connections only to the services the app uses. Run by build.sh after stamping.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const html = readFileSync(process.argv[2], 'utf8');
const at = html.indexOf('<script>\n"use strict";');
if (at < 0) throw new Error('inline app script not found');
const body = html.slice(at + '<script>'.length, html.indexOf('</script>', at));
const hash = createHash('sha256').update(body, 'utf8').digest('base64');
const connect = ["'self'", 'https://api.anthropic.com', 'https://api.openalex.org', 'https://en.wikipedia.org', 'https://arxiv.org', 'https://export.arxiv.org',
  'https://api.dropboxapi.com', 'https://content.dropboxapi.com', 'https://www.googleapis.com', 'https://oauth2.googleapis.com',
  'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
const csp = [
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
process.stdout.write(`/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`);
