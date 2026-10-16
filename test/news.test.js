'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseFeed, check } = require('../tools/check-news');
const notices = require('../src/core/notices');

const RSS = `<rss><channel>
<item><title>Rosetta 2 availability in macOS 28</title><link>https://developer.apple.com/news/?id=a1</link><pubDate>Mon, 08 Jun 2026</pubDate><description><![CDATA[Intel-based apps &amp; plug-ins]]></description></item>
<item><title>New design resources</title><link>https://developer.apple.com/news/?id=b2</link><description>Fonts</description></item>
</channel></rss>`;
const ATOM = `<feed><entry><title>Prism improvements for Arm64EC</title><link href="https://blogs.windows.com/x"/><updated>2026-09-01</updated><summary>emulation</summary></entry></feed>`;

test('RSS und Atom lesen', () => {
  const r = parseFeed(RSS);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].summary, 'Intel-based apps & plug-ins');
  assert.strictEqual(parseFeed(ATOM)[0].link, 'https://blogs.windows.com/x');
});

test('nur neue Treffer mit Stichwort, Fehler blockieren nicht', async () => {
  const pages = { 'https://a.test/rss': RSS, 'https://w.test/atom': ATOM };
  const fetchImpl = async (u) => (pages[u] ? { ok: true, status: 200, text: async () => pages[u] } : { ok: false, status: 404, text: async () => '' });
  const config = { keywords: ['rosetta', 'arm64'], feeds: [{ name: 'A', platform: 'darwin', url: 'https://a.test/rss' }, { name: 'W', platform: 'win32', url: 'https://w.test/atom' }, { name: 'X', url: 'https://x.test/none' }] };
  const r = await check(config, new Set(['https://blogs.windows.com/x']), fetchImpl, new Date('2026-07-01'));
  assert.deepStrictEqual(r.hits.map((h) => h.link), ['https://developer.apple.com/news/?id=a1']);
  assert.strictEqual(r.errors.length, 1);
});

test('notices.json ist gültig', () => {
  const j = require('../notices.json');
  assert.strictEqual(j.format, 1);
  for (const n of j.notices) {
    assert.ok(n.id && n.title && n.text && ['darwin', 'win32'].includes(n.platform) && notices.MATCHERS[n.affects], n.id);
    if (n.url) assert.match(n.url, /^https:\/\//);
  }
  assert.strictEqual(new Set(j.notices.map((n) => n.id)).size, j.notices.length, 'ids eindeutig');
});

test('alte und ignorierte Meldungen fallen weg, HTML wird Text', async () => {
  const rss = `<rss><item><title>Rosetta old</title><link>https://a.test/old</link><pubDate>Mon, 01 Jan 2024</pubDate></item>
    <item><title>Rosetta skip</title><link>https://a.test/skip</link></item>
    <item><title>Rosetta new</title><link>https://a.test/new</link><description>&lt;p&gt;Intel &amp;amp; Rosetta&lt;/p&gt;</description></item></rss>`;
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => rss });
  const r = await check({ keywords: ['rosetta'], ignore: ['https://a.test/skip'], feeds: [{ name: 'A', url: 'https://a.test/rss' }] }, new Set(), fetchImpl, new Date('2026-10-16'));
  assert.deepStrictEqual(r.hits.map((h) => h.link), ['https://a.test/new']);
  assert.strictEqual(r.hits[0].summary, 'Intel & Rosetta');
});
