'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { findImage, applyImages, refresh } = require('../tools/fetch-images');

test('findet og:image, auch mit vertauschter Reihenfolge und relativem Link', () => {
  assert.strictEqual(findImage('<meta content="https://cdn.x.com/a.jpg" property="og:image">', 'https://x.com/p'), 'https://cdn.x.com/a.jpg');
  assert.strictEqual(findImage('<meta property="og:image" content="/img/b.png?a=1&amp;b=2">', 'https://x.com/p/'), 'https://x.com/img/b.png?a=1&b=2');
  assert.strictEqual(findImage('<meta name="twitter:image" content="https://x.com/t.jpg">', 'https://x.com/'), 'https://x.com/t.jpg');
  assert.strictEqual(findImage('<meta property="og:image" content="http://x.com/u.jpg">', 'https://x.com/'), null);
  assert.strictEqual(findImage('<p>nichts</p>', 'https://x.com/'), null);
});

test('Bild-Links landen in der Datenbank, verschwundene werden entfernt', () => {
  const db = { plugins: [{ vendor: 'u-he', name: 'Diva' }, { vendor: 'TAL', name: 'X', image: 'https://alt', page: 'https://alt' }] };
  applyImages(db, { plugins: [{ vendor: 'U-HE', name: 'diva', page: 'https://u-he.com/products/diva/', image: 'https://u-he.com/d.jpg' }] });
  assert.strictEqual(db.plugins[0].image, 'https://u-he.com/d.jpg');
  assert.strictEqual(db.plugins[1].image, undefined);
});

test('frische Einträge werden nicht neu geladen, Fehler behalten das alte Bild', async () => {
  const now = Date.parse('2026-11-24T00:00:00Z');
  const images = { plugins: [
    { vendor: 'a', name: 'frisch', page: 'https://a/1', image: 'https://a/1.jpg', checked: '2026-11-20T00:00:00Z', checkedPage: 'https://a/1' },
    { vendor: 'a', name: 'neu', page: 'https://a/2' },
    { vendor: 'a', name: 'kaputt', page: 'https://a/3', image: 'https://a/3.jpg', checked: '2026-01-01T00:00:00Z', checkedPage: 'https://a/3' },
  ] };
  const seen = [];
  const fetchImpl = async (u) => { seen.push(u); if (u.endsWith('3')) return { ok: false, status: 500 }; return { ok: true, text: async () => '<meta property="og:image" content="https://a/neu.jpg">' }; };
  await refresh(images, { fetchImpl, now, log: () => {} });
  assert.deepStrictEqual(seen, ['https://a/2', 'https://a/3']);
  assert.strictEqual(images.plugins[1].image, 'https://a/neu.jpg');
  assert.strictEqual(images.plugins[2].image, 'https://a/3.jpg');
  assert.strictEqual(images.plugins[2].error, 'HTTP 500');
});
