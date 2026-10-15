/**
 * شبكة الطرق بمحافظة البريمي - أكتوبر العمران ٢٠٢٦
 * © دائرة الطرق بمحافظة البريمي
 * Data: OpenStreetMap vector tiles via OpenFreeMap, and AWS/Mapzen DEM.
 * OpenStreetMap road class ≠ road ownership, network inventory or ministry jurisdiction.
 * Legacy image/pixel positions are NEVER converted to geographic coordinates.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const STORAGE = 'buraimi_roads_osm_locations_v2';
  const OLD_STORAGE = 'buraimi_roads_touch_points_v1';
  const THEME = 'buraimi_roads_touch_theme_v1';
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'; // lean vector style; same OSM road source
  const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  // Governorate boundary vector dataset (derived from GADM 3.6; remote read-only source).
  // The map stays invisible if this data cannot be loaded. It must never show neighbouring UAE tiles.
  const BOUNDARY_SOURCES = ['assets/buraimi-boundary.geojson','https://raw.githubusercontent.com/NasserAlbusaidi/oman-data-bank/main/public/oman-governorates.json','https://cdn.jsdelivr.net/gh/NasserAlbusaidi/oman-data-bank@main/public/oman-governorates.json'];
  const BOUNDARY_CACHE = 'buraimi-boundary-v2.4';
  const MASK_ID = 'buraimi-outside-hidden';
  const OUTLINE_ID = 'buraimi-governorate-border';
  const ROAD_LAYER = 'buraimi-osm-roads-emphasis';
  const BUILDINGS_ID = 'buraimi-3d-buildings';
  let BOUNDS = [[55.58,23.45],[56.28,25.05]]; // replaced by true polygon bounds before display
  const CENTER = [55.88,24.25];
  const ROAD_TYPES = {
    all: ['motorway','trunk','primary','secondary','tertiary','minor','street','street_limited','service','track','path'],
    main: ['motorway','trunk','primary'],
    regional: ['secondary','tertiary'],
    local: ['minor','street','street_limited','service'],
    track: ['track','path']
  };
  const ROAD_LABELS = { motorway:'طريق سريع',trunk:'طريق رئيسي',primary:'طريق رئيسي',secondary:'طريق رابط',tertiary:'طريق فرعي',minor:'طريق محلي',street:'شارع',street_limited:'شارع محلي',service:'طريق خدمة',track:'مسار ترابي',path:'مسار مشاة' };
  // Real-world coordinates for the four grounded locations, not positions copied from the old raster.
  // Remaining legacy labels are preserved as unlocated until coordinates are provided.
  const DEFAULT_POINTS = [
    {id:'buraimi',title:'ولاية البريمي',kind:'wilaya',lat:24.25579,lng:55.80253,description:'مركز ولاية البريمي. تظهر الطرق ومحيط الولاية من قاعدة OpenStreetMap المفتوحة.'},
    {id:'mahdah',title:'ولاية محضة',kind:'wilaya',lat:24.4095,lng:55.9666,description:'مركز ولاية محضة. استكشف الطرق والمناطق الجبلية المحيطة من زاوية ثلاثية الأبعاد.'},
    {id:'sununah',title:'ولاية السنينة',kind:'wilaya',lat:23.60676,lng:55.95399,description:'مركز ولاية السنينة في جنوب المحافظة. استعرض امتداد الطرق حول المركز.'},
    {id:'rawdah',title:'الروضة',kind:'site',lat:24.90327,lng:55.86047,description:'موقع قرية الروضة بمحافظة البريمي، وفق بيانات جغرافية مفتوحة.'},
    {id:'saa',title:'صاع',kind:'site',lat:null,lng:null,description:'وارد في المخطط الأصلي. أضف إحداثياته الجغرافية المعتمدة من وضع الإدارة لإظهاره على الخريطة.'},
    {id:'hafeet',title:'حفيت',kind:'site',lat:null,lng:null,description:'وارد في المخطط الأصلي. لم تُحوّل إحداثيات الصورة القديمة إلى GPS لعدم دقتها.'},
    {id:'fayadh',title:'الفياض',kind:'site',lat:null,lng:null,description:'وارد في المخطط الأصلي. ينتظر إضافة إحداثيات جغرافية دقيقة من الإدارة.'}
  ];
  const params = new URLSearchParams(location.search);
  const adminAvailable = params.get('admin') === '1'; // UI-only, NOT a security measure.
  document.body.classList.toggle('admin-mode',adminAvailable);
  const state = {
    points: loadPoints(), selectedId:'buraimi', road:null, filter:'all', term:'', roadFilter:'all',
    showWilaya:true,showSite:true,showRoads:true,showBuildings:true,showTerrain:false,terrainUserSet:false,
    is3D:false, editMode:false,editingId:null, pendingCoords:null, markers:[], map:null,
    mapReady:false, styleReady:false, firstPaint:false, sourceId:null, buildingLayerIds:[], tourTimer:null, toastTimer:null, errorCount:0, boundaryGeo:null, boundaryReady:false, boundaryLoading:false
  };
  if(!state.points.some(p=>p.id==='buraimi'))state.selectedId=state.points[0]?.id||null;
  // The boundaries come from the governorate polygon, NOT from a loose rectangular bbox.
  function ringContains(lng,lat,ring){
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i], b=ring[j];
      if(((a[1]>lat)!==(b[1]>lat))&&(lng<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0]))inside=!inside;
    }
    return inside;
  }
  function pointInGeometry(lng,lat,geometry){
    if(!geometry)return false;
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:(geometry.type==='MultiPolygon'?geometry.coordinates:[]);
    return polygons.some(rings=>rings.length&&ringContains(lng,lat,rings[0])&&!rings.slice(1).some(r=>ringContains(lng,lat,r)));
  }
  function boundaryPolygons(geo){return geo.type==='Polygon'?[geo.coordinates]:(geo.type==='MultiPolygon'?geo.coordinates:[]);}
  function nameMatchesBuraymi(feature){
    const props=feature?.properties||{};
    return Object.values(props).some(v=>typeof v==='string'&&/البريمي|البريمى|(?:al[\s_-]*)?(?:buraymi|buraimi|bur[a-z]*ymi)/i.test(v));
  }
  function extractGovernorate(data){
    const features=data?.type==='FeatureCollection'?data.features:(data?.type==='Feature'?[data]:[]);
    const valid=features.filter(f=>f?.geometry&&boundaryPolygons(f.geometry).length);
    let selected=valid.find(nameMatchesBuraymi);
    // Backup for datasets with numeric governorate IDs and no readable names:
    // the correct governorate must encompass all three known Omani wilayat centres.
    if(!selected)selected=valid.find(f=>[[55.80253,24.25579],[55.9666,24.4095],[55.95399,23.60676]]
      .every(([lng,lat])=>pointInGeometry(lng,lat,f.geometry)));
    if(!selected)throw Error('لم يتم تحديد مضلع محافظة البريمي داخل ملف الحدود.');
    const poly=boundaryPolygons(selected.geometry);
    let n=0,west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
    for(const polygon of poly)for(const ring of polygon){
      if(!Array.isArray(ring)||ring.length<4)throw Error('مضلع غير صالح');
      for(const p of ring){const [lng,lat]=p;
        if(!Number.isFinite(lng)||!Number.isFinite(lat))throw Error('إحداثيات غير صالحة');
        west=Math.min(west,lng);south=Math.min(south,lat);east=Math.max(east,lng);north=Math.max(north,lat);n++;
      }
    }
    if(n<5||west<54||east>58||south<22||north>27||east-west<.12||north-south<.12)throw Error('المضلع المحدد لا يمثل محافظة البريمي');
    return {type:'Feature',properties:{name:'محافظة البريمي'},geometry:selected.geometry,bbox:[west,south,east,north]};
  }
  function geometryRing(ring,clockwise){
    const pts=ring.map(p=>[Number(p[0]),Number(p[1])]);
    if(pts.length&& (pts[0][0]!==pts.at(-1)[0]||pts[0][1]!==pts.at(-1)[1]))pts.push([...pts[0]]);
    let doubleArea=0;
    for(let i=0;i<pts.length-1;i++)doubleArea+=(pts[i][0]*pts[i+1][1]-pts[i+1][0]*pts[i][1]);
    // GeoJSON RFC 7946: outer CCW and hole CW.
    if((doubleArea<0)!==clockwise)pts.reverse();
    return pts;
  }
  function geometryOutsideMask(geometry){
    const polygons=boundaryPolygons(geometry);
    const [west,south,east,north]=state.boundaryGeo.bbox;
    const globalRing=geometryRing([[west-1,south-1],[east+1,south-1],[east+1,north+1],[west-1,north+1]],false);
    const holes=polygons.map(poly=>geometryRing(poly[0],true));
    const features=[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[globalRing,...holes]}}];
    // Any interior holes within the governorate boundaries should remain masked.
    for(const poly of polygons)for(const inner of poly.slice(1))features.push({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[geometryRing(inner,false)]}});
    return {type:'FeatureCollection',features};
  }
  function applyArabicMapLabels(){
    // MapLibre >=6.9 handles Arabic shaping and RTL natively, without an extra network plugin.
    // Field names vary among vector tile providers; Arabic is preferred where available.
    for(const layer of state.map.getStyle().layers||[]){
      if(layer.type!=='symbol'||layer.layout?.['text-field']===undefined)continue;
      try{
        state.map.setLayoutProperty(layer.id,'text-field',[
          'coalesce',
          ['get','name:ar'],['get','name_ar'],['get','name'],['get','name_en'],''
        ]);
        // OpenFreeMap serves glyphs for the Noto Sans stack used in its vector styles.
        state.map.setLayoutProperty(layer.id,'text-font',['Noto Sans Regular']);
      }catch(error){console.warn('Arabic label layout:',layer.id,error);}
    }
  }
  function drawGovernorateOnly(){
    if(!state.styleReady||!state.boundaryGeo||state.boundaryReady)return;
    const map=state.map;
    try{
      applyArabicMapLabels();
      map.addSource('buraimi-boundary',{type:'geojson',data:state.boundaryGeo});
      map.addSource('buraimi-hide-outside',{type:'geojson',data:geometryOutsideMask(state.boundaryGeo.geometry)});
      map.addLayer({id:MASK_ID,type:'fill',source:'buraimi-hide-outside',
        paint:{'fill-color':'#dbe7de','fill-opacity':1}});
      map.addLayer({id:OUTLINE_ID,type:'line',source:'buraimi-boundary',
        paint:{'line-color':'#1d7563','line-width':['interpolate',['linear'],['zoom'],7,2,12,3.5], 'line-opacity':.98}});
      const [west,south,east,north]=state.boundaryGeo.bbox;
      BOUNDS=[[west,south],[east,north]];
      // Panning remains near the governorate; the mask removes all neighbouring locations.
      map.setMaxBounds([[west-.22,south-.22],[east+.22,north+.22]]);
      const pad=innerWidth<820?{top:180,bottom:200,left:22,right:22}:{top:160,bottom:145,left:Math.min(300,innerWidth*.20),right:Math.min(300,innerWidth*.20)};
      map.fitBounds(BOUNDS,{padding:pad,duration:0,pitch:0,bearing:0});
      state.boundaryReady=true;
      $('mapLoading').classList.remove('failed');
      $('osmMap').classList.add('boundary-ready');
      $('mapLoading').hidden=true;
      $('mapStatusText').textContent='محافظة البريمي فقط · عرض عربي';
      $('mapStatus').classList.remove('error');
      renderMarkers();readouts();
    }catch(err){console.error('Governorate mask:',err);setMapError('تعذر قصّ الخريطة بحدود المحافظة. لن تُعرض خرائط المناطق المجاورة حفاظًا على دقة العرض.');}
  }
  async function loadGovernorateBoundary(){
    if(state.boundaryLoading)return;
    state.boundaryLoading=true;
    setLoadingProgress('تحميل مضلع حدود محافظة البريمي…');
    let data=null;
    try{const cached=localStorage.getItem(BOUNDARY_CACHE);if(cached)data=JSON.parse(cached);}catch(_){/* optional cache */}
    if(!data){
      try{
        let lastError=null;
        for(const url of BOUNDARY_SOURCES){
          try{
            const response=await fetch(url,{cache:'force-cache',signal:AbortSignal.timeout(10000)});
            if(!response.ok)throw Error('HTTP '+response.status);
            data=extractGovernorate(await response.json());
            break;
          }catch(err){lastError=err;console.warn('Governorate boundary source unavailable:',url,err);}
        }
        if(!data)throw lastError||Error('لا توجد حدود متاحة');
        try{localStorage.setItem(BOUNDARY_CACHE,JSON.stringify(data));}catch(_){/* optional cache */}
      }catch(error){
        console.error('Governorate data:',error);
        setMapError('تعذر تحميل حدود محافظة البريمي. يلزم الاتصال بمصدر الحدود أو توفير ملف GeoJSON محلي؛ لن تظهر خريطة الإمارات بدلًا منها.');
        return;
      }
    }
    try{
      state.boundaryGeo=extractGovernorate(data);
      drawGovernorateOnly();
    }catch(error){
      console.error('Governorate data parse:',error);
      setMapError('تعذر قراءة مضلع حدود المحافظة. يرجى إعادة المحاولة.');
    }
  }

  function ar(value){return String(value).replace(/\d/g,ch=>'٠١٢٣٤٥٦٧٨٩'[Number(ch)]);}
  function element(tag, cls, text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function coord(value,min,max){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
  function normalize(p, fallbackId){
    if(!p||typeof p!=='object')return null;
    const title=typeof p.title==='string'?p.title.trim().slice(0,60):'';
    if(!title)return null;
    const id=typeof p.id==='string'&&/^[\w-]{1,80}$/.test(p.id)?p.id:fallbackId;
    const lat=coord(p.lat,-90,90),lng=coord(p.lng,-180,180);
    return {id,title,kind:p.kind==='wilaya'?'wilaya':'site',lat,lng,description:typeof p.description==='string'?p.description.trim().slice(0,300):''};
  }
  function sanitizeArray(arr){if(!Array.isArray(arr)||arr.length>1000)return null;const out=arr.map((p,i)=>normalize(p,`imported_${i}`));if(out.some(p=>!p))return null;const seen=new Set();return out.map((p,i)=>{if(seen.has(p.id))p.id=`duplicate_${i}`;seen.add(p.id);return p;});}
  function loadPoints(){
    try{
      const saved=localStorage.getItem(STORAGE);
      if(saved){const parsed=JSON.parse(saved);const res=sanitizeArray(Array.isArray(parsed)?parsed:parsed.locations);if(res?.length)return res;}
      // Safely migrate titles, descriptions, and types, but NEVER pixel x/y coordinates.
      const legacy=localStorage.getItem(OLD_STORAGE);
      if(legacy){const parsed=JSON.parse(legacy);const arr=Array.isArray(parsed)?parsed:parsed.locations;if(Array.isArray(arr)&&arr.length<=1000){
        const migrated=arr.map((p,i)=>{const original=DEFAULT_POINTS.find(d=>d.id===p?.id&&d.title===p?.title);return normalize({...p,lat:original?.lat??null,lng:original?.lng??null},`imported_${i}`);});
        if(migrated.every(Boolean)&&migrated.length)return migrated;
      }}
    }catch(_){/* no local storage */}
    return structuredClone(DEFAULT_POINTS);
  }
  function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({version:2,project:'شبكة الطرق بمحافظة البريمي',coordinateSystem:'WGS84',locations:state.points}));return true;}catch(_){toast('لم يتم الحفظ محليًا. يمكنك تصدير البيانات بصيغة JSON.');return false;}}
  function toast(msg){const e=$('toast');e.textContent=msg;e.classList.add('visible');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>e.classList.remove('visible'),4100);}
  function available(p){return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng);}
  function visible(p){return p.kind==='wilaya'?state.showWilaya:state.showSite;}
  function listFiltered(){const base=state.points.filter(p=>visible(p)&&(state.filter==='all'||p.kind===state.filter));if(!state.term)return base;const nameMatches=base.filter(p=>p.title.includes(state.term));return nameMatches.length?nameMatches:base.filter(p=>p.description.includes(state.term));}
  function renderList(){
    const list=$('locationList');list.replaceChildren();const entries=listFiltered();$('resultCount').textContent=ar(entries.length);
    if(!entries.length){list.append(element('p','empty-results','لا توجد نتائج مطابقة. جرّب بحثًا آخر.'));return;}
    for(const p of entries){
      const b=element('button','location-item');b.type='button';b.dataset.kind=p.kind;if(p.id===state.selectedId&&!state.road)b.classList.add('active');
      b.append(element('span','location-bubble',p.kind==='wilaya'?'⌖':'◆'));
      const w=element('span','location-words');w.append(element('strong','',p.title));w.append(element('small','',available(p)?(p.kind==='wilaya'?'مركز الولاية · موقع جغرافي':'موقع على الخريطة'):'يحتاج إلى إحداثيات GPS'));
      b.append(w,element('span','chevron','‹'));b.addEventListener('click',()=>{selectPoint(p.id,true);closeDrawer('browse');});list.append(b);
    }
  }
  function renderMarkers(){
    state.markers.forEach(m=>m.remove());state.markers=[];if(!state.mapReady||!state.boundaryReady)return;
    state.points.filter(p=>visible(p)&&available(p)&&pointInGeometry(p.lng,p.lat,state.boundaryGeo?.geometry)).forEach(p=>{
      const btn=element('button','geo-marker'+(p.id===state.selectedId&&!state.road?' selected':''));btn.type='button';btn.textContent=p.kind==='wilaya'?'⌖':'◆';btn.title=p.title;btn.setAttribute('aria-label',p.title);btn.dataset.kind=p.kind;
      btn.addEventListener('click',evt=>{evt.stopPropagation();selectPoint(p.id,false);openDrawer('detail');});
      const marker=new maplibregl.Marker({element:btn,anchor:'bottom'}).setLngLat([p.lng,p.lat]).addTo(state.map);state.markers.push(marker);
    });
  }
  function renderDetail(){
    if(state.road){
      const r=state.road;
      $('detailIcon').textContent='≋';$('detailType').textContent='عنصر من شبكة OpenStreetMap';$('detailTitle').textContent=r.name||r.ref||'طريق غير مسمى';
      $('detailDesc').textContent=`التصنيف: ${ROAD_LABELS[r.class]||r.class||'غير محدد'}. ${r.ref?'الرقم المرجعي: '+r.ref+'. ':''}هذه خصائص مسجلة في OpenStreetMap وليست تأكيدًا لملكية الطريق أو الإشراف عليه.`;
      $('coordinateLabel').textContent='إحداثيات نقطة الاختيار';$('detailCoordinate').textContent=`${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`;
      $('focusButton').disabled=false;$('editActions').hidden=true;return;
    }
    const p=state.points.find(i=>i.id===state.selectedId);
    $('detailIcon').textContent=p?.kind==='wilaya'?'⌖':'◆';$('detailType').textContent=p?(p.kind==='wilaya'?'مركز ولاية':'موقع جغرافي'):'لم يحدد موقع';
    $('detailTitle').textContent=p?.title||'اختر موقعًا';$('detailDesc').textContent=p?.description||'اختر موقعًا من اللوحة اليمنى.';
    $('coordinateLabel').textContent='إحداثيات WGS84';$('detailCoordinate').textContent=available(p)?`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`:'غير متوفرة';
    $('focusButton').disabled=!available(p);$('editActions').hidden=!(state.editMode&&p);
  }
  function selectPoint(id,focus=false){
    if(!state.points.some(p=>p.id===id))return;
    state.selectedId=id;state.road=null;renderList();renderDetail();renderMarkers();
    if(focus)focusSelected();
    if(!available(state.points.find(p=>p.id===id)))toast('لا تتوفر إحداثيات لهذا الموقع. يمكن إضافتها في وضع الإدارة.');
  }
  function focusSelected(){
    if(!state.mapReady||!state.boundaryReady)return;
    if(state.road){state.map.flyTo({center:[state.road.lng,state.road.lat],zoom:Math.max(13,state.map.getZoom()),pitch:state.is3D?61:0,essential:true,duration:1500});return;}
    const p=state.points.find(i=>i.id===state.selectedId);if(!available(p))return;
    if(!pointInGeometry(p.lng,p.lat,state.boundaryGeo?.geometry)){toast('هذا الموقع يقع خارج حدود المحافظة بحسب بيانات الحدود المتاحة.');return;}
    state.map.flyTo({center:[p.lng,p.lat],zoom:12.4,pitch:state.is3D?62:0,bearing:state.is3D?-20:0,duration:1800,essential:true});
  }
  function toggleTour(){
    if(state.tourTimer){stopTour();return;}
    if(!state.mapReady||!state.boundaryReady){toast('انتظر تحميل حدود محافظة البريمي.');return;}
    const entries=listFiltered().filter(available);if(!entries.length){toast('لا توجد مواقع محددة الإحداثيات لبدء الجولة.');return;}
    let i=0;const next=()=>{const p=entries[i++%entries.length];selectPoint(p.id,true);};next();state.tourTimer=setInterval(next,8500);
    $('tourIcon').textContent='■';$('tourText').textContent='إيقاف الجولة';$('tourButton').setAttribute('aria-pressed','true');closeDrawer('browse');
  }
  function stopTour(){clearInterval(state.tourTimer);state.tourTimer=null;$('tourIcon').textContent='▶';$('tourText').textContent='بدء جولة تفاعلية';$('tourButton').setAttribute('aria-pressed','false');}
  function resetMap(){if(!state.mapReady||!state.boundaryReady)return;stopTour();state.map.fitBounds(BOUNDS,{padding:Math.max(45,Math.min(innerWidth*.07,110)),pitch:state.is3D?45:0,bearing:state.is3D?-12:0,duration:1500,essential:true});}
  function readouts(){if(!state.mapReady)return;$('pitchReadout').textContent=ar(`${Math.round(state.map.getPitch())}°`);$('zoomReadout').textContent=ar(state.map.getZoom().toFixed(1));}
  function roadFilterExpression(){return ['in',['get','class'],['literal',ROAD_TYPES[state.roadFilter]]];}
  function updateRoadLayer(){
    if(!state.mapReady||!state.map.getLayer(ROAD_LAYER))return;
    state.map.setFilter(ROAD_LAYER,roadFilterExpression());
    state.map.setLayoutProperty(ROAD_LAYER,'visibility',state.showRoads?'visible':'none');
  }
  function ensureRoadLayer(){
    const layers=state.map.getStyle().layers||[];
    const native=layers.find(l=>l['source-layer']==='transportation'&&l.type==='line');
    if(!native){$('roadsHint').textContent='طبقة الطرق غير متوفرة في نمط الخريطة';return;}
    state.sourceId=native.source;
    if(state.map.getLayer(ROAD_LAYER))return;
    const style={
      id:ROAD_LAYER,type:'line',source:state.sourceId,'source-layer':'transportation',
      filter:roadFilterExpression(),layout:{'line-cap':'round','line-join':'round'},
      paint:{
        'line-color':['match',['get','class'],'motorway','#c97143','trunk','#c97143','primary','#d6963f','secondary','#55a2a3','tertiary','#69ae86','minor','#7f9470','street','#7f9470','street_limited','#7f9470','service','#aeb094','track','#a9a16a','path','#a9a16a','#a9a16a'],
        'line-width':['interpolate',['linear'],['zoom'],6,1.0,9,2.3,12,4.2,15,6.2,18,9],
        'line-opacity':0.86
      }
    };
    const firstLabels=layers.find(l=>l.type==='symbol'&&l.id&&/label|place|name/i.test(l.id));
    state.map.addLayer(style,firstLabels?.id);
    state.map.on('mouseenter',ROAD_LAYER,()=>{state.map.getCanvas().style.cursor=state.editMode?'crosshair':'pointer';});
    state.map.on('mouseleave',ROAD_LAYER,()=>{state.map.getCanvas().style.cursor=state.editMode?'crosshair':'';});
    updateRoadLayer();
  }
  function ensureBuildings(){
    const layers=state.map.getStyle().layers||[];
    state.buildingLayerIds=layers.filter(l=>l.type==='fill-extrusion'&&l['source-layer']==='building').map(l=>l.id);
    if(!state.buildingLayerIds.length){
      const l=layers.find(l=>l['source-layer']==='building');
      if(l&&!state.map.getLayer(BUILDINGS_ID)){
        const label=layers.find(x=>x.type==='symbol'&&/place|label|road/i.test(x.id));
        state.map.addLayer({id:BUILDINGS_ID,source:l.source,'source-layer':'building',type:'fill-extrusion',minzoom:14,
          paint:{'fill-extrusion-color':'#c8c0ac','fill-extrusion-opacity':0.78,
            'fill-extrusion-height':['coalesce',['get','render_height'],['get','height'],6],
            'fill-extrusion-base':['coalesce',['get','render_min_height'],0]}},label?.id);
        state.buildingLayerIds=[BUILDINGS_ID];
      }
    }
    updateBuildings();
  }
  function updateBuildings(){if(!state.mapReady)return;state.buildingLayerIds.forEach(id=>{if(state.map.getLayer(id))state.map.setLayoutProperty(id,'visibility',state.showBuildings&&state.is3D?'visible':'none');});}
  function enableTerrain(){
    if(!state.mapReady)return;
    try{
      if(state.is3D&&state.showTerrain){
        if(!state.map.getSource('buraimi-terrain'))state.map.addSource('buraimi-terrain',{type:'raster-dem',tiles:[DEM_URL],tileSize:256,maxzoom:12,encoding:'terrarium',attribution:'Elevation: AWS/Mapzen'});
        state.map.setTerrain({source:'buraimi-terrain',exaggeration:1.15});
      }else{state.map.setTerrain(null);}
    }catch(err){console.warn('Terrain unavailable:',err);toast('تعذر تفعيل التضاريس. ما زالت الخريطة والطرق متاحة.');}
  }
  function updateMode(){
    if(!state.mapReady)return;
    if(state.is3D){try{ensureBuildings();}catch(err){console.warn('Buildings unavailable:',err);}}
    enableTerrain();updateBuildings();
    state.map.easeTo({pitch:state.is3D?54:0,bearing:state.is3D?-15:0,duration:800,essential:true});
    $('viewModeButton').classList.toggle('mode-2d',!state.is3D);
    $('viewModeButton').textContent=state.is3D?'▤ العودة إلى 2D':'◩ عرض ثلاثي الأبعاد';
    $('viewModeButton').setAttribute('aria-pressed',String(state.is3D));
  }
  function onMapClick(e){
    if(!state.boundaryReady||!pointInGeometry(e.lngLat.lng,e.lngLat.lat,state.boundaryGeo?.geometry))return;
    if(state.editMode){openEditor(null,e.lngLat.lat,e.lngLat.lng);return;}
    if(!state.showRoads||!state.map.getLayer(ROAD_LAYER))return;
    const hits=state.map.queryRenderedFeatures(e.point,{layers:[ROAD_LAYER]});
    if(!hits.length)return;
    const props=hits[0].properties||{};
    state.road={name:String(props.name_ar||props['name:ar']||props.name||'').slice(0,100),ref:String(props.ref||'').slice(0,60),class:String(props.class||'').slice(0,40),lat:e.lngLat.lat,lng:e.lngLat.lng};
    renderList();renderDetail();renderMarkers();openDrawer('detail');
  }
  function mapError(e){
    const message=String(e?.error?.message||'');
    if(/elevation-tiles|terrarium/.test(message)){if(state.showTerrain){state.showTerrain=false;$('terrainToggle').checked=false;try{if(state.mapReady)state.map.setTerrain(null);}catch(_){};toast('تعذر تحميل ارتفاعات التضاريس؛ يستمر عرض الطرق والخريطة دون تضاريس.');}return;}
    if(!state.styleReady && /failed|fetch|network|style|404|cors/i.test(message)){
      setMapError('تعذر الاتصال بمصدر الخرائط. تحقق من الإنترنت أو سماح الشبكة باتصالات OpenFreeMap وMapLibre.');
    }else if(state.styleReady&&state.errorCount++<1){$('mapStatusText').textContent='بعض بيانات الخريطة لم تُحمّل — يمكنك الاستكشاف';}
  }
  function setMapError(message){$('mapLoading').hidden=false;$('mapLoading').classList.add('failed');$('loadingTitle').textContent='تعذر تحميل خريطة OpenStreetMap';$('loadingSub').textContent=message;$('retryButton').hidden=false;$('mapStatus').classList.add('error');$('mapStatusText').textContent='الاتصال غير مكتمل';}
  function setLoadingProgress(text){
    if(!$('mapLoading').classList.contains('failed'))$('loadingSub').textContent=text;
  }
  function mapStyleReady(){
    if(state.styleReady)return;
    state.styleReady=true;
    state.mapReady=true; // MapLibre style is usable even while map tiles continue arriving.
    $('mapStatusText').textContent='تم تحميل الأساس، جاري تحديد حدود المحافظة…';
    $('mapStatus').classList.remove('error');
    try{ensureRoadLayer();}catch(err){console.warn(err);toast('تعذر تطبيق التمييز الإضافي للطرق.');}
    // Compile and add 3D building layers only when the visitor switches to 3D.
    drawGovernorateOnly();
    // Intentionally DO NOT call resetMap() here: it starts a second wave of tile
    // requests while the initial map tiles are still downloading.
  }
  function initMap(){
    if(typeof window.maplibregl==='undefined'){
      setMapError('تعذر بدء مكتبة الخرائط. يُرجى تحديث الصفحة أو مراجعة اتصال الشبكة.');return;
    }
    try{
      setLoadingProgress('البدء بخريطة الطرق الخفيفة؛ التضاريس عند الطلب…');
      state.map=new maplibregl.Map({
        container:'osmMap',style:STYLE_URL,center:CENTER,zoom:8,pitch:0,bearing:0,
        maxPitch:75,antialias:false,attributionControl:true,hash:false,
        fadeDuration:0, // show ready road labels without lengthy transition fades
        touchZoomRotate:true
      });
      state.map.on('error',mapError);
      // style.load fires before MapLibre has waited for every tile and symbol.
      state.map.once('style.load',mapStyleReady);
      state.map.once('load',()=>{
        mapStyleReady();
        state.firstPaint=true;
        if(state.boundaryReady)$('mapLoading').hidden=true;
        $('mapStatusText').textContent=state.boundaryReady?'محافظة البريمي فقط · أسماء عربية':'جاري تحديد حدود المحافظة…';
        $('mapStatus').classList.remove('error');
      });
      state.map.on('click',onMapClick);
      state.map.on('move',readouts);
      state.map.on('zoom',readouts);
      // Keep browsing panels accessible during slow network; a loading
      // screen is not allowed to block the UI indefinitely.
      setTimeout(()=>{
        if(!state.styleReady&&!$('mapLoading').classList.contains('failed')){
          $('mapStatusText').textContent='الاتصال ببيانات الطرق بطيء — سيستمر التحميل';
        }
      },4500);
      setTimeout(()=>{
        if($('mapLoading').classList.contains('failed')||state.boundaryReady)return;
        if(!state.boundaryGeo){setMapError('لم تتوفر بيانات حدود محافظة البريمي. تحقق من الشبكة ثم أعد المحاولة.');return;}
        if(!state.styleReady){
          $('mapLoading').hidden=false;
          setMapError('تأخر اتصال الخرائط. تحقق من الشبكة ثم اضغط إعادة المحاولة.');
        }else if(!state.firstPaint){
          $('mapStatusText').textContent='الطرق قيد التحميل؛ يمكنك الانتقال بين المواقع';
        }
      },16000);
    }catch(err){console.error(err);setMapError('تعذر بدء محرك الخرائط. يُنصح باستخدام Chrome أو Edge أو Safari حديث مع WebGL.');}
  }
  function openDrawer(which){const browse=which==='browse';$('browsePanel').classList.toggle('open',browse);$('detailPanel').classList.toggle('open',!browse);$('mobileBrowse').classList.toggle('active',browse);$('mobileDetail').classList.toggle('active',!browse);$('mobileBrowse').setAttribute('aria-expanded',String(browse));$('mobileDetail').setAttribute('aria-expanded',String(!browse));}
  function closeDrawer(which){const name=which==='browse'?'browsePanel':'detailPanel',toggle=which==='browse'?'mobileBrowse':'mobileDetail';$(name).classList.remove('open');$(toggle).classList.remove('active');$(toggle).setAttribute('aria-expanded','false');}
  function toggleDrawer(which){const target=which==='browse'?'browsePanel':'detailPanel';if($(target).classList.contains('open'))closeDrawer(which);else openDrawer(which);}
  function toggleEdit(){
    if(!adminAvailable){toast('افتح نسخة الإدارة عبر ?admin=1 على جهاز المشرف.');return;}
    stopTour();state.editMode=!state.editMode;
    $('editModeButton').classList.toggle('active',state.editMode);$('editModeButton').textContent=state.editMode?'✓ إنهاء الإدارة':'⚙ إدارة المواقع';$('adminHint').hidden=!state.editMode;
    $('manageHint').textContent=state.editMode?'المس موضعًا على الخريطة لإضافة موقع حقيقي GPS. تحفظ التعديلات محليًا على هذا الجهاز فقط.':'وضع الإدارة محلي ولا يوفر تسجيل دخول أو صلاحيات فعلية.';
    if(state.mapReady)state.map.getCanvas().style.cursor=state.editMode?'crosshair':'';
    renderDetail();toast(state.editMode?'وضع إضافة وتعديل المواقع الجغرافية مفعّل.':'تم إيقاف وضع إدارة المواقع.');
  }
  function openEditor(p=null,lat=null,lng=null){
    if(!state.editMode)return;
    state.editingId=p?.id||null;state.pendingCoords={lat:p?.lat??lat,lng:p?.lng??lng};
    $('dialogTitle').textContent=p?'تعديل الموقع':'إضافة موقع جديد';$('pointTitle').value=p?.title||'';$('pointDescription').value=p?.description||'';$('pointKind').value=p?.kind||'site';
    $('pointLat').value=Number.isFinite(state.pendingCoords.lat)?state.pendingCoords.lat.toFixed(6):'';$('pointLng').value=Number.isFinite(state.pendingCoords.lng)?state.pendingCoords.lng.toFixed(6):'';
    $('locationDialog').showModal();
  }
  function saveEditor(){
    if(!$('locationForm').reportValidity())return;
    const candidate={id:state.editingId||`custom_${Date.now()}`,title:$('pointTitle').value.trim(),kind:$('pointKind').value,
      description:$('pointDescription').value.trim(),lat:$('pointLat').value,lng:$('pointLng').value};
    const normalized=normalize(candidate,candidate.id);
    if(!normalized||!available(normalized)){toast('يرجى إدخال اسم وإحداثيات صالحة.');return;}
    if(!state.boundaryGeo||!pointInGeometry(normalized.lng,normalized.lat,state.boundaryGeo.geometry)){toast('الإحداثيات خارج حدود محافظة البريمي.');return;}
    if(state.editingId){const index=state.points.findIndex(p=>p.id===state.editingId);if(index!==-1)state.points[index]=normalized;}
    else state.points.push(normalized);
    state.selectedId=normalized.id;state.road=null;persist();renderList();renderDetail();renderMarkers();$('locationDialog').close();focusSelected();toast('تم حفظ الموقع الجغرافي.');
  }
  function exportData(){
    const content=JSON.stringify({version:2,project:'شبكة الطرق بمحافظة البريمي',coordinateSystem:'WGS84',source:'User-selected markers; OSM roads remain externally provided',locations:state.points},null,2);
    const blob=new Blob([content],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='buraimi-roads-geo-locations-v2.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('تم تصدير المواقع بصيغة JSON.');
  }
  async function importData(file){
    if(!file)return;if(file.size>2*1024*1024){toast('الحد الأقصى للملف ٢ ميجابايت.');return;}
    try{
      const json=JSON.parse(await file.text());const arr=Array.isArray(json)?json:json.locations;const parsed=sanitizeArray(arr);
      if(!parsed||!parsed.length)throw new Error('invalid');
      // Older x/y pixels are preserved as unlocated points (never falsely geocoded).
      const verified=parsed.map(p=>{const old=DEFAULT_POINTS.find(d=>d.id===p.id&&d.title===p.title);if(json.version!==2&&old&&(!available(p)))return {...p,lat:old.lat,lng:old.lng};return p;});
      if(!confirm(`استبدال قائمة المواقع الحالية بـ ${verified.length} موقع من الملف؟`))return;
      state.points=verified;state.selectedId=verified[0].id;state.road=null;persist();renderList();renderDetail();renderMarkers();resetMap();toast('تم استيراد المواقع. أي مواضع قديمة على الصورة بلا GPS ستبقى دون علامات.');
    }catch(err){toast('ملف JSON غير صالح. تحقق من وجود قائمة locations.');}
  }
  // Interactions
  $$('.tab').forEach(btn=>btn.addEventListener('click',()=>{state.filter=btn.dataset.filter;$$('.tab').forEach(b=>{const yes=b===btn;b.classList.toggle('active',yes);b.setAttribute('aria-selected',String(yes));});renderList();}));
  $('searchInput').addEventListener('input',e=>{state.term=e.target.value.trim();renderList();});
  $('tourButton').addEventListener('click',toggleTour);
  $('focusButton').addEventListener('click',focusSelected);
  $('zoomIn').addEventListener('click',()=>state.mapReady&&state.map.zoomIn({duration:450}));
  $('zoomOut').addEventListener('click',()=>state.mapReady&&state.map.zoomOut({duration:450}));
  $('mapReset').addEventListener('click',resetMap);
  $('rotateReset').addEventListener('click',()=>state.mapReady&&state.map.easeTo({bearing:0,duration:600}));
  $('viewModeButton').addEventListener('click',()=>{state.is3D=!state.is3D;if(state.is3D&&!state.terrainUserSet){state.showTerrain=true;$('terrainToggle').checked=true;}updateMode();if(state.is3D)toast(state.showTerrain?'جار تحميل التضاريس عند الطلب — يمكن متابعة التصفح.':'منظور 3D سريع دون التضاريس بناءً على إعداداتك.');});
  $('wilayaToggle').addEventListener('change',e=>{state.showWilaya=e.target.checked;renderList();renderMarkers();stopTour();});
  $('siteToggle').addEventListener('change',e=>{state.showSite=e.target.checked;renderList();renderMarkers();stopTour();});
  $('roadToggle').addEventListener('change',e=>{state.showRoads=e.target.checked;updateRoadLayer();});
  $('buildingToggle').addEventListener('change',e=>{state.showBuildings=e.target.checked;updateBuildings();});
  $('terrainToggle').addEventListener('change',e=>{state.terrainUserSet=true;state.showTerrain=e.target.checked;enableTerrain();if(state.showTerrain&&!state.is3D)toast('اختر العرض ثلاثي الأبعاد لإظهار التضاريس.');});
  $$('.route-chip').forEach(b=>b.addEventListener('click',()=>{state.roadFilter=b.dataset.road;$$('.route-chip').forEach(item=>item.classList.toggle('active',item===b));updateRoadLayer();}));
  $('mobileBrowse').addEventListener('click',()=>toggleDrawer('browse'));
  $('mobileDetail').addEventListener('click',()=>toggleDrawer('detail'));
  $('closeBrowse').addEventListener('click',()=>closeDrawer('browse'));
  $('closeDetail').addEventListener('click',()=>closeDrawer('detail'));
  $('editModeButton').addEventListener('click',toggleEdit);
  $('editSelectedButton').addEventListener('click',()=>openEditor(state.points.find(p=>p.id===state.selectedId)));
  $('deleteSelectedButton').addEventListener('click',()=>{const p=state.points.find(i=>i.id===state.selectedId);if(!p||!confirm(`حذف الموقع «${p.title}»؟`))return;state.points=state.points.filter(i=>i.id!==p.id);state.selectedId=state.points[0]?.id||null;persist();renderList();renderDetail();renderMarkers();toast('تم حذف الموقع.');});
  $('exportButton').addEventListener('click',exportData);
  $('importButton').addEventListener('click',()=>$('importFile').click());
  $('importFile').addEventListener('change',async e=>{await importData(e.target.files[0]);e.target.value='';});
  $('dialogClose').addEventListener('click',()=>$('locationDialog').close());$('dialogCancel').addEventListener('click',()=>$('locationDialog').close());
  $('locationForm').addEventListener('submit',e=>{e.preventDefault();saveEditor();});
  $('locationDialog').addEventListener('click',e=>{if(e.target===$('locationDialog'))$('locationDialog').close();});
  $('themeButton').addEventListener('click',()=>{const light=$('appShell').classList.toggle('light-theme');$('themeButton').textContent=light?'☾':'☼';try{localStorage.setItem(THEME,light?'light':'dark');}catch(_){}});
  if((()=>{try{return localStorage.getItem(THEME)==='light';}catch(_){return false;}})()){$('appShell').classList.add('light-theme');$('themeButton').textContent='☾';}
  $('fullscreenButton').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('ملء الشاشة غير مدعوم في هذا المتصفح.');}catch(_){toast('تعذر ملء الشاشة؛ يمكن فتح الصفحة بوضع العرض المستقل.');}});
  $('retryButton').addEventListener('click',()=>location.reload());
  renderList();renderDetail();
  loadGovernorateBoundary();
  initMap();
  // Cache ONLY same-origin application shell, NEVER third-party dynamic map tiles.
  if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
