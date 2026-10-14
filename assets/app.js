/*
 * شبكة الطرق بمحافظة البريمي — تجربة معرض أكتوبر العمران ٢٠٢٦
 * تصميم دائرة الطرق بمحافظة البريمي
 * IMPORTANT: The reference is a small, non-georeferenced raster map.
 * Coordinates and optional route highlights are illustrative pixel positions,
 * NOT GPS, surveying, GIS geometry, official route alignments or road distances.
 */
(() => {
  'use strict';
  const MAP_W = 500;
  const MAP_H = 708;
  const DATA_KEY = 'buraimi_roads_touch_points_v1';
  const THEME_KEY = 'buraimi_roads_touch_theme_v1';
  const DEFAULT_POINTS = [
    {id:'buraimi', title:'ولاية البريمي', kind:'wilaya', x:247, y:331, description:'إحدى ولايات محافظة البريمي. يبيّن المؤشر موضعًا استرشاديًا مستندًا إلى المخطط المرفق، وليس إحداثية ملاحية معتمدة.'},
    {id:'mahdah', title:'ولاية محضة', kind:'wilaya', x:314, y:274, description:'إحدى ولايات محافظة البريمي. يمكنك تكبير الخريطة للاطلاع على شبكة الطرق ومسارات الربط الظاهرة في المخطط المرجعي.'},
    {id:'sununah', title:'ولاية السنينة', kind:'wilaya', x:314, y:563, description:'إحدى ولايات محافظة البريمي. يعرض التطبيق موقعها بشكل تقريبي على الخريطة المرجعية دون بيانات أطوال أو إحداثيات رسمية.'},
    {id:'rawdah', title:'الروضة', kind:'site', x:281, y:119, description:'موقع وارد في الجزء الشمالي من المخطط التوضيحي. موضع العلامة استرشادي للتفاعل والعرض داخل المعرض.'},
    {id:'saa', title:'صاع', kind:'site', x:338, y:368, description:'موقع يظهر في وسط المخطط المرجعي بمحافظة البريمي. اضغط على مسارات التمييز أسفل الخريطة لمشاهدة التفاعل.'},
    {id:'hafeet', title:'حفيت', kind:'site', x:260, y:445, description:'موقع وارد في المخطط التوضيحي لشبكة الطرق. عرض موقعه تقريبي ولا يُستخدم للتنقل أو التصميم الهندسي.'},
    {id:'fayadh', title:'الفياض', kind:'site', x:374, y:412, description:'موقع ظاهر في المنطقة الوسطى إلى الجنوبية بالمخطط. يمكن تحريك الخريطة والتكبير لمعاينة محيطه.'}
  ];
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  // Optional maintenance mode: ?admin=1 (not an authentication mechanism).
  const maintenanceMode = new URLSearchParams(location.search).get('admin') === '1';
  document.body.classList.toggle('admin-mode', maintenanceMode);
  const refs = {
    stage:$('#mapStage'), art:$('#mapArt'), pins:$('#pinsLayer'), list:$('#locationList'),
    search:$('#searchInput'), resultCount:$('#resultCount'), selectedCard:$('#selectedCard'),
    detailIcon:$('#detailIcon'), detailTitle:$('#detailTitle'), detailDesc:$('#detailDesc'),
    detailType:$('#detailType'), detailCoordinate:$('#detailCoordinate'),
    zoomReadout:$('#zoomReadout'), tourButton:$('#tourButton'),
    dialog:$('#locationDialog'), form:$('#locationForm'), tapHint:$('#mapTapHint'),
    editActions:$('#editActions'), toast:$('#toast')
  };
  let points = getPoints();
  let selectedId = points.some(point => point.id === 'buraimi') ? 'buraimi' : points[0]?.id || null;
  let filter = 'all';
  let term = '';
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let baseScale = 1;
  let showWilaya = true;
  let showSite = true;
  let showRoutes = true;
  let currentRoute = 'off';
  let editMode = false;
  let editingId = null;
  let pendingPoint = null;
  let tourTimer = null;
  let pointerPositions = new Map();
  let suppressTap = false;
  let lastPointer = null;
  let toastTimer = null;

  function toArabic(value) {
    return String(value).replace(/\d/g, char => '٠١٢٣٤٥٦٧٨٩'[Number(char)]);
  }
  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function normalizePoint(p, fallbackId) {
    if (!p || typeof p !== 'object') return null;
    const title = typeof p.title === 'string' ? p.title.trim().slice(0,60) : '';
    const x = Number(p.x), y = Number(p.y);
    if (!title || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > MAP_W || y < 0 || y > MAP_H) return null;
    const kind = p.kind === 'wilaya' ? 'wilaya' : 'site';
    const description = typeof p.description === 'string' ? p.description.trim().slice(0,240) : '';
    const id = typeof p.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(p.id) ? p.id : fallbackId;
    return {id,title,kind,x,y,description};
  }
  function getPoints() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (!raw) return structuredClone(DEFAULT_POINTS);
      const payload = JSON.parse(raw);
      const src = Array.isArray(payload) ? payload : payload.locations;
      if (!Array.isArray(src) || !src.length || src.length > 1000) return structuredClone(DEFAULT_POINTS);
      const out = src.map((p,i) => normalizePoint(p,`imported_${i}`)).filter(Boolean);
      return out.length ? uniqueIds(out) : structuredClone(DEFAULT_POINTS);
    } catch(_) { return structuredClone(DEFAULT_POINTS); }
  }
  function uniqueIds(array) {
    const seen = new Set();
    return array.map((p,i) => {
      let id = p.id;
      if (seen.has(id)) id = `location_${i}`;
      seen.add(id);
      return {...p,id};
    });
  }
  function persist() {
    try {localStorage.setItem(DATA_KEY,JSON.stringify({version:1,locations:points}));return true;}
    catch (_) {showToast('تعذر الحفظ على هذا المتصفح. يمكنك تصدير ملف JSON لحفظ التعديلات.');return false;}
  }
  function showToast(message) {
    refs.toast.textContent = message;
    refs.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => refs.toast.classList.remove('visible'), 3900);
  }
  function visiblePoints() {
    return points.filter(p => (p.kind === 'wilaya' ? showWilaya : showSite));
  }
  function listPoints() {
    return visiblePoints().filter(p => (filter === 'all' || p.kind === filter) && `${p.title} ${p.description}`.includes(term));
  }
  function makeElement(tag,className,textValue) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textValue !== undefined) el.textContent = textValue;
    return el;
  }
  function renderList() {
    const list = listPoints();
    refs.list.replaceChildren();
    refs.resultCount.textContent = toArabic(list.length);
    if (!list.length) {
      refs.list.append(makeElement('p','empty-results','لا توجد مواقع مطابقة. جرّب البحث بكلمة أخرى أو غيّر عوامل التصفية.'));
      return;
    }
    for (const p of list) {
      const btn = makeElement('button','location-item');
      btn.type='button';
      btn.dataset.kind = p.kind;
      if(p.id === selectedId) btn.classList.add('active');
      const bubble=makeElement('span','location-bubble',p.kind==='wilaya'?'⌖':'◆');
      const words=makeElement('span','location-words');
      words.append(makeElement('strong','',p.title));
      words.append(makeElement('small','',p.kind==='wilaya'?'ولاية بمحافظة البريمي':'موقع على المخطط التوضيحي'));
      btn.append(bubble,words,makeElement('span','chevron','‹'));
      btn.addEventListener('click',() => selectPoint(p.id,true));
      refs.list.append(btn);
    }
  }
  function renderPins() {
    refs.pins.replaceChildren();
    const inverse = 1 / (baseScale * zoom);
    for (const p of visiblePoints()) {
      const button = makeElement('button','map-pin');
      button.type='button';
      button.dataset.kind = p.kind;
      button.setAttribute('aria-label',`${p.title}، ${p.kind==='wilaya'?'ولاية':'موقع'}`);
      button.style.left=`${p.x}px`;
      button.style.top=`${p.y}px`;
      button.style.setProperty('--inverse', inverse.toFixed(5));
      if(p.id===selectedId) button.classList.add('active');
      button.append(makeElement('span','pin-circle',p.kind==='wilaya'?'⌖':'◆'));
      button.append(makeElement('span','pin-name',p.title));
      button.addEventListener('click',()=>selectPoint(p.id,true));
      refs.pins.append(button);
    }
  }
  function renderDetail() {
    const p=points.find(p=>p.id===selectedId);
    refs.detailTitle.textContent=p?.title || 'اختر موقعًا';
    refs.detailType.textContent=p?(p.kind==='wilaya'?'إحدى ولايات المحافظة':'موقع على الخريطة'):'لا يوجد موقع محدد';
    refs.detailDesc.textContent=p?.description || 'اختر موقعًا من القائمة أو من الخريطة لاستعراض تفاصيله.';
    refs.detailIcon.textContent=p?.kind==='wilaya'?'⌖':'◆';
    refs.detailCoordinate.textContent=p?'موضع استرشادي':'—';
    refs.editActions.hidden=!editMode || !p;
    $('#focusButton').disabled=!p;
  }
  function selectPoint(id,focus=false) {
    if (!points.some(p=>p.id===id)) return;
    selectedId=id;
    renderList();renderPins();renderDetail();
    if (focus) focusPoint();
  }
  function scaleValue(){return baseScale*zoom;}
  function measureStage() {
    const rect=refs.stage.getBoundingClientRect();
    if(!rect.width || !rect.height) return;
    baseScale=Math.min((rect.width-22)/MAP_W,(rect.height-28)/MAP_H);
    applyTransform();renderPins();
  }
  function applyTransform() {
    const bounds=refs.stage.getBoundingClientRect();
    const s=scaleValue();
    const panLimitX=Math.max(bounds.width*.7,(MAP_W*s-bounds.width)/2+bounds.width*.45);
    const panLimitY=Math.max(bounds.height*.7,(MAP_H*s-bounds.height)/2+bounds.height*.45);
    panX=clamp(panX,-panLimitX,panLimitX);
    panY=clamp(panY,-panLimitY,panLimitY);
    refs.art.style.transform=`translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${s})`;
    refs.zoomReadout.textContent=toArabic(`${Math.round(zoom*100)}٪`);
    $$('.map-pin').forEach(el=>el.style.setProperty('--inverse',(1/s).toFixed(5)));
  }
  function focusPoint() {
    const p=points.find(p=>p.id===selectedId);
    if(!p)return;
    zoom=Math.max(zoom,1.43);
    const s=scaleValue();
    panX=-(p.x-MAP_W/2)*s;
    panY=-(p.y-MAP_H/2)*s;
    applyTransform();
  }
  function zoomAt(multiplier,clientX,clientY) {
    const oldZoom=zoom;
    zoom=clamp(zoom*multiplier,.7,5.5);
    const factor=zoom/oldZoom;
    const rect=refs.stage.getBoundingClientRect();
    const cx=clientX-rect.left-rect.width/2;
    const cy=clientY-rect.top-rect.height/2;
    panX=cx-(cx-panX)*factor;
    panY=cy-(cy-panY)*factor;
    applyTransform();
  }
  function zoomCenter(mult) {
    const r=refs.stage.getBoundingClientRect();
    zoomAt(mult,r.left+r.width/2,r.top+r.height/2);
  }
  function resetMap() {zoom=1;panX=0;panY=0;applyTransform();}
  function renderRoutes() {
    $$('#routeSvg path').forEach(p=>p.classList.toggle('active',showRoutes && p.dataset.route===currentRoute));
    $$('[data-route-select]').forEach(b=>b.classList.toggle('active',b.dataset.routeSelect===currentRoute));
  }
  function stopTour() {
    if (tourTimer) clearInterval(tourTimer);
    tourTimer=null;
    $('#tourText').textContent='بدء الجولة التفاعلية';
    $('#tourIcon').textContent='▶';
    refs.tourButton.setAttribute('aria-pressed','false');
  }
  function toggleTour() {
    if(tourTimer){stopTour();return;}
    const destinations=listPoints();
    if(!destinations.length){showToast('أظهر بعض المواقع أولًا لبدء الجولة.');return;}
    let index=0;
    function next(){const p=destinations[index++ % destinations.length];selectPoint(p.id,true);}
    next();
    tourTimer=setInterval(next,6500);
    $('#tourText').textContent='إيقاف الجولة التفاعلية';
    $('#tourIcon').textContent='■';
    refs.tourButton.setAttribute('aria-pressed','true');
    showToast('بدأت الجولة التفاعلية، وسيتم تغيير الموقع تلقائيًا.');
  }
  function toggleEdit() {
    stopTour();
    editMode=!editMode;
    $('#editModeButton').classList.toggle('active',editMode);
    $('#editModeButton').textContent=editMode?'✓ إنهاء إدارة المواقع':'⚙ إدارة المواقع';
    refs.tapHint.hidden=!editMode;
    $('#manageHint').textContent=editMode?'وضع الإدارة مفعل: المس الخريطة لإضافة نقطة، أو اختر نقطة لتعديلها أو حذفها. التعديلات محفوظة محليًا على هذا الجهاز.':'يمكن تخصيص المواقع وحفظ التعديلات على الجهاز المستخدم. لا يتطلب التطبيق خادمًا أو قاعدة بيانات.';
    if(!$('#restoreButton') && editMode){
      const reset=makeElement('button','quiet-button','↺ استعادة الافتراضي');
      reset.id='restoreButton';
      reset.type='button';
      reset.addEventListener('click',()=>{
        if(!confirm('هل تريد استعادة المواقع الافتراضية وحذف التعديلات المحلية؟'))return;
        points=structuredClone(DEFAULT_POINTS);selectedId='buraimi';persist();renderEverything();resetMap();showToast('تمت استعادة المواقع الافتراضية.');
      });
      $('.manage-controls').append(reset);
    }
    if($('#restoreButton'))$('#restoreButton').hidden=!editMode;
    renderDetail();
    showToast(editMode?'تم تفعيل وضع الإدارة. المس الخريطة لإضافة موقع.':'تم إغلاق وضع الإدارة.');
  }
  function openEditor(p=null,x=null,y=null) {
    if(!editMode)return;
    editingId=p?.id||null;
    pendingPoint=p?{x:p.x,y:p.y}:{x,y};
    $('#dialogTitle').textContent=p?'تعديل موقع تفاعلي':'إضافة موقع تفاعلي';
    $('#pointTitle').value=p?.title||'';
    $('#pointKind').value=p?.kind||'site';
    $('#pointDescription').value=p?.description||'';
    refs.dialog.showModal();
    $('#pointTitle').focus();
  }
  function saveEditor() {
    if (!refs.form.reportValidity()) return;
    if (!pendingPoint) return;
    const p={id:editingId||`custom_${Date.now()}_${Math.floor(Math.random()*100000)}`,title:$('#pointTitle').value.trim(),kind:$('#pointKind').value,x:pendingPoint.x,y:pendingPoint.y,description:$('#pointDescription').value.trim()};
    const clean=normalizePoint(p,p.id);
    if(!clean){showToast('تحقق من اسم الموقع والإحداثيات.');return;}
    if(editingId){const index=points.findIndex(i=>i.id===editingId);if(index!==-1)points[index]=clean;}
    else{points.push(clean);}
    selectedId=clean.id;persist();renderEverything();focusPoint();refs.dialog.close();showToast('تم حفظ الموقع التفاعلي.');
  }
  function exportData() {
    const content=JSON.stringify({version:1,project:'شبكة الطرق بمحافظة البريمي',disclaimer:'Illustrative pixel coordinates, not official GIS',locations:points},null,2);
    const blob=new Blob([content],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download='buraimi-roads-locations.json';document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
    showToast('تم تجهيز ملف بيانات المواقع للتنزيل.');
  }
  async function importData(file) {
    if(!file)return;
    if(file.size>2*1024*1024){showToast('الملف كبير جدًا. الحد المسموح ٢ ميجابايت.');return;}
    try{
      const json=JSON.parse(await file.text());
      const raw=Array.isArray(json)?json:json.locations;
      if(!Array.isArray(raw)||!raw.length||raw.length>1000)throw new Error('invalid entries');
      const imported=raw.map((p,i)=>normalizePoint(p,`imported_${i}`));
      if(imported.some(p=>!p))throw new Error('invalid location');
      points=uniqueIds(imported);
      selectedId=points[0].id;
      persist();renderEverything();resetMap();
      showToast(`تم استيراد ${toArabic(points.length)} موقع بنجاح.`);
    }catch(_){showToast('تعذر استيراد الملف. تأكد من أنه JSON صالح يحتوي على locations.');}
  }
  function renderEverything(){renderList();renderPins();renderDetail();renderRoutes();}
  $$('.tab').forEach(tab=>tab.addEventListener('click',()=>{
    filter=tab.dataset.filter;
    $$('.tab').forEach(t=>{const on=t===tab;t.classList.toggle('active',on);t.setAttribute('aria-selected',String(on));});
    renderList();
  }));
  refs.search.addEventListener('input',()=>{term=refs.search.value.trim();renderList();});
  $('#wilayaToggle').addEventListener('change',e=>{showWilaya=e.target.checked;renderList();renderPins();stopTour();});
  $('#siteToggle').addEventListener('change',e=>{showSite=e.target.checked;renderList();renderPins();stopTour();});
  $('#routeToggle').addEventListener('change',e=>{showRoutes=e.target.checked;renderRoutes();});
  $$('[data-route-select]').forEach(button=>button.addEventListener('click',()=>{
    currentRoute=currentRoute===button.dataset.routeSelect?'off':button.dataset.routeSelect;
    if(currentRoute!=='off' && !showRoutes){showRoutes=true;$('#routeToggle').checked=true;}
    renderRoutes();
  }));
  $('#tourButton').addEventListener('click',toggleTour);
  $('#focusButton').addEventListener('click',focusPoint);
  $('#zoomIn').addEventListener('click',()=>zoomCenter(1.25));
  $('#zoomOut').addEventListener('click',()=>zoomCenter(.8));
  $('#mapReset').addEventListener('click',resetMap);
  $('#editModeButton').addEventListener('click',toggleEdit);
  $('#exportButton').addEventListener('click',exportData);
  $('#importButton').addEventListener('click',()=>$('#importFile').click());
  $('#importFile').addEventListener('change',async event=>{await importData(event.target.files[0]);event.target.value='';});
  $('#editSelectedButton').addEventListener('click',()=>openEditor(points.find(p=>p.id===selectedId)));
  $('#deleteSelectedButton').addEventListener('click',()=>{
    const p=points.find(p=>p.id===selectedId);
    if(!p || !confirm(`هل تريد حذف «${p.title}»؟`))return;
    points=points.filter(item=>item.id!==selectedId);
    selectedId=points[0]?.id||null;
    persist();renderEverything();showToast('تم حذف الموقع.');
  });
  $('#dialogClose').addEventListener('click',()=>refs.dialog.close());
  $('#dialogCancel').addEventListener('click',()=>refs.dialog.close());
  refs.form.addEventListener('submit',event=>{event.preventDefault();saveEditor();});
  refs.dialog.addEventListener('click',event=>{if(event.target===refs.dialog)refs.dialog.close();});
  $('#themeButton').addEventListener('click',()=>{
    const light=$('#appShell').classList.toggle('light-theme');
    $('#themeIcon').textContent=light?'☾':'☼';
    try{localStorage.setItem(THEME_KEY,light?'light':'dark');}catch(_){}
  });
  if((()=>{try{return localStorage.getItem(THEME_KEY)==='light';}catch(_){return false;}})()){$('#appShell').classList.add('light-theme');$('#themeIcon').textContent='☾';}
  $('#fullscreenButton').addEventListener('click',async()=>{
    try{
      if(document.fullscreenElement){await document.exitFullscreen();}
      else if(document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen();}
      else showToast('ملء الشاشة غير متاح هنا. جرّب إضافة الموقع إلى الشاشة الرئيسية.');
    }catch(_){showToast('لم يتمكّن المتصفح من تشغيل وضع ملء الشاشة.');}
  });
  refs.stage.addEventListener('wheel',event=>{
    event.preventDefault();
    zoomAt(event.deltaY<0?1.14:1/1.14,event.clientX,event.clientY);
  },{passive:false});
  refs.stage.addEventListener('pointerdown',event=>{
    if(event.target.closest('button'))return;
    refs.stage.setPointerCapture(event.pointerId);
    pointerPositions.set(event.pointerId,{x:event.clientX,y:event.clientY});
    lastPointer={x:event.clientX,y:event.clientY};
    suppressTap=false;
    refs.stage.classList.add('dragging');
  });
  refs.stage.addEventListener('pointermove',event=>{
    if(!pointerPositions.has(event.pointerId))return;
    const prior=pointerPositions.get(event.pointerId);
    if(Math.abs(event.clientX-prior.x)>3 || Math.abs(event.clientY-prior.y)>3) suppressTap=true;
    if(pointerPositions.size===1){
      panX+=event.clientX-prior.x;
      panY+=event.clientY-prior.y;
    }else if(pointerPositions.size===2){
      const other=[...pointerPositions.entries()].find(([id])=>id!==event.pointerId)?.[1];
      if(other){
        const oldDist=Math.hypot(prior.x-other.x,prior.y-other.y);
        const newDist=Math.hypot(event.clientX-other.x,event.clientY-other.y);
        if(oldDist>2 && newDist>2)zoomAt(newDist/oldDist,(event.clientX+other.x)/2,(event.clientY+other.y)/2);
        panX+=(event.clientX-prior.x)/2;
        panY+=(event.clientY-prior.y)/2;
      }
    }
    pointerPositions.set(event.pointerId,{x:event.clientX,y:event.clientY});
    applyTransform();
  });
  const endPointer=event=>{
    if(!pointerPositions.has(event.pointerId))return;
    pointerPositions.delete(event.pointerId);
    if(!pointerPositions.size){refs.stage.classList.remove('dragging');lastPointer=null;}
  };
  refs.stage.addEventListener('pointerup',endPointer);
  refs.stage.addEventListener('pointercancel',endPointer);
  refs.stage.addEventListener('lostpointercapture',endPointer);
  refs.stage.addEventListener('click',event=>{
    if(!editMode||event.target.closest('button'))return;
    if(suppressTap){suppressTap=false;return;}
    const rect=refs.art.getBoundingClientRect();
    const x=(event.clientX-rect.left)/rect.width*MAP_W;
    const y=(event.clientY-rect.top)/rect.height*MAP_H;
    if(x<0||x>MAP_W||y<0||y>MAP_H)return;
    openEditor(null,Math.round(x),Math.round(y));
  });
  refs.stage.addEventListener('keydown',event=>{
    if(event.target!==refs.stage)return;
    const moves={ArrowLeft:[-35,0],ArrowRight:[35,0],ArrowUp:[0,-35],ArrowDown:[0,35]};
    if(moves[event.key]){
      event.preventDefault();panX+=moves[event.key][0];panY+=moves[event.key][1];applyTransform();
    } else if(event.key==='+'||event.key==='='){event.preventDefault();zoomCenter(1.2);}
    else if(event.key==='-'){event.preventDefault();zoomCenter(.83);}
    else if(event.key==='Home'){event.preventDefault();resetMap();}
  });
  const observer=new ResizeObserver(measureStage);
  observer.observe(refs.stage);
  renderEverything();
  requestAnimationFrame(measureStage);
  if ('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
})();
