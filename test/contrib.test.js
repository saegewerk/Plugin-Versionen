'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { mergeContributions } = require('../src/core/versiondb');
const { discoverPages, findProductLink } = require('../tools/fetch-images');

test('Nutzer-Meldungen: erst ab zwei Installationen, echte Quellen haben Vorrang', () => {
  const db = { plugins: [{ vendor: 'FabFilter', name: 'Pro-Q 4', latest: '4.02', source: 'html' }] };
  const list = [
    { vendor: 'FabFilter', name: 'Pro-Q 4', versions: { '9.9': 5 } },
    { vendor: 'Kleinfirma', name: 'Ding', url: 'https://klein.example/', versions: { '1.0': 3, '1.2': 2, '1.5': 1 } },
    { vendor: 'Einzel', name: 'Nur einer', versions: { '2.0': 1 } },
    { vendor: 'Böse', name: '<script>', versions: { '1': 9 } },
    { vendor: 'Unbekannt', name: 'X', versions: { '1': 9 } },
  ];
  const { db: out, applied } = mergeContributions(db, list, { now: new Date('2026-11-24') });
  assert.deepStrictEqual(applied.map((a) => a.name), ['Ding']);
  const d = out.plugins.find((p) => p.name === 'Ding');
  assert.strictEqual(d.latest, '1.2');
  assert.strictEqual(d.source, 'nutzer');
  assert.strictEqual(out.plugins.find((p) => p.name === 'Pro-Q 4').latest, '4.02');
  // Höhere Version später: wird übernommen
  const again = mergeContributions(out, [{ vendor: 'Kleinfirma', name: 'Ding', versions: { '1.5': 2 } }]);
  assert.strictEqual(again.db.plugins.find((p) => p.name === 'Ding').latest, '1.5');
});

test('Produktseite auf der Hersteller-Webseite finden', async () => {
  const html = `<a href="/about">Über uns</a><a href="https://www.klein.example/plugins/ding-pro">Ding Pro</a>
    <a href="/plugins/ding">Ding</a><a href="https://fremd.example/ding">Ding</a>`;
  assert.strictEqual(findProductLink(html, 'https://klein.example/', 'Ding'), 'https://klein.example/plugins/ding');
  const images = { plugins: [] };
  const db = { plugins: [{ vendor: 'Kleinfirma', name: 'Ding', source: 'nutzer', url: 'https://klein.example/' }, { vendor: 'A', name: 'B', source: 'html', url: 'https://a.example/' }] };
  const fetchImpl = async () => ({ ok: true, text: async () => html });
  assert.ok(await discoverPages(images, db, { fetchImpl, log: () => {} }));
  assert.deepStrictEqual(images.plugins, [{ vendor: 'Kleinfirma', name: 'Ding', auto: true, page: 'https://klein.example/plugins/ding' }]);
});
