'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const seo = require('../utils/siteSeo');

test('only an explicitly configured public origin creates production canonical URLs', () => {
  assert.equal(seo.publicOrigin({}), '');
  assert.equal(seo.publicOrigin({ CLIENT_URL: 'http://localhost:3000' }), '');
  assert.equal(seo.publicOrigin({ PUBLIC_SITE_URL: 'https://games.example/path/' }), 'https://games.example');
  assert.equal(seo.publicOrigin({ PUBLIC_SITE_URL: 'javascript:alert(1)' }), '');
});

test('landing canonical and social metadata use one absolute canonical root', () => {
  const html = seo.renderLanding('<head><!--PUBLIC_SEO_ORIGIN--></head>', 'https://games.example');
  assert.match(html, /rel="canonical" href="https:\/\/games\.example\/"/);
  assert.match(html, /property="og:url" content="https:\/\/games\.example\/"/);
  assert.match(html, /property="og:image" content="https:\/\/games\.example\/icon-192\.png"/);
});

test('sitemap lists only canonical public landing content and robots points to it', () => {
  const xml = seo.sitemap('https://games.example');
  assert.match(xml, /<loc>https:\/\/games\.example\/<\/loc>/);
  assert.doesNotMatch(xml, /\/play|\/gamehub|\/api/);
  const robots = seo.robots('https://games.example');
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/games\.example\/sitemap\.xml/);
  assert.equal(seo.sitemap(''), '');
});
