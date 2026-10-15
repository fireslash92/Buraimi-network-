/**
 * شبكة الطرق بمحافظة البريمي: self-contained static GitHub Pages project.
 * MapLibre is served from assets/vendor when manually supplied;
 * otherwise compatible CDN ES modules are tried without GitHub Actions.
 */
const $=id=>document.getElementById(id);
const VERSION='6.13.0';
const SOURCES=[
  {name:'المكتبة المحلية',module:'./assets/vendor/maplibre-gl.mjs',css:'./assets/vendor/maplibre-gl.css',local:true},
  {name:'UNPKG',module:`https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl.mjs`,css:`https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl.css`},
  {name:'jsDelivr',module:`https://cdn.jsdelivr.net/npm/maplibre-gl@${VERSION}/dist/maplibre-gl.mjs`,css:`https://cdn.jsdelivr.net/npm/maplibre-gl@${VERSION}/dist/maplibre-gl.css`},
  {name:'esm.sh',module:`https://esm.sh/maplibre-gl@${VERSION}?bundle`,css:`https://esm.sh/maplibre-gl@${VERSION}/dist/maplibre-gl.css`}
];
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function setMessage(msg){const e=$('loadingSub');if(e)e.textContent=msg;}
function fail(error){
  console.error('Map engine unavailable:',error);
  const l=$('mapLoading');if(l){l.hidden=false;l.classList.add('failed');}
  if($('loadingTitle'))$('loadingTitle').textContent='تعذر تحميل محرك الخريطة';
  setMessage('جرّب شبكة إنترنت أخرى، أو أضف ملفات MapLibre إلى مجلد assets/vendor ثم أعد نشر الموقع. التفاصيل في README.');
  const b=$('retryButton');if(b){b.hidden=false;b.onclick=()=>location.reload();}
  const s=$('mapStatusText');if(s)s.textContent='محرك الخرائط غير متاح';
  $('mapStatus')?.classList.add('error');
}
async function linkCSS(url,timeout){
  const link=document.createElement('link');link.rel='stylesheet';link.href=url;link.dataset.maplibre='1';document.head.append(link);
  return Promise.race([
    new Promise(resolve=>{link.onload=()=>resolve(true);link.onerror=()=>resolve(false)}),
    sleep(timeout).then(()=>false)
  ]).then(ok=>{if(!ok)link.remove();return ok;});
}
async function importLimited(url,ms){
  let timer;
  return Promise.race([
    import(/* webpackIgnore: true */ url),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('تجاوز المهلة')),ms)})
  ]).finally(()=>clearTimeout(timer));
}
async function main(){
  let mod=null,lastErr=null;
  for(const source of SOURCES){
    const jsUrl=new URL(source.module,location.href).href;
    const cssUrl=new URL(source.css,location.href).href;
    setMessage(`تجهيز خريطة البريمي من ${source.name}…`);
    try{
      if(source.local){
        const r=await fetch(jsUrl,{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(2400)});
        if(!r.ok)continue;
      }
      const cssPromise=linkCSS(cssUrl,source.local?3000:7500);
      const candidate=await importLimited(jsUrl,source.local?11000:11000);
      if(typeof candidate.Map!=='function'||typeof candidate.Marker!=='function')throw Error('Invalid MapLibre module');
      mod=candidate;
      // Stylesheet is auxiliary: if blocked, controls are still generated.
      await cssPromise;
      break;
    }catch(e){lastErr=e;document.querySelectorAll('link[data-maplibre="1"]').forEach(el=>el.remove());console.warn(source.name,e);}
  }
  if(!mod)return fail(lastErr);
  window.maplibregl=mod;
  setMessage('محرك الخريطة جاهز؛ جاري قراءة حدود محافظة البريمي…');
  try{await import('./app.js?v=5.1')}catch(e){fail(e)}
}
main();
