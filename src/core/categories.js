'use strict';
// Intelligente Kategorien: VST3-Unterkategorien, AU-Typ und Namens-Schlagwörter
// werden auf Hauptkategorie + Unterkategorie abgebildet.

// [Unterkategorie, Hauptkategorie, Schlagwort-RegExp (auf Namen), VST3-Subcategories]
const RULES = [
  ['Multiband-Kompressor', 'Dynamik', /multi.?band|\bmb.?comp|\bc[46]\b/i, []],
  ['Limiter', 'Dynamik', /limit|\bl[123]\b|maximi[sz]er|\bmaxim/i, []],
  ['De-Esser', 'Dynamik', /de.?ess|sibil/i, []],
  ['Gate / Expander', 'Dynamik', /\bgate|expander|noise.?gate/i, []],
  ['Transienten', 'Dynamik', /transient|\bspl\b|smack|punch/i, []],
  ['Clipper', 'Dynamik', /clip(per)?\b|kclip|standard.?clip/i, []],
  ['Kompressor', 'Dynamik', /comp(ress)?|\bcla.?(2a|3a|76)|1176|\bla.?2a|\bla.?3a|\bssl.?g|\bvca\b|opto|fet|leveler|glue|\bpie\b|fairchild|vari.?mu/i, ['Dynamics']],
  ['Dynamic EQ', 'EQ', /dyn(amic)?.?eq|soothe|resonan|\bf6\b/i, []],
  ['Pultec / Röhren-EQ', 'EQ', /pultec|\beqp|\bpuig|tube.?eq|\bmeq\b/i, []],
  ['Konsolen-EQ', 'EQ', /channel.?strip|console|\bssl\b|\bneve\b|\bapi.?5|1073|\bscheps/i, ['Channel Strip']],
  ['Equalizer', 'EQ', /\beq\b|\beq\d|equali[sz]|\bq\d+\b|pro-?q|filter.?bank/i, ['EQ']],
  ['Filter', 'Filter', /filter|\bvcf\b|\bwah\b|\bhpf|\blpf/i, ['Filter']],
  ['Hall', 'Raum', /reverb|\bverb|\bhall\b|\broom\b|plate|spring|\bchamber|\bnimbus|\bvalhalla|\bh-?reverb|\bseventh/i, ['Reverb']],
  ['Delay / Echo', 'Raum', /delay|echo|\btap\b|\bh-?delay|\bdual.?delay/i, ['Delay']],
  ['Stereo / Imaging', 'Raum', /stereo|imag|widen|\bs1\b|\bmid.?side|\bm\/s\b|panner|binaural/i, ['Spatial', 'Surround', 'Ambisonics']],
  ['Chorus', 'Modulation', /chorus|\bdimension|juno.?60.?ch/i, []],
  ['Flanger / Phaser', 'Modulation', /flang|\bphaser|phase.?90|small.?stone/i, []],
  ['Tremolo / Vibrato', 'Modulation', /tremolo|vibrato|\brotary|leslie/i, []],
  ['Modulation', 'Modulation', /\bmod\b|modulat|ensemble|ring.?mod|\bshaper/i, ['Modulation']],
  ['Tape', 'Sättigung', /tape|\bj37|\bkramer|\bato?r-?\d|studer|ampex|\bvtm\b|\bwow/i, []],
  ['Amp / Cab', 'Sättigung', /\bamp(lifier|sim)?\b|\bcab(inet)?\b|guitar.?rig|\bbias\b|\bneural.?dsp|archetype|\bmarshall|\bfender|\bmesa|\bpedal/i, []],
  ['Sättigung / Distortion', 'Sättigung', /satur|distort|overdriv|\bdrive|\bfuzz|crush|bit.?crush|decimat|\bdecap|\bheat|\bwarm|\bexcit|\bharmonic|\btube|\bvalve|\bsaturn|\bdecapitator|\btrash/i, ['Distortion']],
  ['Pitch / Tuning', 'Vocal & Pitch', /pitch|\btune\b|autotune|auto-?tune|melodyne|\bwaves.?tune|\bharmoni[sz]|\bformant|\bvocoder|\bdoubl/i, ['Pitch Shift']],
  ['Vocal', 'Vocal & Pitch', /vocal|\bvox\b|voice/i, []],
  ['Restauration', 'Restauration', /\bden(oise|ois)|noise.?red|\bclick|\bhum\b|\brx\b|restor|\bdeclip|\bderev|\bclarity|\bwns\b|\bx-?noise|\bnoise/i, ['Restoration']],
  ['Analyse / Metering', 'Analyse', /meter|analy[sz]|\bscope|spectr|loud(ness)?|\blufs|\bwlm|\bpaz\b|insight|tuner|correlat|\bvu\b|\bppm\b/i, ['Analyzer']],
  ['Mastering-Suite', 'Mastering', /\bmaster(ing)?|ozone|\babbey.?road.?tg|\bl3|elevate/i, ['Mastering']],
  ['Synthesizer', 'Instrument', /synth|\bserum|\bvital|massive|\bsylenth|\bdiva\b|\brepro|\bpigments|\bomnisphere|\bspire|\bjup|\bjuno|\bminimoog|\bprophet|\bdx7|\bwavetable|\boscillat|\barp\b|\bfm8|\bzebra/i, ['Synth']],
  ['Sampler', 'Instrument', /sampler|kontakt|\bhalion|\bsampl|\bdecent|\bsforzando|\bpianoteq/i, ['Sampler']],
  ['Drums', 'Instrument', /drum|\bbeat|\bkit\b|superior|\bbfd\b|\bezdrummer|\baddictive|\b808|\b909|perc(ussion)?/i, ['Drum']],
  ['Piano / Keys', 'Instrument', /piano|\bkeys\b|\brhodes|\bwurli|\borgan|\bclav|\bkeyscape|\bb-?3\b/i, ['Piano']],
  ['Bass', 'Instrument', /\bbass\b|\btrilian|\bsubbass/i, []],
  ['Orchester / Strings', 'Instrument', /string|orchest|\bbrass|\bwoodwind|\bchoir|\bspitfire|\bbbc.?so|\bcinematic|\bensemble/i, ['Orchestra']],
  ['Gitarre', 'Instrument', /guitar|\bstrum|\bampleguitar/i, []],
  ['Utility', 'Werkzeuge', /utility|\bgain\b|\btrim\b|\bpolarity|\bphase.?(align|invert)|\bmono\b|\bsplit|\brouting|\bsidechain|\bvolume/i, ['Tools', 'Generator']],
  ['MIDI', 'MIDI', /\bmidi\b|arpeggi|chord|\bscaler|\bcthulhu|\bsequencer/i, []],
];

const VST3_MAIN = {
  Instrument: 'Instrument', Synth: 'Instrument', Sampler: 'Instrument', Drum: 'Instrument', Piano: 'Instrument',
  Dynamics: 'Dynamik', EQ: 'EQ', Filter: 'Filter', Reverb: 'Raum', Delay: 'Raum', Spatial: 'Raum',
  Modulation: 'Modulation', Distortion: 'Sättigung', 'Pitch Shift': 'Vocal & Pitch', Restoration: 'Restauration',
  Analyzer: 'Analyse', Mastering: 'Mastering', Tools: 'Werkzeuge', Network: 'Werkzeuge',
};

function categorize({ name, kind, subCategories = [], vendor }) {
  const n = name || '';
  if (/waveshell/i.test(n)) return { category: 'Werkzeuge', subCategory: 'Hersteller-Shell' };
  for (const [sub, main, re, vstSubs] of RULES) {
    if (re.test(n)) return { category: main, subCategory: sub };
  }
  for (const [sub, main, , vstSubs] of RULES) {
    if (vstSubs.some((s) => subCategories.includes(s))) return { category: main, subCategory: sub };
  }
  for (const s of subCategories) if (VST3_MAIN[s] && s !== 'Fx') return { category: VST3_MAIN[s], subCategory: s };
  if (kind === 'Instrument') return { category: 'Instrument', subCategory: 'Sonstige Instrumente' };
  if (kind === 'MIDI') return { category: 'MIDI', subCategory: 'MIDI' };
  return { category: 'Sonstige', subCategory: kind === 'Effekt' ? 'Sonstige Effekte' : 'Unbekannt' };
}

const SUBCATEGORY_COUNT = RULES.length;

// Herstellernamen vereinheitlichen
const VENDOR_ALIASES = [
  [/^waves(\s|$)|^waves audio/i, 'Waves'],
  [/^uad|universal audio/i, 'Universal Audio'],
  [/fabfilter/i, 'FabFilter'],
  [/native instruments|^ni$/i, 'Native Instruments'],
  [/izotope/i, 'iZotope'],
  [/plugin alliance|brainworx/i, 'Plugin Alliance'],
  [/soundtoys/i, 'Soundtoys'],
  [/valhalla/i, 'Valhalla DSP'],
  [/arturia/i, 'Arturia'],
  [/steinberg/i, 'Steinberg'],
  [/xfer/i, 'Xfer Records'],
  [/u-?he\b/i, 'u-he'],
  [/spectrasonics/i, 'Spectrasonics'],
  [/slate digital/i, 'Slate Digital'],
  [/softube/i, 'Softube'],
  [/apple/i, 'Apple'],
  [/eventide/i, 'Eventide'],
];

function normalizeVendor(vendor, name = '', bundleId = '') {
  let v = (vendor || '').trim();
  if (!v && /^uad[ -]/i.test(name)) v = 'Universal Audio';
  if (!v && /waveshell/i.test(name)) v = 'Waves';
  if (!v && bundleId) {
    const parts = bundleId.split('.');
    if (parts.length >= 3 && /^(com|de|net|org|fr|uk|co|io|se|ch|at|nl|it|dk)$/i.test(parts[0])) {
      v = parts[1].replace(/[-_]/g, ' ');
      v = v.charAt(0).toUpperCase() + v.slice(1);
    }
  }
  for (const [re, canon] of VENDOR_ALIASES) if (re.test(v)) return canon;
  v = v.replace(/,?\s*(inc|ltd|llc|gmbh|ag|s\.?a\.?s?|b\.?v\.?|corp(oration)?)\.?$/i, '').trim();
  return v || 'Unbekannt';
}

// Schlüssel, unter dem AU/VST2/VST3/AAX/CLAP-Versionen zu einem Produkt zusammengefasst werden
function productKey(name, vendor) {
  let n = (name || '').toLowerCase();
  const v = (vendor || '').toLowerCase();
  if (v && v !== 'unbekannt' && n.startsWith(v + ' ')) n = n.slice(v.length + 1);
  n = n
    .replace(/\.(vst3|vst|component|clap|aaxplugin|dll|bundle)$/i, '')
    .replace(/[\s_-]*(x64|x86|64[\s_-]?bit|32[\s_-]?bit|\(64\)|\(x64\)|vst3?|au|aax|clap|stereo|mono)\b/gi, '')
    .replace(/[^a-z0-9]+/g, '');
  return n || (name || '').toLowerCase();
}

module.exports = { categorize, normalizeVendor, productKey, SUBCATEGORY_COUNT };
