#!/usr/bin/env node
'use strict';
// Sucht in den Nachrichten von Apple und Microsoft nach Ankündigungen, die Audio-Plugins betreffen
// könnten (Rosetta, 32 Bit, ARM …). Treffer werden NICHT automatisch übernommen: der Workflow legt
// für jeden neuen Treffer ein Issue mit Label "os-news" an. Wer es prüft, trägt bei Bedarf einen
// Hinweis in notices.json ein und schließt das Issue.
//
// Aufruf: node tools/check-news.js news-sources.json bekannte-links.txt > neue-treffer.json

const fs = require('fs');
const { fetchText } = require('../src/core/updates');

// Erst Entities auflösen, dann Tags entfernen: viele Feeds liefern HTML als &lt;p&gt;
const decode = (s) => String(s || '').replace(/&amp;(?=[a-z#]+;)/g, '&').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// RSS (<item>) und Atom (<entry>)
function parseFeed(xml) {
  const items = [];
  for (const m of String(xml).matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)) {
    const block = m[0];
    const tag = (name) => (block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1];
    const link = decode(tag('link')) || (block.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    items.push({ title: decode(tag('title')), link: link.trim(), date: decode(tag('pubDate') || tag('updated') || tag('published')), summary: decode(tag('description') || tag('summary')).slice(0, 600) });
  }
  return items;
}

function matches(item, keywords) {
  const hay = (item.title + ' ' + item.summary).toLowerCase();
  return keywords.filter((k) => hay.includes(k));
}

async function check(config, known, fetchImpl, now = new Date()) {
  const hits = []; const errors = [];
  const ignore = new Set(config.ignore || []);
  const maxAge = (config.maxAgeDays || 180) * 864e5;
  for (const f of config.feeds) {
    let items;
    try { items = parseFeed(await fetchText(f.url, fetchImpl, { 'User-Agent': 'Mozilla/5.0 (compatible; Plugin-Versionen news check)' })); } catch (e) { errors.push({ feed: f.name, error: e.message }); continue; }
    for (const it of items) {
      if (!/^https:\/\//.test(it.link) || known.has(it.link) || ignore.has(it.link)) continue;
      const t = Date.parse(it.date);
      if (!Number.isNaN(t) && now - t > maxAge) continue; // alte Meldungen nicht nachträglich melden
      const kw = matches(it, config.keywords);
      if (kw.length) hits.push({ feed: f.name, platform: f.platform, ...it, keywords: kw });
    }
  }
  return { hits, errors };
}

module.exports = { parseFeed, matches, check };

if (require.main === module) {
  (async () => {
    const [cfgPath, knownPath] = process.argv.slice(2);
    const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const known = new Set(knownPath && fs.existsSync(knownPath) ? fs.readFileSync(knownPath, 'utf8').split(/\s+/).filter(Boolean) : []);
    const { hits, errors } = await check(config, known);
    for (const e of errors) console.error(`Feed nicht erreichbar: ${e.feed}: ${e.error}`);
    console.error(`${hits.length} neue Treffer`);
    const top = hits.slice(0, 10);
    if (process.argv.includes('--create-issues')) {
      // gh direkt mit Argumenten aufrufen: Feed-Texte landen nie in einer Shell
      const { execFileSync } = require('child_process');
      for (const h of top) {
        const body = [`Mögliche Betriebssystem-Änderung (${h.platform === 'darwin' ? 'macOS' : 'Windows'}), gefunden in „${h.feed}“.`, '',
          `- Titel: ${h.title}`, `- Datum: ${h.date || 'unbekannt'}`, `- Link: ${h.link}`, `- Stichwörter: ${h.keywords.join(', ')}`, '',
          `> ${h.summary}`, '',
          'Bitte prüfen: Betrifft das Audio-Plugins? Dann einen Eintrag in notices.json ergänzen (id, platform, affects, severity, title, text, url). Sonst einfach schließen.'].join('\n');
        execFileSync('gh', ['issue', 'create', '--title', `OS-News: ${h.title}`.slice(0, 200), '--label', 'os-news', '--body', body], { stdio: 'inherit' });
      }
    } else process.stdout.write(JSON.stringify(top, null, 2));
  })();
}
