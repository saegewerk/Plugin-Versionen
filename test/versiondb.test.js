'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const vdb = require('../src/core/versiondb');
const { applyFeed, checkAll } = require('../src/core/updates');

// Simuliertes Internet: url -> Text (oder Error)
function fakeFetch(pages) {
  return async (url) => {
    const v = pages[url];
    if (v === undefined || v instanceof Error) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => (typeof v === 'string' ? v : JSON.stringify(v)) };
  };
}

const SOURCES = [
  { vendor: 'Surge Synth Team', name: 'Surge XT', type: 'github', url: 'https://api.github.com/repos/surge-synthesizer/surge/releases/latest' },
  { vendor: 'Acme', name: 'Synth One', type: 'sparkle', url: 'https://acme.test/appcast.xml' },
  { vendor: 'Acme', type: 'html', url: 'https://acme.test/versions', products: [
    { name: 'Comp', pattern: 'Comp[^0-9]{0,20}(\\d+\\.\\d+(?:\\.\\d+)?)' },
    { name: 'Verb', pattern: 'Verb[^0-9]{0,20}(\\d+\\.\\d+(?:\\.\\d+)?)', aliases: ['Acme Reverb'] },
  ] },
  { vendor: 'Beta', name: 'Delay', type: 'json', url: 'https://beta.test/api', path: 'products.0.version' },
  { vendor: 'Gone', name: 'Old', url: 'https://gone.test/' },
];
const PAGES = {
  'https://api.github.com/repos/surge-synthesizer/surge/releases/latest': { tag_name: 'release_xt_1.3.4' },
  'https://acme.test/appcast.xml': '<rss><item><enclosure sparkle:shortVersionString="2.1.0" sparkle:version="210"/></item><item><enclosure sparkle:shortVersionString="2.0.5"/></item></rss>',
  'https://acme.test/versions': '<li>Comp version 3.2.1</li><li>Verb v1.10</li>',
  'https://beta.test/api': { products: [{ version: 'v5.0' }] },
};

test('Crawler liest GitHub, Sparkle, HTML mit mehreren Produkten und JSON', async () => {
  const { db, log } = await vdb.crawl(SOURCES, { fetchImpl: fakeFetch(PAGES), now: new Date('2026-10-12T03:00:00Z') });
  const v = Object.fromEntries(db.plugins.map((p) => [p.name, p.latest]));
  assert.deepStrictEqual(v, { 'Surge XT': '1.3.4', 'Synth One': '2.1.0', Comp: '3.2.1', Verb: '1.10', Delay: '5.0' });
  assert.deepStrictEqual(db.plugins.find((p) => p.name === 'Verb').aliases, ['Acme Reverb']);
  assert.ok(log.some((l) => l.vendor === 'Gone' && l.status === 'fehler'));
  assert.strictEqual(db.format, 1);
});

test('Crawler behält alten Stand bei Fehlern und ignoriert plötzlich niedrigere Versionen', async () => {
  const { db: first } = await vdb.crawl(SOURCES, { fetchImpl: fakeFetch(PAGES), now: new Date('2026-10-01') });
  const pages2 = { ...PAGES, 'https://acme.test/versions': '<li>Comp version 1.0</li><li>Verb v1.11</li>', 'https://beta.test/api': new Error('down') };
  const { db, log } = await vdb.crawl(SOURCES, { previous: first, fetchImpl: fakeFetch(pages2), now: new Date('2026-10-12') });
  const get = (n) => db.plugins.find((p) => p.name === n);
  assert.strictEqual(get('Comp').latest, '3.2.1', 'niedrigere Version wird nicht übernommen');
  assert.ok(log.some((l) => l.name === 'Comp' && l.status === 'verdächtig'));
  assert.strictEqual(get('Verb').latest, '1.11');
  assert.strictEqual(get('Verb').released, '2026-10-12');
  assert.strictEqual(get('Surge XT').released, '2026-10-01', 'unverändert behält Datum');
  assert.strictEqual(get('Delay').latest, '5.0', 'Ausfall behält alten Wert');
});

test('Versionsnummern normalisieren', () => {
  assert.strictEqual(vdb.normalize('148', 'digits'), '1.4.8');
  assert.strictEqual(vdb.normalize('1_4_0'), '1.4.0');
  assert.strictEqual(vdb.cleanVersion('5.5.5.19885'), '5.5.5.19885');
  assert.strictEqual(vdb.cleanVersion('Version'), null);
});

test('Meldungen: Link erzeugen, zurücklesen, nur neuere übernehmen', () => {
  const link = vdb.reportUrl('chico/plugin-organizer', { vendor: 'FabFilter', name: 'Pro-Q 4', installed: '4.0', latest: '4.02', url: 'https://www.fabfilter.com/download' });
  const u = new URL(link);
  assert.strictEqual(u.pathname, '/chico/plugin-organizer/issues/new');
  assert.strictEqual(u.searchParams.get('labels'), 'version-meldung');
  const r = vdb.parseReport(u.searchParams.get('body'));
  assert.deepStrictEqual(r, { vendor: 'FabFilter', name: 'Pro-Q 4', latest: '4.02', url: 'https://www.fabfilter.com/download' });
  assert.strictEqual(vdb.reportUrl('kein repo', r), null);
  assert.strictEqual(vdb.parseReport('- Hersteller: X\n- Plugin: Y\n- Neueste Version: bald'), null);
  const db = vdb.build([{ vendor: 'FabFilter', name: 'Pro-Q 4', latest: '4.03', url: null }, { vendor: 'Acme', name: 'Comp', latest: '1.0' }]);
  const { db: out, applied } = vdb.mergeReports(db, [r, { vendor: 'Acme', name: 'Comp', latest: '1.1', url: 'javascript:x' }]);
  assert.strictEqual(applied.length, 1, 'ältere Meldung wird ignoriert');
  assert.strictEqual(out.plugins.find((p) => p.name === 'Pro-Q 4').latest, '4.03');
  assert.strictEqual(out.plugins.find((p) => p.name === 'Comp').latest, '1.1');
});

test('Zuordnung: Aliase, unbekannter Hersteller, höchste Version gewinnt', async () => {
  const P = [
    { key: 'a', name: 'FabFilter Pro-Q 4', vendor: 'FabFilter', items: [] },
    { key: 'b', name: 'Acme Reverb', vendor: 'Acme', items: [] },
    { key: 'c', name: 'Delay', vendor: 'Unbekannt', items: [] },
    { key: 'd', name: 'Delay', vendor: 'Other', items: [] },
  ];
  const feed = { plugins: [{ vendor: 'FabFilter', name: 'Pro-Q 4', latest: '4.02' }, { vendor: 'Acme', name: 'Verb', aliases: ['Acme Reverb'], latest: '1.1' }, { vendor: 'Beta', name: 'Delay', latest: '5.0' }] };
  const m = applyFeed(P, feed, 'db');
  assert.strictEqual(m.a.latest, '4.02');
  assert.strictEqual(m.b.latest, '1.1');
  assert.strictEqual(m.c.latest, '5.0', 'unbekannter Hersteller per Name');
  assert.ok(!m.d, 'anderer bekannter Hersteller wird nicht verwechselt');
  const { result } = await checkAll(P, {
    dbs: [{ feed, source: 'mitgeliefert' }],
    feeds: [{ url: 'https://x.test/db.json', source: 'Datenbank' }],
    fetchImpl: fakeFetch({ 'https://x.test/db.json': { plugins: [{ vendor: 'FabFilter', name: 'Pro-Q 4', latest: '4.10' }, { vendor: 'Acme', name: 'Verb', aliases: ['Acme Reverb'], latest: '1.0' }] } }),
  });
  assert.strictEqual(result.a.latest, '4.10');
  assert.strictEqual(result.a.source, 'Datenbank');
  assert.strictEqual(result.b.latest, '1.1', 'niedrigerer Online-Wert verdrängt nicht');
});

test('Mitgelieferte Datenbank ist gültig', () => {
  const db = require('../versions.json');
  assert.strictEqual(db.format, 1);
  for (const p of db.plugins) {
    assert.ok(p.vendor && p.name && vdb.cleanVersion(p.latest), JSON.stringify(p));
  }
  const sources = require('../sources.json');
  for (const s of sources) {
    assert.ok(s.vendor && /^https:\/\//.test(s.url), JSON.stringify(s));
    for (const p of s.products || [s]) if (p.pattern) new RegExp(p.pattern, 'i');
  }
});
