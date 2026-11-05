/* ---------- Datos de la planilla de carga ---------- */
// Dos descargas separadas: la de la planilla (6 casas) y CC (4 casas que se descargan otro día)
const MODES={
  descarga:{label:'Descarga',houses:[1,2,3,4,5,6],file:'datos.json',fotos:'fotos',db:'state'},
  cc:{label:'CC',houses:[1,2,3,4],file:'datos-cc.json',fotos:'fotos-cc',db:'state-cc'}
};
let MODE='descarga';try{if(MODES[localStorage.getItem('modo')])MODE=localStorage.getItem('modo')}catch(e){}
let HOUSES=MODES[MODE].houses;
const COLORS={1:'#f6b26b',2:'#f4cccc',3:'#76a5af',4:'#3d85c6',5:'#b4a7d6',6:'#6aa84f'};
const INK={1:'#222222',2:'#222222',3:'#222222',4:'#ffffff',5:'#222222',6:'#ffffff'};
const PIECES=[['v1','Ventana 1'],['v2','Ventana 2'],['l1','Lateral 1'],['l2','Lateral 2'],['pl1','Piso lateral 1'],['pl2','Piso lateral 2'],['pm','Piso medio'],['pu','Puerta'],['ci','Ciego']];
const PLABEL=Object.fromEntries(PIECES);
const STATES={ok:'Llegó',dmg:'Dañada',falta:'Falta'};
// Orden de descarga según la planilla (de arriba hacia abajo en el camión)
const STOPS_DESCARGA=[
  {h:1, del:['v1','v2'],                    tras:['l1','l2']},
  {h:2, del:['v1','v2'],                    tras:['l1','l2']},
  {h:3, del:['v1','v2','pl1','pl2','pm'],   tras:['l1','l2','pu','ci']},
  {h:4, del:['pm','pl1','pl2'],             tras:['pu','ci']},
  {h:5, del:['pl1','pl2','pm','v1','v2'],   tras:['pu','ci','l1','l2']},
  {h:4, del:['v1','v2'],                    tras:['l1','l2']},
  {h:6, del:['v1','v2','pl1','pl2','pm'],   tras:['l1','l2','pu','ci']},
  {h:1, del:['pl1','pl2','pm'],             tras:['pu','ci']},
  {h:2, del:['pl1','pl2','pm'],             tras:['pu','ci']},
];
// CC no tiene planilla: una parada por casa con sus 9 piezas
const STOPS_CC=MODES.cc.houses.map(h=>({h,del:['v1','v2','pl1','pl2','pm'],tras:['l1','l2','pu','ci']}));
// b: número fijo de cada parada, para que el orden se pueda cambiar sin perder cuál es cuál
STOPS_DESCARGA.forEach((s,i)=>s.b=i);STOPS_CC.forEach((s,i)=>s.b=i);
let STOPS=MODE==='cc'?STOPS_CC:STOPS_DESCARGA;
const baseStops=()=>MODE==='cc'?STOPS_CC:STOPS_DESCARGA;
// S.order: el orden elegido por el equipo (lista de números fijos); si no hay o no cierra, va el original
function applyOrder(){
  const base=baseStops(), o=S.order;
  const ok=Array.isArray(o)&&o.length===base.length&&new Set(o).size===base.length&&o.every(x=>base[x]);
  STOPS=ok?o.map(x=>base[x]):base.slice();
}
function setOrder(o){S.order=o;save('order');renderAll()}

/* ---------- Estado ---------- */
// movedTo: a qué grupo y casa pasó; from: de dónde vino
function blankHouse(){return {name:'',loc:null,pieces:{},comment:'',surplus:false,surplusDetail:'',photos:[],movedTo:null,from:null}}
// t: cuándo se cambió cada campo (para combinar con lo de otros celulares); deleted: fotos borradas
function blank(){const s={fecha:'',order:null,start:{name:'',loc:null},houses:{},t:{},deleted:[],dirty:false};HOUSES.forEach(h=>s.houses[h]=blankHouse());return s}
let S=blank();
let tab='recorrido', placingFor=null, openKeys=new Set(), lastNext=null;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hName=h=>S.houses[h].name?`Casa ${h}: ${S.houses[h].name}`:`Casa ${h}`;
const getObj=k=>k==='start'?S.start:S.houses[k];
const objPath=k=>k==='start'?'start':`houses.${k}`;
const allKeys=()=>['order','start.loc','start.name',...HOUSES.flatMap(h=>['loc','name','comment','surplus','surplusDetail','movedTo','from',...PIECES.map(([p])=>'pieces.'+p)].map(f=>`houses.${h}.${f}`))];
const getPath=(o,k)=>k.split('.').reduce((a,x)=>a==null?undefined:a[x],o);
function setPath(o,k,v){const ks=k.split('.'),last=ks.pop();const t=ks.reduce((a,x)=>a[x]??(a[x]={}),o);if(v===undefined)delete t[last];else t[last]=v}

/* ---------- Guardado (IndexedDB) ---------- */
const DB={db:null,
  open(){return new Promise((res,rej)=>{const r=indexedDB.open('descarga-viviendas',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>{this.db=r.result;res()};r.onerror=()=>rej(r.error)})},
  get(k){return new Promise((res,rej)=>{const q=this.db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})},
  set(k,v){return new Promise((res,rej)=>{const tx=this.db.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
};
let saveTimer=null, editRev=0, localErr='';
// save(...campos): registra un cambio del usuario, lo guarda en el celular y lo sube al repo
function save(...keys){
  const now=Date.now();keys.forEach(k=>S.t[k]=now);
  S.dirty=true;editRev++;
  saveLocal();scheduleSync();
}
function saveLocal(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{
    try{ if(DB.db){await DB.set(MODES[MODE].db,S);localErr=''} else localErr='este navegador no permite guardar datos' }
    catch(e){ localErr=e.message }
    setStatus();
  },300);
}
function normalize(d){
  const s=blank();
  if(d&&d.start) s.start=Object.assign(s.start,d.start);
  HOUSES.forEach(h=>{ if(d&&d.houses&&d.houses[h]) s.houses[h]=Object.assign(blankHouse(),d.houses[h]); });
  if(d&&d.fecha) s.fecha=d.fecha;
  if(d&&d.order) s.order=d.order;
  if(d&&d.t) s.t=d.t; if(d&&d.deleted) s.deleted=d.deleted; if(d&&d.dirty) s.dirty=true;
  return s;
}

/* ---------- Compartido en GitHub ---------- */
// datos.json y fotos/ viven en el repo público; cada celular trabaja sobre su copia y sube sus cambios
const REPO='agustin1115/descarga-viviendas', BRANCH='main', API=`https://api.github.com/repos/${REPO}/contents/`;
const rawURL=path=>`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`;
const photoSrc=p=>p.data||rawURL(p.path);
let token='';try{token=localStorage.getItem('gh-token')||''}catch(e){}
let remoteSha=null, syncing=false, syncRun=null, syncQueued=null, lastSync=null, syncErr='', syncTimer=null, panelStale=false;
const b64enc=str=>{const b=new TextEncoder().encode(str);let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode(...b.subarray(i,i+0x8000));return btoa(s)};
const b64dec=b=>new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g,'')),c=>c.charCodeAt(0)));
function gh(path,opt={}){
  const headers={Accept:'application/vnd.github+json'};
  if(token) headers.Authorization='Bearer '+token;
  return fetch(API+path+(opt.method?'':`?ref=${BRANCH}`),{...opt,headers,cache:'no-store'});
}
// Sin clave se lee el archivo raw: la API sin clave permite solo 60 consultas por hora por conexión,
// y se agotan enseguida si varios celulares comparten wifi o datos móviles. El raw puede tener hasta 5 minutos de atraso.
const rawGet=f=>fetch(rawURL(f),{cache:'no-store'});
async function pull(){
  if(!token){
    const r=await rawGet(MODES[MODE].file);
    if(r.status===404) return null;
    if(!r.ok) throw new Error('GitHub respondió '+r.status);
    return r.json();
  }
  const r=await gh(MODES[MODE].file);
  if(r.status===404){remoteSha=null;return null}
  if(r.status===403||r.status===429) throw new Error('GitHub rechazó la consulta');
  if(!r.ok) throw new Error('GitHub respondió '+r.status);
  const j=await r.json();remoteSha=j.sha;return JSON.parse(b64dec(j.content));
}
// Por cada campo gana el cambio más reciente; las fotos se suman y se quitan las borradas
function mergeRemote(R){
  let changed=false;
  for(const k in (R.t||{})) if(R.t[k]>(S.t[k]||0)){setPath(S,k,getPath(R,k));S.t[k]=R.t[k];changed=true}
  const del=new Set([...S.deleted,...(R.deleted||[])]);
  if(del.size!==S.deleted.length){S.deleted=[...del];changed=true}
  HOUSES.forEach(h=>{
    const mine=S.houses[h].photos, by=new Map(mine.map(p=>[p.id,p]));
    ((R.houses&&R.houses[h]&&R.houses[h].photos)||[]).forEach(p=>{const m=by.get(p.id);
      if(!m){by.set(p.id,{...p});changed=true;return}
      if(!m.path&&p.path){m.path=p.path;changed=true}
      if((p.pt||0)>(m.pt||0)){m.piece=p.piece;m.pt=p.pt;changed=true}});
    const list=[...by.values()].filter(p=>!del.has(p.id)).sort((a,b)=>a.ts-b.ts);
    if(list.length!==mine.length)changed=true;
    S.houses[h].photos=list;
  });
  return changed;
}
// Lo que se sube: sin las fotos en base64 (van como archivos) y sin las que todavía no se subieron
function remoteCopy(){
  const c=JSON.parse(JSON.stringify({fecha:S.fecha,order:S.order,start:S.start,houses:S.houses,t:S.t,deleted:S.deleted}));
  HOUSES.forEach(h=>{c.houses[h].photos=c.houses[h].photos.filter(p=>p.path).map(({data,...p})=>p)});
  return c;
}
async function uploadPhotos(m){
  for(const h of HOUSES) for(const p of S.houses[h].photos){
    if(p.path||!p.data) continue;
    const path=`${MODES[m].fotos}/casa-${h}/${p.id}.jpg`;
    const r=await gh(path,{method:'PUT',body:JSON.stringify({message:`Foto de la casa ${h}`,content:p.data.split(',')[1],branch:BRANCH})});
    if(m!==MODE) throw ABORT;
    if(r.ok||r.status===422){p.path=path;saveLocal()}
    else if(r.status===401||r.status===403) throw new Error('la clave no tiene permiso para guardar');
  }
}
const ABORT=new Error('cambio de modo');
function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(sync,2500);setStatus()}
// Las sincronizaciones van de a una: si hay una en curso, la siguiente espera y se hace una sola vez
function sync(){
  if(syncQueued) return syncQueued;
  if(!syncRun){syncRun=doSync().finally(()=>{syncRun=null});return syncRun}
  syncQueued=syncRun.then(()=>{syncQueued=null;return sync()});
  return syncQueued;
}
async function doSync(){
  if(!navigator.onLine){setStatus();return}
  syncing=true;syncErr='';setStatus();
  // Si se cambia de modo en el medio, se corta para no mezclar los datos de las dos descargas
  const m=MODE;
  try{
    for(let i=0;i<3;i++){
      const R=await pull();
      if(m!==MODE) throw ABORT;
      if(R&&mergeRemote(R)){saveLocal();refresh()}
      if(!token||!S.dirty) break;
      await uploadPhotos(m);
      const rev=editRev;
      const r=await gh(MODES[m].file,{method:'PUT',body:JSON.stringify({message:`Actualizar datos de ${MODES[m].label}`,
        content:b64enc(JSON.stringify(remoteCopy(),null,1)),branch:BRANCH,...(remoteSha?{sha:remoteSha}:{})})});
      if(m!==MODE) throw ABORT;
      if(r.ok){remoteSha=(await r.json()).content.sha;if(rev===editRev)S.dirty=false;saveLocal();break}
      if(r.status===401||r.status===403) throw new Error('la clave no sirve o no tiene permiso para guardar');
      // 409/422: otro celular guardó en el medio; se vuelve a leer, combinar y guardar
      if(r.status!==409&&r.status!==422) throw new Error('GitHub respondió '+r.status);
    }
    lastSync=new Date();
  }catch(e){if(e!==ABORT)syncErr=navigator.onLine?e.message:''}
  syncing=false;setStatus();
}
// Si alguien está escribiendo, no se redibuja el panel hasta que termine
function refresh(){
  const a=document.activeElement;
  applyOrder();renderHeader();renderMap();
  if(drag||a&&a.closest&&a.closest('#content')&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)) panelStale=true; else renderPanel();
}
function setStatus(){
  const hh=d=>d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  let m;
  if(localErr) m='No se pudo guardar en el celular: '+localErr;
  else if(!navigator.onLine) m=S.dirty?'Sin señal: los cambios se suben cuando vuelva':'Sin señal: mostrando lo último guardado';
  else if(syncErr) m='No se pudo sincronizar: '+syncErr;
  else if(syncing) m='Sincronizando…';
  else if(!token) m=S.dirty?'Cambios solo en este celular: falta la clave (Informe)':'Solo lectura (puede tener hasta 5 min de atraso): para guardar, cargá la clave en Informe';
  else if(S.dirty) m='Guardando…';
  else m=lastSync?'Sincronizado con el equipo, '+hh(lastSync):'Conectando…';
  $('saved').textContent=m;
}
async function setToken(t){
  t=t.trim();if(!t){toast('Pegá la clave primero');return}
  toast('Probando la clave…');
  try{
    const r=await fetch(`https://api.github.com/repos/${REPO}`,{headers:{Authorization:'Bearer '+t,Accept:'application/vnd.github+json'}});
    const j=await r.json();
    if(!r.ok||!j.permissions||!j.permissions.push){toast('Esa clave no tiene permiso para guardar en el repo');return}
  }catch(e){toast('No se pudo probar la clave: revisá la conexión');return}
  token=t;try{localStorage.setItem('gh-token',t)}catch(e){}
  toast('Clave guardada: este celular ya sincroniza con el equipo');renderPanel();sync();
}
window.addEventListener('online',()=>sync());
window.addEventListener('offline',setStatus);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
document.addEventListener('focusout',()=>setTimeout(()=>{if(panelStale&&!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#content'))){panelStale=false;renderPanel()}},0));
setInterval(()=>{if(!document.hidden)sync()},token?20000:60000);

async function setMode(m){
  if(m===MODE) return;
  clearTimeout(saveTimer);clearTimeout(syncTimer);
  try{if(DB.db)await DB.set(MODES[MODE].db,S)}catch(e){}
  MODE=m;try{localStorage.setItem('modo',m)}catch(e){}
  HOUSES=MODES[m].houses;
  S=blank();remoteSha=null;lastSync=null;syncErr='';editRev++;
  try{if(DB.db){const d=await DB.get(MODES[m].db);if(d)S=normalize(d)}}catch(e){}
  openKeys.clear();lastNext=null;stopPlacing();
  renderAll();if(allLocs().length)fitAll();
  await sync();if(allLocs().length)fitAll();
  peekFecha(otherMode());
}
document.querySelector('.modes').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(b)setMode(b.dataset.mode)});

/* ---------- Fecha de cada grupo y mover casas de un día a otro ---------- */
const fmtFecha=f=>{if(!f)return '';const [y,m,d]=f.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('es-AR',{weekday:'short',day:'2-digit',month:'2-digit'})};
function cacheFecha(m,f){try{localStorage.setItem('fecha-'+m,f)}catch(e){}}
function fechaOf(m){if(m===MODE)return S.fecha;try{return localStorage.getItem('fecha-'+m)||''}catch(e){return ''}}
// La fecha del otro grupo se lee del repo para mostrarla en su botón
async function peekFecha(m){
  try{const r=await rawGet(MODES[m].file);if(!r.ok)return;const d=await r.json();if(d.fecha){cacheFecha(m,d.fecha);renderHeader()}}catch(e){}
}
$('fecha').addEventListener('change',e=>{S.fecha=e.target.value;save('fecha');renderHeader()});
const otherMode=()=>MODE==='cc'?'descarga':'cc';
function movedLabel(h){const mv=moved(h);return `Pasó a ${MODES[mv.mode].label}`}
function movedBody(h){const mv=moved(h),f=fechaOf(mv.mode);
  return `<p>Esta casa se descarga ${f?'el '+fmtFecha(f)+' ':''}con ${MODES[mv.mode].label}, donde quedó como Casa ${mv.h}. Sus datos se fueron con ella.</p>`+
    `<div class="actions"><button class="btn" data-act="gomode" data-mode="${mv.mode}">Ir a ${MODES[mv.mode].label}</button></div>`}
// Un lugar está libre si nunca se usó o si su casa ya pasó a otro grupo
function isFree(x){const X=S.houses[x];return !!X.movedTo||(!X.name&&!X.loc&&!Object.keys(X.pieces).length&&!X.comment&&!X.photos.length)}
function placeHouse(slot,P,from){
  const X=S.houses[slot], keep=new Set(P.photos.map(p=>p.id)), keys=[];
  S.deleted.push(...X.photos.filter(p=>!keep.has(p.id)).map(p=>p.id));
  ['name','loc','comment','surplus','surplusDetail'].forEach(f=>{X[f]=P[f];keys.push(`houses.${slot}.${f}`)});
  PIECES.forEach(([p])=>{if(P.pieces[p])X.pieces[p]=P.pieces[p];else delete X.pieces[p];keys.push(`houses.${slot}.pieces.${p}`)});
  X.photos=P.photos;X.movedTo=null;X.from=from;
  save(...keys,`houses.${slot}.movedTo`,`houses.${slot}.from`);
}
let moving=false;
// Pasa la casa con todos sus datos al otro grupo: primero la agrega allá y después la marca acá
async function moveHouse(h){
  if(moving) return;
  const from=MODE, to=otherMode(), H=S.houses[h], f=fechaOf(to), name=hName(h);
  if(!token){toast('Para cambiar la fecha de una casa hace falta la clave (pestaña Informe)');return}
  if(!navigator.onLine){toast('Para cambiar la fecha de una casa hace falta señal');return}
  if(!confirm(`¿Pasar ${name} a ${MODES[to].label}${f?' ('+fmtFecha(f)+')':''}? Se lleva la ubicación, las piezas marcadas, los comentarios y las fotos.`)) return;
  moving=true;toast('Cambiando la fecha…');
  try{
    const P=JSON.parse(JSON.stringify({name:H.name,loc:H.loc,pieces:H.pieces,comment:H.comment,surplus:H.surplus,surplusDetail:H.surplusDetail,photos:H.photos}));
    const back=H.from&&H.from.mode===to?H.from.h:null;
    await setMode(to);
    if(syncErr){const e=syncErr;await setMode(from);toast('No se pudo leer '+MODES[to].label+': '+e);return}
    const slot=back&&isFree(back)?back:HOUSES.find(isFree);
    if(!slot){await setMode(from);toast(`${MODES[to].label} ya tiene sus ${MODES[to].houses.length} casas: no hay lugar libre`);return}
    placeHouse(slot,P,{mode:from,h});
    await sync();
    await setMode(from);
    S.houses[h].movedTo={mode:to,h:slot};save(`houses.${h}.movedTo`);
    await sync();renderAll();
    toast(`${name} pasó a ${MODES[to].label} como Casa ${slot}`);
  }finally{moving=false}
}

/* ---------- Cálculos ---------- */
const moved=h=>S.houses[h].movedTo;
const activeHouses=()=>HOUSES.filter(h=>!moved(h));
function stopDone(i){const st=STOPS[i],p=S.houses[st.h].pieces;return [...st.del,...st.tras].every(x=>p[x])}
// Las paradas de una casa que pasó a otro grupo se saltean
function nextStop(){const i=STOPS.findIndex((st,i)=>!moved(st.h)&&!stopDone(i));return i<0?null:i}
function houseCount(h){const p=S.houses[h].pieces;let ok=0,dmg=0,falta=0;PIECES.forEach(([k])=>{if(p[k]==='ok')ok++;if(p[k]==='dmg')dmg++;if(p[k]==='falta')falta++});return {ok,dmg,falta,recv:ok+dmg,marked:ok+dmg+falta}}
function stopsOf(h){return STOPS.map((s,i)=>s.h===h?i+1:null).filter(Boolean)}

/* ---------- Mapa ---------- */
const map=L.map('map',{zoomControl:true}).setView([-34.75,-58.3],11);
// OpenStreetMap bloquea sus mapas cuando la página se abre como archivo local y CARTO ahora pide clave, por eso se usa Esri
const streets=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'© Esri, © OpenStreetMap'});
const streets2=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'© Esri'});
const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imágenes © Esri'});
streets.addTo(map);
L.control.layers({'Calles':streets,'Calles (alternativo)':streets2,'Satélite':sat},null,{position:'topright'}).addTo(map);
// Si el mapa de calles principal falla, pasa solo al alternativo
let tileErrors=0;
streets.on('tileerror',()=>{if(++tileErrors===4&&map.hasLayer(streets)){map.removeLayer(streets);streets2.addTo(map);toast('Cambié al mapa de calles alternativo')}});
const markerLayer=L.layerGroup().addTo(map), routeLayer=L.layerGroup().addTo(map);
let meMarker=null;

function pinIcon(key,isNext){
  if(key==='start') return L.divIcon({className:'',html:'<div class="pin start">P</div>',iconSize:[34,34],iconAnchor:[17,17]});
  return L.divIcon({className:'',html:`<div class="pin${isNext?' next':''}" style="background:${COLORS[key]};color:${INK[key]}">${key}</div>`,iconSize:[34,34],iconAnchor:[17,17]});
}
function renderMap(){
  markerLayer.clearLayers(); routeLayer.clearLayers();
  const n=nextStop(), nextH=n===null?null:STOPS[n].h;
  const add=(key,obj,popup)=>{
    if(!obj.loc) return;
    const m=L.marker([obj.loc.lat,obj.loc.lng],{icon:pinIcon(key,key===nextH),draggable:true,zIndexOffset:key===nextH?1000:0});
    m.bindPopup(popup);
    m.on('dragend',e=>{const ll=e.target.getLatLng();obj.loc={lat:+ll.lat.toFixed(6),lng:+ll.lng.toFixed(6)};save(objPath(key)+'.loc');renderMap();if(tab==='ubicaciones')renderPanel();toast('Ubicación ajustada')});
    m.addTo(markerLayer);
  };
  add('start',S.start,`<b>Punto de partida</b>${S.start.name?'<br>'+esc(S.start.name):''}`);
  activeHouses().forEach(h=>{const c=houseCount(h);add(h,S.houses[h],`<b>${esc(hName(h))}</b><br>Paradas ${stopsOf(h).join(' y ')}<br>${c.recv} de 9 piezas recibidas`)});
  // Recorrido
  let prev=S.start.loc, nextLine=null;
  STOPS.forEach((st,i)=>{
    const loc=S.houses[st.h].loc;
    if(!loc||moved(st.h)) return;
    if(prev && (prev.lat!==loc.lat||prev.lng!==loc.lng)){
      const done=stopDone(i), isNext=i===n;
      const line=L.polyline(segPath(prev,loc),{
        color:isNext?'#c2410c':(done?'#555555':'#0288d1'),weight:isNext?6:4,opacity:done?.5:.9,dashArray:isNext?null:'6 8'
      }).bindTooltip(`Tramo a parada ${i+1}`).addTo(routeLayer);
      if(isNext) nextLine=line;
    }
    prev=loc;
  });
  // El tramo a la próxima parada queda por encima de los que comparten calle con él
  if(nextLine) nextLine.bringToFront();
}
/* ---------- Tramos por las calles (OSRM) ---------- */
// Cada tramo se pide una vez y queda guardado; sin conexión se dibuja recto hasta que se pueda pedir
let routeCache={}, routeQueue=new Set(), routeBusy=false;
const segKey=(a,b)=>`${a.lat},${a.lng}>${b.lat},${b.lng}`;
function segPath(a,b){
  const k=segKey(a,b);
  if(routeCache[k]) return routeCache[k];
  routeQueue.add(k); fetchRoutes();
  return [[a.lat,a.lng],[b.lat,b.lng]];
}
async function fetchRoutes(){
  if(routeBusy) return; routeBusy=true;
  let got=false;
  for(const k of [...routeQueue]){
    routeQueue.delete(k);
    const [a,b]=k.split('>').map(x=>x.split(',').map(Number));
    try{
      const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`);
      const j=await r.json();
      if(j.code==='Ok'&&j.routes[0]){
        // Se suman los extremos exactos porque OSRM engancha el camino a la calle más cercana
        routeCache[k]=[a,...j.routes[0].geometry.coordinates.map(([lng,lat])=>[lat,lng]),b]; got=true;
      }
    }catch(e){}
  }
  routeBusy=false;
  if(got){ renderMap(); try{ if(DB.db) await DB.set('routes',routeCache) }catch(e){} }
}
window.addEventListener('online',()=>renderMap());

function allLocs(){const a=[];if(S.start.loc)a.push(S.start.loc);activeHouses().forEach(h=>{if(S.houses[h].loc)a.push(S.houses[h].loc)});return a}
function fitAll(){const a=allLocs();if(!a.length){toast('Todavía no hay casas ubicadas');return}if(a.length===1)map.setView([a[0].lat,a[0].lng],17);else map.fitBounds(a.map(l=>[l.lat,l.lng]),{padding:[40,40]})}
map.on('click',e=>{
  if(placingFor===null) return;
  getObj(placingFor).loc={lat:+e.latlng.lat.toFixed(6),lng:+e.latlng.lng.toFixed(6)};
  const k=placingFor; stopPlacing(); save(objPath(k)+'.loc'); renderAll();
  toast(k==='start'?'Punto de partida ubicado':`Casa ${k} ubicada`);
});
function startPlacing(k){
  placingFor=k;
  $('placingText').textContent=k==='start'?'Tocá el mapa donde arranca el camión':`Tocá el mapa donde va la casa ${k}`;
  $('placing').classList.add('show'); map.getContainer().style.cursor='crosshair';
  if(window.innerWidth<900) $('map').scrollIntoView({behavior:'smooth',block:'start'});
}
function stopPlacing(){placingFor=null;$('placing').classList.remove('show');map.getContainer().style.cursor=''}
$('cancelPlacing').onclick=stopPlacing;
$('btnFit').onclick=fitAll;
$('btnMe').onclick=()=>getHere(loc=>{
  if(meMarker) meMarker.remove();
  meMarker=L.marker([loc.lat,loc.lng],{icon:L.divIcon({className:'',html:'<div class="me"></div>',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(map);
  map.setView([loc.lat,loc.lng],17);
});
function getHere(cb){
  if(!navigator.geolocation){toast('Este navegador no da la ubicación');return}
  toast('Buscando tu ubicación…');
  navigator.geolocation.getCurrentPosition(p=>cb({lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6)}),
    e=>toast('No se pudo obtener la ubicación: activá el GPS y dale permiso al navegador'),{enableHighAccuracy:true,timeout:15000});
}
function focusOn(loc){map.setView([loc.lat,loc.lng],18);if(window.innerWidth<900)$('map').scrollIntoView({behavior:'smooth',block:'start'})}

/* ---------- Ubicar por texto ---------- */
function parseLoc(t){
  t=t.trim();
  const m=t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)||t.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*\+?(-?\d+\.\d+)/i)
        ||t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)||t.match(/^(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)$/);
  if(!m) return null;
  const lat=+m[1],lng=+m[2];
  return Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
}
async function locateFromText(k,text){
  text=(text||'').trim();
  if(!text){toast('Escribí coordenadas, un link o una dirección');return}
  if(/goo\.gl|maps\.app/i.test(text)){toast('Los links cortos no traen coordenadas. En Google Maps mantené apretado el lugar y copiá los números que aparecen arriba.');return}
  let loc=parseLoc(text);
  if(!loc){
    toast('Buscando la dirección…');
    try{
      const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&q='+encodeURIComponent(text),{headers:{'Accept-Language':'es'}});
      const j=await r.json();
      if(j[0]) loc={lat:+(+j[0].lat).toFixed(6),lng:+(+j[0].lon).toFixed(6)};
    }catch(e){}
    if(!loc){toast('No encontré esa dirección. Probá con coordenadas o tocando el mapa.');return}
    toast('Dirección encontrada: revisá que el pin quedó bien y arrastralo si hace falta');
  }else toast(k==='start'?'Punto de partida ubicado':`Casa ${k} ubicada`);
  getObj(k).loc=loc; save(objPath(k)+'.loc'); renderAll(); focusOn(loc);
}

/* ---------- Fotos ---------- */
function compress(file){return new Promise((res,rej)=>{const img=new Image(),url=URL.createObjectURL(file);
  img.onload=()=>{const max=1400,k=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');
    c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    URL.revokeObjectURL(url);res(c.toDataURL('image/jpeg',.75))};
  img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('No se pudo leer la imagen'))};img.src=url})}

/* ---------- Render ---------- */
function chip(h){return `<span class="chip" style="background:${COLORS[h]};color:${INK[h]}">${h}</span>`}
function pieceRow(h,pid){
  const cur=S.houses[h].pieces[pid];
  return `<div class="piece"><span>${PLABEL[pid]}</span><div class="seg">${Object.entries(STATES).map(([v,l])=>
    `<button data-act="piece" data-h="${h}" data-p="${pid}" data-v="${v}" class="${cur===v?'on '+v:''}" aria-pressed="${cur===v}">${l}</button>`).join('')}</div></div>`;
}
function navLink(loc,label='Ir con Google Maps'){return `<a class="btn primary" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}&travelmode=driving">${label}</a>`}
function details(key,cls,summary,body){return `<details class="card ${cls}" data-key="${key}" ${openKeys.has(key)?'open':''}><summary>${summary}</summary><div class="body">${body}</div></details>`}

function renderHeader(){
  document.querySelectorAll('.modes button').forEach(b=>{const on=b.dataset.mode===MODE;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
  if(S.fecha) cacheFecha(MODE,S.fecha);
  document.querySelectorAll('[data-fecha]').forEach(el=>el.textContent=fmtFecha(fechaOf(el.dataset.fecha))||'Sin fecha');
  if(document.activeElement!==$('fecha')) $('fecha').value=S.fecha||'';
  const act=activeHouses(), tot=act.reduce((a,h)=>a+houseCount(h).recv,0);
  const n=nextStop();
  $('loadCaption').textContent=`${MODES[MODE].label}: ${act.length} casa${act.length===1?'':'s'}, ${tot} de ${act.length*9} piezas recibidas. `+(n===null?'Descarga completa.':`Próxima parada: ${n+1}, ${hName(STOPS[n].h)}.`);
}

function viewRecorrido(){
  const n=nextStop();
  const nb=n===null?null:STOPS[n].b;
  if(nb!==lastNext){ if(lastNext!==null) openKeys.delete('stop-'+lastNext); if(nb!==null) openKeys.add('stop-'+nb); lastNext=nb; }
  const missing=activeHouses().filter(h=>!S.houses[h].loc);
  let out='';
  if(missing.length) out+=`<div class="note warn"><div><p>Faltan ubicar ${missing.length===1?'la casa':'las casas'} ${missing.join(', ')}. Cargalas en la pestaña Ubicaciones para ver el recorrido completo.</p><button class="btn" data-act="tab" data-t="ubicaciones">Cargar ubicaciones</button></div></div>`;
  // Recorrido completo en Google Maps (formato de ruta con varias paradas)
  const pts=[];if(S.start.loc)pts.push(S.start.loc);
  STOPS.forEach(st=>{const l=S.houses[st.h].loc;if(l&&!moved(st.h)){const p=pts[pts.length-1];if(!p||p.lat!==l.lat||p.lng!==l.lng)pts.push(l)}});
  if(pts.length>=2) out+=`<div class="actions"><a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/${pts.map(p=>p.lat+','+p.lng).join('/')}">Abrir recorrido completo en Google Maps</a></div>`;
  const twice=activeHouses().filter(h=>stopsOf(h).length>1);
  if(twice.length) out+=`<div class="note"><div><p>Las casas ${twice.slice(0,-1).join(', ')} y ${twice[twice.length-1]} reciben sus piezas en dos pasadas: lo que queda arriba en el camión baja primero y los pisos, puertas y ciegos de esas casas quedan abajo.</p></div></div>`;
  const custom=STOPS.some((st,i)=>st.b!==i);
  out+=`<div class="note"><div><p>Para cambiar el orden, mantené apretada una parada (o su ícono <span class="grip-ico" aria-hidden="true">${GRIP_SVG}</span>) y arrastrala. También podés usar Subir y Bajar adentro de cada parada.</p>`+
    (custom&&MODE==='descarga'?`<p>El orden de la planilla depende de cómo está cargado el camión: si lo cambiás, fijate que las piezas de cada parada queden a mano.</p>`:'')+
    (custom?`<button class="btn" data-act="resetorder">Volver al orden ${MODE==='descarga'?'de la planilla':'original'}</button>`:'')+`</div></div>`;
  const orderBtns=i=>`<div class="actions order"><span>Orden</span><button class="btn" data-act="up" data-i="${i}" ${i===0?'disabled':''}>Subir</button><button class="btn" data-act="down" data-i="${i}" ${i===STOPS.length-1?'disabled':''}>Bajar</button></div>`;
  const grip=`<span class="grip" data-grip title="Arrastrá para cambiar el orden" aria-hidden="true">${GRIP_SVG}</span>`;
  out+=STOPS.map((st,i)=>{
    const k='stop-'+st.b;
    if(moved(st.h)) return details(k,'moved',`${grip}${chip(st.h)}<span class="title"><span class="tag">Parada ${i+1}</span>${esc(hName(st.h))}<small>No se descarga en esta fecha</small></span><span class="state moved">${movedLabel(st.h)}</span>`,movedBody(st.h)+orderBtns(i));
    const done=stopDone(i), second=STOPS.findIndex(s=>s.h===st.h)!==i, loc=S.houses[st.h].loc;
    const count=st.del.length+st.tras.length;
    const sum=`${grip}${chip(st.h)}<span class="title"><span class="tag">Parada ${i+1}</span>${esc(hName(st.h))}<small>${second?'Segunda pasada, ':''}${count} piezas</small></span>`+
      `<span class="state ${done?'done':(i===n?'next':'')}">${done?'Descargada':(i===n?'Próxima':'Pendiente')}</span>`;
    const body=`<div class="group"><h3>De la parte delantera</h3>${st.del.map(p=>pieceRow(st.h,p)).join('')}</div>`+
      `<div class="group"><h3>De la parte trasera</h3>${st.tras.map(p=>pieceRow(st.h,p)).join('')}</div>`+
      `<div class="actions">${loc?navLink(loc)+`<button class="btn" data-act="focus" data-h="${st.h}">Ver en el mapa</button>`:`<button class="btn" data-act="tab" data-t="ubicaciones">Ubicar casa ${st.h}</button>`}`+
      `<button class="btn" data-act="gohouse" data-h="${st.h}">Comentarios y fotos</button>`+
      `<button class="btn" data-act="allok" data-i="${i}">Todo llegó bien</button>`+
      `<button class="btn" data-act="move" data-h="${st.h}">Cambiar fecha</button></div>`+orderBtns(i);
    return details(k,(done?'done ':'')+(i===n?'next':''),sum,body);
  }).join('');
  return out;
}

function viewCasas(){
  return HOUSES.map(h=>{
    const H=S.houses[h],c=houseCount(h),k='house-'+h;
    if(moved(h)) return details(k,'moved',`${chip(h)}<span class="title">${esc(hName(h))}<small>No se descarga en esta fecha</small></span><span class="state moved">${movedLabel(h)}</span>`,movedBody(h));
    const flags=[H.from?`vino de ${MODES[H.from.mode].label}`:'',c.dmg?`${c.dmg} dañada${c.dmg>1?'s':''}`:'',c.falta?`${c.falta} falta${c.falta>1?'n':''}`:'',H.surplus?'pide sobrantes':'',H.photos.length?`${H.photos.length} foto${H.photos.length>1?'s':''}`:''].filter(Boolean).join(', ');
    const sum=`${chip(h)}<span class="title">${esc(hName(h))}<small>${flags||'Sin novedades'}</small></span><span class="state ${c.recv===9?'done':''}">${c.recv}/9</span>`;
    const body=`<div class="group"><h3>Piezas (paradas ${stopsOf(h).join(' y ')})</h3>${PIECES.map(([p])=>pieceRow(h,p)).join('')}</div>`+
      `<label class="field">Comentarios<textarea data-in="comment" data-h="${h}" placeholder="Ej.: el ciego tiene una tabla partida, lo dejamos al fondo del terreno">${esc(H.comment)}</textarea></label>`+
      `<label class="check"><input type="checkbox" data-in="surplus" data-h="${h}" ${H.surplus?'checked':''}> Necesita sobrantes</label>`+
      (H.surplus?`<label class="field">Qué sobrantes necesita<input data-in="surplusDetail" data-h="${h}" value="${esc(H.surplusDetail)}" placeholder="Ej.: 2 tablas de piso, 1 bisagra"></label>`:'')+
      `<div class="group"><h3>Fotos</h3><div class="photos">${H.photos.map(ph=>`<div class="photo"><img src="${photoSrc(ph)}" alt="Foto de la casa ${h}" loading="lazy" data-act="view" data-src="${ph.id}" data-h="${h}">`+
        `<select data-in="photoPiece" data-h="${h}" data-id="${ph.id}" aria-label="Pieza de la foto"><option value="">Pieza (opcional)</option>${PIECES.map(([p,l])=>`<option value="${p}" ${ph.piece===p?'selected':''}>${l}</option>`).join('')}</select>`+
        `<button data-act="delphoto" data-h="${h}" data-id="${ph.id}">Borrar foto</button></div>`).join('')}</div></div>`+
      `<div class="actions"><label class="btn">Agregar fotos<input type="file" accept="image/*" multiple data-photo="${h}"></label>${H.loc?navLink(H.loc):''}<button class="btn" data-act="move" data-h="${h}">Cambiar fecha</button></div>`;
    return details(k,'',sum,body);
  }).join('');
}

function locBlock(k){
  const o=getObj(k), isStart=k==='start';
  const sum=(isStart?'<span class="chip start">P</span>':chip(k))+
    `<span class="title">${isStart?'Punto de partida (opcional)':esc(hName(k))}<small class="${o.loc?'':''}">${o.loc?`${o.loc.lat}, ${o.loc.lng}`:'Sin ubicar'}</small></span><span class="state ${o.loc?'done':''}">${o.loc?'Ubicada':'Falta'}</span>`;
  const body=`<label class="field">${isStart?'Nombre del lugar':'Familia o referencia'}<input data-in="name" data-k="${k}" value="${esc(o.name)}" placeholder="${isStart?'Ej.: obrador, escuela':'Ej.: Familia Gómez, lote 14'}"></label>`+
    `<label class="field">Coordenadas, link de Google Maps o dirección<input class="locinput" data-locin="${k}" placeholder="-34.8123, -58.2765" autocomplete="off"></label>`+
    `<div class="actions"><button class="btn primary" data-act="locate" data-k="${k}">Ubicar</button><button class="btn" data-act="place" data-k="${k}">Tocar en el mapa</button>`+
    `<button class="btn" data-act="here" data-k="${k}">Estoy acá</button>${o.loc?`<button class="btn" data-act="focusk" data-k="${k}">Ver</button><button class="btn danger" data-act="clearloc" data-k="${k}">Quitar</button>`:''}</div>`;
  return details('loc-'+k,'',sum,body);
}
function viewUbicaciones(){
  return `<div class="note"><div><p>Cuatro formas de ubicar cada casa: pegar coordenadas, pegar el link largo de Google Maps, tocar el lugar en el mapa (en vista Satélite se ven los lotes) o pararte en el terreno y apretar «Estoy acá».</p><p>Los pines se pueden arrastrar para corregirlos.</p></div></div>`+
    locBlock('start')+activeHouses().map(locBlock).join('');
}

function viewInforme(){
  const rows=HOUSES.map(h=>{const H=S.houses[h],c=houseCount(h);
    if(moved(h)) return `<tr><td>${chip(h)}</td><td>${esc(H.name)||'Sin nombre'}: ${movedLabel(h)}</td>${'<td data-label="">–</td>'.repeat(5)}</tr>`;
    return `<tr><td>${chip(h)}</td><td>${esc(H.name)||'Sin nombre'}</td><td data-label="Recibidas">${c.recv}/9</td><td data-label="Dañadas">${c.dmg}</td><td data-label="Faltan">${c.falta}</td><td data-label="Sobrantes">${H.surplus?'Sí':'No'}</td><td data-label="Fotos">${H.photos.length}</td></tr>`}).join('');
  return `<div class="tablewrap"><table><thead><tr><th>Casa</th><th>Referencia</th><th>Recibidas</th><th>Dañadas</th><th>Faltan</th><th>Sobrantes</th><th>Fotos</th></tr></thead><tbody>${rows}</tbody></table></div>`+
    `<div class="actions"><button class="btn primary" data-act="copy">Copiar resumen</button>${navigator.share?'<button class="btn" data-act="share">Compartir resumen</button>':''}<button class="btn" data-act="report">Descargar informe con fotos</button></div>`+
    `<h2 class="sect">Compartido con el equipo</h2>`+
    `<div class="note"><div><p>Todo lo que se carga se guarda en GitHub, en el repo público <a href="https://github.com/${REPO}" target="_blank" rel="noopener">${REPO}</a>, y les aparece a todos los que abren esta página. Cualquiera con el link puede verlo.</p>`+
    `<p>${token?'Este celular ya tiene la clave y guarda sus cambios en el repo.':'Para que este celular pueda guardar, pegá una sola vez la clave que te pasó quien organiza la descarga.'}</p></div></div>`+
    (token?'':`<label class="field">Clave de GitHub<input type="password" data-tokenin autocomplete="off" placeholder="github_pat_…"></label>`)+
    `<div class="actions">${token?'':'<button class="btn primary" data-act="savetoken">Guardar clave</button>'}<button class="btn" data-act="syncnow">Sincronizar ahora</button>${token?'<button class="btn danger" data-act="deltoken">Quitar la clave de este celular</button>':''}</div>`+
    `<h2 class="sect">Respaldo</h2>`+
    `<div class="note"><div><p>El respaldo guarda todo (ubicaciones, marcas, comentarios y fotos) para pasarlo a otro celular o recuperarlo.</p></div></div>`+
    `<div class="actions"><button class="btn" data-act="backup">Guardar respaldo</button><button class="btn" data-act="import">Cargar respaldo</button><button class="btn danger" data-act="reset">Empezar de cero</button></div>`;
}

function renderPanel(){
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===tab));
  $('content').innerHTML={recorrido:viewRecorrido,casas:viewCasas,ubicaciones:viewUbicaciones,informe:viewInforme}[tab]();
}
function renderAll(){applyOrder();renderHeader();renderMap();renderPanel()}

/* ---------- Resumen e informe ---------- */
function summaryText(){
  const d=new Date().toLocaleDateString('es-AR');
  let t=`${MODES[MODE].label} de viviendas, ${d}\n`;
  if(S.fecha) t=`${MODES[MODE].label} de viviendas, ${fmtFecha(S.fecha)}\n`;
  HOUSES.forEach(h=>{const H=S.houses[h],c=houseCount(h),p=H.pieces;
    if(moved(h)){t+=`\n${hName(h)}: ${movedLabel(h)}\n`;return}
    const list=v=>PIECES.filter(([k])=>p[k]===v).map(([,l])=>l).join(', ');
    t+=`\n${hName(h)}: ${c.recv}/9 recibidas\n`;
    if(c.dmg) t+=`- Dañadas: ${list('dmg')}\n`;
    if(c.falta) t+=`- Faltan: ${list('falta')}\n`;
    const sinMarcar=PIECES.filter(([k])=>!p[k]).map(([,l])=>l);
    if(sinMarcar.length&&sinMarcar.length<9) t+=`- Sin marcar: ${sinMarcar.join(', ')}\n`;
    if(H.surplus) t+=`- Necesita sobrantes${H.surplusDetail?': '+H.surplusDetail:''}\n`;
    if(H.comment) t+=`- Comentario: ${H.comment}\n`;
    if(H.photos.length) t+=`- Fotos: ${H.photos.length}\n`;
  });
  return t;
}
async function copyText(t){
  try{await navigator.clipboard.writeText(t)}catch(e){const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove()}
  toast('Resumen copiado');
}
function download(name,content,type){const b=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
function reportHTML(){
  const d=new Date().toLocaleString('es-AR');
  const sec=activeHouses().map(h=>{const H=S.houses[h],c=houseCount(h);
    const rows=PIECES.map(([k,l])=>`<tr><td>${l}</td><td>${STATES[H.pieces[k]]||'Sin marcar'}</td></tr>`).join('');
    const ph=H.photos.map(p=>`<figure><img src="${photoSrc(p)}"><figcaption>${p.piece?PLABEL[p.piece]:''}</figcaption></figure>`).join('');
    return `<section><h2><span style="background:${COLORS[h]};color:${INK[h]}">${h}</span> ${esc(hName(h))}</h2><p>${c.recv}/9 recibidas${H.loc?`. Ubicación: <a href="https://www.google.com/maps?q=${H.loc.lat},${H.loc.lng}">${H.loc.lat}, ${H.loc.lng}</a>`:''}</p>
      <table>${rows}</table>${H.surplus?`<p><b>Necesita sobrantes:</b> ${esc(H.surplusDetail)||'sin detalle'}</p>`:''}${H.comment?`<p><b>Comentarios:</b> ${esc(H.comment)}</p>`:''}<div class="ph">${ph}</div></section>`}).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informe de descarga</title>
<style>body{font-family:Arial,Helvetica,sans-serif;line-height:1.625;max-width:820px;margin:auto;padding:20px;color:#222}h1,h2{font-family:'Trebuchet MS',Verdana,sans-serif;color:#01579b}h2 span{display:inline-block;width:1.6em;text-align:center;border-radius:50%}
table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #e1f5fe;padding:4px 6px}.ph{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
img{width:100%;border:3px solid #4fc3f7;border-radius:8px}figure{margin:0}section{border-top:3px solid #4fc3f7;margin-top:24px;padding-top:6px;break-inside:avoid}</style></head>
<body><h1>Informe de ${MODES[MODE].label}</h1><p>Generado el ${d}</p>${sec}</body></html>`;
}

/* ---------- Eventos ---------- */
$('tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;tab=b.dataset.t;renderPanel();
  const top=document.querySelector('.panel').getBoundingClientRect().top;if(window.innerWidth<900&&top<0)window.scrollBy({top})});
const content=$('content');
content.addEventListener('toggle',e=>{const d=e.target;if(d.dataset&&d.dataset.key){d.open?openKeys.add(d.dataset.key):openKeys.delete(d.dataset.key)}},true);
content.addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]');if(!b)return;
  const a=b.dataset.act,h=b.dataset.h,k=b.dataset.k;
  if(a==='piece'){const P=S.houses[h].pieces;P[b.dataset.p]=P[b.dataset.p]===b.dataset.v?undefined:b.dataset.v;if(!P[b.dataset.p])delete P[b.dataset.p];save(`houses.${h}.pieces.${b.dataset.p}`);renderAll()}
  else if(a==='allok'){const st=STOPS[+b.dataset.i];const ks=[];[...st.del,...st.tras].forEach(p=>{if(!S.houses[st.h].pieces[p]){S.houses[st.h].pieces[p]='ok';ks.push(`houses.${st.h}.pieces.${p}`)}});save(...ks);renderAll();toast(`Parada ${+b.dataset.i+1} descargada`)}
  else if(a==='tab'){tab=b.dataset.t;renderPanel();const top=document.querySelector('.panel').getBoundingClientRect().top;if(window.innerWidth<900&&top<0)window.scrollBy({top})}
  else if(a==='gohouse'){tab='casas';openKeys.add('house-'+h);renderPanel();const el=document.querySelector(`[data-key="house-${h}"]`);el&&el.scrollIntoView({behavior:'smooth'})}
  else if(a==='focus'){focusOn(S.houses[h].loc)}
  else if(a==='focusk'){focusOn(getObj(k).loc)}
  else if(a==='locate'){locateFromText(k,content.querySelector(`[data-locin="${k}"]`).value)}
  else if(a==='place'){startPlacing(k)}
  else if(a==='here'){getHere(loc=>{getObj(k).loc=loc;save(objPath(k)+'.loc');renderAll();focusOn(loc);toast('Ubicación tomada del GPS')})}
  else if(a==='clearloc'){getObj(k).loc=null;save(objPath(k)+'.loc');renderAll()}
  else if(a==='delphoto'){if(!confirm('¿Borrar esta foto?'))return;const H=S.houses[h];H.photos=H.photos.filter(p=>p.id!==b.dataset.id);S.deleted.push(b.dataset.id);save();renderAll()}
  else if(a==='view'){const p=S.houses[h].photos.find(p=>p.id===b.dataset.src);$('viewer').querySelector('img').src=photoSrc(p);$('viewer').classList.add('show')}
  else if(a==='copy'){copyText(summaryText())}
  else if(a==='share'){try{await navigator.share({title:'Descarga de viviendas',text:summaryText()})}catch(e){}}
  else if(a==='report'){download(`informe-${MODE}-${new Date().toISOString().slice(0,10)}.html`,reportHTML(),'text/html')}
  else if(a==='backup'){download(`respaldo-${MODE}-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(S),'application/json');toast('Respaldo descargado')}
  else if(a==='import'){$('importFile').click()}
  else if(a==='reset'){if(confirm('Esto borra ubicaciones, marcas, comentarios y fotos para todo el equipo. ¿Seguir?')){
    const t=S.t,del=[...S.deleted,...HOUSES.flatMap(h=>S.houses[h].photos.map(p=>p.id))];S=blank();S.t=t;S.deleted=del;openKeys.clear();lastNext=null;save(...allKeys());renderAll()}}
  else if(a==='savetoken'){setToken(content.querySelector('[data-tokenin]').value)}
  else if(a==='deltoken'){token='';try{localStorage.removeItem('gh-token')}catch(e){}renderPanel();setStatus()}
  else if(a==='syncnow'){sync()}
  else if(a==='move'){moveHouse(+h)}
  else if(a==='up'||a==='down'){const o=STOPS.map(s=>s.b),i=+b.dataset.i,j=a==='up'?i-1:i+1;if(j<0||j>=o.length)return;[o[i],o[j]]=[o[j],o[i]];setOrder(o)}
  else if(a==='resetorder'){setOrder(null)}
  else if(a==='gomode'){setMode(b.dataset.mode)}
});
content.addEventListener('input',e=>{
  const t=e.target,f=t.dataset.in;if(!f)return;
  if(f==='name'){getObj(t.dataset.k).name=t.value;save(objPath(t.dataset.k)+'.name');renderHeader();renderMap();return}
  if(f==='comment'||f==='surplusDetail'){S.houses[t.dataset.h][f]=t.value;save(`houses.${t.dataset.h}.${f}`)}
});
content.addEventListener('change',async e=>{
  const t=e.target;
  if(t.dataset.in==='surplus'){S.houses[t.dataset.h].surplus=t.checked;save(`houses.${t.dataset.h}.surplus`);renderPanel()}
  else if(t.dataset.in==='photoPiece'){const p=S.houses[t.dataset.h].photos.find(p=>p.id===t.dataset.id);p.piece=t.value;p.pt=Date.now();save()}
  else if(t.dataset.photo){
    const h=t.dataset.photo,files=[...t.files];if(!files.length)return;toast('Procesando fotos…');
    for(const f of files){try{S.houses[h].photos.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),data:await compress(f),piece:'',ts:Date.now()})}catch(err){toast(err.message)}}
    save();renderAll();toast(`${files.length} foto${files.length>1?'s':''} agregada${files.length>1?'s':''}`);
  }
});
content.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.locin){e.preventDefault();locateFromText(e.target.dataset.locin,e.target.value)}});
$('importFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;
  try{const d=normalize(JSON.parse(await f.text())),t=S.t,del=S.deleted;S=d;S.t=t;S.deleted=del;lastNext=null;save(...allKeys());renderAll();fitAll();toast('Respaldo cargado')}catch(err){toast('El archivo no es un respaldo válido')}e.target.value=''});
$('viewer').onclick=()=>$('viewer').classList.remove('show');
/* ---------- Arrastrar paradas ---------- */
const GRIP_SVG='<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/></svg>';
// En el celular se usan eventos de toque y se frena el desplazamiento de la página mientras se arrastra:
// con Pointer Events el navegador cancela el arrastre en cuanto cree que el dedo quiere desplazar la lista.
// Se arrastra desde la manija, o manteniendo apretada la parada medio segundo.
let drag=null, press=null, skipClick=false;
const stopCards=()=>[...content.querySelectorAll('details[data-key^="stop-"]')];
function startDrag(card){
  drag={card};
  // Cerrada es más fácil de mover entre las demás
  card.open=false;
  card.classList.add('dragging');document.body.classList.add('is-dragging');
  try{navigator.vibrate&&navigator.vibrate(25)}catch(e){}
}
function moveDrag(y){
  const wide=innerWidth>=900, panel=document.querySelector('.panel'), box=wide?panel.getBoundingClientRect():{top:0,bottom:innerHeight};
  // Cerca del borde, la lista se desplaza sola
  const dy=y<box.top+70?-14:y>box.bottom-70?14:0;
  if(dy) wide?panel.scrollBy(0,dy):window.scrollBy(0,dy);
  const others=stopCards().filter(c=>c!==drag.card);
  const before=others.find(c=>{const r=c.getBoundingClientRect();return y<r.top+r.height/2});
  if(before){if(before.previousElementSibling!==drag.card)before.before(drag.card)}
  else{const last=others[others.length-1];if(last&&last.nextElementSibling!==drag.card)last.after(drag.card)}
}
function endDrag(){
  if(!drag) return;
  drag.card.classList.remove('dragging');document.body.classList.remove('is-dragging');drag=null;
  setTimeout(()=>{skipClick=false},400);
  const o=stopCards().map(c=>+c.dataset.key.slice(5));
  if(o.join()!==STOPS.map(s=>s.b).join()){setOrder(o);toast('Orden de las paradas actualizado')}
  else if(panelStale){panelStale=false;renderPanel()}
}
// Mouse
content.addEventListener('pointerdown',e=>{
  if(e.pointerType!=='mouse') return;
  const g=e.target.closest('[data-grip]');if(!g) return;
  e.preventDefault();startDrag(g.closest('details'));
});
document.addEventListener('pointermove',e=>{if(drag&&e.pointerType==='mouse')moveDrag(e.clientY)});
document.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')endDrag()});
// Dedo
content.addEventListener('touchstart',e=>{
  if(e.touches.length>1) return;
  const t=e.touches[0], g=e.target.closest('[data-grip]');
  if(g){e.preventDefault();startDrag(g.closest('details'));return}
  const sum=e.target.closest('details[data-key^="stop-"] > summary');
  if(!sum||e.target.closest('button,a,input,select,textarea')) return;
  press={x:t.clientX,y:t.clientY,timer:setTimeout(()=>{press=null;skipClick=true;startDrag(sum.parentElement)},450)};
},{passive:false});
document.addEventListener('touchmove',e=>{
  const t=e.touches[0];
  if(drag){e.preventDefault();moveDrag(t.clientY);return}
  // Si el dedo se mueve antes del medio segundo, es un desplazamiento normal
  if(press&&Math.hypot(t.clientX-press.x,t.clientY-press.y)>10){clearTimeout(press.timer);press=null}
},{passive:false});
function touchEnd(){if(press){clearTimeout(press.timer);press=null}endDrag()}
document.addEventListener('touchend',touchEnd);
document.addEventListener('touchcancel',touchEnd);
// Mantener apretado no abre el menú del navegador, y soltar no abre ni cierra la parada
content.addEventListener('contextmenu',e=>{if(drag||e.target.closest('details[data-key^="stop-"] > summary'))e.preventDefault()});
content.addEventListener('click',e=>{if(skipClick||e.target.closest('[data-grip]')){e.preventDefault();e.stopPropagation();skipClick=false}},true);

let toastT;function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),3500)}

/* ---------- Inicio ---------- */
(async()=>{
  try{await DB.open();const d=await DB.get(MODES[MODE].db);if(d)S=normalize(d);routeCache=(await DB.get('routes'))||{}}catch(e){$('saved').textContent='Sin guardado: este navegador no permite almacenar datos'}
  renderAll();
  if(allLocs().length) fitAll();
  setTimeout(()=>map.invalidateSize(),200);
  const had=allLocs().length;await sync();if(!had&&allLocs().length)fitAll();
  peekFecha(otherMode());
})();
