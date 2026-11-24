#!/usr/bin/env node
'use strict';
// Holt zu jedem Plugin aus images.json das Vorschaubild der Herstellerseite (og:image / twitter:image)
// und trägt nur den Link in versions.json ein (Felder "image" und "page"). Bilder werden nicht kopiert.
// Aufruf: node tools/fetch-images.js [images.json] [versions.json]
// Neu geprüft wird ein Eintrag, wenn er noch kein Bild hat, die Seite geändert wurde oder die Prüfung älter als 30 Tage ist.

const fs = require('fs');
const path = require('path');

const MAX_AGE = 30 * 24 * 3600 * 1000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 Plugin-Versionen';
const key = (v, n) => `${String(v).toLowerCase()}|${String(n).toLowerCase()}`;

function decode(s) { return s.replace(/&amp;/g, '&').replace(/&#0?38;/g, '&').replace(/&quot;/g, '"').replace(/&#x2F;/gi, '/'); }

// Vorschaubild aus dem HTML einer Seite; relative Links werden gegen die Seite aufgelöst. Nur https.
function findImage(html, pageUrl) {
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  const want = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'];
  const found = {};
  for (const m of metas) {
    const name = (m.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const content = (m.match(/\bcontent\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (name && content && !found[name.toLowerCase()]) found[name.toLowerCase()] = decode(content.trim());
  }
  if (!Object.keys(found).length) {
    const l = html.match(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/i);
    const h = l && (l[0].match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (h) found.image_src = decode(h.trim());
  }
  for (const n of [...want, 'image_src']) {
    if (!found[n]) continue;
    try {
      const u = new URL(found[n], pageUrl);
      if (u.protocol === 'https:') return u.href;
    } catch { /* ungültig */ }
  }
  return null;
}

async function fetchPage(url, fetchImpl = globalThis.fetch) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetchImpl(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

// Links aus images.json in die Einträge der Datenbank übernehmen (ändert db.plugins direkt)
function applyImages(db, images) {
  const map = new Map(((images && images.plugins) || []).filter((e) => e.image).map((e) => [key(e.vendor, e.name), e]));
  for (const p of (db && db.plugins) || []) {
    const e = map.get(key(p.vendor, p.name));
    if (e) { p.image = e.image; p.page = e.page; } else { delete p.image; delete p.page; }
  }
  return db;
}

async function refresh(images, { fetchImpl, now = Date.now(), log = console.log } = {}) {
  let changed = false;
  for (const e of images.plugins || []) {
    if (!e.page) continue;
    const fresh = e.image && e.checkedPage === e.page && e.checked && now - Date.parse(e.checked) < MAX_AGE;
    if (fresh) continue;
    try {
      const img = findImage(await fetchPage(e.page, fetchImpl), e.page);
      if (img !== (e.image || null)) changed = true;
      if (img) { e.image = img; delete e.error; log(`Bild          ${e.vendor} ${e.name}`); } else { delete e.image; e.error = 'kein Vorschaubild'; log(`kein Bild     ${e.vendor} ${e.name}`); }
    } catch (err) {
      e.error = err.message; log(`fehler        ${e.vendor} ${e.name} ${err.message}`);
      // Ein vorhandenes Bild bleibt bei einem einmaligen Fehler stehen
    }
    e.checked = new Date(now).toISOString(); e.checkedPage = e.page; changed = true;
  }
  return changed;
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const [imgFile = path.join(root, 'images.json'), dbFile = path.join(root, 'versions.json')] = process.argv.slice(2);
  (async () => {
    const images = JSON.parse(fs.readFileSync(imgFile, 'utf8'));
    if (await refresh(images)) fs.writeFileSync(imgFile, JSON.stringify(images, null, 2) + '\n');
    const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    const before = JSON.stringify(db.plugins);
    applyImages(db, images);
    if (JSON.stringify(db.plugins) !== before) fs.writeFileSync(dbFile, JSON.stringify(db, null, 2) + '\n');
    const n = (images.plugins || []).filter((e) => e.image).length;
    console.log(`\n${n} von ${(images.plugins || []).length} Plugins mit Bild.`);
  })().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { findImage, applyImages, refresh };
