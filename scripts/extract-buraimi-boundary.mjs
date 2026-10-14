import fs from 'node:fs';
const src=process.argv[2],dst=process.argv[3];
if(!src||!dst)throw Error('Usage: node extract-buraimi-boundary.mjs input.json output.geojson');
const data=JSON.parse(fs.readFileSync(src,'utf8'));
const features=data.type==='FeatureCollection'?data.features:[data];
function ringContains(lng,lat,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>lat)!==(b[1]>lat)&&lng<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function inside(lng,lat,g){return (g.type==='Polygon'?[g.coordinates]:(g.type==='MultiPolygon'?g.coordinates:[])).some(p=>ringContains(lng,lat,p[0])&&!p.slice(1).some(r=>ringContains(lng,lat,r)));}
function valid(f){return f?.geometry&&['Polygon','MultiPolygon'].includes(f.geometry.type);}
function hasName(f){return Object.values(f.properties||{}).some(s=>typeof s==='string'&&/البريمي|البريمى|(?:al[\s_-]*)?(?:buraymi|buraimi|bur[a-z]*ymi)/i.test(s));}
let selected=features.filter(valid).find(hasName);
if(!selected)selected=features.filter(valid).find(f=>[[55.80253,24.25579],[55.9666,24.4095],[55.95399,23.60676]].every(p=>inside(...p,f.geometry)));
if(!selected)throw Error('No matching Al Buraimi governorate polygon');
const polygons=selected.geometry.type==='Polygon'?[selected.geometry.coordinates]:selected.geometry.coordinates;
let west=Infinity,east=-Infinity,north=-Infinity,south=Infinity;
for(const poly of polygons)for(const ring of poly)for(const p of ring){west=Math.min(west,p[0]);east=Math.max(east,p[0]);south=Math.min(south,p[1]);north=Math.max(north,p[1]);}
if(west<54||east>58||south<22||north>27||east-west<.12||north-south<.12)throw Error('Unexpected boundary coordinates');
fs.writeFileSync(dst,JSON.stringify({type:'Feature',properties:{name:'محافظة البريمي'},geometry:selected.geometry}));
console.log(`Built local Al Buraimi GeoJSON, bbox: ${[west,south,east,north]}`);
