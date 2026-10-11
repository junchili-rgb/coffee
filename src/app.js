import { initialData, validateData, validateRecord, advise, changes, TASTES, PHENOMENA } from './model.js';
const $=s=>document.querySelector(s), KEY='coffee-journal-v1';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data, storageBlocked=false, editing=null, parentId=null, selectedRecord=null, toastTimer;
try { const saved=localStorage.getItem(KEY); data=saved?validateData(JSON.parse(saved)):initialData(); }
catch { data=initialData(); storageBlocked=true; }
let batchId=data.batches[0].id;
let activeView='brew';
const viewCopy={
  brew:['今天，这杯怎么样？','记下参数，让下一杯更接近酸甜花香。'],
  history:['每一杯，都有迹可循。','回看配方与口感，找到这包豆子的最佳候选。'],
  advice:['下一杯，靠近喜欢的味道。','结合口感和历史反馈，一次尝试一个调整。'],
};
function showView(view, {focus=false, scroll=false}={}) {
  activeView=Object.hasOwn(viewCopy,view)?view:'brew';
  document.querySelectorAll('[role="tab"]').forEach(tab=>{
    const selected=tab.dataset.view===activeView;
    tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
  });
  document.querySelectorAll('[role="tabpanel"]').forEach(panel=>panel.hidden=panel.id!=='view-'+activeView);
  $('#page-title').textContent=viewCopy[activeView][0];$('#page-description').textContent=viewCopy[activeView][1];
  if(location.hash!=='#'+activeView)history.replaceState(null,'','#'+activeView);
  if(focus)$('#view-'+activeView).focus({preventScroll:true});
  if(scroll)window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
$('.tabs').addEventListener('click',e=>{const tab=e.target.closest('[data-view]');if(tab)showView(tab.dataset.view);});
$('.tabs').addEventListener('keydown',e=>{
  const tab=e.target.closest('[role="tab"]');if(!tab)return;
  const tabs=[...document.querySelectorAll('[role="tab"]')],index=tabs.indexOf(tab);
  let next;
  if(e.key==='ArrowRight')next=tabs[(index+1)%tabs.length];
  if(e.key==='ArrowLeft')next=tabs[(index+tabs.length-1)%tabs.length];
  if(e.key==='Home')next=tabs[0];if(e.key==='End')next=tabs.at(-1);
  if(next){e.preventDefault();showView(next.dataset.view);next.focus();}
});
window.addEventListener('hashchange',()=>showView(location.hash.slice(1)));
function toast(msg) { $('#toast').textContent=msg; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,6000); }
function persist(next) {
  if(storageBlocked) { toast('原存储无法读取，已保护原数据。请先导出当前记录；导入有效备份后可恢复保存。'); return false; }
  try { localStorage.setItem(KEY,JSON.stringify(validateData(next))); data=next; return true; }
  catch { toast('保存失败：浏览器存储不可用或空间不足。请导出备份。'); return false; }
}
function rows() { return data.records.filter(r=>r.batchId===batchId); }
function tags(container, values, name) { $(container).innerHTML=values.map(v=>`<label class="tag"><input type="checkbox" name="${name}" value="${escape(v)}"><span>${escape(v)}</span></label>`).join(''); }
tags('#taste-tags',TASTES,'tastes'); tags('#phenomena-tags',PHENOMENA,'phenomena');
const form=$('#brew-form');
form.addEventListener('change',e=>{
  if(e.target.name==='phenomena' && e.target.checked) {
    form.querySelectorAll('[name="phenomena"]').forEach(x=>{if(x!==e.target && (e.target.value==='出液均匀' || x.value==='出液均匀')) x.checked=false;});
  }
});
function updateRatio(){
  const d=Number(form.elements.dose.value),y=Number(form.elements.yieldWeight.value);
  $('#ratio').textContent=d>0&&y>0?`粉液比 1 : ${(y/d).toFixed(2)}`:'待填写';
  const water=form.elements.water.value,ice=form.elements.ice.value;
  const temperature=form.elements.temperature.value==='默认'?'默认水温':form.elements.temperature.value;
  $('#recipe-summary').textContent=temperature+' · '+(water!==''||ice!==''?`水 ${water||'—'}g / 冰 ${ice||'—'}g`:'配比未填写');
  const observations=[...form.querySelectorAll('[name="phenomena"]:checked')].map(x=>x.value);
  if(form.elements.satisfaction.value)observations.push(form.elements.satisfaction.value+'/5 分');
  if(form.elements.notes.value.trim())observations.push('有备注');
  if(form.elements.best.checked)observations.push('最佳候选');
  $('#observation-summary').textContent=observations.length?observations.join(' · '):'现象、评分与备注';
}
form.addEventListener('input',updateRatio);
form.addEventListener('change',updateRatio);
function renderBatches(){
  $('#batch-select').innerHTML=data.batches.map(b=>`<option value="${escape(b.id)}">${escape(b.name)}</option>`).join(''); $('#batch-select').value=batchId;
  const b=data.batches.find(x=>x.id===batchId); $('#batch-info').textContent=[b.roast,b.origin,b.process,b.roastedAt?'烘焙 '+b.roastedAt:''].filter(Boolean).join(' · ');
}
function renderAdvice(r) {
  $('#use-advised').disabled=!r;
  if(!r) { $('#advice-context').textContent='从这一包豆子的第一杯开始'; $('#advice-content').innerHTML='<p class="empty">保存参数与口感后，这里会给出一个优先调整项和下一杯观察重点。</p>'; return; }
  const a=advise(r,data.records); $('#advice-context').textContent=`依据：${r.label} · ${r.dose}g → ${r.yieldWeight}g`;
  $('#advice-content').innerHTML=`<span class="source">${escape(a.source)}</span><h3>${escape(a.title)}</h3><div class="recommendation">${escape(a.action)}</div><h4>为什么这样调</h4><p>${escape(a.reason)}</p><h4>下一杯观察</h4><p>${escape(a.observe)}</p><details class="limits"><summary>判断边界</summary>${a.caveats.map(c=>`<p>${escape(c)}</p>`).join('')}</details>`;
}
function date(r){ return r.createdAt?new Date(r.createdAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'历史实验 · 日期未记录'; }
function renderHistory(){
  const records=rows(); $('#record-count').textContent=records.length+' 杯记录';
  $('#history-list').innerHTML=records.length?records.slice().reverse().map(r=>{
    const p=data.records.find(x=>x.id===r.parentId), diff=changes(p,r);
    const dateLabel=r.createdAt?date(r):'历史实验';
    return `<details class="record ${r.best?'best':''}"><summary><span class="record-title"><strong>${escape(r.label)}</strong><small>${escape(dateLabel)}</small>${r.best?'<span class="best-badge">★ 最佳候选</span>':''}</span><span class="record-recipe"><b>${r.dose}g → ${r.yieldWeight}g</b><small>研磨 ${r.grind} · ${r.time==null?'时间未记录':r.time+' 秒'}</small></span><span class="record-flavor">${escape(r.notes||r.tastes.join('、')||'暂无口感评价')}</span></summary><div class="record-body"><div class="metrics"><span>粉液比 <b>1:${(r.yieldWeight/r.dose).toFixed(2)}</b></span><span>${r.satisfaction?'满意度 '+r.satisfaction+'/5':'未评分'}</span><span>${escape(date(r))}</span></div><p class="record-detail">${escape(r.temperature)} · 水 ${r.water??'—'}g / 冰 ${r.ice??'—'}g · ${escape(r.iceState)}</p><p class="record-notes">${escape(r.notes||'暂无备注')}</p><div class="record-tags">${[...r.tastes,...r.phenomena].map(x=>`<span>${escape(x)}</span>`).join('')}</div>${p?`<div class="diff"><strong>对照 ${escape(p.label)} · ${escape(r.outcome)}</strong><p>${escape(diff.length?diff.join('；'):'记录参数相同')}</p>${diff.length>1?'<small>多个变量变化，不能区分单项作用。</small>':''}</div>`:''}<div class="record-actions"><button data-action="advice" data-id="${escape(r.id)}">看建议</button><button data-action="copy" data-id="${escape(r.id)}">沿用参数</button><button data-action="edit" data-id="${escape(r.id)}">编辑</button><button data-action="best" data-id="${escape(r.id)}">${r.best?'取消最佳':'标为最佳'}</button><button data-action="delete" data-id="${escape(r.id)}" class="delete">删除</button></div></div></details>`;
  }).join(''):'<p class="empty">这包豆子还没有记录。记下第一杯，开始找到它的最佳配方。</p>';
}
function render(){renderBatches();renderHistory();renderAdvice(data.records.find(r=>r.id===selectedRecord && r.batchId===batchId)||rows().at(-1));}
function resetForm(){form.reset();editing=null;parentId=null;$('#form-title').textContent='记录这一杯';$('#save-record').textContent='保存，查看建议 →';$('#cancel-edit').hidden=true;$('#comparison-note').hidden=true;$('#comparison-note').textContent='';$('#recipe-details').open=false;$('#observation-details').open=false;updateRatio();}
function fill(r,edit=false){
  resetForm(); for(const k of ['dose','yieldWeight','grind','time','temperature','water','ice','iceState']) form.elements[k].value=r[k]??'';
  if(edit){for(const k of ['notes','satisfaction','outcome'])form.elements[k].value=r[k]??'';form.elements.best.checked=r.best;form.querySelectorAll('[name="tastes"],[name="phenomena"]').forEach(x=>x.checked=r[x.name].includes(x.value));editing=r.id;parentId=r.parentId;$('#form-title').textContent='编辑 · '+r.label;$('#save-record').textContent='保存修改';}
  else {parentId=r.id;$('#form-title').textContent='沿用 · '+r.label;}
  $('#cancel-edit').hidden=false;$('#comparison-note').hidden=false;$('#comparison-note').textContent=parentId?'已关联对照杯，保存后展示参数变化。':'此杯没有关联对照杯。';
  if(edit){$('#recipe-details').open=true;$('#observation-details').open=true;}
  updateRatio();showView('brew',{focus:true,scroll:true});
}
$('#cancel-edit').onclick=resetForm;
$('#copy-last').onclick=()=>{const last=rows().at(-1);if(last)fill(last);else toast('当前豆批次还没有记录');};
$('#use-advised').onclick=()=>{const r=data.records.find(x=>x.id===selectedRecord && x.batchId===batchId)||rows().at(-1);if(r)fill(r);};
$('#batch-select').onchange=e=>{batchId=e.target.value;selectedRecord=null;resetForm();render();};
form.onsubmit=e=>{
  e.preventDefault(); const fd=new FormData(form), old=data.records.find(r=>r.id===editing);
  const r={id:old?.id??crypto.randomUUID(),batchId,label:old?.label??'第 '+(rows().length+1)+' 杯',createdAt:old?.createdAt??new Date().toISOString(),historical:old?.historical??false,parentId,best:fd.has('best'),tastes:fd.getAll('tastes'),phenomena:fd.getAll('phenomena')};
  if(old)r.createdAt=old.createdAt;
  for(const k of ['dose','yieldWeight','grind','time','water','ice','satisfaction'])r[k]=fd.get(k)===''?null:Number(fd.get(k));
  for(const k of ['temperature','iceState','notes','outcome'])r[k]=fd.get(k);
  try {validateRecord(r);const next={...data,records:editing?data.records.map(x=>x.id===editing?r:x):[...data.records,r]};if(!persist(next))return;selectedRecord=r.id;resetForm();render();showView('advice',{focus:true,scroll:true});toast('已保存，下一杯建议已更新');}
  catch(error){toast(error.message);}
};
$('#history-list').onclick=e=>{
  const button=e.target.closest('button[data-id]');if(!button)return;const r=data.records.find(x=>x.id===button.dataset.id);if(!r)return;
  switch(button.dataset.action){
    case 'advice':selectedRecord=r.id;renderAdvice(r);showView('advice',{focus:true,scroll:true});break;
    case 'copy':fill(r);break;
    case 'edit':fill(r,true);break;
    case 'best':if(persist({...data,records:data.records.map(x=>x.id===r.id?{...x,best:!x.best}:x)}))render();break;
    case 'delete':if(confirm(`删除“${r.label}”？建议先导出备份。`)){const next={...data,records:data.records.filter(x=>x.id!==r.id).map(x=>x.parentId===r.id?{...x,parentId:null}:x)};if(persist(next)){if(editing===r.id||parentId===r.id)resetForm();render();toast('记录已删除');}}break;
  }
};
$('#new-batch').onclick=()=>$('#batch-dialog').showModal();$('#close-batch').onclick=()=>$('#batch-dialog').close();
$('#batch-form').onsubmit=e=>{
  e.preventDefault();const fd=new FormData(e.target), b={id:crypto.randomUUID()};for(const k of ['name','roast','origin','process','roastedAt'])b[k]=fd.get(k).trim();
  if(!b.name){toast('请填写豆子名称');return;}
  if(persist({...data,batches:[...data.batches,b]})){batchId=b.id;selectedRecord=null;resetForm();render();e.target.reset();$('#batch-dialog').close();showView('brew',{focus:true,scroll:true});toast('新批次已创建');}
};
$('#export-data').onclick=()=>{
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='coffee-journal-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('备份已导出');
};
$('#import-data').onclick=()=>$('#import-file').click();
$('#import-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>10*1024*1024)throw new Error('备份文件超过10MB');const next=validateData(JSON.parse(await file.text()));
    if(!confirm(`导入 ${next.batches.length} 个批次、${next.records.length} 条记录，将替换当前数据。请先导出备份。继续？`))return;
    localStorage.setItem(KEY,JSON.stringify(next));storageBlocked=false;data=next;batchId=data.batches[0].id;selectedRecord=null;resetForm();render();toast('备份导入成功');
  }catch(error){toast('导入失败：'+error.message);}finally{e.target.value='';}
};
render();updateRatio();showView(location.hash.slice(1));
if(storageBlocked)toast('原存储无法读取，已保护原数据。可导入有效备份恢复。');
