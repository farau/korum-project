import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'app', 'data', 'korum.html');

export function getRawHtml() {
  try {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

export function extractHead() {
  const raw = getRawHtml();
  const m = raw.match(/<head[\s\S]*?>[\s\S]*?<\/head>/i);
  if (!m) return '';
  return m[0].replace(/<head[^>]*>/i, '').replace(/<\/head>/i, '');
}

export function extractHeadSafe() {
  // same as extractHead but strip <script> tags to avoid running DOM-mutating scripts before React hydration
  const head = extractHead();
  return head.replace(/<script[\s\S]*?<\/script>/gi, '');
}

export function extractHeader() {
  const raw = getRawHtml();
  const m = raw.match(/<header[\s\S]*?>[\s\S]*?<\/header>/i);
  if (!m) return '';
  return m[0];
}

function normalizeHashLinks(html: string) {
  // Map anchor hashes to app routes
  const map: Record<string, string> = {
    '#index': '/explore',
    '#analytics': '/analytics',
    '#earn': '/earn',
    '#leaderboard': '/leaderboard',
    '#concept': '/concept',
    '#create': '/create',
    '#profile': '/profile',
    '#privacy': '/privacy',
    '#terms': '/terms',
  };

  return html.replace(/href=(\"|\')#([a-zA-Z0-9\-]+)(\"|\')/g, (s, q1, hash, q2) => {
    const key = `#${hash}`;
    if (map[key]) return `href=${q1}${map[key]}${q2}`;
    return s;
  });
}

export function extractPage(id: string) {
  const raw = getRawHtml();
  const re = new RegExp(`<div\\s+class=\"page\"\\s+id=\"page-${id}\\"[\\s\\S]*?>[\\s\\S]*?<\\/div>`, 'i');
  const m = raw.match(re);
  if (!m) return '';
  let html = m[0];
  // normalize internal hash links so they point to the Next.js routes
  html = normalizeHashLinks(html);
  return html;
}
