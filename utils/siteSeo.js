'use strict';

function publicOrigin(env = process.env) {
  const raw = String(env.PUBLIC_SITE_URL || env.CLIENT_URL || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return '';
    return url.origin;
  } catch (_) { return ''; }
}

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function metadataTags(origin) {
  if (!origin) return '';
  const root = `${origin}/`;
  return `\n  <link rel="canonical" href="${root}">\n  <meta property="og:url" content="${root}">\n  <meta property="og:image" content="${origin}/icon-192.png">\n  <meta name="twitter:image" content="${origin}/icon-192.png">`;
}

function renderLanding(html, origin = publicOrigin()) {
  return String(html).replace('<!--PUBLIC_SEO_ORIGIN-->', metadataTags(origin));
}

function sitemap(origin = publicOrigin()) {
  if (!origin) return '';
  const urls = ['/'];
  const entries = urls.map((route) => `  <url><loc>${xmlEscape(origin + route)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function robots(origin = publicOrigin()) {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`;
}

module.exports = { publicOrigin, metadataTags, renderLanding, sitemap, robots };
