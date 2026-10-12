#!/usr/bin/env node
'use strict';
// Erzeugt die gemeinsame Versions-Datenbank.
// Aufruf: node tools/crawl-versions.js [quellen.json] [ausgabe.json] [meldungen.json]
// Läuft nächtlich per GitHub Actions (.github/workflows/versions.yml), geht aber auch lokal.

const fs = require('fs');
const path = require('path');
const versiondb = require('../src/core/versiondb');

const root = path.join(__dirname, '..');
const [srcFile = path.join(root, 'sources.json'), outFile = path.join(root, 'versions.json'), reportsFile] = process.argv.slice(2);

(async () => {
  const sources = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch { /* erster Lauf */ }
  let { db, log } = await versiondb.crawl(sources, { previous });
  if (reportsFile && fs.existsSync(reportsFile)) {
    // GitHub-Issues mit Label "bestätigt": [{ number, body }]
    const issues = JSON.parse(fs.readFileSync(reportsFile, 'utf8'));
    const reports = issues.map((i) => ({ ...versiondb.parseReport(i.body || ''), number: i.number })).filter((r) => r.latest);
    const merged = versiondb.mergeReports(db, reports);
    db = merged.db;
    for (const r of merged.applied) log.push({ vendor: r.vendor, name: r.name, status: `Meldung #${r.number} übernommen: ${r.latest}` });
    fs.writeFileSync(path.join(path.dirname(reportsFile), 'applied.json'), JSON.stringify(merged.applied.map((r) => r.number)));
  }
  // Nur schreiben, wenn sich Versionen geändert haben (sonst entsteht jede Nacht ein leerer Commit)
  const strip = (d) => JSON.stringify((d && d.plugins) || []);
  if (!previous || strip(previous) !== strip(db)) fs.writeFileSync(outFile, JSON.stringify(db, null, 2) + '\n');
  for (const l of log) console.log(`${l.status.padEnd(26)} ${l.vendor} ${l.name || ''} ${l.error || ''}`.trim());
  const bad = log.filter((l) => l.status === 'fehler' || l.status === 'keine Version gefunden').length;
  console.log(`\n${db.plugins.length} Plugins in der Datenbank, ${bad} Quellen ohne Ergebnis.`);
})().catch((e) => { console.error(e); process.exit(1); });
