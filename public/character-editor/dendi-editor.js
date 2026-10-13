/*
 * Dendi skin V1. A real composited vector rig, not an image editor.
 * All items in this pilot are visual test presets, not approved rewards.
 * Gameplay, catalog, prices and production role saves are untouched.
 */
(() => {
  'use strict';
  const STORE = '2la-dendi-rig-v1';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const ROLES = [
    {id:'civilian',title:'Мирный'},
    {id:'mafia',title:'Мафия'},
    {id:'don',title:'Дон'},
    {id:'sheriff',title:'Шериф'},
  ];
  const SLOTS = [
    {id:'outerwear',title:'Пиджак',symbol:'♜',view:'0 390 512 250',items:[
      {id:'coat-wine',title:'Бордовый в полоску'},
      {id:'coat-ink',title:'Чёрный классический'},
    ]},
    {id:'neckwear',title:'Шейный аксессуар',symbol:'♢',view:'170 395 170 115',items:[
      {id:'neck-bow',title:'Бабочка'},
      {id:'neck-tie',title:'Галстук'},
    ]},
    {id:'accessory',title:'Украшение',symbol:'✧',view:'302 469 164 110',items:[
      {id:'accessory-brooch',title:'Брошь'},
      {id:'accessory-chain',title:'Цепочка'},
    ]},
    {id:'hat',title:'Головной убор',symbol:'♛',view:'83 74 347 180',items:[
      {id:'hat-fedora',title:'Бордовая федора'},
      {id:'hat-ink',title:'Чёрная федора'},
    ]},
  ];
  const PRESETS = {
    civilian:{outerwear:'coat-wine',neckwear:'neck-bow',accessory:'accessory-brooch',hat:null},
    mafia:{outerwear:'coat-ink',neckwear:'neck-tie',accessory:'accessory-chain',hat:'hat-ink'},
    don:{outerwear:'coat-wine',neckwear:'neck-bow',accessory:'accessory-chain',hat:'hat-fedora'},
    sheriff:{outerwear:'coat-ink',neckwear:'neck-tie',accessory:'accessory-brooch',hat:null},
  };
  const $ = id => document.getElementById(id);
  let role = 'civilian';
  let slot = 'outerwear';
  let template = null;
  let saved = load();
  let drafts = copy(saved);
  let message = '';
  function copy(obj){return JSON.parse(JSON.stringify(obj));}
  function valid(slotInfo,id){return id === null || slotInfo.items.some(x=>x.id===id);}
  function cleanRole(source,defaults){
    const next={};
    for(const s of SLOTS){
      const maybe=source && Object.prototype.hasOwnProperty.call(source,s.id)?source[s.id]:defaults[s.id];
      next[s.id]=valid(s,maybe)?maybe:defaults[s.id];
    }
    return next;
  }
  function load(){
    try{
      const source=JSON.parse(localStorage.getItem(STORE)||'null');
      const result={};
      for(const r of ROLES)result[r.id]=cleanRole(source?.[r.id],PRESETS[r.id]);
      return result;
    }catch{return copy(PRESETS);}
  }
  function save(){
    const next=copy(drafts);
    try{localStorage.setItem(STORE,JSON.stringify(next));saved=next;message='Образ сохранён в этом браузере.';}
    catch{message='Браузер не разрешает сохранять данные. Примерка останется открытой до закрытия страницы.';}
    render();
  }
  function dirty(){
    return JSON.stringify(drafts[role])!==JSON.stringify(saved[role]);
  }
  function composeTo(svg,loadout){
    for(const g of svg.querySelectorAll('[data-slot]')){
      const chosen=loadout[g.dataset.slot];
      g.style.display=g.dataset.item===chosen?'inline':'none';
    }
  }
  function initSvg(svg){
    svg.setAttribute('aria-label','Денди, игровой персонаж из отдельных векторных деталей');
    svg.setAttribute('role','img');
    svg.removeAttribute('width');svg.removeAttribute('height');
    return svg;
  }
  function thumbnail(groupId,view){
    if(!template)return null;
    const svg=document.createElementNS(SVGNS,'svg');
    svg.setAttribute('viewBox',view);
    svg.setAttribute('aria-hidden','true');
    const defs=template.querySelector('defs');
    if(defs)svg.appendChild(defs.cloneNode(true));
    const source=template.querySelector('#'+groupId);
    if(source){
      const clone=source.cloneNode(true);
      clone.removeAttribute('display');clone.style.display='inline';svg.appendChild(clone);
    }
    return svg;
  }
  function renderRoles(){
    const box=$('roles');box.replaceChildren();
    for(const r of ROLES){
      const b=document.createElement('button');
      b.type='button';b.textContent=r.title;b.setAttribute('aria-pressed',r.id===role?'true':'false');
      b.onclick=()=>{role=r.id;message='';render();};box.appendChild(b);
    }
  }
  function renderSlots(){
    const box=$('slots');box.replaceChildren();
    for(const s of SLOTS){
      const b=document.createElement('button');b.type='button';
      b.setAttribute('aria-pressed',s.id===slot?'true':'false');
      const icon=document.createElement('span');icon.className='symbol';icon.textContent=s.symbol;icon.setAttribute('aria-hidden','true');
      const title=document.createElement('span');title.textContent=s.title;
      b.append(icon,title);
      b.onclick=()=>{slot=s.id;renderSlots();renderItems();};
      box.appendChild(b);
    }
  }
  function renderItems(){
    const info=SLOTS.find(s=>s.id===slot);
    $('inventory-title').textContent=info.title;
    $('items-count').textContent='2 тестовых варианта';
    const box=$('items');box.replaceChildren();
    const choices=[{id:null,title:'Без предмета'},...info.items];
    for(const item of choices){
      const b=document.createElement('button');b.type='button';b.className='item';
      b.setAttribute('aria-pressed',drafts[role][slot]===item.id?'true':'false');
      const graphic=document.createElement('span');graphic.className='item-preview';
      if(item.id){const t=thumbnail(item.id,info.view);if(t)graphic.appendChild(t);}
      else{const t=document.createElement('span');t.className='empty-mark';t.textContent='∅';graphic.appendChild(t);}
      const name=document.createElement('strong');name.textContent=item.title;
      const tag=document.createElement('small');tag.textContent=item.id?'Базовый пресет':'Пустой слот';
      b.append(graphic,name,tag);
      b.onclick=()=>{drafts[role][slot]=item.id;message='';render();};
      box.appendChild(b);
    }
  }
  function render(){
    renderRoles();renderSlots();renderItems();
    const name=ROLES.find(r=>r.id===role).title;
    $('role-name').textContent=name;
    const svg=$('rig-stage').querySelector('svg');
    if(svg)composeTo(svg,drafts[role]);
    const changed=dirty();
    $('status-label').textContent=message|| (changed?'Есть несохранённые изменения':'Образ сохранён');
    $('status-label').parentNode.classList.toggle('unsaved',changed);
    $('save').disabled=!changed;
  }
  function reset(){
    drafts[role]=copy(PRESETS[role]);message='';render();
  }
  function compare(){
    const dialog=$('comparison');const grid=$('compare-grid');grid.replaceChildren();
    for(const r of ROLES){
      const item=document.createElement('div');item.className='compare-item';
      const cloned=initSvg(template.cloneNode(true));composeTo(cloned,drafts[r.id]);
      const title=document.createElement('strong');title.textContent=r.title;
      const tag=document.createElement('small');tag.textContent=JSON.stringify(drafts[r.id])===JSON.stringify(saved[r.id])?'Сохранён':'Черновик';
      item.append(cloned,title,tag);grid.appendChild(item);
    }
    dialog.showModal();
  }
  async function start(){
    $('save').onclick=save;
    $('reset').onclick=reset;
    $('compare').onclick=compare;
    $('close-compare').onclick=()=> $('comparison').close();
    $('comparison').addEventListener('click',event=>{if(event.target===$('comparison'))$('comparison').close();});
    try{
      const text=window.__DENDI_RIG_INLINE__ || await (await fetch('./dendi-rig.svg')).text();
      const doc=new DOMParser().parseFromString(text,'image/svg+xml');
      if(doc.querySelector('parsererror') || !doc.querySelector('svg'))throw Error('invalid_rig');
      template=doc.querySelector('svg');
      const figure=initSvg(document.importNode(template,true));
      $('rig-stage').appendChild(figure);
      render();
    }catch{
      $('rig-stage').textContent='Не удалось загрузить игровой шаблон Денди.';
      $('save').disabled=true;
    }
  }
  // Script executes with defer. No external libraries, no app credentials.
  void start();
})();
