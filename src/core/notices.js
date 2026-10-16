'use strict';
// Betriebssystem-Hinweise: angekündigte Änderungen (z. B. Rosetta-Ende), die bestimmte Plugins
// unbrauchbar machen. Die Liste pflegt das Repo Plugin-Versionen in notices.json; die App bringt
// eine Kopie mit und zeigt nur Hinweise, die zum System passen und eigene Plugins betreffen.
//
// Format: { format: 1, updated, notices: [ { id, platform: 'darwin'|'win32', affects, severity: 'info'|'warn',
//   title, text, date?, deadline?, until?, url? } ] }
// affects: 'intel'      – macOS, Plugin hat nur Intel-Code (läuft nur über Rosetta)
//          '32bit'      – Plugin hat nur 32-Bit-Code
//          'x64-on-arm' – Windows auf ARM, Plugin hat keinen ARM64/ARM64EC-Code

const MATCHERS = {
  intel: (archs) => archs.includes('x86_64') && !archs.includes('arm64'),
  '32bit': (archs) => archs.length > 0 && archs.every((a) => a === 'i386' || a === 'x86'),
  'x64-on-arm': (archs, host) => host.arm && archs.length > 0 && !archs.some((a) => a === 'arm64' || a === 'arm64ec'),
};

function noticesUrlFor(versionDbUrl) {
  if (!versionDbUrl || !/versions\.json(\?.*)?$/i.test(versionDbUrl)) return null;
  return versionDbUrl.replace(/versions\.json(\?.*)?$/i, 'notices.json');
}

function valid(n) {
  return n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.text === 'string' && MATCHERS[n.affects] && ['darwin', 'win32'].includes(n.platform);
}

// Hinweise für dieses System, jeweils mit den betroffenen eigenen Plugins
function applicable(list, products, { platform, host = {}, now = new Date(), dismissed = [] } = {}) {
  const off = new Set(dismissed);
  return (list || []).filter(valid)
    .filter((n) => n.platform === platform && !off.has(n.id) && !(n.until && Date.parse(n.until) < now.getTime()))
    .map((n) => {
      const affected = products.filter((p) => !p.isShell && MATCHERS[n.affects](p.archs || [], host));
      return { ...n, affected: affected.map((p) => p.key), affectedCount: affected.length };
    })
    .filter((n) => n.affectedCount > 0);
}

// Neuere Liste gewinnt; fehlt die Online-Liste, gilt die mitgelieferte
function pick(bundled, remote) {
  if (remote && Array.isArray(remote.notices) && (!bundled || String(remote.updated || '') >= String(bundled.updated || ''))) return remote;
  return bundled || { format: 1, notices: [] };
}

module.exports = { applicable, noticesUrlFor, pick, MATCHERS };
