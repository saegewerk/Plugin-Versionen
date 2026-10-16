#!/usr/bin/env node
'use strict';
// Prüft einmal pro Woche alle Download-Seiten aus downloads.json. Tote Links landen in EINEM Issue
// (Label "links"), das bei jedem Lauf aktualisiert und geschlossen wird, sobald alles wieder geht.
// 403/429/503 zählen nicht als tot: viele Hersteller sperren nur Server wie GitHub aus.
//
// Aufruf: node tools/check-links.js downloads.json [--issue] [--force]

const fs = require('fs');

const UNCLEAR = new Set([401, 403, 405, 429, 503]);

function collect(data) {
  const out = [];
  for (const [vendor, v] of Object.entries((data && data.vendors) || {})) {
    if (v.download) out.push({ vendor, what: 'Download-Seite', url: v.download });
    for (const [name, url] of Object.entries(v.products || {})) out.push({ vendor, what: name, url });
  }
  const seen = new Set();
  return out.filter((x) => !seen.has(x.url) && seen.add(x.url));
}

function classify(status, error) {
  if (error) return /abort|timeout/i.test(error) ? 'unklar' : 'tot';
  if (status >= 200 && status < 400) return 'ok';
  return UNCLEAR.has(status) ? 'unklar' : 'tot';
}

async function check(list, fetchImpl = fetch) {
  const res = [];
  for (const x of list) {
    let status = 0; let error = null;
    try {
      const r = await fetchImpl(x.url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0 (Plugin-Versionen Link-Check)' } });
      status = r.status;
    } catch (e) { error = String((e && (e.cause && e.cause.code)) || (e && e.name) || e); }
    res.push({ ...x, status, error, result: classify(status, error) });
  }
  return res;
}

module.exports = { collect, classify, check };

if (require.main === module) {
  (async () => {
    const force = process.argv.includes('--force');
    if (!force && new Date().getUTCDay() !== 1) { console.log('Link-Check läuft nur montags (--force für sofort).'); return; }
    const data = JSON.parse(fs.readFileSync(process.argv[2] || 'downloads.json', 'utf8'));
    const res = await check(collect(data));
    const dead = res.filter((r) => r.result === 'tot');
    console.log(`${res.length} Links geprüft: ${res.filter((r) => r.result === 'ok').length} ok, ${dead.length} tot, ${res.filter((r) => r.result === 'unklar').length} unklar`);
    for (const d of dead) console.log(`TOT ${d.vendor} · ${d.what}: ${d.url} (${d.status || d.error})`);
    if (!process.argv.includes('--issue')) return;
    // gh direkt mit Argumenten aufrufen, nie über eine Shell
    const { execFileSync } = require('child_process');
    const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' });
    gh(['label', 'create', 'links', '--color', 'fbca04', '--description', 'Tote Download-Links in downloads.json', '--force']);
    const open = JSON.parse(gh(['issue', 'list', '--label', 'links', '--state', 'open', '--json', 'number', '--limit', '5']));
    if (!dead.length) {
      for (const i of open) gh(['issue', 'close', String(i.number), '--comment', 'Alle Download-Links funktionieren wieder.']);
      return;
    }
    const body = ['Diese Download-Seiten liefern einen Fehler. Bitte in downloads.json korrigieren (nur Adressen auf der Seite des Herstellers).', '',
      ...dead.map((d) => `- **${d.vendor}** · ${d.what}: ${d.url} (${d.status || d.error})`), '',
      `Stand: ${new Date().toISOString().slice(0, 10)}. Das Issue wird bei jedem Lauf aktualisiert und schließt sich, sobald alles wieder geht.`].join('\n');
    if (open.length) gh(['issue', 'edit', String(open[0].number), '--body', body]);
    else gh(['issue', 'create', '--title', `Tote Download-Links (${dead.length})`, '--label', 'links', '--body', body]);
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
