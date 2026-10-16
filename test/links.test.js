'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { collect, classify, check } = require('../tools/check-links');

test('Link-Check: tot, unklar und ok werden richtig erkannt', async () => {
  const data = { vendors: { A: { download: 'https://a/dl', products: { X: 'https://a/x', Y: 'https://a/dl' } }, B: { download: 'https://b/dl' } } };
  const list = collect(data);
  assert.strictEqual(list.length, 3, 'doppelte Adressen nur einmal');
  const fake = async (u) => { if (u === 'https://b/dl') throw Object.assign(new Error('x'), { cause: { code: 'ENOTFOUND' } }); return { status: u.endsWith('/x') ? 404 : 403 }; };
  const r = await check(list, fake);
  assert.deepStrictEqual(r.map((x) => x.result), ['unklar', 'tot', 'tot']);
  assert.strictEqual(classify(301), 'ok');
  assert.strictEqual(classify(0, 'TimeoutError'), 'unklar');
});
