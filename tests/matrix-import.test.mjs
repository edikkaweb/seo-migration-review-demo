import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse, suggest } from '../.compiled/csv.js';
import { analyze } from '../.compiled/engine.js';
import { exportPlan } from '../.compiled/export.js';

for (const lang of ['fr','en']) test(`matrice publique ${lang} : HTTP, décisions et aller-retour sans perte`, () => {
  const raw = fs.readFileSync(new URL(`data/matrix-${lang}.csv`, import.meta.url), 'utf8');
  const file = parse(raw);
  const map = suggest(file.headers, 'plan');
  assert.equal(map.planned_status, 8); // never workflow Status, column 16
  assert.equal(map.reason, 7);
  const report = analyze(file, map);
  assert.deepEqual(report.plan.map(r=>[r.decision,r.status,r.complete]), [['redirect','301',true],['consolidate','301',true],['remove','410',true]]);
  assert(report.plan.every(r=>r.origin==='explicit'));
  const exported = parse(exportPlan(report).text);
  assert.deepEqual(exported.headers.slice(0,file.headers.length), file.headers);
  assert.deepEqual(exported.rows.map(r=>r.slice(0,file.headers.length)), file.rows);
  const again = analyze(exported,suggest(exported.headers,'plan'));
  assert.deepEqual(again.plan.map(r=>[r.decision,r.status,r.complete]),report.plan.map(r=>[r.decision,r.status,r.complete]));
});
test('unknown labels remain unknown; decision label cannot override a conflicting HTTP code', () => {
  const f=parse('Old URL;Decision;New URL;Expected HTTP;Status\nhttps://example.com/a;301 redirect;https://example.com/b;410;Validated\nhttps://example.com/c;mystery;https://example.com/d;301;Ready');
  const r=analyze(f,suggest(f.headers,'plan'));
  assert(r.findings.some(f=>f.code==='STATUS_INCOMPATIBLE'));
  assert.equal(r.plan[1].decision,'unknown');
  assert.equal(r.plan[1].complete,false);
});
test('ambiguous explicit HTTP headers require a mapping choice',()=> {
  assert.equal(suggest(['Old URL','Expected HTTP','HTTP attendu','Status'],'plan').planned_status,-1);
});
