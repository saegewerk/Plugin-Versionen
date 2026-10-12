'use strict';
// Gemeinsame Versions-Datenbank: eine JSON-Datei, die ein nächtlicher Crawler (GitHub Actions)
// aus Hersteller-Seiten, GitHub-Releases und Sparkle-Appcasts erzeugt. Die App bringt eine Kopie mit
// und lädt die aktuelle Fassung von einer frei wählbaren Adresse. Bestätigte Nutzer-Meldungen
// (GitHub-Issues) fließen beim nächsten Lauf mit ein.
//
// Format: { format: 1, generated, plugins: [ { vendor, name, aliases?, latest, url, released?, source } ] }

const { cmpVersion } = require('./insights');
const { extractVersion, fetchText } = require('./updates');

const FORMAT = 1;
const VERSION_RE = /^\d+(?:\.\d+){0,3}[a-z]?\d*$/i;

function cleanVersion(v) {
  const s = String(v || '').trim().replace(/^v(?=\d)/i, '');
  return VERSION_RE.test(s) ? s : null;
}

// "1_4_0" -> "1.4.0"; mit format "digits" (z. B. u-he-Dateinamen) "148" -> "1.4.8"
function normalize(v, format) {
  if (v == null) return v;
  let s = String(v).trim().replace(/_/g, '.');
  if (format === 'digits' && /^\d{2,4}$/.test(s)) s = s.split('').join('.');
  return s;
}

// Ein Wert aus JSON per Pfad "a.b.0.c"
function jsonPath(obj, p) {
  return String(p || '').split('.').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Sparkle-Appcast: höchste Version aller Einträge
function sparkleVersion(xml) {
  const found = [];
  for (const m of String(xml).matchAll(/sparkle:shortVersionString\s*=\s*"([^"]+)"|<sparkle:shortVersionString>([^<]+)</g)) found.push(m[1] || m[2]);
  if (!found.length) for (const m of String(xml).matchAll(/sparkle:version\s*=\s*"([^"]+)"|<sparkle:version>([^<]+)</g)) found.push(m[1] || m[2]);
  const ok = found.map(cleanVersion).filter(Boolean);
  return ok.length ? ok.reduce((a, b) => (cmpVersion(a, b) >= 0 ? a : b)) : null;
}

// Liefert für eine Quelle die Versionen ihrer Produkte: [{ name, latest }]
async function readSource(src, fetchImpl) {
  const products = src.products || [{ name: src.name, pattern: src.pattern, path: src.path }];
  const type = src.type || 'html';
  if (type === 'github') {
    // url: https://api.github.com/repos/<owner>/<repo>/releases/latest
    const j = JSON.parse(await fetchText(src.url, fetchImpl));
    const v = cleanVersion(String(j.tag_name || j.name || '').replace(/^[^\d]*/, ''));
    return products.map((p) => ({ name: p.name, latest: v }));
  }
  const text = await fetchText(src.url, fetchImpl);
  if (type === 'sparkle') return products.map((p) => ({ name: p.name, latest: sparkleVersion(text) }));
  if (type === 'json') {
    const j = JSON.parse(text);
    return products.map((p) => ({ name: p.name, latest: cleanVersion(jsonPath(j, p.path || src.path)) }));
  }
  return products.map((p) => ({ name: p.name, latest: cleanVersion(normalize(extractVersion(text, p.pattern || src.pattern), p.format)) }));
}

const keyOf = (e) => (e.vendor + '|' + e.name).toLowerCase();

// Crawlt alle Quellen. Fehlschläge behalten den alten Stand; ein plötzlich NIEDRIGERER Wert
// gilt als Fehlgriff des Musters und wird nicht übernommen.
async function crawl(sources, { previous = null, fetchImpl, now = new Date() } = {}) {
  const old = new Map(((previous && previous.plugins) || []).map((e) => [keyOf(e), e]));
  const next = new Map(old);
  const log = [];
  for (const src of sources) {
    let got;
    try { got = await readSource(src, fetchImpl); } catch (e) {
      log.push({ vendor: src.vendor, url: src.url, status: 'fehler', error: e.message });
      continue;
    }
    for (const g of got) {
      const k = keyOf({ vendor: src.vendor, name: g.name });
      const prev = old.get(k);
      const meta = (src.products || []).find((p) => p.name === g.name) || src;
      if (!g.latest) { log.push({ vendor: src.vendor, name: g.name, url: src.url, status: 'keine Version gefunden' }); continue; }
      if (prev && cmpVersion(g.latest, prev.latest) < 0) {
        log.push({ vendor: src.vendor, name: g.name, status: 'verdächtig', error: `${g.latest} < ${prev.latest}, behalte alten Wert` });
        continue;
      }
      const changed = !prev || cmpVersion(g.latest, prev.latest) > 0;
      next.set(k, {
        vendor: src.vendor, name: g.name, ...(meta.aliases ? { aliases: meta.aliases } : {}),
        latest: g.latest, url: meta.download || src.download || src.url,
        released: changed ? now.toISOString().slice(0, 10) : (prev.released || null), source: src.type || 'html',
      });
      log.push({ vendor: src.vendor, name: g.name, status: changed ? (prev ? `neu: ${prev.latest} → ${g.latest}` : `aufgenommen: ${g.latest}`) : 'unverändert' });
    }
  }
  return { db: build([...next.values()], now), log };
}

function build(plugins, now = new Date()) {
  return { format: FORMAT, generated: now.toISOString(), plugins: plugins.sort((a, b) => keyOf(a).localeCompare(keyOf(b))) };
}

// ---------- Nutzer-Meldungen ----------

// Text eines GitHub-Issues aus reportUrl() zurücklesen
function parseReport(body) {
  const get = (label) => (String(body).match(new RegExp(`^\\s*[-*]?\\s*${label}\\s*:\\s*(.+)$`, 'mi')) || [])[1]?.trim() || '';
  const r = { vendor: get('Hersteller'), name: get('Plugin'), latest: cleanVersion(get('Neueste Version')), url: get('Quelle') };
  if (!r.vendor || !r.name || !r.latest) return null;
  if (!/^https?:\/\//i.test(r.url)) r.url = null;
  return r;
}

// Bestätigte Meldungen übernehmen, nur wenn sie neuer sind
function mergeReports(db, reports, now = new Date()) {
  const map = new Map(((db && db.plugins) || []).map((e) => [keyOf(e), e]));
  const applied = [];
  for (const r of reports) {
    if (!r) continue;
    const k = keyOf(r);
    const prev = map.get(k);
    if (prev && cmpVersion(r.latest, prev.latest) <= 0) continue;
    map.set(k, { ...(prev || {}), vendor: r.vendor, name: r.name, latest: r.latest, url: r.url || prev?.url || null, released: now.toISOString().slice(0, 10), source: 'meldung' });
    applied.push(r);
  }
  return { db: build([...map.values()], now), applied };
}

// Vorausgefülltes GitHub-Issue (kein Konto in der App nötig, der Browser übernimmt)
function reportUrl(repo, { vendor, name, installed, latest, url }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo || ''))) return null;
  const body = [
    'Neue Plugin-Version gemeldet aus Plugin Organizer.', '',
    `- Hersteller: ${vendor}`, `- Plugin: ${name}`, `- Neueste Version: ${latest}`,
    `- Installiert: ${installed || 'unbekannt'}`, `- Quelle: ${url || ''}`,
  ].join('\n');
  const q = new URLSearchParams({ title: `Version: ${vendor} ${name} ${latest}`, labels: 'version-meldung', body });
  return `https://github.com/${repo}/issues/new?${q}`;
}

// Eigene, manuell eingetragene Versionen als teilbaren Feed
function exportFeed(products, updates) {
  const plugins = products.filter((p) => updates[p.key] && updates[p.key].source === 'manuell')
    .map((p) => ({ vendor: p.vendor, name: p.name, latest: updates[p.key].latest, url: updates[p.key].url || null, source: 'manuell' }));
  return build(plugins);
}

module.exports = { FORMAT, cleanVersion, normalize, jsonPath, sparkleVersion, readSource, crawl, parseReport, mergeReports, reportUrl, exportFeed, build };
