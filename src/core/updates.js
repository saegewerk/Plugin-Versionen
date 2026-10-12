'use strict';
// Update-Prüfung ohne Abo und ohne zentrale Datenbank eines Einzelnen:
// 1) Versions-Feeds (JSON), die jeder hosten und teilen kann,
// 2) pro Plugin eine eigene Quelle (Webseite + Muster),
// 3) manuell eingetragene neueste Version.

const { productKey, normalizeVendor } = require('./categories');
const { cmpVersion } = require('./insights');

// Feed-Format: { "plugins": [ { "vendor": "FabFilter", "name": "Pro-Q 4", "aliases": ["ProQ4"], "latest": "4.02", "url": "https://..." } ] }
// Zuordnung über Produktschlüssel + Hersteller; bei unbekanntem Hersteller reicht ein eindeutiger Name.
function applyFeed(products, feed, source) {
  const out = {};
  const byKey = new Map();
  const byName = new Map();
  for (const p of products) {
    if (p.isShell) continue;
    const k = productKey(p.name, p.vendor);
    byKey.set(k + '@' + p.vendor.toLowerCase(), p);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(p);
  }
  for (const e of (feed && feed.plugins) || []) {
    if (!e || !e.latest || !e.name) continue;
    const vendor = normalizeVendor(e.vendor || '');
    for (const n of [e.name, ...(e.aliases || [])]) {
      const k = productKey(n, vendor);
      const hits = [byKey.get(k + '@' + vendor.toLowerCase())].filter(Boolean);
      if (!hits.length) hits.push(...(byName.get(k) || []).filter((p) => p.vendor === 'Unbekannt'));
      for (const p of hits) out[p.key] = { latest: String(e.latest), url: e.url || null, source, checkedAt: new Date().toISOString() };
      if (hits.length) break;
    }
  }
  return out;
}

// Mehrere Quellen: die höchste Version gewinnt
function mergeHighest(target, add) {
  for (const [k, v] of Object.entries(add)) {
    if (!target[k] || cmpVersion(v.latest, target[k].latest) > 0) target[k] = v;
  }
  return target;
}

function extractVersion(html, pattern) {
  if (pattern) {
    const m = html.match(new RegExp(pattern, 'i'));
    return m ? (m[1] || m[0]).trim() : null;
  }
  // Standard: erste Versionsangabe nach "Version"
  const m = html.match(/version[^0-9]{0,20}(\d+(?:\.\d+){1,3})/i);
  return m ? m[1] : null;
}

async function fetchText(url, fetchImpl = globalThis.fetch) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetchImpl(url, { signal: ctl.signal, headers: { 'User-Agent': 'PluginOrganizer/0.5' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

// dbs: bereits geladene Datenbanken [{ feed, source }] (z. B. mitgelieferte Kopie)
async function checkAll(products, { dbs = [], feeds = [], sources = {}, fetchImpl } = {}) {
  const result = {};
  const errors = [];
  const meta = {};
  for (const d of dbs) mergeHighest(result, applyFeed(products, d.feed, d.source));
  for (const f of feeds) {
    const url = typeof f === 'string' ? f : f.url;
    const label = typeof f === 'string' ? url : f.source || url;
    try {
      const feed = JSON.parse(await fetchText(url, fetchImpl));
      meta[url] = { generated: feed.generated || null, count: ((feed && feed.plugins) || []).length };
      mergeHighest(result, applyFeed(products, feed, label));
    } catch (e) { errors.push({ url, error: e.message }); }
  }
  for (const [key, s] of Object.entries(sources)) {
    if (!s.url) continue;
    try {
      const v = extractVersion(await fetchText(s.url, fetchImpl), s.pattern);
      if (v) mergeHighest(result, { [key]: { latest: v, url: s.url, source: 'Webseite', checkedAt: new Date().toISOString() } });
      else errors.push({ url: s.url, error: 'Keine Versionsnummer gefunden' });
    } catch (e) { errors.push({ url: s.url, error: e.message }); }
  }
  return { result, errors, meta };
}

module.exports = { checkAll, applyFeed, extractVersion, fetchText, mergeHighest };
