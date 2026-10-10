import {chromium,firefox} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {parse,suggest} from '../.compiled/csv.js';
import {analyze} from '../.compiled/engine.js';
const base=process.env.TEST_URL || 'http://127.0.0.1:4179/seo-migration-review-demo/';
const results=[];
for(const [name,type,opts] of [['chromium',chromium,process.env.CI?{}:{channel:'chrome'}],['firefox',firefox,{}]]){
 const b=await type.launch(opts);
 try{for(const lang of ['fr','en']){
  const c=await b.newContext({acceptDownloads:true}); const p=await c.newPage();
  await p.goto(base);
  await p.locator('#personal').click();
  const input=await fs.readFile(new URL(`data/matrix-${lang}.csv`,import.meta.url));
  await p.locator('#plan-file').setInputFiles({name:`matrix-${lang}.csv`,mimeType:'text/csv',buffer:input});
  await p.locator('#plan-planned_status').waitFor();
  assert.equal(await p.locator('#plan-planned_status').inputValue(),'8');
  await p.locator('#plan-confirmed').check();await p.locator('#analyze').click();await p.locator('#results').waitFor({state:'visible'});
  const ready=p.waitForEvent('download');await p.locator('#export-plan').click();const downloaded=await ready;
  const output=`evidence/${name}-matrix-${lang}-export.csv`;await downloaded.saveAs(output);
  const exported=parse(await fs.readFile(output,'utf8'));const r=analyze(exported,suggest(exported.headers,'plan'));
  assert.deepEqual(r.plan.map(x=>[x.decision,x.status,x.complete]),[['redirect','301',true],['consolidate','301',true],['remove','410',true]]);
  assert.deepEqual(exported.rows.map(r=>r.slice(0,17)),parse(input.toString('utf8')).rows);
  await p.locator('#personal').click();await p.locator('#plan-file').setInputFiles(output);
  await p.waitForFunction(name=>document.querySelector('#plan-preview').textContent.includes(name),`${name}-matrix-${lang}-export.csv`);
  await p.locator('#plan-confirmed').check();await p.locator('#analyze').click();await p.locator('#results').waitFor({state:'visible'});
  results.push({engine:name,language:lang,httpColumn:9,rows:3,downloadAndReimport:true});await c.close();
 }}finally{await b.close();}
}
await fs.writeFile('evidence/browser-matrix.json',JSON.stringify({at:new Date().toISOString(),results},null,2));console.log(results);
