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

function requestOrigin(req) {
  if (!req) return '';
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `${proto}://${host}` : '';
}

// Social crawlers (WhatsApp, Telegram, X) only accept ABSOLUTE image URLs, and need >= 300px to show a proper logo card.
function metadataTags(origin, path = '/') {
  if (!origin) return '';
  const url = origin + path, img = `${origin}/logo-512.png`;
  return `\n  <link rel="canonical" href="${url}">\n  <meta property="og:url" content="${url}">\n  <meta property="og:image" content="${img}">\n  <meta property="og:image:secure_url" content="${img}">\n  <meta property="og:image:type" content="image/png">\n  <meta property="og:image:width" content="512">\n  <meta property="og:image:height" content="512">\n  <meta property="og:image:alt" content="AllConnect logo">\n  <meta name="twitter:image" content="${img}">`;
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

module.exports = { requestOrigin, publicOrigin, metadataTags, renderLanding, sitemap, robots };
