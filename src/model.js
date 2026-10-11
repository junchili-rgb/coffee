export const HISTORICAL_BATCH = 'history';
export const TASTES = ['酸质舒服', '尖酸', '甜感明显', '甜感不足', '花香清晰', '香气弱', '苦', '涩', '偏淡', '平衡'];
export const PHENOMENA = ['出液均匀', '偏流', '喷溅', '流速不稳定'];
export function initialData() {
  const rows = [
    ['1',13,18.5,31,32,'未单独评价',[],[]],
    ['1延长',13,18.5,55,null,'平淡，加水更淡',['偏淡'],[]],
    ['2',15,18.5,38,28,'相对17档涩感较轻',[],[]],
    ['3',17,18.5,55,33,'涩、平闷、香气弱',['涩','香气弱'],[]],
    ['4',18,18.5,43,27,'涩感下降，香气初现',[],[]],
    ['5',19,18.6,49.2,27,'均衡，尾韵微苦涩',['平衡','苦','涩'],[]],
    ['6',19,19,46,27,'花果香和酸甜感提升，苦涩进一步减弱；前段、后段出现细针状喷射',[],['喷溅']],
  ];
  return { version: 1, batches: [{id:HISTORICAL_BATCH,name:'历史豆批次，信息待补',roast:'浅烘',origin:'',process:'',roastedAt:''}], records: rows.map(([label,grind,dose,yieldWeight,time,notes,tastes,phenomena],i)=>({id:'history-'+i,batchId:HISTORICAL_BATCH,label,grind,dose,yieldWeight,time,notes,tastes,phenomena,temperature:'默认（历史约93°C）',water:null,ice:null,iceState:'未记录',satisfaction:null,createdAt:null,best:i===6,parentId:i===1?'history-0':i===6?'history-5':null,outcome:i===6?'变好':'未评价',historical:true})) };
}
const numberFields = {dose:[1,40],yieldWeight:[1,200],grind:[1,40],time:[1,180],water:[0,1000],ice:[0,1000],satisfaction:[1,5]};
export function validateRecord(r) {
  if (!r || typeof r !== 'object') throw new Error('记录格式无效');
  for (const [k,[min,max]] of Object.entries(numberFields)) {
    if (r[k] == null && !['dose','yieldWeight','grind'].includes(k)) continue;
    if (typeof r[k] !== 'number' || !Number.isFinite(r[k]) || r[k]<min || r[k]>max) throw new Error('参数超出范围：'+k);
  }
  if (!Array.isArray(r.tastes) || r.tastes.some(x=>!TASTES.includes(x)) || !Array.isArray(r.phenomena) || r.phenomena.some(x=>!PHENOMENA.includes(x))) throw new Error('口感或现象标签无效');
  if (r.phenomena.includes('出液均匀') && r.phenomena.length>1) throw new Error('“出液均匀”不能与异常现象同时选择');
  if (typeof r.notes!=='string' || r.notes.length>5000 || typeof r.temperature!=='string') throw new Error('备注或水温格式无效');
  return r;
}
export function validateData(data) {
  if (!data || data.version!==1 || !Array.isArray(data.batches) || !Array.isArray(data.records) || !data.batches.length || data.records.length>10000) throw new Error('请选择本应用导出的版本1 JSON文件');
  const ids=new Set();
  for (const b of data.batches) {
    if (!b || typeof b.id!=='string' || ids.has(b.id) || typeof b.name!=='string' || !b.name.trim() || b.name.length>200) throw new Error('豆批次格式无效');
    for (const k of ['roast','origin','process','roastedAt']) if (typeof b[k]!=='string') throw new Error('豆信息格式无效');
    ids.add(b.id);
  }
  const records=new Set();
  for (const r of data.records) {
    validateRecord(r);
    if (typeof r.id!=='string' || records.has(r.id) || !ids.has(r.batchId) || (r.createdAt!==null && (typeof r.createdAt!=='string' || !Number.isFinite(Date.parse(r.createdAt)))) || typeof r.best!=='boolean') throw new Error('记录关联或日期无效');
    for (const k of ['label','iceState','outcome']) if (typeof r[k]!=='string') throw new Error('记录字段无效');
    if (r.parentId!==null && typeof r.parentId!=='string') throw new Error('对比关联无效');
    records.add(r.id);
  }
  for (const r of data.records) if (r.parentId && (!records.has(r.parentId) || r.parentId===r.id || data.records.find(x=>x.id===r.parentId).batchId!==r.batchId)) throw new Error('对比记录不属于同一豆批次');
  return data;
}
export function changes(a,b) {
  if (!a || !b) return [];
  const names={dose:'粉量',yieldWeight:'液重',grind:'研磨',temperature:'水温',water:'加水',ice:'冰量'};
  return Object.entries(names).filter(([k])=>a[k]!==b[k]).map(([k,name])=>`${name}：${a[k]??'未记录'} → ${b[k]??'未记录'}`);
}
export function advise(r, records=[]) {
  const t=new Set(r.tastes), abnormal=r.phenomena.some(x=>x!=='出液均匀');
  const parent=records.find(x=>x.id===r.parentId && x.batchId===r.batchId);
  const changed=changes(parent,r);
  const caveats=['仅品尝冰美式，口感不能单独证明萃取率；建议是下一杯的对照实验。'];
  if (r.water==null || r.ice==null) caveats.push('水量或冰量未记录，暂时无法充分区分萃取与稀释影响。');
  if (changed.length>1) caveats.push('相较对照杯同时改变了多个参数，无法区分各项作用。');
  if (r.historical) caveats.push('历史记录没有完整的饮品配比与口感评分，不补猜测。');
  const finish=(title,action,reason,observe,source='萃取理论')=>({title,action,reason,observe,source,caveats});
  if(abnormal) return finish('先让萃取更稳定','保持粉量、研磨、液重和水温；下一杯优先检查布粉均匀性与水平压粉。','喷溅或偏流提示可能存在局部水流不均。即使花香、酸甜改善，也应分别评价风味与稳定性。不能仅据此判断压粉太实。','喷溅是否减少，同时酸甜和香气是否保留。');
  if(parent && r.outcome==='变差' && changed.length===1) return finish('先回到上一杯参数',`下一杯恢复对照杯的${changed[0].split('：')[0]}，其他参数保持一致。`,'单项调整后你评价变差，先验证恢复参数能否找回上一杯表现。','是否恢复原来的甜感、酸质和香气。','同批次历史反馈');
  if (r.best || (t.has('酸质舒服') && t.has('甜感明显') && !['尖酸','苦','涩','偏淡'].some(x=>t.has(x)))) return finish('保留这杯配方','下一杯复现当前参数及水冰配比。','这杯接近酸甜花香的目标，先确认重复性，再决定是否调整。','连续两杯能否保持相近风味。','当前口感反馈');
  if(t.has('尖酸') && (t.has('苦') || t.has('涩'))) return finish('先检查均匀性','保持萃取参数；下一杯优先检查布粉与水平压粉。','尖酸与苦涩并存可能与萃取不均有关，但仅凭口感不能确认。','酸苦是否同时缓和，并补记出液现象。');
  if(t.has('偏淡') && !['尖酸','苦','涩'].some(x=>t.has(x)) && r.water>0) return finish('先验证稀释比例',`加水从 ${r.water}g 减至 ${Math.round(r.water*0.9)}g，保持萃取参数与冰量。`,'你只评价冰美式，单纯偏淡先用较少加水做对照，避免直接改变浓缩配方。','浓度是否更合适，花香与甜感是否更清晰。');
  if(t.has('尖酸') || (t.has('甜感不足') && !t.has('苦') && !t.has('涩'))) {
    if(r.yieldWeight/r.dose<2.7) return finish('小幅增加液重',`液重从 ${r.yieldWeight}g 增至 ${Math.round(r.yieldWeight+r.dose*0.2)}g，保持粉量、研磨、水温和水冰用量。`,'尖酸或甜感弱时，可以试着增加萃取量；舒服的浅烘酸味无需消除。','酸质是否柔和、甜感是否增加，是否带来苦涩。');
    if(!r.phenomena.length) return finish('补充出液观察','下一杯保持参数，记录出液是否均匀。','当前粉液比已较长，先排查均匀性，避免仅凭尖酸继续延长。','是否喷溅、偏流，以及酸甜变化。');
    return finish('尝试略微磨细',`研磨刻度从 ${r.grind} 调至 ${Math.max(1,r.grind-1)}，保持粉量、目标液重、水温与水冰用量。`,'液重已较长且记录出液均匀，可以用一档磨细作对照；更长时间本身不是目标。','甜感是否提升，是否出现涩感或出液异常。');
  }
  if(t.has('苦') || t.has('涩')) {
    const same=records.filter(x=>x.batchId===r.batchId && x.id!==r.id);
    const knownHistory=same.some(x=>x.id==='history-3') && r.batchId===HISTORICAL_BATCH;
    if(knownHistory || (t.has('涩') && r.time>32)) return finish('试着磨粗一档',`研磨刻度从 ${r.grind} 调至 ${Math.min(40,r.grind+1)}，其余参数不变。`,knownHistory?'这组历史中，磨粗后涩感下降、香气改善；这是相关反馈，不能据此认定单一因果。':'涩感和较慢流速值得用略粗研磨做对照，同时观察均匀性。','涩感是否下降、花香是否保留。',knownHistory?'同批次历史反馈 + 萃取理论':'萃取理论');
    return finish('小幅减少液重',`液重从 ${r.yieldWeight}g 减至 ${Math.max(Math.round(r.dose*1.5),Math.round(r.yieldWeight-r.dose*0.2))}g，其他参数不变。`,'苦涩可能有多种来源，先以较短液重测试风味变化，不能直接判定过萃。','苦涩是否减弱，是否损失甜感或出现尖酸。');
  }
  return finish('先补齐口感反馈','保持当前参数，补记酸质、甜感、香气和水冰用量。','目前信息不足以选择可靠的调整方向，不仅凭萃取秒数推荐改动。','区分尖酸与舒服的酸、苦味与干涩感。');
}
