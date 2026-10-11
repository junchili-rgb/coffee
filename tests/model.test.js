import test from 'node:test';
import assert from 'node:assert/strict';
import {initialData,validateData,advise,changes} from '../src/model.js';
const sample=()=>({...initialData().records[6],id:'new',batchId:'fresh',historical:false,best:false,phenomena:['出液均匀'],tastes:['尖酸','甜感不足'],water:120,ice:100,parentId:null});
test('历史记录精确保留7次实验及缺失值',()=>{
  const d=validateData(initialData());assert.equal(d.records.length,7);assert.equal(d.records[1].time,null);assert.equal(d.records[1].parentId,d.records[0].id);assert.equal(d.records[6].best,true);assert.equal(d.records[6].grind,19);assert.equal(d.records[6].dose,19);assert.equal(d.records[6].yieldWeight,46);assert.equal(d.records[6].water,null);assert.deepEqual(d.records[6].tastes,[]);
});
test('风味好的喷溅杯也优先检查均匀性',()=>{
  const r=initialData().records[6], a=advise(r,initialData().records);assert.match(a.title,/稳定/);assert.match(a.action,/保持粉量/);assert.match(a.reason,/不能仅据此判断压粉太实/);
});
test('尖酸采用单个变量对照，不以秒数直接诊断',()=>{
  const r=sample(), a=advise(r);assert.match(a.action,/46g 增至 50g/);assert.match(a.action,/保持粉量、研磨、水温/);
});
test('冰美式单纯偏淡优先验证稀释',()=>{
  const r=sample();r.tastes=['偏淡'];assert.match(advise(r).action,/120g 减至 108g/);
});
test('相同秒数没有口感数据时不猜测调整',()=>{
  const r=sample();r.tastes=[];assert.match(advise(r).title,/补齐/);
});
test('同时改变粉量和液重不能认定单一因果',()=>{
  const d=initialData();d.records[6].parentId=d.records[5].id;assert.equal(changes(d.records[5],d.records[6]).length,2);assert.ok(advise(d.records[6],d.records).caveats.some(x=>x.includes('多个参数')));
});
test('单项调整变差时恢复对照参数',()=>{
  const p=sample(),r={...p,id:'next',grind:20,parentId:p.id,outcome:'变差'};assert.match(advise(r,[p,r]).action,/恢复对照杯的研磨/);
});
test('不会将其他豆批次的磨粗经验套用到新豆',()=>{
  const r=sample();r.tastes=['苦'];assert.equal(advise(r,initialData().records).source,'萃取理论');
});
test('备份往返保持数据，不接受非法参数或跨批次关联',()=>{
  const d=initialData();assert.deepEqual(validateData(JSON.parse(JSON.stringify(d))),d);
  d.records[0].dose=-1;assert.throws(()=>validateData(d));
  const cross=initialData();cross.batches.push({...cross.batches[0],id:'other'});cross.records[0].batchId='other';assert.throws(()=>validateData(cross),/同一豆批次/);
});
test('不接受重复记录、未知标签和冲突现象',()=>{
  const d=initialData();d.records.push({...d.records[0]});assert.throws(()=>validateData(d));
  const t=initialData();t.records[0].tastes=['假标签'];assert.throws(()=>validateData(t));
  const p=initialData();p.records[0].phenomena=['出液均匀','喷溅'];assert.throws(()=>validateData(p));
});
