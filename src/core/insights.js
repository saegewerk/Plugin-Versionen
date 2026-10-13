'use strict';
// System-Warnungen: veraltet, abgelöst (Nachfolger installiert), nicht nativ auf Apple Silicon,
// 32 Bit, unnötige Formate, Duplikate, Update-Konflikte.

function cmpVersion(a, b) {
  const pa = String(a || '').match(/\d+/g) || [];
  const pb = String(b || '').match(/\d+/g) || [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = parseInt(pa[i] || '0', 10);
    const y = parseInt(pb[i] || '0', 10);
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// "Pro-Q 3" -> { stem: "pro-q", num: 3 }; "Ozone 11 Maximizer" -> { stem: "ozone maximizer", num: 11 }
function generation(name) {
  const m = String(name).match(/^(.*?)[\s_-]*(?:v|mk\s*)?(?<!\d)(\d{1,2})(?!\d)(.*)$/i);
  if (!m) return null;
  const stem = (m[1] + ' ' + (m[3] || '')).toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  if (stem.replace(/\s/g, '').length < 3) return null;
  return { stem, num: parseInt(m[2], 10) };
}

function supersededMap(products) {
  const groups = new Map();
  for (const p of products) {
    if (p.isShell) continue;
    const g = generation(p.name);
    if (!g) continue;
    const k = p.vendor.toLowerCase() + '|' + g.stem;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ p, num: g.num });
  }
  const out = new Map();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const newest = list.reduce((a, b) => (b.num > a.num ? b : a));
    for (const x of list) if (x.num < newest.num) out.set(x.p.key, newest.p);
  }
  return out;
}

function computeInsights(products, { platform, daws = [], updates = {} }) {
  const warnings = [];
  const add = (type, p, text, extra = {}) => warnings.push({ type, key: p.key, name: p.name, vendor: p.vendor, text, ...extra });
  const dawFormats = new Set(daws.flatMap((d) => d.formats));
  const hasProTools = daws.some((d) => d.name === 'Pro Tools');
  const sup = supersededMap(products);

  for (const p of products) {
    const u = updates[p.key];
    if (u && u.latest && p.version && cmpVersion(p.version, u.latest) < 0) {
      add('outdated', p, `Version ${p.version} installiert, ${u.latest} verfügbar`, { latest: u.latest, url: u.url || null });
    }
    if (sup.has(p.key)) add('superseded', p, `Nachfolger „${sup.get(p.key).name}“ ist installiert`, { successor: sup.get(p.key).key });
    const archs = p.archs || [];
    if (platform === 'darwin' && archs.length && archs.includes('x86_64') && !archs.includes('arm64')) {
      add('intel', p, 'Nur für Intel: läuft auf Apple Silicon nur über Rosetta');
    }
    if (archs.some((a) => a === 'i386' || a === 'x86')) add('32bit', p, '32-Bit-Version: wird von aktuellen DAWs nicht mehr geladen');
    if (p.formats.includes('AAX') && daws.length && !hasProTools) {
      const size = p.items.filter((i) => i.format === 'AAX').reduce((s, i) => s + i.size, 0);
      add('unneeded', p, 'AAX-Version, aber Pro Tools ist nicht installiert', { format: 'AAX', size });
    }
    if (p.formats.includes('VST2') && p.formats.includes('VST3')) {
      const size = p.items.filter((i) => i.format === 'VST2').reduce((s, i) => s + i.size, 0);
      if (!daws.length || dawFormats.has('VST3')) add('unneeded', p, 'VST2 zusätzlich zu VST3 installiert (VST2 wird meist nicht gebraucht)', { format: 'VST2', size });
    }
    if (p.duplicateFormats.length) add('duplicate', p, p.duplicateFormats.map((f) => `${f} liegt ${p.items.filter((i) => i.format === f && i.enabled).length}× aktiv vor`).join(', ') + ' (gleiches Format doppelt)');
    if (p.conflicts.length) add('conflict', p, 'Nach einem Update doppelt vorhanden (aktiv und deaktiviert)');
    if (p.versionMismatch) add('mismatch', p, 'Formate haben unterschiedliche Versionen: ' + [...new Set(p.items.map((i) => `${i.format} ${i.version || '?'}`))].join(', '));
  }
  return warnings;
}

module.exports = { computeInsights, cmpVersion, generation, supersededMap };
