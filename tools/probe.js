#!/usr/bin/env node
'use strict';
// Hilft beim Schreiben neuer Quellen: zeigt Status und Textstellen rund um "version" für jede Adresse.
// Aufruf: node tools/probe.js <url> [weitere urls …]
const { fetchText } = require('../src/core/updates');
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', Accept: 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' };
(async () => {
  for (const url of process.argv.slice(2)) {
    try {
      const html = await fetchText(url, undefined, HEADERS);
      const hits = [...html.matchAll(/.{0,80}version.{0,120}/gis)].slice(0, 6).map((m) => m[0].replace(/\s+/g, ' '));
      console.log(`\n== ${url}  OK ${html.length} Zeichen`);
      for (const h of hits) console.log('   ' + h);
    } catch (e) { console.log(`\n== ${url}  ${e.message}`); }
  }
})();
