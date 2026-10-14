/**
 * MapLibre v6 loader for GitHub Pages.
 * The former <script src="...maplibre-gl.js"> is incompatible with MapLibre 6.
 * Local packaged ES module takes priority; public CDNs are fallbacks only.
 */
const $ = id => document.getElementById(id);
const locations = [
  {label:'المكتبة المحلية',js:'./assets/vendor/maplibre-gl.mjs',css:'./assets/vendor/maplibre-gl.css',local:true},
  {label:'UNPKG',js:'https://unpkg.com/maplibre-gl@6.14.0/dist/maplibre-gl.mjs',css:'https://unpkg.com/maplibre-gl@6.14.0/dist/maplibre-gl.css'},
  {label:'jsDelivr',js:'https://cdn.jsdelivr.net/npm/maplibre-gl@6.14.0/dist/maplibre-gl.mjs',css:'https://cdn.jsdelivr.net/npm/maplibre-gl@6.14.0/dist/maplibre-gl.css'}
];
function loading(message){const el=$('loadingSub');if(el)el.textContent=message;}
function failure(){
  const loader=$('mapLoading');if(loader){loader.hidden=false;loader.classList.add('failed');}
  $('loadingTitle').textContent='تعذر تهيئة محرك الخرائط';
  $('loadingSub').textContent='تعذر تحميل MapLibre محليًا أو عبر المصادر البديلة. لتشغيله على الشبكات المقيدة، فعّل نشر GitHub Actions كما هو موضح في README.';
  $('retryButton').hidden=false;
  $('retryButton').onclick=()=>location.reload();
  $('mapStatusText').textContent='مكتبة الخريطة غير متاحة';
  $('mapStatus').classList.add('error');
}
async function stylesheet(url){
  const link=document.createElement('link');link.rel='stylesheet';link.href=url;link.dataset.maplibre='yes';
  document.head.append(link);
  return await new Promise(resolve=>{
    const t=setTimeout(()=>resolve(false),6500);
    link.onload=()=>{clearTimeout(t);resolve(true);};
    link.onerror=()=>{clearTimeout(t);link.remove();resolve(false);};
  });
}
function importWithTimeout(url,ms){
  let timer;
  return Promise.race([
    import(/* @vite-ignore */ url),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('مهلة اتصال')),ms);})
  ]).finally(()=>clearTimeout(timer));
}
async function main(){
  let module=null;
  for(const source of locations){
    loading(`تجهيز محرك الخرائط (${source.label})...`);
    try{
      const loaded=await importWithTimeout(new URL(source.js,location.href).href,source.local?1800:8500);
      if(typeof loaded.Map!=='function'||typeof loaded.Marker!=='function')throw Error('مكتبة غير متوافقة');
      module=loaded;
      // Match the stylesheet to the successful JS origin. If CSS fails,
      // map can still start with basic controls; that failure is logged.
      if(!await stylesheet(new URL(source.css,location.href).href))console.warn('MapLibre CSS failed:',source.css);
      break;
    }catch(error){console.warn('MapLibre failed:',source.label,error);}
  }
  if(!module){failure();return;}
  window.maplibregl=module;
  loading('مكتبة الخرائط جاهزة؛ جاري تحميل حدود البريمي...');
  try{await import('./app.js');}
  catch(error){console.error('Application startup:',error);failure();}
}
main();
