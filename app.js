/* ============================================================
   PROJECT SOVEREIGN — client app
   EU4-style political map editor for a multi-era D&D campaign.
   ============================================================ */

const SVGNS = "http://www.w3.org/2000/svg";
// Read-only "player viewer" mode: set window.SOVEREIGN_VIEWER=true (published
// build) or add ?viewer to the URL. In this mode nothing can be edited or saved.
const VIEWER = (typeof window !== "undefined") &&
  (window.SOVEREIGN_VIEWER === true || /[?&]view(er)?\b/i.test(location.search));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : "id" + Math.random().toString(36).slice(2) + Date.now());

// Surface any runtime error visibly (helps diagnose since the app runs in a
// standalone window with no dev console open).
window.onerror = function(msg, src, line, col){
  let b = document.getElementById("errbanner");
  if(!b){ b=document.createElement("div"); b.id="errbanner";
    b.style.cssText="position:fixed;left:10px;bottom:10px;max-width:min(560px,68vw);z-index:9999;background:#5a2330;color:#fff;padding:9px 34px 9px 12px;font:12px/1.45 system-ui;white-space:pre-wrap;border:1px solid #ff7a7a;border-radius:8px;box-shadow:0 6px 20px #0007;max-height:38vh;overflow:auto";
    const x=document.createElement("div"); x.textContent="✕"; x.title="Dismiss";
    x.style.cssText="position:absolute;top:3px;right:9px;cursor:pointer;font-size:16px;color:#ffdede;line-height:1";
    x.onclick=()=>b.remove();
    b.appendChild(x);
    const m=document.createElement("div"); m.id="errbannermsg"; b.appendChild(m);
    document.body.appendChild(b);
  }
  const m=document.getElementById("errbannermsg"); if(m)m.textContent="⚠ "+msg+"  ("+line+":"+col+")";
};

/* ---------- default lists ---------- */
const DEFAULT_LISTS = {
  religions: ["The Old Faith", "Lumenism", "Ancestor Cult", "The Deep Pact", "Unbelief"],
  cultures: ["Veshkan", "Aurelian", "Highland Clans", "Skyborn", "Marsh-folk"],
  races: ["Human", "Elf", "Dwarf", "Orc", "Halfling", "Goblin", "Dragonborn", "Tiefling", "Aarakocra"],
  languages: ["Common", "Old Veshkan", "High Aurelian", "Cant", "Draconic"],
  terrains: ["Plains", "Forest", "Hills", "Mountains", "Desert", "Marsh", "Tundra", "Jungle", "Coast", "Wasteland", "Floating Reef"],
  settlements: ["Uninhabited", "Village", "Town", "City", "Megalopolis"],
  resources: ["Grain", "Livestock", "Fish", "Timber", "Iron", "Gold", "Gems", "Wine", "Spices", "Cloth", "Magical Reagents", "Enchanted Items", "Skystone", "Aether Crystals"],
  features: ["Impact Crater", "Arcane Scar", "Ancient Ruin", "Ley-line Nexus", "Floating Monolith", "Sunken City", "Volcanic Rift", "Sacred Grove"],
  governments: ["Feudal Monarchy", "Absolute Monarchy", "Merchant Republic", "Theocracy", "Magocracy", "Tribal Confederation", "City-State", "Hegemony", "Imperial", "Council"],
  economies: ["Agrarian", "Trade", "Mercantile", "Industrial", "Arcane-Industrial", "Pastoral", "Plunder", "Mixed"]
};

/* ---------- color helpers ---------- */
const PALETTE = ["#e07a5f","#3d8bfd","#81b29a","#f2cc8f","#b5179e","#4cc9f0","#f72585","#90be6d","#f9844a","#577590","#9d4edd","#43aa8b","#ff9f1c","#2ec4b6","#e71d36","#8338ec","#3a86ff","#fb5607","#ffbe0b","#06d6a0"];
function hashColor(str){let h=0;for(let i=0;i<(str||"").length;i++)h=(h*31+str.charCodeAt(i))>>>0;return `hsl(${h%360} 62% 58%)`;}
function listColor(list, name){const i=list.indexOf(name);return i>=0?PALETTE[i%PALETTE.length]:hashColor(name);}
function ramp(t){t=Math.max(0,Math.min(1,t));const a=[239,122,95],b=[95,208,160];return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(",")})`;}

const TERRAIN_COLORS={Plains:"#a7c957",Forest:"#386641",Hills:"#9c8246",Mountains:"#8d99ae",Desert:"#e9c46a",Marsh:"#52796f",Tundra:"#cad2c5",Jungle:"#2d6a4f",Coast:"#76c7c0",Wasteland:"#6d597a","Floating Reef":"#48bfe3"};
const SETTLE_COLORS={Uninhabited:"#26304a",Village:"#9bb25f",Town:"#e9c46a",City:"#f4a261",Megalopolis:"#e76f51"};

/* ============================================================
   STATE
   ============================================================ */
let world = null;
let state = {
  tool: "select",
  mapmode: "political",
  selProvince: null,
  selRealm: null,
  focusedContinent: null,   // continent currently targeted for drawing
  tilt: false,
  cam: { x: 0, y: 0, scale: 0.3 },  // x,y = world coord at canvas top-left; scale = px/world-unit
  draft: null,              // in-progress polygon points (local coords) while drawing
  paintValue: null,         // category value to paint (non-political modes)
  paintUnclaim: false,      // political: paint provinces back to unclaimed
  drawCursor: null,         // live (snapped) cursor while drawing
  nodeDrag: null,           // {p,i} vertex being dragged in Nodes tool
  split: null,              // {p, pts:[], cur:[x,y]} active split-line for a province
  editMode: false,          // map-drawing screen on/off
  showNames: true,          // show landmass names on the map
  terrainOverlay: false,    // resource mode: overlay terrain-region outlines as a painting aid
  pingOn: false,            // annotation/ping overlay active
  pingTool: "brush",        // brush | pin | erase | pan
  pingColor: "#e23b3b",
  pingWidth: 6,
  labelDrag: null,          // continentId whose name is being dragged
  customDrag: null,         // custom label id being dragged
  selLabel: null,           // selected custom label id
  draftType: "province",    // what the current draft becomes: province | lake | river
  moveDrag: null,           // {p, start:[...points], grab:[wx,wy]} while moving a province
  selWater: null,           // {type:"river"|"lake", id} selected water feature
};
const WORLD_W = 4000, WORLD_H = 2600;
let saveTimer = null;

/* ============================================================
   SAMPLE WORLD
   ============================================================ */
function blankPop(lists){return {religion:[],culture:[],race:[],language:[]};}
function sampleWorld(){
  const lists = JSON.parse(JSON.stringify(DEFAULT_LISTS));
  const eras = [
    {id:uid(),name:"The Sundering Age"},
    {id:uid(),name:"Age of Isolation"},
    {id:uid(),name:"Age of Skyships"}
  ];
  const c1={id:uid(),name:"Aurelia",ox:300,oy:300,note:"The central, most populous continent."};
  const c2={id:uid(),name:"Veshka",ox:1900,oy:1300,note:"Storm-wracked southern isle."};
  const c3={id:uid(),name:"The Shards",ox:2700,oy:200,note:"A cluster of tiny floating islets."};
  const r1={id:uid(),name:"Aurelian Compact",color:"#3d8bfd",government:"Merchant Republic",economy:"Trade",stateReligion:"Lumenism",dominantCulture:"Aurelian",dominantRace:"Human",leaderName:"Doge Calen Vorr",leaderTitle:"Doge",capitalId:null,note:""};
  const r2={id:uid(),name:"Clanholds of Veshka",color:"#e07a5f",government:"Tribal Confederation",economy:"Pastoral",stateReligion:"The Old Faith",dominantCulture:"Veshkan",dominantRace:"Orc",leaderName:"High Chief Garruk",leaderTitle:"High Chief",capitalId:null,note:""};
  function poly(cx,cy,r,n,seed){const pts=[];for(let i=0;i<n;i++){const a=i/n*Math.PI*2;const rr=r*(0.7+0.5*Math.abs(Math.sin(i*seed)));pts.push([Math.round(cx+Math.cos(a)*rr),Math.round(cy+Math.sin(a)*rr)]);}return pts;}
  const p1={id:uid(),name:"Sunhaven",continentId:c1.id,points:poly(160,160,150,7,1.3),terrain:"Coast",settlement:"City",resource:"Cloth",features:[],tolerance:70,population:42000,
    religion:[{name:"Lumenism",pct:80},{name:"The Old Faith",pct:20}],culture:[{name:"Aurelian",pct:90},{name:"Veshkan",pct:10}],race:[{name:"Human",pct:75},{name:"Halfling",pct:15},{name:"Elf",pct:10}],language:[{name:"Common",pct:70},{name:"High Aurelian",pct:30}],
    realmId:r1.id,history:[{eraId:eras[0].id,title:"Founding",text:"Settled by Aurelian traders after the Sundering."}],notes:""};
  const p2={id:uid(),name:"Goldfurrow",continentId:c1.id,points:poly(420,260,160,8,2.1),terrain:"Plains",settlement:"Town",resource:"Grain",features:["Ley-line Nexus"],tolerance:60,population:18000,
    religion:[{name:"Lumenism",pct:55},{name:"Ancestor Cult",pct:45}],culture:[{name:"Aurelian",pct:100}],race:[{name:"Human",pct:60},{name:"Dwarf",pct:40}],language:[{name:"Common",pct:100}],
    realmId:r1.id,history:[],notes:""};
  const p3={id:uid(),name:"Stormreach",continentId:c2.id,points:poly(180,180,170,7,1.7),terrain:"Hills",settlement:"Town",resource:"Iron",features:["Arcane Scar"],tolerance:40,population:12000,
    religion:[{name:"The Old Faith",pct:90},{name:"Unbelief",pct:10}],culture:[{name:"Veshkan",pct:95},{name:"Highland Clans",pct:5}],race:[{name:"Orc",pct:70},{name:"Human",pct:30}],language:[{name:"Old Veshkan",pct:80},{name:"Common",pct:20}],
    realmId:r2.id,history:[{eraId:eras[1].id,title:"The Long Storm",text:"Cut off from Aurelia for a generation."}],notes:""};
  const p4={id:uid(),name:"Glimmerstone",continentId:c3.id,points:poly(120,120,90,9,2.6),terrain:"Floating Reef",settlement:"Village",resource:"Skystone",features:["Floating Monolith"],tolerance:55,population:2200,
    religion:[{name:"The Deep Pact",pct:100}],culture:[{name:"Skyborn",pct:100}],race:[{name:"Aarakocra",pct:80},{name:"Tiefling",pct:20}],language:[{name:"Cant",pct:100}],
    realmId:null,history:[],notes:"Independent island."};
  r1.capitalId=p1.id; r2.capitalId=p3.id;
  return {
    name:"Aetheria",
    eras, currentEraId:eras[2].id, lists,
    continents:[c1,c2,c3],
    realms:[r1,r2],
    provinces:[p1,p2,p3,p4]
  };
}

/* ============================================================
   PERSISTENCE
   ============================================================ */
function markDirty(){if(VIEWER)return;clearTimeout(saveTimer);saveTimer=setTimeout(saveWorld,900);}
async function saveWorld(silent=true){
  if(VIEWER)return;
  try{
    const res=await fetch("/api/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({world})});
    const j=await res.json();
    if(!silent && j.ok) flash("Saved as "+j.savedAs);
  }catch(e){ if(!silent) flash("Save failed: "+e.message); }
}
async function listWorlds(){const r=await fetch("/api/worlds");return (await r.json()).worlds||[];}
async function loadWorld(name){
  const r=await fetch("/api/load?name="+encodeURIComponent(name));
  if(!r.ok) return false;
  const j=await r.json();
  if(j.ok){ world=normalize(j.world); afterLoad(); return true; }
  return false;
}
function normalize(w){
  w.lists=Object.assign(JSON.parse(JSON.stringify(DEFAULT_LISTS)),w.lists||{});
  w.continents=w.continents||[]; w.realms=w.realms||[]; w.provinces=w.provinces||[]; w.eras=w.eras||[];
  w.rivers=w.rivers||[]; w.lakes=w.lakes||[]; w.colors=w.colors||{};
  w.labels=w.labels||[];   // custom map annotations
  if(!w.milesPerUnit)w.milesPerUnit=10;   // map scale: miles per world unit
  if(w.distanceUnit!=="km")w.distanceUnit="mi";   // display unit for the scale bar
  if(w.capitalBoost==null)w.capitalBoost=1.8;   // population distribution: capital multiplier
  if(w.adminBoost==null)w.adminBoost=1.3;        // population distribution: admin-centre multiplier
  w.provinces.forEach(p=>{
    ["religion","culture","race","language"].forEach(k=>p[k]=p[k]||[]);
    p.features=p.features||[]; p.history=p.history||[];
    if(!Array.isArray(p.pops)) p.pops=migratePops(p,w.lists);   // one-time migration from the old model
    deriveProvince(p);                                          // keep population + %s in sync with pops
  });
  w.realms.forEach(r=>{r.adminCenters=r.adminCenters||[];r.dominantLanguage=r.dominantLanguage||"";});
  return w;
}

/* ============================================================
   COORDINATE + GEOMETRY HELPERS
   ============================================================ */
function continentBox(cid){
  const ps=world.provinces.filter(p=>p.continentId===cid);
  const c=world.continents.find(x=>x.id===cid);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  ps.forEach(p=>p.points.forEach(([x,y])=>{minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}));
  // include reference image extent so the slab wraps a traced map too
  if(c.bg&&c.bg.href){const w=(c.bg.w||600)*(c.bg.scale||1),h=(c.bg.h||400)*(c.bg.scale||1);minX=Math.min(minX,0);minY=Math.min(minY,0);maxX=Math.max(maxX,w);maxY=Math.max(maxY,h);}
  if(!isFinite(minX)) return {x:c.ox-40,y:c.oy-40,w:320,h:240};
  const pad=50;
  return {x:c.ox+minX-pad,y:c.oy+minY-pad,w:(maxX-minX)+pad*2,h:(maxY-minY)+pad*2};
}
function provCentroid(p){
  let x=0,y=0;p.points.forEach(pt=>{x+=pt[0];y+=pt[1];});const n=p.points.length||1;
  const c=world.continents.find(c=>c.id===p.continentId)||{ox:0,oy:0};
  return [c.ox+x/n, c.oy+y/n];
}
function screenToWorld(evt){
  const rect=$("#map").getBoundingClientRect();
  return [state.cam.x+(evt.clientX-rect.left)/state.cam.scale,
          state.cam.y+(evt.clientY-rect.top)/state.cam.scale];
}
function dominant(arr){if(!arr||!arr.length)return null;return arr.slice().sort((a,b)=>b.pct-a.pct)[0].name;}

/* ---------- population "pops" (chunks) ----------
   A province's population is a list of pop chunks; each chunk has a size and a
   religion, culture, race and language. The old per-axis %s and p.population are
   kept in sync (derived) so map modes and exports keep working. */
function newPop(size,rel,cul,race,lang){return {id:uid(),size:Math.max(0,Math.round(size||0)),religion:rel||"",culture:cul||"",race:race||"",language:lang||""};}
function axisFromPops(pops,key){
  const m={}; let tot=0;
  for(const q of pops){const v=q[key]||""; if(!v||!(q.size>0))continue; m[v]=(m[v]||0)+q.size; tot+=q.size;}
  if(tot<=0)return [];
  return Object.entries(m).map(([name,sz])=>({name,pct:Math.round(sz/tot*100)})).sort((a,b)=>b.pct-a.pct);
}
function deriveProvince(p){
  p.pops=Array.isArray(p.pops)?p.pops:[];
  p.population=p.pops.reduce((a,q)=>a+(q.size||0),0);
  p.religion=axisFromPops(p.pops,"religion");
  p.culture=axisFromPops(p.pops,"culture");
  p.race=axisFromPops(p.pops,"race");
  p.language=axisFromPops(p.pops,"language");
}
function migratePops(p,lists){
  const pop=p.population||0; if(pop<=0)return [];
  const def={religion:(lists.religions[0]||""),culture:(lists.cultures[0]||""),race:(lists.races[0]||""),language:(lists.languages[0]||"")};
  const ax=key=>(p[key]&&p[key].length)?p[key]:[{name:def[key],pct:100}];
  const rels=ax("religion"),culs=ax("culture"),races=ax("race"),langs=ax("language");
  const out=[];
  for(const r of rels)for(const c of culs)for(const ra of races)for(const l of langs){
    const size=Math.round(pop*(r.pct/100)*(c.pct/100)*(ra.pct/100)*(l.pct/100));
    if(size>0)out.push(newPop(size,r.name,c.name,ra.name,l.name));
  }
  if(!out.length)out.push(newPop(pop,dominant(p.religion),dominant(p.culture),dominant(p.race),dominant(p.language)));
  return out;
}
// Scale a province's pops so their total equals `target` (used by realm Distribute).
function setProvincePopulation(p,target){
  target=Math.max(0,Math.round(target||0));
  p.pops=Array.isArray(p.pops)?p.pops:[];
  const cur=p.pops.reduce((a,q)=>a+(q.size||0),0);
  if(!p.pops.length){
    if(target>0){const r=world.realms.find(x=>x.id===p.realmId);
      p.pops=[newPop(target, r?r.stateReligion:(world.lists.religions[0]||""), r?r.dominantCulture:(world.lists.cultures[0]||""), r?r.dominantRace:(world.lists.races[0]||""), r?r.dominantLanguage:(world.lists.languages[0]||""))];}
  } else if(cur<=0){
    p.pops[0].size=target; for(let i=1;i<p.pops.length;i++)p.pops[i].size=0;
  } else {
    const f=target/cur; p.pops.forEach(q=>q.size=Math.max(0,Math.round(q.size*f)));
  }
  deriveProvince(p);
}
function worldPopBreakdown(key){
  const m={}; let tot=0;
  for(const p of world.provinces)for(const q of (p.pops||[])){const v=q[key]||"—"; if(!(q.size>0))continue; m[v]=(m[v]||0)+q.size; tot+=q.size;}
  const rows=Object.entries(m).map(([name,size])=>({name,size,pct:tot?size/tot*100:0})).sort((a,b)=>b.size-a.size);
  return {rows,total:tot};
}

/* ============================================================
   CANVAS RENDERER  (scales to thousands of provinces)
   ============================================================ */
let _geoDirty=true, _renderQueued=false, _provGeo=[], _contBox={}, _stars=null;
let _labelGroups=[], _labelMode=null, _labelsDirty=true, _medProvW=20;
let _landCache={};   // continentId -> {canvas,x,y,w,h} silhouette of its provinces
let _realmBorderCache={};   // continentId -> {canvas,x,y,w,h} overlay of realm borders
let _terrainBorderCache={};   // continentId -> {canvas,x,y,w,h} overlay of terrain borders
let _contProvCount={}, _contLabelRects={}, _customLabelRects={};   // province counts + on-screen name boxes
let _keyLocMap={};   // provinceId -> "capital" | "admin" (so names can dodge the markers)
let pingLayer={strokes:[],pins:[]};   // player annotations (viewer-local, persisted in localStorage)
let _curStroke=null;
let _maxPop=0;   // highest province population (for the population heatmap scale)
const _imgCache={};
let _undo=[], _redo=[];   // undo/redo snapshot stacks

// ---- pastel color transform (Pastel-Graphics-for-Anbennar look) ----
const _ccx=document.createElement("canvas").getContext("2d");
function toRGB(c){_ccx.fillStyle="#000";_ccx.fillStyle=c;const v=_ccx.fillStyle;
  if(v[0]==="#")return [parseInt(v.slice(1,3),16),parseInt(v.slice(3,5),16),parseInt(v.slice(5,7),16)];
  const m=v.match(/\d+/g);return m?[+m[0],+m[1],+m[2]]:[120,120,120];}
const _pastelCache={};
function pastelize(c){
  if(_pastelCache[c])return _pastelCache[c];
  let [r,g,b]=toRGB(c);
  const gray=(r+g+b)/3, desat=0.34, light=0.42;
  r=r+(gray-r)*desat; g=g+(gray-g)*desat; b=b+(gray-b)*desat;
  r=r+(255-r)*light; g=g+(255-g)*light; b=b+(255-b)*light;
  const out=`rgb(${r|0},${g|0},${b|0})`; _pastelCache[c]=out; return out;
}
// distinct pastel color for new realms (golden-angle hue walk)
let _hueSeed=200;
function autoPastelHex(){   // distinct, fully-saturated default color for a new realm
  _hueSeed=(_hueSeed+137)%360;
  const c=toRGB(`hsl(${_hueSeed} 64% 53%)`);
  return "#"+c.map(v=>v.toString(16).padStart(2,"0")).join("");
}

// renderMap() is the name used throughout the app; it now schedules a redraw
// and flags geometry for rebuild (used after any edit).
function renderMap(){ _geoDirty=true; _labelsDirty=true; requestRender(); }

// EU4-style map labels: one name per category group, placed over its territory.
function labelKeyer(mode){
  switch(mode){
    case "political": return p=>p.realmId;
    case "religion": return p=>dominant(p.religion);
    case "culture": return p=>dominant(p.culture);
    case "race": return p=>dominant(p.race);
    case "language": return p=>dominant(p.language);
    case "terrain": return null;   // terrain uses custom labels, not auto region names
    case "settlement": return p=>(p.settlement&&p.settlement!=="Uninhabited")?p.settlement:null;
    case "resource": return null;   // resource uses custom labels, not auto region names
    default: return null;
  }
}
function labelText(mode,val){ if(mode==="political"){const r=world.realms.find(r=>r.id===val);return r?r.name:"";} return val; }
function clamp01(x){return x<0?0:x>1?1:x;}
// draw uppercase text along a gentle arc (EU4-style), with halo
function drawArcText(ctx,text,cx,cy,fontPx,ls,bow,angle){
  const chars=[...text]; if(!chars.length)return;
  ctx.font=`600 ${fontPx}px Georgia,"Times New Roman",serif`;
  const w=chars.map(c=>ctx.measureText(c).width);
  let total=ls*(chars.length-1); w.forEach(x=>total+=x);
  if(total<=0)return;
  const R=total/Math.max(0.04,bow);          // subtended angle = bow (radians)
  ctx.save(); ctx.translate(cx,cy); if(angle) ctx.rotate(angle);   // orient along territory axis
  ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.lineJoin="round";
  let acc=-total/2;
  for(let i=0;i<chars.length;i++){
    const mid=acc+w[i]/2, ang=mid/R;
    const x=R*Math.sin(ang), y=R-R*Math.cos(ang);   // gentle valley along the axis
    ctx.save(); ctx.translate(x,y); ctx.rotate(ang);
    if(ctx.lineWidth>0) ctx.strokeText(chars[i],0,0);
    ctx.fillText(chars[i],0,0);
    ctx.restore();
    acc+=w[i]+ls;
  }
  ctx.restore();
}
function computeLabelGroups(mode){
  // Label each CONTIGUOUS pocket of same-value provinces separately, so names
  // (e.g. terrain types) sit over each region instead of averaging across the map.
  const keyer=labelKeyer(mode); if(!keyer)return [];
  const items=[];
  for(const gp of _provGeo){
    const val=keyer(gp.p); if(val==null||val==="")continue;
    items.push({val,cont:gp.p.continentId,cx:gp.cx,cy:gp.cy,
      r:0.5*Math.hypot(gp.maxx-gp.minx,gp.maxy-gp.miny),
      area:Math.max(1,(gp.maxx-gp.minx)*(gp.maxy-gp.miny))});
  }
  const n=items.length; if(!n)return [];
  const parent=new Array(n); for(let i=0;i<n;i++)parent[i]=i;
  const find=a=>{while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;};
  const uni=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};
  const cell=Math.max(8,(_medProvW||20)*2.5), grid={};
  for(let i=0;i<n;i++){const gk=Math.floor(items[i].cx/cell)+","+Math.floor(items[i].cy/cell);(grid[gk]||(grid[gk]=[])).push(i);}
  for(let i=0;i<n;i++){
    const it=items[i], gx=Math.floor(it.cx/cell), gy=Math.floor(it.cy/cell);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      const arr=grid[(gx+dx)+","+(gy+dy)]; if(!arr)continue;
      for(const j of arr){ if(j<=i)continue; const jt=items[j];
        if(jt.val!==it.val||jt.cont!==it.cont)continue;
        if(Math.hypot(it.cx-jt.cx,it.cy-jt.cy) < (it.r+jt.r)*1.2) uni(i,j);   // touching = same pocket
      }
    }
  }
  const groups={};
  for(let i=0;i<n;i++){const root=find(i),it=items[i];
    let g=groups[root]; if(!g){g={val:it.val,sx:0,sy:0,sxx:0,syy:0,sxy:0,a:0};groups[root]=g;}
    g.sx+=it.cx*it.area; g.sy+=it.cy*it.area; g.a+=it.area;
    g.sxx+=it.cx*it.cx*it.area; g.syy+=it.cy*it.cy*it.area; g.sxy+=it.cx*it.cy*it.area;
  }
  const out=[];
  for(const k in groups){const g=groups[k]; const text=labelText(mode,g.val); if(!text)continue;
    const mx=g.sx/g.a, my=g.sy/g.a;
    const Sxx=g.sxx/g.a-mx*mx, Syy=g.syy/g.a-my*my, Sxy=g.sxy/g.a-mx*my;
    let angle=0.5*Math.atan2(2*Sxy,(Sxx-Syy)||1e-9);
    if(angle>Math.PI/2)angle-=Math.PI; if(angle<-Math.PI/2)angle+=Math.PI;
    const tr=(Sxx+Syy)/2, dd=Math.sqrt(Math.max(0,((Sxx-Syy)/2)**2+Sxy*Sxy));
    const axisLen=Math.sqrt(Math.max(tr+dd,1))*4.2;
    out.push({text,x:mx,y:my,a:g.a,angle,axisLen});
  }
  return out;
}
function requestRender(){ if(_renderQueued)return; _renderQueued=true; requestAnimationFrame(drawFrame); }

function rebuildGeo(){
  _provGeo=[]; _contBox={};
  const byId={}; world.continents.forEach(c=>byId[c.id]=c);
  world.provinces.forEach(p=>{
    const c=byId[p.continentId]; if(!c)return;
    let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity,sx=0,sy=0;
    const pts=p.points.map(([x,y])=>{const wx=c.ox+x,wy=c.oy+y;
      if(wx<minx)minx=wx;if(wy<miny)miny=wy;if(wx>maxx)maxx=wx;if(wy>maxy)maxy=wy;sx+=wx;sy+=wy;return [wx,wy];});
    const n=pts.length||1; const cx=sx/n, cy=sy/n;
    // principal-axis orientation (so labels flow with the province's shape, EU4-style)
    let sxx=0,syy=0,sxy=0;
    for(const [x,y] of pts){const dx=x-cx,dy=y-cy; sxx+=dx*dx; syy+=dy*dy; sxy+=dx*dy;}
    let ang=0.5*Math.atan2(2*sxy,(sxx-syy)||1e-9);
    const ca=Math.cos(ang), sa=Math.sin(ang);
    let lo1=Infinity,hi1=-Infinity,lo2=Infinity,hi2=-Infinity;
    for(const [x,y] of pts){const dx=x-cx,dy=y-cy; const u=dx*ca+dy*sa, v=-dx*sa+dy*ca;
      if(u<lo1)lo1=u; if(u>hi1)hi1=u; if(v<lo2)lo2=v; if(v>hi2)hi2=v;}
    let len=hi1-lo1, thick=hi2-lo2;
    if(len<thick){ [len,thick]=[thick,len]; ang+=Math.PI/2; }   // major axis = longer side
    if(len < thick*1.12) ang=0;                                 // round-ish → keep level
    if(ang> Math.PI/2) ang-=Math.PI; else if(ang<-Math.PI/2) ang+=Math.PI;
    if(ang> Math.PI/2-0.3) ang-=Math.PI;                        // near-vertical reads bottom-to-top
    _provGeo.push({p,pts,minx,miny,maxx,maxy,cx,cy,ang,len,thick});
  });
  world.continents.forEach(c=>{ _contBox[c.id]=continentBox(c.id); });
  _contProvCount={}; world.provinces.forEach(p=>{_contProvCount[p.continentId]=(_contProvCount[p.continentId]||0)+1;});
  _keyLocMap={}; world.realms.forEach(r=>{if(r.capitalId)_keyLocMap[r.capitalId]="capital";(r.adminCenters||[]).forEach(pid=>{if(!_keyLocMap[pid])_keyLocMap[pid]="admin";});});
  _landCache={};   // silhouettes rebuilt lazily for the new geometry
  _realmBorderCache={}; _terrainBorderCache={};   // border overlays rebuilt lazily too
  // typical province width (world units) → drives the region/province zoom handoff
  if(_provGeo.length){const ws=_provGeo.map(g=>g.maxx-g.minx).sort((a,b)=>a-b);_medProvW=Math.max(2,ws[Math.floor(ws.length/2)]);}
}
// Build a continent's landmass silhouette from its provinces (fat stroke merges
// the gaps), cached to an offscreen canvas in world space.
function buildLandCanvas(cid){
  const ps=_provGeo.filter(g=>g.p.continentId===cid); if(!ps.length)return null;
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  ps.forEach(g=>{if(g.minx<minx)minx=g.minx;if(g.miny<miny)miny=g.miny;if(g.maxx>maxx)maxx=g.maxx;if(g.maxy>maxy)maxy=g.maxy;});
  const pad=10; minx-=pad;miny-=pad;maxx+=pad;maxy+=pad;
  const w=maxx-minx,h=maxy-miny;
  const q=Math.min(2.5,Math.max(0.25,1200/Math.max(w,h)));
  const cnv=document.createElement("canvas"); cnv.width=Math.max(1,Math.round(w*q)); cnv.height=Math.max(1,Math.round(h*q));
  const cx=cnv.getContext("2d"); cx.scale(q,q); cx.translate(-minx,-miny);
  cx.fillStyle="#e7dec9"; cx.strokeStyle="#d8cdb2"; cx.lineJoin="round"; cx.lineWidth=3.4;
  for(const g of ps){const pts=g.pts; if(!pts.length)continue; cx.beginPath(); cx.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++)cx.lineTo(pts[i][0],pts[i][1]); cx.closePath(); cx.fill(); cx.stroke();}
  return {canvas:cnv,x:minx,y:miny,w,h};
}
// Build an overlay canvas (world space) that draws a dark line wherever two
// adjacent provinces belong to different realms — or a realm meets unclaimed
// land — so realm borders read clearly on any map mode.
function darkenColor(col,f){
  let r=68,g=80,b=102, m=/^#?([0-9a-f]{6})$/i.exec(col||"");
  if(m){const v=parseInt(m[1],16);r=(v>>16)&255;g=(v>>8)&255;b=v&255;}
  else{m=/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(col||"");if(m){r=+m[1];g=+m[2];b=+m[3];}}
  return [Math.round(r*f),Math.round(g*f),Math.round(b*f)];
}
// Generic: outline every place where two adjacent provinces have a different
// value of keyOf(p). Each border pixel is painted colorOf(key) for its own side.
function buildBorderCanvas(cid, keyOf, colorOf){
  const ps=_provGeo.filter(g=>{const k=keyOf(g.p);return g.p.continentId===cid && k!=null && k!=="";});
  if(!ps.length)return null;
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  ps.forEach(g=>{if(g.minx<minx)minx=g.minx;if(g.miny<miny)miny=g.miny;if(g.maxx>maxx)maxx=g.maxx;if(g.maxy>maxy)maxy=g.maxy;});
  const pad=6; minx-=pad;miny-=pad;maxx+=pad;maxy+=pad;
  const w=maxx-minx,h=maxy-miny;
  const q=Math.min(3,Math.max(0.4,1500/Math.max(w,h)));
  const W=Math.max(1,Math.round(w*q)),H=Math.max(1,Math.round(h*q));
  const tmp=document.createElement("canvas");tmp.width=W;tmp.height=H;
  const tx=tmp.getContext("2d");tx.imageSmoothingEnabled=false;tx.scale(q,q);tx.translate(-minx,-miny);
  // synthetic colors → robust adjacency detection; remember each key's display colour
  const idOf={}, revMap={}, colByK=[null]; let n=0;
  const synthFor=key=>{const s=String(key);
    if(idOf[s]===undefined){const k=idOf[s]=++n;const R=(k*73)%254+1,G=(k*151)%254+1,B=(k*211)%254+1;revMap[R+","+G+","+B]=k;colByK[k]=colorOf(key);}
    const k=idOf[s];return `rgb(${(k*73)%254+1},${(k*151)%254+1},${(k*211)%254+1})`;};
  tx.lineJoin="round"; tx.lineWidth=2/q;
  for(const g of ps){const col=synthFor(keyOf(g.p));tx.fillStyle=col;tx.strokeStyle=col;const pts=g.pts;if(!pts.length)continue;
    tx.beginPath();tx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)tx.lineTo(pts[i][0],pts[i][1]);tx.closePath();tx.fill();tx.stroke();}
  const src=tx.getImageData(0,0,W,H).data;
  const kAt=a=>(src[a+3]>128?(revMap[src[a]+","+src[a+1]+","+src[a+2]]||0):0);
  const mark=new Uint16Array(W*H);
  const px=(x,y)=>y*W+x, at=(x,y)=>(y*W+x)*4;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const ka=kAt(at(x,y));
    if(x+1<W){const kb=kAt(at(x+1,y));if(ka!==kb){if(ka)mark[px(x,y)]=ka;if(kb)mark[px(x+1,y)]=kb;}}
    if(y+1<H){const kb=kAt(at(x,y+1));if(ka!==kb){if(ka)mark[px(x,y)]=ka;if(kb)mark[px(x,y+1)]=kb;}}
  }
  // thicken by one pixel (4-neighbour dilation, keeping each pixel's colour)
  const grow=mark.slice();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const k=mark[px(x,y)];if(!k)continue;
    if(x>0&&!grow[px(x-1,y)])grow[px(x-1,y)]=k; if(x+1<W&&!grow[px(x+1,y)])grow[px(x+1,y)]=k;
    if(y>0&&!grow[px(x,y-1)])grow[px(x,y-1)]=k; if(y+1<H&&!grow[px(x,y+1)])grow[px(x,y+1)]=k;}
  const out=document.createElement("canvas");out.width=W;out.height=H;
  const octx=out.getContext("2d");const od=octx.createImageData(W,H);const o=od.data;
  for(let i=0;i<grow.length;i++){const k=grow[i];if(!k)continue;const c=colByK[k];const a=i*4;o[a]=c[0];o[a+1]=c[1];o[a+2]=c[2];o[a+3]=245;}
  octx.putImageData(od,0,0);
  return {canvas:out,x:minx,y:miny,w,h};
}
function buildRealmBorderCanvas(cid){
  const rc={}; world.realms.forEach(r=>rc[r.id]=r);
  return buildBorderCanvas(cid, p=>p.realmId||null, id=>darkenColor(toHex(rc[id]?rc[id].color:"#445066"),0.78));
}
function buildTerrainBorderCanvas(cid){
  return buildBorderCanvas(cid, p=>p.terrain||null, t=>darkenColor(toHex(catColor("terrains",t)),0.7));
}
// Draw the cached realm-border overlays (assumes ctx already in world transform).
function drawRealmBorders(ctx){
  for(const c of world.continents){
    let bc=_realmBorderCache[c.id]; if(bc===undefined)bc=_realmBorderCache[c.id]=buildRealmBorderCanvas(c.id);
    if(bc)ctx.drawImage(bc.canvas,bc.x,bc.y,bc.w,bc.h);
  }
}
// Draw the cached terrain-border overlays (resource-painting aid).
function drawTerrainBorders(ctx){
  for(const c of world.continents){
    let bc=_terrainBorderCache[c.id]; if(bc===undefined)bc=_terrainBorderCache[c.id]=buildTerrainBorderCanvas(c.id);
    if(bc)ctx.drawImage(bc.canvas,bc.x,bc.y,bc.w,bc.h);
  }
}
function contBoxC(cid){ return _contBox[cid] || continentBox(cid); }
// distance scale bar (miles), drawn in device space anchored at bottom-right (rx,by)
const KM_PER_MI=1.609344;
function distPerWorldUnit(){ return (world.distanceUnit==="km") ? (world.milesPerUnit||10)*KM_PER_MI : (world.milesPerUnit||10); }
function unitLabel(){ return world.distanceUnit==="km" ? "km" : "mi"; }
function niceMiles(x){if(x<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(x)));const f=x/p;return (f>=5?5:f>=2?2:1)*p;}
function drawScaleBar(ctx,pxPerDist,rx,by,fs,unit){
  unit=unit||"mi";
  if(!isFinite(pxPerDist)||pxPerDist<=0)return;
  const dist=niceMiles(140/pxPerDist), barPx=dist*pxPerDist;
  if(barPx<20||barPx>rx)return;
  const x1=rx, x0=rx-barPx, y=by;
  ctx.save();
  const bar=()=>{ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.moveTo(x0,y-fs*0.55);ctx.lineTo(x0,y+fs*0.2);ctx.moveTo(x1,y-fs*0.55);ctx.lineTo(x1,y+fs*0.2);ctx.stroke();};
  ctx.lineCap="round";
  ctx.lineWidth=Math.max(3,fs*0.32);ctx.strokeStyle="rgba(255,255,255,.92)";bar();
  ctx.lineWidth=Math.max(1.2,fs*0.12);ctx.strokeStyle="#2b3038";bar();
  ctx.font=`600 ${fs}px system-ui,sans-serif`;ctx.textAlign="center";ctx.textBaseline="bottom";
  const label=dist.toLocaleString()+" "+unit, tx=(x0+x1)/2, ty=y-fs*0.75;
  ctx.lineWidth=Math.max(3,fs*0.4);ctx.strokeStyle="rgba(255,255,255,.92)";ctx.strokeText(label,tx,ty);
  ctx.fillStyle="#2b3038";ctx.fillText(label,tx,ty);
  ctx.restore();
}
// user-placed custom labels (device space; store screen boxes for on-screen hit-testing)
function drawCustomLabels(ctx,ox,oy,s,cw,ch,store){
  if(store)_customLabelRects={};
  ctx.textAlign="center";ctx.textBaseline="middle";
  for(const lb of world.labels){
    const fs=Math.max(9,(lb.size||38)*s), X=(lb.x-ox)*s, Y=(lb.y-oy)*s;
    if(X<-400||Y<-100||X>cw+400||Y>ch+100)continue;
    ctx.font=`italic 600 ${fs}px Georgia,"Times New Roman",serif`;
    ctx.lineWidth=Math.max(2,fs*0.2);ctx.strokeStyle="rgba(255,255,255,.88)";ctx.fillStyle=lb.color||"#2b3038";
    ctx.strokeText(lb.text,X,Y);ctx.fillText(lb.text,X,Y);
    if(store){const w=ctx.measureText(lb.text).width; _customLabelRects[lb.id]={x:X-w/2,y:Y-fs*0.6,w,h:fs*1.2};
      if(state.selLabel===lb.id){ctx.lineWidth=1.5;ctx.strokeStyle="#6f8fc9";ctx.setLineDash([4,3]);ctx.strokeRect(X-w/2-5,Y-fs*0.6-3,w+10,fs*1.2+6);ctx.setLineDash([]);}}
  }
}
// realm key locations: capital (gold star) + administrative centres (diamond)
function drawKeyLocations(ctx,ox,oy,s,cw,ch,sz){
  if(!world.realms.some(r=>r.capitalId||(r.adminCenters&&r.adminCenters.length)))return;
  const cen={}; for(const g of _provGeo)cen[g.p.id]=g;
  const star=(x,y,rad)=>{ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?rad*0.45:rad,px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();};
  ctx.lineJoin="round";
  world.realms.forEach(r=>{
    (r.adminCenters||[]).forEach(pid=>{const g=cen[pid];if(!g)return;const X=(g.cx-ox)*s,Y=(g.cy-oy)*s;if(X<-30||Y<-30||X>cw+30||Y>ch+30)return;
      const rad=sz*0.6, dia=()=>{ctx.beginPath();ctx.moveTo(X,Y-rad);ctx.lineTo(X+rad,Y);ctx.lineTo(X,Y+rad);ctx.lineTo(X-rad,Y);ctx.closePath();};
      dia();ctx.lineWidth=Math.max(2,sz*0.55);ctx.strokeStyle="rgba(255,255,255,.92)";ctx.stroke();
      dia();ctx.fillStyle="#eef2f7";ctx.fill();ctx.lineWidth=Math.max(1.2,sz*0.16);ctx.strokeStyle="#33415e";ctx.stroke();});
    if(r.capitalId&&cen[r.capitalId]){const g=cen[r.capitalId];const X=(g.cx-ox)*s,Y=(g.cy-oy)*s;if(X<-30||Y<-30||X>cw+30||Y>ch+30)return;
      star(X,Y,sz);ctx.lineWidth=Math.max(2,sz*0.55);ctx.strokeStyle="rgba(255,255,255,.92)";ctx.stroke();
      star(X,Y,sz);ctx.fillStyle="#f4c430";ctx.fill();ctx.lineWidth=Math.max(1.4,sz*0.18);ctx.strokeStyle="#6e5210";ctx.stroke();}
  });
}
// Wrap a set of words into lines that each fit maxW (measured in the current ctx.font).
function wrapToWidth(ctx,words,maxW){
  if(words.length<=1)return words.slice();
  const lines=[]; let cur=words[0];
  for(let i=1;i<words.length;i++){const t=cur+" "+words[i];
    if(ctx.measureText(t).width<=maxW)cur=t; else {lines.push(cur);cur=words[i];}}
  lines.push(cur); return lines;
}
// Draw a province name that flows with the province's shape: rotated to its
// principal axis (EU4-style), wrapped onto lines, and scaled to fit the box.
// boxLen = usable length along the text, boxThick = across it (device px).
const LABEL_FONT='"Segoe UI Semibold","Segoe UI",system-ui,Roboto,Arial,sans-serif';
function drawFittedLabel(ctx,name,cx,cy,angle,boxLen,boxThick,maxFs,perpShift){
  perpShift=perpShift||0;                            // nudge text off a capital/admin marker
  const boxW=boxLen*0.92, boxH=Math.max(9, boxThick*0.9 - Math.abs(perpShift)*1.6);
  const words=name.split(/\s+/).filter(Boolean); if(!words.length)return;
  let chosen=null;
  const hi=Math.max(9,Math.min(maxFs||16, boxH));
  for(let fs=hi; fs>=9; fs--){
    ctx.font=`600 ${fs}px ${LABEL_FONT}`;
    const lines=wrapToWidth(ctx,words,boxW);
    let wMax=0; for(const ln of lines) wMax=Math.max(wMax,ctx.measureText(ln).width);
    if(wMax<=boxW && lines.length*fs*1.05<=boxH){ chosen={fs,lines}; break; }
  }
  if(!chosen){ const fs=9; ctx.font=`600 ${fs}px ${LABEL_FONT}`; chosen={fs,lines:wrapToWidth(ctx,words,boxW)}; }
  ctx.save();
  ctx.translate(Math.round(cx),Math.round(cy));      // integer origin keeps glyphs sharp
  if(angle) ctx.rotate(angle);
  ctx.font=`600 ${chosen.fs}px ${LABEL_FONT}`;
  ctx.lineJoin="round"; ctx.miterLimit=2;
  const lh=chosen.fs*1.14, y0=-(chosen.lines.length-1)*lh/2 + perpShift;
  // one crisp white halo pass, then the dark text
  ctx.strokeStyle="rgba(255,255,255,.95)"; ctx.lineWidth=Math.max(2.5,chosen.fs*0.22);
  chosen.lines.forEach((ln,i)=>ctx.strokeText(ln,0,Math.round(y0+i*lh)));
  ctx.fillStyle="#1c212b";
  chosen.lines.forEach((ln,i)=>ctx.fillText(ln,0,Math.round(y0+i*lh)));
  ctx.restore();
}
// Fit a name into a province's box (WORLD units): returns {fs, lines} where fs is
// a world-space font size, so the label scales with the province as you zoom.
const _measCtx=document.createElement("canvas").getContext("2d");
function fitLabel(name, lenWorld, thickWorld){
  const words=(name||"").split(/\s+/).filter(Boolean); if(!words.length) return null;
  const boxW=lenWorld*0.9, boxH=thickWorld*0.86; if(boxW<=0||boxH<=0) return null;
  const c=_measCtx; c.font=`600 100px ${LABEL_FONT}`;
  const wRef=words.map(w=>c.measureText(w).width/100), spRef=c.measureText(" ").width/100, LH=1.14;
  const wrapAt=fs=>{ const lines=[]; let acc=[words[0]], w0=wRef[0]*fs;
    for(let i=1;i<words.length;i++){ const add=(spRef+wRef[i])*fs;
      if(w0+add<=boxW){ w0+=add; acc.push(words[i]); } else { lines.push({w:w0,t:acc.join(" ")}); acc=[words[i]]; w0=wRef[i]*fs; } }
    lines.push({w:w0,t:acc.join(" ")}); return lines; };
  const fits=fs=>{ const L=wrapAt(fs); let mw=0; for(const l of L)mw=Math.max(mw,l.w);
    return (mw<=boxW && L.length*fs*LH<=boxH) ? L.map(l=>l.t) : null; };
  let lo=0.5, hi=boxH, ok=null;
  for(let i=0;i<20;i++){ const mid=(lo+hi)/2, r=fits(mid); if(r){ ok={fs:mid,lines:r}; lo=mid; } else hi=mid; }
  return ok;
}
function drawProvinceWorldLabel(ctx, gl, perpShift){
  const L=gl.lbl; if(!L)return;
  ctx.save();
  ctx.translate(gl.cx, gl.cy);
  if(gl.ang) ctx.rotate(gl.ang);
  ctx.font=`600 ${L.fs}px ${LABEL_FONT}`;
  ctx.lineJoin="round"; ctx.miterLimit=2;
  const lh=L.fs*1.14, y0=-(L.lines.length-1)*lh/2 + (perpShift||0);
  ctx.lineWidth=L.fs*0.16; ctx.strokeStyle="rgba(255,255,255,.95)";
  L.lines.forEach((ln,i)=>ctx.strokeText(ln,0,y0+i*lh));
  ctx.fillStyle="#1c212b";
  L.lines.forEach((ln,i)=>ctx.fillText(ln,0,y0+i*lh));
  ctx.restore();
}
/* ---------- ping / annotation overlay ---------- */
function pingKey(){ return "sovereign_pings_"+((world&&world.name)?world.name:"world"); }
function savePings(){ try{ localStorage.setItem(pingKey(), JSON.stringify(pingLayer)); }catch(e){} }
function loadPings(){
  try{ const s=localStorage.getItem(pingKey()); pingLayer=s?JSON.parse(s):{strokes:[],pins:[]}; }catch(e){ pingLayer={strokes:[],pins:[]}; }
  if(!pingLayer||typeof pingLayer!=="object")pingLayer={strokes:[],pins:[]};
  pingLayer.strokes=pingLayer.strokes||[]; pingLayer.pins=pingLayer.pins||[];
}
function drawPingsWorld(ctx){
  if(!pingLayer.strokes.length)return;
  ctx.lineCap="round"; ctx.lineJoin="round"; ctx.globalAlpha=0.82;
  for(const st of pingLayer.strokes){ if(!st.pts||!st.pts.length)continue;
    ctx.beginPath(); ctx.moveTo(st.pts[0][0],st.pts[0][1]);
    for(let i=1;i<st.pts.length;i++)ctx.lineTo(st.pts[i][0],st.pts[i][1]);
    ctx.strokeStyle=st.color||"#e23b3b"; ctx.lineWidth=st.width||4; ctx.stroke();
  }
  ctx.globalAlpha=1;
}
function drawPingsDevice(ctx,cam,s,cw,ch){
  for(const pn of pingLayer.pins){
    const X=(pn.x-cam.x)*s, Y=(pn.y-cam.y)*s; if(X<-20||Y<-20||X>cw+20||Y>ch+20)continue;
    ctx.save(); ctx.fillStyle=pn.color||"#e23b3b"; ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.lineJoin="round";
    ctx.beginPath(); ctx.arc(X,Y-12,7,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X-5,Y-8); ctx.lineTo(X,Y); ctx.lineTo(X+5,Y-8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
function pingEraseAt(ev){
  const [wx,wy]=screenToWorld(ev); const r=(state.pingWidth*2+12)/state.cam.scale, r2=r*r;
  pingLayer.strokes=pingLayer.strokes.filter(st=>!(st.pts||[]).some(p=>{const dx=p[0]-wx,dy=p[1]-wy;return dx*dx+dy*dy<r2;}));
  pingLayer.pins=pingLayer.pins.filter(pn=>{const dx=pn.x-wx,dy=pn.y-wy;return dx*dx+dy*dy>r2;});
  requestRender();
}
function sharePings(){ downloadText((world.name||"world")+" pings.json", JSON.stringify(pingLayer)); flash("Saved your pings to a file — send it to your GM."); }
function loadPingsFile(){
  const inp=document.createElement("input"); inp.type="file"; inp.accept="application/json";
  inp.onchange=()=>{const f=inp.files[0]; if(!f)return; const rd=new FileReader();
    rd.onload=()=>{try{const d=JSON.parse(rd.result); pingLayer={strokes:d.strokes||[],pins:d.pins||[]}; savePings(); renderMap(); flash("Loaded pings.");}catch(e){alert("Invalid pings file.");}};
    rd.readAsText(f);};
  inp.click();
}
const PING_SWATCHES=["#e23b3b","#e8873b","#e8cf3b","#4fb050","#2fb9a8","#3b8fe8","#7a4fd0","#d94fb0","#2b2f38","#ffffff"];
function buildPingBar(){
  const bar=$("#pingBar"); if(!bar)return;
  bar.innerHTML=`
    <div class="pgrp">
      <button class="pbtn ptool" data-pt="brush" title="Brush — draw shapes">🖌</button>
      <button class="pbtn ptool" data-pt="pin" title="Drop a pin">📍</button>
      <button class="pbtn ptool" data-pt="erase" title="Erase pings">🧽</button>
      <button class="pbtn ptool" data-pt="pan" title="Pan the map (stop drawing)">✋</button>
    </div>
    <div class="pgrp">${PING_SWATCHES.map(c=>`<span class="psw" data-c="${c}" style="background:${c}"></span>`).join("")}
      <input type="color" id="pcolor" value="${toHex(state.pingColor)}" title="Custom colour"/></div>
    <div class="pgrp"><input type="range" id="pwidth" min="1" max="30" value="${state.pingWidth}" title="Brush size"/></div>
    <div class="pgrp">
      <button class="pbtn" id="pundo" title="Undo last">↶</button>
      <button class="pbtn" id="pclear" title="Clear all pings">🗑</button>
      <button class="pbtn" id="pshare" title="Save your pings to a file to share">⬇</button>
      <button class="pbtn" id="pload" title="Load a shared pings file">⬆</button>
    </div>`;
  bar.querySelectorAll(".ptool").forEach(b=>b.onclick=()=>{state.pingTool=b.dataset.pt;refreshPingBar();const m=$("#map");if(m)m.classList.toggle("pinging",state.pingOn&&state.pingTool!=="pan");});
  bar.querySelectorAll(".psw").forEach(sw=>sw.onclick=()=>{state.pingColor=sw.dataset.c;const pc=$("#pcolor");if(pc)pc.value=toHex(sw.dataset.c);refreshPingBar();});
  $("#pcolor").oninput=e=>{state.pingColor=e.target.value;refreshPingBar();};
  $("#pwidth").oninput=e=>{state.pingWidth=+e.target.value;};
  $("#pundo").onclick=()=>{ if(_curStroke)return; if(pingLayer.strokes.length)pingLayer.strokes.pop(); else if(pingLayer.pins.length)pingLayer.pins.pop(); savePings(); renderMap(); };
  $("#pclear").onclick=()=>{ if(confirm("Clear all pings on the map?")){pingLayer={strokes:[],pins:[]};savePings();renderMap();} };
  $("#pshare").onclick=sharePings;
  $("#pload").onclick=loadPingsFile;
  refreshPingBar();
}
function refreshPingBar(){
  const bar=$("#pingBar"); if(!bar)return;
  bar.querySelectorAll(".ptool").forEach(b=>b.classList.toggle("active",b.dataset.pt===state.pingTool));
  bar.querySelectorAll(".psw").forEach(sw=>sw.classList.toggle("active",(sw.dataset.c||"").toLowerCase()===(state.pingColor||"").toLowerCase()));
}
function togglePing(){
  state.pingOn=!state.pingOn;
  const b=$("#btnPing"); if(b)b.classList.toggle("on",state.pingOn);
  const bar=$("#pingBar"); if(bar)bar.classList.toggle("hidden",!state.pingOn);
  if(state.pingOn){ if(state.pingTool==="pan")state.pingTool="brush"; refreshPingBar(); flash("Ping mode on — draw to mark the map; ✋ to pan. Pings stay until the map is updated."); }
  else flash("Ping mode off.");
  const m=$("#map"); if(m)m.classList.toggle("pinging",state.pingOn && state.pingTool!=="pan");
  renderMap();
}
function ensureImg(href){
  if(_imgCache[href])return _imgCache[href];
  const im=new Image(); im.onload=()=>requestRender(); im.src=href; _imgCache[href]=im; return im;
}
function contentBounds(){
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  world.continents.forEach(c=>{const b=contBoxC(c.id);minx=Math.min(minx,b.x);miny=Math.min(miny,b.y);maxx=Math.max(maxx,b.x+b.w);maxy=Math.max(maxy,b.y+b.h);});
  if(!isFinite(minx))return {x:0,y:0,w:WORLD_W,h:WORLD_H};
  return {x:minx,y:miny,w:maxx-minx,h:maxy-miny};
}
function roundRect(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function pointInPoly(pts,x,y){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const xi=pts[i][0],yi=pts[i][1],xj=pts[j][0],yj=pts[j][1];if(((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-9)+xi))inside=!inside;}return inside;}
function provinceAt(wx,wy){for(let i=_provGeo.length-1;i>=0;i--){const g=_provGeo[i];if(wx<g.minx||wx>g.maxx||wy<g.miny||wy>g.maxy)continue;if(pointInPoly(g.pts,wx,wy))return g.p;}return null;}
function continentAt(wx,wy){for(let i=world.continents.length-1;i>=0;i--){const c=world.continents[i];const b=contBoxC(c.id);if(wx>=b.x&&wx<=b.x+b.w&&wy>=b.y&&wy<=b.y+b.h)return c;}return null;}
function makeStars(){const b=contentBounds();const pad=Math.max(b.w,b.h)*0.4;_stars=[];for(let i=0;i<240;i++)_stars.push([b.x-pad+Math.random()*(b.w+2*pad),b.y-pad+Math.random()*(b.h+2*pad),Math.random()*1.8+0.4,Math.random()*0.5+0.12]);}

function drawFrame(){
  _renderQueued=false;
  if(_geoDirty){rebuildGeo();_geoDirty=false;}
  if(!_stars)makeStars();
  const cv=$("#map"); if(!cv)return; const ctx=cv.getContext("2d");
  const dpr=window.devicePixelRatio||1;
  const cw=cv.clientWidth||800, ch=cv.clientHeight||600;
  if(cv.width!==Math.round(cw*dpr)||cv.height!==Math.round(ch*dpr)){cv.width=Math.round(cw*dpr);cv.height=Math.round(ch*dpr);}
  const cam=state.cam, s=cam.scale;

  // background sea (device space, light theme)
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const g=ctx.createRadialGradient(cw*0.5,ch*0.35,0,cw*0.5,ch*0.35,Math.max(cw,ch)*0.9);
  g.addColorStop(0,"#eaf3fa");g.addColorStop(0.55,"#dbe9f2");g.addColorStop(1,"#cfe0ee");
  ctx.fillStyle=g;ctx.fillRect(0,0,cw,ch);

  // world transform
  ctx.setTransform(s*dpr,0,0,s*dpr,-cam.x*s*dpr,-cam.y*s*dpr);

  // continent landmasses — silhouette of the actual provinces, with a drop shadow
  world.continents.forEach(c=>{
    let lc=_landCache[c.id]; if(lc===undefined)lc=_landCache[c.id]=buildLandCanvas(c.id);
    if(lc){
      ctx.save(); ctx.globalAlpha=0.22; ctx.filter="brightness(0)";       // soft shadow
      ctx.drawImage(lc.canvas, lc.x+10/s, lc.y+16/s, lc.w, lc.h);
      ctx.restore();
      ctx.drawImage(lc.canvas, lc.x, lc.y, lc.w, lc.h);                   // land
    }
    if(c.bg&&c.bg.href){const im=ensureImg(c.bg.href);if(im.complete&&im.naturalWidth){ctx.globalAlpha=c.bg.opacity??0.6;ctx.drawImage(im,c.ox,c.oy,(c.bg.w||600)*(c.bg.scale||1),(c.bg.h||400)*(c.bg.scale||1));ctx.globalAlpha=1;}}
  });

  // provinces (fills, plus borders when zoomed in enough to matter)
  const drawStroke=s>0.12;
  if(drawStroke){ctx.lineWidth=1/s;ctx.strokeStyle="rgba(90,98,112,.45)";}
  for(const gp of _provGeo){
    const pts=gp.pts; if(!pts.length)continue;
    ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]); ctx.closePath();
    ctx.fillStyle=provinceFill(gp.p); ctx.fill();
    if(drawStroke)ctx.stroke();
  }

  // lakes & rivers on top of land
  drawWater(ctx,s);

  // realm-border overlay on non-political modes, so borders stay readable
  if(state.mapmode!=="political") drawRealmBorders(ctx);
  // terrain-region outline overlay — resource-painting aid (toggle)
  if(state.mapmode==="resource" && state.terrainOverlay) drawTerrainBorders(ctx);

  // player ping/annotation strokes (world space, over the map)
  drawPingsWorld(ctx);

  // selected province highlight
  if(state.selProvince){const gs=_provGeo.find(g=>g.p.id===state.selProvince);if(gs){const pts=gs.pts;ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.lineWidth=2.5/s;ctx.strokeStyle="#24364f";ctx.stroke();}}

  // draft polygon being drawn (+ rubber-band preview to the snapped cursor)
  if(state.draft&&state.focusedContinent){const c=world.continents.find(x=>x.id===state.focusedContinent);if(c){
    if(state.draft.length>1){ctx.lineWidth=1.5/s;ctx.strokeStyle="#6ea8ff";ctx.beginPath();ctx.moveTo(c.ox+state.draft[0][0],c.oy+state.draft[0][1]);for(let i=1;i<state.draft.length;i++)ctx.lineTo(c.ox+state.draft[i][0],c.oy+state.draft[i][1]);ctx.stroke();}
    if(state.drawCursor&&state.draft.length){const last=state.draft[state.draft.length-1];ctx.setLineDash([5/s,4/s]);ctx.lineWidth=1.2/s;ctx.strokeStyle="#6ea8ff";ctx.beginPath();ctx.moveTo(c.ox+last[0],c.oy+last[1]);ctx.lineTo(state.drawCursor.x,state.drawCursor.y);ctx.stroke();ctx.setLineDash([]);}
    ctx.fillStyle="#6ea8ff";state.draft.forEach(pt=>{ctx.beginPath();ctx.arc(c.ox+pt[0],c.oy+pt[1],4/s,0,7);ctx.fill();});}}
  // draw cursor + snap indicator (Draw tool)
  if(state.tool==="draw"&&state.drawCursor){ctx.beginPath();ctx.arc(state.drawCursor.x,state.drawCursor.y,(state.drawCursor.snapped?6:3.5)/s,0,7);ctx.fillStyle=state.drawCursor.snapped?"#e0b24e":"#6ea8ff";ctx.fill();if(state.drawCursor.snapped){ctx.lineWidth=1.5/s;ctx.strokeStyle="#a9791f";ctx.stroke();}}
  // vertex handles (Nodes tool, selected province)
  if(state.tool==="nodes"&&state.selProvince){const sp=world.provinces.find(x=>x.id===state.selProvince);const c=sp&&world.continents.find(cc=>cc.id===sp.continentId);if(sp&&c){ctx.fillStyle="#fff";ctx.strokeStyle="#24364f";ctx.lineWidth=1.5/s;for(const pt of sp.points){ctx.beginPath();ctx.arc(c.ox+pt[0],c.oy+pt[1],5/s,0,7);ctx.fill();ctx.stroke();}}}
  // split cut line preview
  if(state.split){const a=state.split.pts[0],b=(state.split.pts.length>1?state.split.pts[1]:state.split.cur);ctx.setLineDash([6/s,4/s]);ctx.lineWidth=1.6/s;ctx.strokeStyle="#d8746c";if(a&&b){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}ctx.setLineDash([]);ctx.fillStyle="#d8746c";state.split.pts.forEach(pt=>{ctx.beginPath();ctx.arc(pt[0],pt[1],4/s,0,7);ctx.fill();});}

  // labels (drawn in device space so text stays a constant size)
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.textAlign="center"; ctx.textBaseline="middle";

  // Two zoom levels with a short crossfade so the handoff isn't jarring:
  // zoomed out → realm / region names; zoomed in → province names.
  const KEY_SZ=6;                          // capital/admin marker size (small, fixed)
  const PROV_CAP=16;                       // max province-name font (px) — keeps them uniform
  const nameZoom = 58/_medProvW;           // lower = province names appear earlier when zooming in
  const band = nameZoom*0.3;               // fade width around the threshold
  const provAlpha = clamp01((s-(nameZoom-band))/(2*band));
  const regionAlpha = 1-provAlpha;

  if(_labelsDirty || _labelMode!==state.mapmode){ _labelGroups=computeLabelGroups(state.mapmode); _labelMode=state.mapmode; _labelsDirty=false; }

  // realm / region names — fade out as we zoom in
  if(regionAlpha>0.02){
    ctx.globalAlpha=regionAlpha;
    for(const lg of _labelGroups){
      let fontPx=Math.sqrt(lg.a)*0.20*s; if(fontPx<9) continue; fontPx=Math.min(fontPx,180);
      const X=(lg.x-cam.x)*s, Y=(lg.y-cam.y)*s;
      if(X<-260||Y<-100||X>cw+260||Y>ch+100) continue;
      const txt=(lg.text||"").toUpperCase(); if(!txt)continue;
      ctx.font=`600 ${fontPx}px Georgia,"Times New Roman",serif`;
      const maxW=lg.axisLen*s, straight=ctx.measureText(txt).width+fontPx*0.16*(txt.length-1);
      if(straight>maxW && maxW>16) fontPx*=maxW/straight;
      if(fontPx<9) continue;
      ctx.lineWidth=Math.max(2,fontPx*0.16); ctx.strokeStyle="rgba(255,255,255,.85)"; ctx.fillStyle="#22262e";
      drawArcText(ctx,txt,X,Y,fontPx,fontPx*0.16,0.18,lg.angle);
    }
    ctx.globalAlpha=1;
  }

  // province names — fade in as we zoom in; a capped, near-uniform screen size,
  // fitted (wrap / rotate) to each province so they stay within the borders.
  if(provAlpha>0.02){
    ctx.globalAlpha=provAlpha;
    for(const gl of _provGeo){
      const wpx=(gl.maxx-gl.minx)*s, hpx=(gl.maxy-gl.miny)*s;
      if(Math.max(wpx,hpx)<24) continue;
      const sx=(gl.cx-cam.x)*s, sy=(gl.cy-cam.y)*s; if(sx<-60||sy<-40||sx>cw+60||sy>ch+40)continue;
      drawFittedLabel(ctx,gl.p.name,sx,sy,gl.ang,gl.len*s,gl.thick*s,PROV_CAP, _keyLocMap[gl.p.id]?KEY_SZ*1.8:0);
    }
    // capital & admin markers — small fixed size, appearing with the province names
    drawKeyLocations(ctx, cam.x, cam.y, s, cw, ch, KEY_SZ);
    ctx.globalAlpha=1;
  }

  // landmass names (toggleable, draggable, hidden for small landmasses)
  _contLabelRects={};
  if(state.showNames){
    ctx.font="600 13px system-ui,sans-serif";
    world.continents.forEach(c=>{
      if((_contProvCount[c.id]||0)<30) return;           // hide names on small landmasses
      const b=contBoxC(c.id);
      const lx=c.labelPos?c.labelPos[0]:b.x+b.w/2, ly=c.labelPos?c.labelPos[1]:b.y-14;
      const sx=(lx-cam.x)*s, sy=(ly-cam.y)*s;
      if(sx<-200||sx>cw+200||sy<-30||sy>ch+30) return;
      ctx.lineWidth=3.5;ctx.strokeStyle="rgba(255,255,255,.9)";ctx.fillStyle="#46506a";
      ctx.strokeText(c.name,sx,sy);ctx.fillText(c.name,sx,sy);
      const w=ctx.measureText(c.name).width; _contLabelRects[c.id]={x:sx-w/2,y:sy-9,w,h:18};
    });
  }

  // custom labels
  drawCustomLabels(ctx, cam.x, cam.y, s, cw, ch, true);
  // ping pins (device space, constant size)
  drawPingsDevice(ctx, cam, s, cw, ch);

  // distance scale bar, bottom-right
  drawScaleBar(ctx, s/distPerWorldUnit(), cw-16, ch-62, 12, unitLabel());   // sits above the map-mode bar

  // export region selection box (device space)
  if(state.regionSel&&state.regionSel.active&&state.regionSel.start&&state.regionSel.cur){
    const a=state.regionSel.start,b2=state.regionSel.cur;
    const x=Math.min(a[0],b2[0]),y=Math.min(a[1],b2[1]),wd=Math.abs(b2[0]-a[0]),ht=Math.abs(b2[1]-a[1]);
    ctx.fillStyle="rgba(111,143,201,.15)";ctx.fillRect(x,y,wd,ht);
    ctx.setLineDash([6,4]);ctx.lineWidth=1.5;ctx.strokeStyle="#3f5e8c";ctx.strokeRect(x,y,wd,ht);ctx.setLineDash([]);
  }
}

// resolve a category entry's colour: custom override if set, else the default
function catColor(key,name){
  if(!name)return "#39415e";
  const cm=world.colors&&world.colors[key]; if(cm&&cm[name])return cm[name];
  if(key==="terrains")return TERRAIN_COLORS[name]||hashColor(name);
  if(key==="settlements")return SETTLE_COLORS[name]||"#39415e";
  return listColor(world.lists[key]||[],name);
}
const _hexcx=document.createElement("canvas").getContext("2d");
function toHex(c){_hexcx.fillStyle="#000";_hexcx.fillStyle=c;const v=_hexcx.fillStyle;if(v[0]==="#")return v;const m=v.match(/\d+/g);return m?"#"+[m[0],m[1],m[2]].map(x=>(+x).toString(16).padStart(2,"0")).join(""):"#888888";}
// Population heatmap: dark red = none, red = low, green = high, light blue = very
// high. Anchored to absolute population decades so colours stay consistent over time.
const POP_ANCHORS=[[0,[124,30,30]],[3,[214,58,58]],[3.5,[236,172,58]],[4,[86,190,96]],[5,[150,205,235]]]; // (log10(pop), rgb)
function popColor(pop){
  pop=pop||0;
  if(pop<=0) return "#5c1010";                      // no population -> darkest red
  let lp=Math.log10(pop); if(lp<0)lp=0; if(lp>5)lp=5;   // 1k=3, 10k=4, 100k+=5
  let c=POP_ANCHORS[POP_ANCHORS.length-1][1];
  for(let i=0;i<POP_ANCHORS.length-1;i++){const l0=POP_ANCHORS[i][0],l1=POP_ANCHORS[i+1][0];
    if(lp>=l0&&lp<=l1){const u=(lp-l0)/((l1-l0)||1),a=POP_ANCHORS[i][1],b=POP_ANCHORS[i+1][1];
      c=[Math.round(a[0]+(b[0]-a[0])*u),Math.round(a[1]+(b[1]-a[1])*u),Math.round(a[2]+(b[2]-a[2])*u)];break;}}
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function provinceFill(p){
  switch(state.mapmode){
    case "political":{const r=world.realms.find(r=>r.id===p.realmId);return r?r.color:"#39415e";}
    case "terrain":return catColor("terrains",p.terrain);
    case "settlement":return catColor("settlements",p.settlement);
    case "religion":return colorByAxis(p.religion,"religions");
    case "culture":return colorByAxis(p.culture,"cultures");
    case "race":return colorByAxis(p.race,"races");
    case "language":return colorByAxis(p.language,"languages");
    case "population":return popColor(p.population);
    case "tolerance":return ramp((p.tolerance??50)/100);
    case "resource":return catColor("resources",p.resource);
    case "imported":return p.importColor||"#39415e";
    default:return "#39415e";
  }
}
function colorByAxis(arr,key){const d=dominant(arr);return d?catColor(key,d):"#39415e";}

/* ============================================================
   AUTOMATIC HISTORY TRACKER
   Logs a dated entry whenever a tracked, map-mode attribute changes.
   ============================================================ */
const FIELD_TITLES={realm:"Ownership",terrain:"Terrain",settlement:"Settlement",resource:"Resource",religion:"Religion",culture:"Culture",race:"Race",language:"Language"};
function provTrackedValue(p,field){
  if(field==="realm")return p.realmId?(world.realms.find(r=>r.id===p.realmId)?.name||"Unknown realm"):"Unclaimed";
  if(field==="terrain")return p.terrain||"—";
  if(field==="settlement")return p.settlement||"—";
  if(field==="resource")return p.resource||"—";
  if(field==="religion"||field==="culture"||field==="race"||field==="language")return dominant(p[field])||"—";
  return "";
}
function autoLog(p,field,oldVal){
  const nv=provTrackedValue(p,field);
  if(nv===oldVal)return;
  p.history.push({eraId:world.currentEraId,title:(FIELD_TITLES[field]||"Change")+" change",text:oldVal+" → "+nv,auto:true});
}

/* ============================================================
   UNDO / REDO  (snapshot before each map operation)
   ============================================================ */
function beginEdit(){ if(VIEWER)return; try{_undo.push(JSON.stringify(world));}catch(e){return;} if(_undo.length>30)_undo.shift(); _redo.length=0; }
function restoreSnapshot(json){
  world=normalize(JSON.parse(json));
  state.selProvince=null; state.draft=null; _labelsDirty=true;
  rebuildGeo(); renderMap(); renderLeft();
  $("#inspector").innerHTML='<div class="empty">Select a province, realm, or continent to edit.</div>';
  markDirty();
}
function doUndo(){ if(!_undo.length){flash("Nothing to undo.");return;} _redo.push(JSON.stringify(world)); restoreSnapshot(_undo.pop()); flash("Undo"); }
function doRedo(){ if(!_redo.length){flash("Nothing to redo.");return;} _undo.push(JSON.stringify(world)); restoreSnapshot(_redo.pop()); flash("Redo"); }

/* ============================================================
   SPLIT & MERGE province geometry
   ============================================================ */
function eqPt(a,b){return Math.abs(a[0]-b[0])<0.5 && Math.abs(a[1]-b[1])<0.5;}
// split a simple polygon (world coords) by the infinite line through A,B → two polygons
function splitPolygonByLine(poly,A,B){
  const dx=B[0]-A[0], dy=B[1]-A[1];
  const side=p=>(p[0]-A[0])*dy-(p[1]-A[1])*dx;       // signed distance
  const out1=[],out2=[]; const n=poly.length;
  for(let i=0;i<n;i++){
    const cur=poly[i], nxt=poly[(i+1)%n];
    const s1=side(cur), s2=side(nxt);
    (s1>=0?out1:out2).push(cur);
    if((s1>0&&s2<0)||(s1<0&&s2>0)){                  // edge crosses the line
      const t=s1/(s1-s2);
      const ix=[cur[0]+(nxt[0]-cur[0])*t, cur[1]+(nxt[1]-cur[1])*t];
      out1.push(ix); out2.push(ix);
    }
  }
  if(out1.length<3||out2.length<3)return null;
  return [out1,out2];
}
// merge two polygons (world coords) that share an edge → one polygon, else null
function mergeAdjacentPolys(A,B){
  const n=A.length,m=B.length;
  for(let i=0;i<n;i++)for(let j=0;j<m;j++){
    if(eqPt(A[i],B[j]) && eqPt(A[(i+1)%n],B[(j-1+m)%m])){   // shared edge A[i]->A[i+1] == B[j]->B[j-1]
      const out=[A[i].slice()];
      let k=(j+1)%m; while(true){out.push(B[k].slice()); if(k===(j-1+m)%m)break; k=(k+1)%m;}
      k=(i+2)%n; while(k!==i){out.push(A[k].slice()); k=(k+1)%n;}
      return out;
    }
  }
  return null;
}
// ---- water features (rivers/lakes) selection + editing ----
function waterAt(wx,wy){
  for(let i=world.lakes.length-1;i>=0;i--){const lk=world.lakes[i];const c=world.continents.find(cc=>cc.id===lk.continentId)||{ox:0,oy:0};
    const poly=lk.points.map(([x,y])=>[c.ox+x,c.oy+y]); if(poly.length>=3&&pointInPoly(poly,wx,wy))return {type:"lake",id:lk.id};}
  for(let i=world.rivers.length-1;i>=0;i--){const rv=world.rivers[i];const c=world.continents.find(cc=>cc.id===rv.continentId)||{ox:0,oy:0};
    const thr=(rv.width||6)/2+8/state.cam.scale, pts=rv.points;
    for(let k=0;k<pts.length-1;k++){const ax=c.ox+pts[k][0],ay=c.oy+pts[k][1],bx=c.ox+pts[k+1][0],by=c.oy+pts[k+1][1];
      const dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy||1;let t=((wx-ax)*dx+(wy-ay)*dy)/L2;t=Math.max(0,Math.min(1,t));
      if((ax+dx*t-wx)**2+(ay+dy*t-wy)**2 < thr*thr)return {type:"river",id:rv.id};}}
  return null;
}
function selectWater(type,id){state.selWater={type,id};state.selProvince=null;state.selRealm=null;renderMap();renderWaterEditor();}
function renderWaterEditor(){
  const ins=$("#inspector"),w=state.selWater; if(!w)return;
  const arr=w.type==="lake"?world.lakes:world.rivers, obj=arr.find(x=>x.id===w.id);
  if(!obj){ins.innerHTML='<div class="empty">Not found.</div>';return;}
  ins.innerHTML=`<div class="insTitle"><input id="wname" value="${esc(obj.name||"")}" placeholder="${w.type==="lake"?"Lake name":"River name"}"/></div>
    <div class="note">${w.type==="lake"?"Lake (water polygon)":"River (water line)"}</div>
    ${w.type==="river"?`<div class="field"><label>Width — <b id="wwv">${obj.width||6}</b></label><input id="wwidth" type="range" min="2" max="40" value="${obj.width||6}"/></div>`:""}
    <div class="btnrow"><button class="btn danger" id="wdel">Delete ${w.type}</button></div>`;
  $("#wname").addEventListener("input",e=>{obj.name=e.target.value;markDirty();renderMap();});
  if($("#wwidth"))$("#wwidth").addEventListener("input",e=>{obj.width=+e.target.value;$("#wwv").textContent=e.target.value;renderMap();markDirty();});
  $("#wdel").addEventListener("click",()=>{beginEdit();const a=w.type==="lake"?world.lakes:world.rivers,idx=a.findIndex(x=>x.id===w.id);if(idx>=0)a.splice(idx,1);state.selWater=null;_geoDirty=true;renderMap();ins.innerHTML='<div class="empty">Deleted.</div>';markDirty();});
}
function drawWater(ctx,s){
  for(const lk of world.lakes){const c=world.continents.find(cc=>cc.id===lk.continentId);if(!c||lk.points.length<3)continue;
    ctx.beginPath();ctx.moveTo(c.ox+lk.points[0][0],c.oy+lk.points[0][1]);for(let i=1;i<lk.points.length;i++)ctx.lineTo(c.ox+lk.points[i][0],c.oy+lk.points[i][1]);ctx.closePath();
    ctx.fillStyle="#3f78b8";ctx.fill();
    const selL=state.selWater&&state.selWater.type==="lake"&&state.selWater.id===lk.id;
    ctx.lineWidth=(selL?2.5:1.2)/s;ctx.strokeStyle=selL?"#8fc0ff":"#2c5788";ctx.stroke();}
  ctx.lineCap="round";ctx.lineJoin="round";
  for(const rv of world.rivers){const c=world.continents.find(cc=>cc.id===rv.continentId);if(!c||rv.points.length<2)continue;
    ctx.beginPath();ctx.moveTo(c.ox+rv.points[0][0],c.oy+rv.points[0][1]);for(let i=1;i<rv.points.length;i++)ctx.lineTo(c.ox+rv.points[i][0],c.oy+rv.points[i][1]);
    const selR=state.selWater&&state.selWater.type==="river"&&state.selWater.id===rv.id;
    ctx.lineWidth=Math.max(rv.width||6,0.8/s);ctx.strokeStyle=selR?"#8fc0ff":"#3f78b8";ctx.stroke();}
  ctx.lineCap="butt";
}
// ---- Conform: pull provinces to fit a painted shape (concave-safe) ----
function nearestOnSeg(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy||1;let t=((px-ax)*dx+(py-ay)*dy)/L2;t=Math.max(0,Math.min(1,t));return [ax+dx*t,ay+dy*t];}
function nearestOnPoly(px,py,poly){let best=[px,py],bd=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];const q=nearestOnSeg(px,py,a[0],a[1],b[0],b[1]);const d=(q[0]-px)**2+(q[1]-py)**2;if(d<bd){bd=d;best=q;}}return best;}
function conformToShape(localShape){
  const c=world.continents.find(x=>x.id===state.focusedContinent);
  if(!c||!localShape||localShape.length<3){state.draft=null;state.drawCursor=null;renderMap();return;}
  const shape=localShape.map(([x,y])=>[c.ox+x,c.oy+y]);   // world-space clip shape
  beginEdit();
  let changed=0;
  for(const p of world.provinces){
    if(p.continentId!==c.id)continue;
    let anyIn=false, moved=false;
    const np=p.points.map(([lx,ly])=>{
      const wx=c.ox+lx, wy=c.oy+ly;
      if(pointInPoly(shape,wx,wy)){ anyIn=true; return [lx,ly]; }
      const q=nearestOnPoly(wx,wy,shape); moved=true;
      return [Math.round(q[0]-c.ox),Math.round(q[1]-c.oy)];
    });
    if(anyIn && moved){ p.points=np; changed++; }   // straddling the shape -> pull outside corners in
    // fully inside (already conform) or fully outside (untouched) are left alone
  }
  state.draft=null;state.drawCursor=null;setTool("select");_geoDirty=true;renderMap();renderLeft();markDirty();
  flash(`Conformed ${changed} provinces to the painted shape.`);
}
function provincesShareVertex(a,b){
  const ca=world.continents.find(c=>c.id===a.continentId)||{ox:0,oy:0};
  const cb=world.continents.find(c=>c.id===b.continentId)||{ox:0,oy:0};
  for(const pa of a.points)for(const pb of b.points){
    if(Math.abs((ca.ox+pa[0])-(cb.ox+pb[0]))<0.5 && Math.abs((ca.oy+pa[1])-(cb.oy+pb[1]))<0.5)return true;
  }
  return false;
}

/* ============================================================
   SELECTION + CLICK BEHAVIOR
   ============================================================ */
// ---- mode-aware painting ----
function setPaintTarget(value,label){
  if(state.mapmode==="political"){
    state.paintUnclaim=(value==="__none__");
    state.selRealm=state.paintUnclaim?null:value;
    if(!state.paintUnclaim)renderRealmEditor();
  } else {
    state.paintValue=value;
  }
  setTool("paint"); renderLeft();
  flash("Painting "+(MODE_TITLES[state.mapmode]||state.mapmode)+": "+label);
}
function paintReady(){
  const m=state.mapmode;
  if(m==="political")return !!state.selRealm || state.paintUnclaim;
  return PAINTABLE_MODES.includes(m) && state.paintValue!=null && state.paintValue!=="";
}
function paintHint(){
  if(state.mapmode==="political")return "Pick a realm (left list) or a legend entry to paint with.";
  if(PAINTABLE_MODES.includes(state.mapmode))return "Click a legend entry (bottom-left) to choose what to paint.";
  return "Painting isn't available in this map mode.";
}
function joinRealmDefaults(p, realmId){
  // When an uninhabited province joins a realm, seed it as a Village and adopt
  // the nation's religion/culture/language. Population is left for Distribute.
  if(!realmId) return false;
  if(p.settlement && p.settlement!=="Uninhabited") return false;
  const r=world.realms.find(x=>x.id===realmId); if(!r) return false;
  let ch=false;
  if(world.lists.settlements.includes("Village") && p.settlement!=="Village"){const o=provTrackedValue(p,"settlement");p.settlement="Village";autoLog(p,"settlement",o);ch=true;}
  // seed a latent identity pop group so, once populated, it takes the nation's identity
  const cur=(p.pops||[]).reduce((a,q)=>a+(q.size||0),0);
  if(cur<=0){
    const oR=provTrackedValue(p,"religion"),oC=provTrackedValue(p,"culture"),oL=provTrackedValue(p,"language");
    p.pops=[newPop(0,r.stateReligion,r.dominantCulture,r.dominantRace,r.dominantLanguage)];
    deriveProvince(p);
    autoLog(p,"religion",oR);autoLog(p,"culture",oC);autoLog(p,"language",oL);
    ch=true;
  }
  return ch;
}
function paintProvince(p){   // returns true if it changed something (and auto-logs it)
  const m=state.mapmode;
  const fieldMap={political:"realm",terrain:"terrain",settlement:"settlement",resource:"resource",religion:"religion",culture:"culture",race:"race",language:"language"};
  const field=fieldMap[m]; if(!field)return false;
  const old=provTrackedValue(p,field); let changed=false;
  if(m==="political"){const v=state.paintUnclaim?null:state.selRealm; if(p.realmId!==v){p.realmId=v;changed=true; if(v)joinRealmDefaults(p,v);}}
  else{ const v=state.paintValue; if(v==null||v==="")return false;
    if(m==="terrain"){if(p.terrain!==v){p.terrain=v;changed=true;}}
    else if(m==="settlement"){if(p.settlement!==v){p.settlement=v;changed=true;}}
    else if(m==="resource"){if(p.resource!==v){p.resource=v;changed=true;}}
    else{ // religion/culture/race/language — convert every pop group in the province
      if(!(p.pops&&p.pops.length))return false;   // no people here to convert
      let any=false; p.pops.forEach(q=>{if(q[m]!==v){q[m]=v;any=true;}});
      if(any){deriveProvince(p);changed=true;}
    }
  }
  if(changed)autoLog(p,field,old);
  return changed;
}
function onProvinceClick(p){
  if(state.tool==="paint"){
    if(!paintReady()){flash(paintHint());return;}
    if(paintProvince(p)){ _labelsDirty=true; renderMap(); renderLeft(); markDirty(); }
    return;
  }
  selectProvince(p.id);
}
function selectProvince(id){
  state.selProvince=id;state.selRealm=null;state.selWater=null;state.selLabel=null;
  const p=world.provinces.find(p=>p.id===id);
  if(p) state.focusedContinent=p.continentId;
  renderMap();renderLeft();renderProvinceEditor();
}
function selectRealm(id){
  state.selRealm=id;state.selProvince=null;state.selWater=null;state.selLabel=null;state.paintUnclaim=false;
  renderLeft();renderRealmEditor();
}
function selectContinent(id){
  state.focusedContinent=id;state.selProvince=null;state.selRealm=null;state.selWater=null;state.selLabel=null;
  renderMap();renderLeft();renderContinentEditor();
}
function selectCustomLabel(id){
  state.selLabel=id;state.selProvince=null;state.selRealm=null;state.selWater=null;
  renderMap();renderLabelEditor();
}
function renderLabelEditor(){
  const ins=$("#inspector"),lb=world.labels.find(x=>x.id===state.selLabel);
  if(!lb){ins.innerHTML='<div class="empty">Label not found.</div>';return;}
  ins.innerHTML=`<div class="insTitle"><input id="lbtext" value="${esc(lb.text)}" placeholder="Label text"/></div>
    <div class="note">Custom map label — drag it on the map to reposition.</div>
    <div class="field"><label>Size — <b id="lbsv">${lb.size||38}</b></label><input id="lbsize" type="range" min="8" max="200" value="${lb.size||38}"/></div>
    <div class="field"><label>Colour</label><input id="lbcolor" type="color" value="${toHex(lb.color||'#2b3038')}" style="width:48px;height:32px;padding:2px"/></div>
    <div class="btnrow"><button class="btn danger" id="lbdel">Delete label</button></div>`;
  $("#lbtext").addEventListener("input",e=>{lb.text=e.target.value;renderMap();markDirty();});
  $("#lbsize").addEventListener("input",e=>{lb.size=+e.target.value;$("#lbsv").textContent=e.target.value;renderMap();markDirty();});
  $("#lbcolor").addEventListener("input",e=>{lb.color=e.target.value;renderMap();markDirty();});
  $("#lbdel").addEventListener("click",()=>{beginEdit();world.labels=world.labels.filter(x=>x.id!==lb.id);state.selLabel=null;renderMap();ins.innerHTML='<div class="empty">Label deleted.</div>';markDirty();});
}

/* ============================================================
   LEFT PANELS
   ============================================================ */
function renderLeft(){
  updateWorldPop();
  // continents
  const cl=$("#continentList");cl.innerHTML="";
  world.continents.forEach(c=>{
    const n=world.provinces.filter(p=>p.continentId===c.id).length;
    const row=div("row"+(state.focusedContinent===c.id&&!state.selProvince&&!state.selRealm?" sel":""));
    row.innerHTML=`<span class="swatch" style="background:#2a3350"></span><span class="name">${esc(c.name)}</span><span class="sub">${n}</span>`;
    row.onclick=()=>{focusContinent(c.id);selectContinent(c.id);};
    cl.appendChild(row);
  });
  // realms (counts cached in one pass; filtered by search)
  const rl=$("#realmList");rl.innerHTML="";
  const counts={}; world.provinces.forEach(p=>{if(p.realmId)counts[p.realmId]=(counts[p.realmId]||0)+1;});
  const q=($("#realmSearch")?.value||"").toLowerCase().trim();
  let shown=0;
  world.realms.forEach(r=>{
    if(q && !r.name.toLowerCase().includes(q))return;
    shown++;
    const row=div("row"+(state.selRealm===r.id?" sel":""));
    row.innerHTML=`<span class="swatch" style="background:${r.color}"></span><span class="name">${esc(r.name)}</span><span class="sub">${counts[r.id]||0}</span>`;
    row.onclick=()=>selectRealm(r.id);
    rl.appendChild(row);
  });
  if(!world.realms.length){rl.innerHTML='<div class="note" style="padding:8px 10px">No realms yet. Click <b>＋ New</b> to create one and start painting provinces into it.</div>';}
  else if(!shown){rl.innerHTML='<div class="note" style="padding:8px 10px">No realms match your search.</div>';}
  renderLegend();
}
const MODE_TITLES={political:"Realms",provincemap:"Province Map",terrain:"Terrain",settlement:"Settlements",religion:"Religion",culture:"Culture",race:"Race",language:"Language",population:"Population",resource:"Resource",imported:"Imported colors"};
function legendEntries(mode){           // [color, label, paintValue]
  const L=world.lists, e=[];
  if(mode==="political"){e.push(["#39415e","Unclaimed","__none__"]);world.realms.forEach(r=>e.push([r.color,r.name,r.id]));}
  else if(mode==="terrain")L.terrains.forEach(t=>e.push([catColor("terrains",t),t,t]));
  else if(mode==="settlement")L.settlements.forEach(s=>e.push([catColor("settlements",s),s,s]));
  else if(mode==="religion")L.religions.forEach(x=>e.push([catColor("religions",x),x,x]));
  else if(mode==="culture")L.cultures.forEach(x=>e.push([catColor("cultures",x),x,x]));
  else if(mode==="race")L.races.forEach(x=>e.push([catColor("races",x),x,x]));
  else if(mode==="language")L.languages.forEach(x=>e.push([catColor("languages",x),x,x]));
  else if(mode==="resource")L.resources.forEach(x=>e.push([catColor("resources",x),x,x]));
  else if(mode==="population"){[[0,"Uninhabited"],[1000,"~1,000"],[5000,"~5,000"],[10000,"~10,000 (high)"],[50000,"~50,000"],[150000,"100,000+ (metropolis)"]].forEach(([v,l])=>e.push([popColor(v),l]));}
  return e;
}
const PAINTABLE_MODES=["political","terrain","settlement","religion","culture","race","language","resource"];
function renderLegend(){
  refreshMapmodeBar();
  const box=$("#legend");box.innerHTML="";
  if(state.mapmode==="imported"){box.innerHTML='<div class="note">Original imported province colors.</div>';return;}
  const paintable=PAINTABLE_MODES.includes(state.mapmode) && !VIEWER;
  legendEntries(state.mapmode).forEach(([c,l,v])=>{
    const d=div("li");d.innerHTML=`<span class="swatch" style="background:${c}"></span>${esc(l)}`;
    if(paintable && v!==undefined){
      const sel=(state.mapmode==="political"? (state.paintUnclaim? v==="__none__": state.selRealm===v) : state.paintValue===v);
      if(sel){d.style.outline="2px solid var(--accent)";d.style.borderRadius="6px";}
      d.style.cursor="pointer"; d.title="Click to paint provinces with this";
      d.onclick=()=>setPaintTarget(v,l);
    }
    box.appendChild(d);
  });
  if(paintable){
    const h=div("note");h.style.marginTop="6px";h.textContent="Click an entry, then click/drag on the map to paint it.";box.appendChild(h);
    const lk=MODE_LIST[state.mapmode];
    if(lk){const mb=document.createElement("button");mb.className="btn tiny";mb.style.marginTop="6px";mb.textContent="✎ Edit / add "+({governments:"governments",religions:"religions",cultures:"cultures",races:"races",languages:"languages",terrains:"terrains",settlements:"settlements",resources:"resources"}[lk]||lk);mb.onclick=()=>openLists(lk);box.appendChild(mb);}
    if(state.mapmode==="resource"){
      const tb=document.createElement("button");tb.className="btn tiny"+(state.terrainOverlay?" primary":"");tb.style.marginTop="6px";tb.style.marginLeft="6px";
      tb.textContent=(state.terrainOverlay?"✓ ":"")+"⛰ Terrain outline overlay";
      tb.title="Overlay terrain-region outlines to help place resources";
      tb.onclick=()=>{state.terrainOverlay=!state.terrainOverlay;renderLegend();renderMap();};
      box.appendChild(tb);
    }
  }
}

/* ============================================================
   INSPECTOR — PROVINCE
   ============================================================ */
/* ---------- read-only inspector (player viewer) ---------- */
function pctBars(arr,listKey){
  if(!arr||!arr.length) return '<div class="note">—</div>';
  const sorted=arr.slice().sort((a,b)=>b.pct-a.pct);
  const seg=sorted.map(e=>`<span style="height:11px;width:${Math.max(1,e.pct)}%;background:${catColor(listKey,e.name)}"></span>`).join("");
  const rows=sorted.map(e=>`<div style="display:flex;justify-content:space-between;gap:8px"><span>${esc(e.name)}</span><span class="note">${e.pct}%</span></div>`).join("");
  return `<div style="display:flex;height:11px;border-radius:4px;overflow:hidden;margin:3px 0 5px">${seg}</div>${rows}`;
}
function renderProvinceView(){
  const p=world.provinces.find(x=>x.id===state.selProvince); const ins=$("#inspector");
  if(!p){ins.innerHTML='<div class="empty">No province selected.</div>';return;}
  const realm=world.realms.find(r=>r.id===p.realmId);
  const cont=world.continents.find(c=>c.id===p.continentId);
  const feats=(p.features&&p.features.length)?p.features.map(f=>`<span class="tag">${esc(f)}</span>`).join(" "):'<span class="note">None</span>';
  const hist=(p.history&&p.history.length)?p.history.map(h=>{const era=world.eras.find(e=>e.id===h.eraId);
    return `<div class="h"><div class="meta">${era?esc(era.name):""}${h.auto?" · auto":""}</div><div style="font-weight:600">${esc(h.title)}</div>${h.text?`<div class="note">${esc(h.text)}</div>`:""}</div>`;}).join(""):'<div class="note">No recorded history.</div>';
  const row=(a,b)=>`<div class="field2"><div class="field"><label>${a[0]}</label><div>${a[1]}</div></div><div class="field"><label>${b[0]}</label><div>${b[1]}</div></div></div>`;
  ins.innerHTML=`
    <div class="insTitle" style="font-weight:700;font-size:17px">${esc(p.name)}</div>
    ${row(["Realm", realm?`<a href="#" id="pvRealm" style="color:var(--accent);text-decoration:none"><span class="swatch" style="background:${realm.color}"></span>${esc(realm.name)}</a>`:'<span class="note">Unclaimed</span>'], ["Continent", cont?esc(cont.name):"—"])}
    ${row(["Terrain", esc(p.terrain||"—")], ["Settlement", esc(p.settlement||"—")])}
    ${row(["Top resource", esc(p.resource||"—")], ["Population", (p.population||0).toLocaleString()])}
    <div class="sectionH">Notable features</div><div>${feats}</div>
    <div class="sectionH">Population breakdown</div>
    <div class="field"><label>Religion</label>${pctBars(p.religion,"religions")}</div>
    <div class="field"><label>Culture</label>${pctBars(p.culture,"cultures")}</div>
    <div class="field"><label>Race</label>${pctBars(p.race,"races")}</div>
    <div class="field"><label>Language</label>${pctBars(p.language,"languages")}</div>
    <div class="sectionH">History</div>${hist}
  `;
  const rl=$("#pvRealm"); if(rl&&realm)rl.onclick=e=>{e.preventDefault();selectRealm(realm.id);};
}
function renderRealmView(){
  const r=world.realms.find(x=>x.id===state.selRealm); const ins=$("#inspector");
  if(!r){ins.innerHTML='<div class="empty">No realm selected.</div>';return;}
  const provs=world.provinces.filter(p=>p.realmId===r.id);
  const pop=provs.reduce((a,p)=>a+(p.population||0),0);
  const cap=r.capitalId&&world.provinces.find(p=>p.id===r.capitalId);
  const admins=(r.adminCenters||[]).map(id=>world.provinces.find(p=>p.id===id)).filter(Boolean);
  const f=(l,v)=>`<div class="field"><label>${l}</label><div>${v||"—"}</div></div>`;
  ins.innerHTML=`
    <div class="insTitle" style="font-weight:700;font-size:17px"><span class="swatch" style="background:${r.color}"></span> ${esc(r.name)}</div>
    <div class="note">${provs.length} provinces · ${pop.toLocaleString()} people</div>
    <div class="field2">${f("Government",esc(r.government))}${f("Economy",esc(r.economy))}</div>
    <div class="field2">${f("State religion",esc(r.stateReligion))}${f("Capital",cap?esc(cap.name):"—")}</div>
    <div class="field2">${f("Dominant culture",esc(r.dominantCulture))}${f("Dominant race",esc(r.dominantRace))}</div>
    <div class="field2">${f("Dominant language",esc(r.dominantLanguage))}${f("Leader",esc([r.leaderTitle,r.leaderName].filter(Boolean).join(" ")))}</div>
    ${admins.length?`<div class="field"><label>Administrative centres</label><div>${admins.map(p=>`<span class="tag">◆ ${esc(p.name)}</span>`).join(" ")}</div></div>`:""}
    <div class="sectionH">Provinces (${provs.length})</div>
    <div class="list">${provs.map(p=>`<div class="li pvp" data-pid="${p.id}" style="cursor:pointer;display:flex">${esc(p.name)}<span class="note" style="margin-left:auto">${(p.population||0).toLocaleString()}</span></div>`).join("")||'<div class="note">None</div>'}</div>
  `;
  $$(".pvp").forEach(el=>el.onclick=()=>selectProvince(el.dataset.pid));
}
function renderContinentView(){
  const c=world.continents.find(x=>x.id===state.focusedContinent); const ins=$("#inspector");
  if(!c){ins.innerHTML='<div class="empty">Click a province or realm to view its details.</div>';return;}
  const provs=world.provinces.filter(p=>p.continentId===c.id);
  const pop=provs.reduce((a,p)=>a+(p.population||0),0);
  ins.innerHTML=`<div class="insTitle" style="font-weight:700;font-size:17px">${esc(c.name)}</div>
    <div class="note">${provs.length} provinces · ${pop.toLocaleString()} people</div>
    <div class="note" style="margin-top:8px">Click a province or realm to view its details.</div>`;
}
function renderProvinceEditor(){
  if(VIEWER)return renderProvinceView();
  const p=world.provinces.find(p=>p.id===state.selProvince);
  const ins=$("#inspector");
  if(!p){ins.innerHTML='<div class="empty">No province selected.</div>';return;}
  const realmOpts=`<option value="">— Unclaimed —</option>`+world.realms.map(r=>`<option value="${r.id}" ${p.realmId===r.id?"selected":""}>${esc(r.name)}</option>`).join("");
  const opt=(list,v)=>list.map(o=>`<option ${o===v?"selected":""}>${esc(o)}</option>`).join("");
  ins.innerHTML=`
    <div class="insTitle"><input id="pname" value="${esc(p.name)}"/></div>
    <div class="field2">
      <div class="field"><label>Realm</label><select id="prealm">${realmOpts}</select></div>
      <div class="field"><label>Continent</label><select id="pcont">${world.continents.map(c=>`<option value="${c.id}" ${p.continentId===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></div>
    </div>
    <div class="field2">
      <div class="field"><label>Terrain</label><select id="pterr">${opt(world.lists.terrains,p.terrain)}</select></div>
      <div class="field"><label>Settlement</label><select id="psett">${opt(world.lists.settlements,p.settlement)}</select></div>
    </div>
    <div class="field"><label>Top resource</label><select id="pres">${opt(world.lists.resources,p.resource)}</select></div>

    <div class="sectionH">Notable features</div>
    <div id="pfeat"></div>

    <div class="sectionH">Population — <span id="ppopTot">${(p.population||0).toLocaleString()}</span> · <span id="ppopN">${p.pops.length}</span> group(s)</div>
    <div class="note">Each group is a chunk of people sharing one religion, culture, race and language. Add groups for minorities — the map-mode percentages update automatically from the groups.</div>
    <div id="ppops"></div>
    <button class="btn tiny" id="ppopAdd" style="margin-top:6px">＋ Add pop group</button>

    <div class="sectionH">History</div>
    <div id="phist" class="hist"></div>
    <div class="field2">
      <div class="field"><label>Age</label><select id="hnera">${world.eras.map(e=>`<option value="${e.id}" ${e.id===world.currentEraId?"selected":""}>${esc(e.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Title</label><input id="hntitle" placeholder="e.g. Razed by dragons"/></div>
    </div>
    <div class="field"><label>Event detail</label><textarea id="hntext"></textarea></div>
    <button class="btn" id="haddBtn">Add history entry</button>

    <div class="field" style="margin-top:14px"><label>Notes</label><textarea id="pnotes">${esc(p.notes||"")}</textarea></div>

    <div class="sectionH">Shape</div>
    <div class="btnrow">
      <button class="btn" id="pnodes">✦ Reshape (nodes)</button>
      <button class="btn" id="psplit">✂ Split</button>
    </div>
    <div class="field2" style="margin-top:6px">
      <div class="field"><label>Merge a neighbor into this</label><select id="pmerge"></select></div>
      <div style="flex:0 0 auto;display:flex;align-items:flex-end"><button class="btn" id="pmergebtn">Merge</button></div>
    </div>

    <div class="btnrow"><button class="btn danger" id="pdel">Delete province</button></div>
  `;
  // bind simple fields
  const bind=(id,fn)=>{const e=$("#"+id);if(e)e.addEventListener("input",()=>{fn(e);renderMap();renderLeft();markDirty();});};
  // tracked fields auto-log a history entry when changed
  const bindTracked=(id,field,setter)=>{const e=$("#"+id);if(e)e.addEventListener("input",()=>{const old=provTrackedValue(p,field);setter(e.value);autoLog(p,field,old);renderHistory(p);renderMap();renderLeft();markDirty();});};
  $("#pname").addEventListener("input",e=>{p.name=e.target.value;renderMapLabelsSoon();renderLeft();markDirty();});
  bindTracked("pterr","terrain",v=>p.terrain=v);
  bindTracked("psett","settlement",v=>p.settlement=v);
  bindTracked("pres","resource",v=>p.resource=v);
  $("#prealm").addEventListener("change",e=>{
    const old=provTrackedValue(p,"realm");p.realmId=e.value||null;autoLog(p,"realm",old);joinRealmDefaults(p,p.realmId);renderHistory(p);renderMap();renderLeft();renderProvinceEditor();markDirty();
  });
  $("#pcont").addEventListener("change",e=>{p.continentId=e.value;renderMap();renderLeft();markDirty();});
  $("#pnotes").addEventListener("input",e=>{p.notes=e.target.value;markDirty();});
  $("#pdel").addEventListener("click",()=>{
    if(!confirm("Delete this province?"))return;
    beginEdit();
    world.provinces=world.provinces.filter(x=>x.id!==p.id);
    state.selProvince=null;renderMap();renderLeft();$("#inspector").innerHTML='<div class="empty">Province deleted.</div>';markDirty();
  });
  $("#pnodes").addEventListener("click",()=>setTool("nodes"));
  $("#psplit").addEventListener("click",()=>startSplit(p));
  // merge: candidate neighbors that share a vertex on the same continent
  const cand=world.provinces.filter(x=>x.id!==p.id && x.continentId===p.continentId && provincesShareVertex(p,x));
  const ms=$("#pmerge");
  ms.innerHTML = cand.length ? cand.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("") : `<option value="">— no adjacent provinces —</option>`;
  $("#pmergebtn").addEventListener("click",()=>{
    const oid=ms.value; const b=oid&&world.provinces.find(x=>x.id===oid); if(!b){flash("No adjacent province to merge.");return;}
    const c=world.continents.find(cc=>cc.id===p.continentId)||{ox:0,oy:0};
    const A=p.points.map(([x,y])=>[c.ox+x,c.oy+y]), B=b.points.map(([x,y])=>[c.ox+x,c.oy+y]);
    const merged=mergeAdjacentPolys(A,B)||mergeAdjacentPolys(B,A);
    if(!merged){flash("These provinces don't share a full border edge — only provinces with a shared edge (e.g. drawn with snapping) can be merged.");return;}
    beginEdit();
    p.points=merged.map(([x,y])=>[Math.round(x-c.ox),Math.round(y-c.oy)]);
    p.pops=(p.pops||[]).concat(b.pops||[]); deriveProvince(p);   // absorb the merged province's people
    world.provinces=world.provinces.filter(x=>x.id!==oid);
    _geoDirty=true; renderMap(); renderLeft(); selectProvince(p.id); markDirty(); flash("Provinces merged.");
  });
  // features
  renderFeatures(p);
  // population pop-groups
  renderPops(p);
  $("#ppopAdd").addEventListener("click",()=>{
    beginEdit();
    const rlm=world.realms.find(x=>x.id===p.realmId);
    p.pops.push(newPop(1000,
      rlm?rlm.stateReligion:(world.lists.religions[0]||""),
      rlm?rlm.dominantCulture:(world.lists.cultures[0]||""),
      rlm?rlm.dominantRace:(world.lists.races[0]||""),
      rlm?rlm.dominantLanguage:(world.lists.languages[0]||"")));
    deriveProvince(p); renderProvinceEditor(); renderMap(); renderLeft(); markDirty();
  });
  // history
  renderHistory(p);
  $("#haddBtn").addEventListener("click",()=>{
    const title=$("#hntitle").value.trim();const text=$("#hntext").value.trim();
    if(!title&&!text)return;
    p.history.push({eraId:$("#hnera").value,title:title||"(untitled)",text});
    $("#hntitle").value="";$("#hntext").value="";renderHistory(p);markDirty();
  });
}
function axisBlock(label,key,p,list){
  return `<div class="field"><label>${label}</label><div class="breakdown" id="ax_${key}"></div>
    <div class="bar" id="bar_${key}"></div></div>`;
}
function renderAxis(key,p){
  const wrap=$("#ax_"+key);if(!wrap)return;
  const list=world.lists[ {religion:"religions",culture:"cultures",race:"races",language:"languages"}[key] ];
  wrap.innerHTML="";
  p[key].forEach((entry,i)=>{
    const row=div("brow");
    row.innerHTML=`<select>${list.map(o=>`<option ${o===entry.name?"selected":""}>${esc(o)}</option>`).join("")}</select>
      <input type="number" min="0" max="100" value="${entry.pct}"/><span class="x">✕</span>`;
    row.querySelector("select").addEventListener("change",e=>{const old=provTrackedValue(p,key);entry.name=e.target.value;autoLog(p,key,old);renderHistory(p);renderMap();renderLeft();drawBar(key,p);markDirty();});
    const numEl=row.querySelector("input"); let domAtFocus=null;
    numEl.addEventListener("focus",()=>{domAtFocus=provTrackedValue(p,key);});
    numEl.addEventListener("input",e=>{entry.pct=+e.target.value||0;renderMap();drawBar(key,p);markDirty();});
    numEl.addEventListener("change",()=>{if(domAtFocus!=null){autoLog(p,key,domAtFocus);renderHistory(p);domAtFocus=null;}});
    row.querySelector(".x").addEventListener("click",()=>{const old=provTrackedValue(p,key);p[key].splice(i,1);autoLog(p,key,old);renderAxis(key,p);renderHistory(p);renderMap();renderLeft();markDirty();});
    wrap.appendChild(row);
  });
  const add=document.createElement("button");add.className="btn tiny";add.textContent="＋ add";
  add.addEventListener("click",()=>{p[key].push({name:list[0],pct:0});renderAxis(key,p);markDirty();});
  wrap.appendChild(add);
  drawBar(key,p);
}
function drawBar(key,p){
  const bar=$("#bar_"+key);if(!bar)return;bar.innerHTML="";
  const list=world.lists[ {religion:"religions",culture:"cultures",race:"races",language:"languages"}[key] ];
  const total=p[key].reduce((s,e)=>s+(+e.pct||0),0)||1;
  p[key].forEach(e=>{const s=document.createElement("span");s.style.width=(e.pct/total*100)+"%";s.style.background=listColor(list,e.name);s.title=`${e.name} ${e.pct}%`;bar.appendChild(s);});
}
function renderPops(p){
  const wrap=$("#ppops"); if(!wrap)return; wrap.innerHTML="";
  const sel=(list,v,cls)=>`<select class="${cls}"><option value="">—</option>${list.map(o=>`<option value="${esc(o)}" ${o===v?"selected":""}>${esc(o)}</option>`).join("")}</select>`;
  if(!p.pops.length){wrap.innerHTML='<div class="note">No people here yet — add a pop group.</div>';return;}
  p.pops.forEach((q,i)=>{
    const row=div("popRow");
    row.innerHTML=`<div class="popHead"><input class="psize" type="number" min="0" value="${q.size||0}" title="People in this group"/><span class="x" title="Remove group">✕</span></div>
      <div class="popAxes">${sel(world.lists.religions,q.religion,"prel")}${sel(world.lists.cultures,q.culture,"pcul")}${sel(world.lists.races,q.race,"prace")}${sel(world.lists.languages,q.language,"plang")}</div>`;
    const upd=()=>{deriveProvince(p);const t=$("#ppopTot");if(t)t.textContent=(p.population||0).toLocaleString();const n=$("#ppopN");if(n)n.textContent=p.pops.length;renderMap();renderLeft();markDirty();};
    row.querySelector(".psize").addEventListener("input",e=>{q.size=Math.max(0,+e.target.value||0);upd();});
    row.querySelector(".prel").addEventListener("change",e=>{q.religion=e.target.value;upd();});
    row.querySelector(".pcul").addEventListener("change",e=>{q.culture=e.target.value;upd();});
    row.querySelector(".prace").addEventListener("change",e=>{q.race=e.target.value;upd();});
    row.querySelector(".plang").addEventListener("change",e=>{q.language=e.target.value;upd();});
    row.querySelector(".x").onclick=()=>{beginEdit();p.pops.splice(i,1);deriveProvince(p);renderProvinceEditor();renderMap();renderLeft();markDirty();};
    wrap.appendChild(row);
  });
}
function renderFeatures(p){
  const wrap=$("#pfeat");wrap.innerHTML="";
  p.features.forEach((f,i)=>{const t=document.createElement("span");t.className="tag";t.innerHTML=`<b>${esc(f)}</b> <span class="x">✕</span>`;t.querySelector(".x").onclick=()=>{p.features.splice(i,1);renderFeatures(p);markDirty();};wrap.appendChild(t);});
  const sel=document.createElement("select");sel.className="sel";sel.style.marginTop="6px";
  sel.innerHTML=`<option value="">＋ add feature…</option>`+world.lists.features.map(f=>`<option>${esc(f)}</option>`).join("")+`<option value="__custom">Custom…</option>`;
  sel.onchange=()=>{let v=sel.value;if(v==="__custom"){v=prompt("Feature name:")||"";}if(v){p.features.push(v);renderFeatures(p);markDirty();}sel.value="";};
  wrap.appendChild(sel);
}
function renderHistory(p){
  const wrap=$("#phist");wrap.innerHTML="";
  if(!p.history.length){wrap.innerHTML='<div class="note">No recorded history yet. Changes you make (ownership, religion, terrain, etc.) are logged here automatically.</div>';return;}
  // newest first for display
  p.history.forEach((h,i)=>{
    const d=div("h");
    const eraOpts=world.eras.map(e=>`<option value="${e.id}" ${e.id===h.eraId?"selected":""}>${esc(e.name)}</option>`).join("");
    d.innerHTML=`<div class="meta"><select class="he" style="font-size:11px">${eraOpts}</select>${h.auto?' · <span title="logged automatically">auto</span>':''} · <span class="x" style="color:var(--bad);cursor:pointer">remove</span></div>
      <input class="ht" value="${esc(h.title)}" style="font-weight:600;width:100%;background:var(--panel2);border:1px solid var(--line);color:var(--ink);padding:4px 6px;border-radius:6px;margin:2px 0"/>
      <input class="hx" value="${esc(h.text||"")}" style="width:100%;background:var(--panel2);border:1px solid var(--line);color:var(--ink);padding:4px 6px;border-radius:6px"/>`;
    d.querySelector(".he").addEventListener("change",e=>{h.eraId=e.target.value;markDirty();});
    d.querySelector(".ht").addEventListener("input",e=>{h.title=e.target.value;markDirty();});
    d.querySelector(".hx").addEventListener("input",e=>{h.text=e.target.value;markDirty();});
    d.querySelector(".x").onclick=()=>{p.history.splice(i,1);renderHistory(p);markDirty();};
    wrap.appendChild(d);
  });
}
let labelTimer=null;
function renderMapLabelsSoon(){clearTimeout(labelTimer);labelTimer=setTimeout(renderMap,250);}

/* ============================================================
   INSPECTOR — REALM
   ============================================================ */
// population weighting: higher settlement tiers get exponentially more; capital
// and administrative centres get a big boost as major hubs.
function settleWeight(tier){const idx=world.lists.settlements.indexOf(tier); return idx<=0?0:Math.pow(4,idx-1);}
function provPopWeight(p,r){
  let w=settleWeight(p.settlement);
  if(r){
    if(p.id===r.capitalId) w=Math.max(w,4)*(world.capitalBoost??1.8);
    else if(r.adminCenters&&r.adminCenters.includes(p.id)) w=Math.max(w,2)*(world.adminBoost??1.3);
  }
  return w;
}
function renderRealmEditor(){
  if(VIEWER)return renderRealmView();
  const r=world.realms.find(r=>r.id===state.selRealm);
  const ins=$("#inspector");
  if(!r){ins.innerHTML='<div class="empty">No realm selected.</div>';return;}
  const opt=(list,v)=>list.map(o=>`<option ${o===v?"selected":""}>${esc(o)}</option>`).join("");
  const provs=world.provinces.filter(p=>p.realmId===r.id);
  const capOpts=`<option value="">— none —</option>`+provs.map(p=>`<option value="${p.id}" ${r.capitalId===p.id?"selected":""}>${esc(p.name)}</option>`).join("");
  const pop=provs.reduce((s,p)=>s+(p.population||0),0);
  ins.innerHTML=`
    <div class="insTitle"><input id="rname" value="${esc(r.name)}"/>
      <input id="rcolor" type="color" value="${r.color}" style="width:42px;height:34px;padding:2px"/></div>
    <div class="note">${provs.length} provinces · ${pop.toLocaleString()} people</div>
    <div class="field2">
      <div class="field"><label>Government</label><select id="rgov">${opt(world.lists.governments,r.government)}</select></div>
      <div class="field"><label>Economy</label><select id="recon">${opt(world.lists.economies,r.economy)}</select></div>
    </div>
    <div class="field2">
      <div class="field"><label>State religion</label><select id="rrel"><option value="">— none —</option>${opt(world.lists.religions,r.stateReligion)}</select></div>
      <div class="field"><label>Capital</label><select id="rcap">${capOpts}</select></div>
    </div>
    <div class="field2">
      <div class="field"><label>Dominant culture</label><select id="rcul"><option value="">—</option>${opt(world.lists.cultures,r.dominantCulture)}</select></div>
      <div class="field"><label>Dominant race</label><select id="rrace"><option value="">—</option>${opt(world.lists.races,r.dominantRace)}</select></div>
    </div>
    <div class="field2">
      <div class="field"><label>Dominant language</label><select id="rlang"><option value="">—</option>${opt(world.lists.languages,r.dominantLanguage)}</select></div>
      <div class="field"></div>
    </div>
    <div class="field2">
      <div class="field"><label>Leader title</label><input id="rltitle" value="${esc(r.leaderTitle||"")}"/></div>
      <div class="field"><label>Leader name</label><input id="rlname" value="${esc(r.leaderName||"")}"/></div>
    </div>
    <div class="field"><label>Notes</label><textarea id="rnote">${esc(r.note||"")}</textarea></div>

    <div class="sectionH">Population</div>
    <div class="field2">
      <div class="field"><label>Total population</label><input id="rtotpop" type="number" min="0" value="${pop}"/></div>
      <div style="flex:0 0 auto;display:flex;align-items:flex-end;gap:6px"><button class="btn" id="rdistpop">↔ Distribute</button><button class="btn danger" id="rclearpop">Clear pops</button></div>
    </div>
    <div class="field2">
      <div class="field"><label>Capital boost ×</label><input id="rcapw" type="number" min="1" step="0.1" value="${(world.capitalBoost??1.8)}"/></div>
      <div class="field"><label>Admin centre boost ×</label><input id="radmw" type="number" min="1" step="0.1" value="${(world.adminBoost??1.3)}"/></div>
    </div>
    <div class="note">Distribute spreads the total across this realm's provinces, weighted by settlement tier (cities ≫ villages, uninhabited get none) and boosted at the capital & admin centres. The two boosts above are global multipliers you can tune — lower = flatter, higher = more concentrated. "Clear pops" zeroes every province in this realm so you can re-trial. Set settlement tiers first (Settlements map mode + Paint) for good results.</div>

    <div class="sectionH">Key locations</div>
    <div class="field"><label>Administrative centres</label>
      <div id="radminList"></div>
      <div class="field2" style="margin-top:4px">
        <div class="field"><select id="radminSel"><option value="">— choose a province —</option>${provs.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div>
        <div style="flex:0 0 auto;display:flex;align-items:flex-end"><button class="btn" id="radminAdd">＋ Add</button></div>
      </div>
    </div>

    <div class="btnrow">
      <button class="btn primary" id="rpaint">🖌 Paint with this realm</button>
      <button class="btn" id="rrecolor">🎨 Random color</button>
    </div>
    <div class="btnrow">
      <button class="btn" id="rerase">🧹 Erase — paint provinces unclaimed</button>
    </div>
    <div class="sectionH">Merge</div>
    <div class="field2">
      <div class="field"><label>Merge another realm into this one</label>
        <select id="rmerge"><option value="">— choose realm —</option>${world.realms.filter(x=>x.id!==r.id).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></div>
      <div style="flex:0 0 auto;display:flex;align-items:flex-end"><button class="btn" id="rmergebtn">Merge in</button></div>
    </div>
    <div class="btnrow"><button class="btn danger" id="rdel">Delete realm</button></div>
    <div class="note">Tip: with Paint active, click or drag across provinces to assign them here.</div>
  `;
  const b=(id,fn)=>{$("#"+id).addEventListener("input",e=>{fn(e.target.value);renderMap();renderLeft();markDirty();});};
  $("#rname").addEventListener("input",e=>{r.name=e.target.value;renderLeft();renderMap();markDirty();});
  $("#rcolor").addEventListener("input",e=>{r.color=e.target.value;renderMap();renderLeft();markDirty();});
  b("rgov",v=>r.government=v);b("recon",v=>r.economy=v);b("rrel",v=>r.stateReligion=v);
  b("rcul",v=>r.dominantCulture=v);b("rrace",v=>r.dominantRace=v);b("rlang",v=>r.dominantLanguage=v);
  b("rltitle",v=>r.leaderTitle=v);b("rlname",v=>r.leaderName=v);
  $("#rcap").addEventListener("change",e=>{r.capitalId=e.target.value||null;renderMap();markDirty();});
  $("#rnote").addEventListener("input",e=>{r.note=e.target.value;markDirty();});
  // administrative centres list
  const renderAdminList=()=>{
    const wrap=$("#radminList"); if(!wrap)return; wrap.innerHTML="";
    if(!r.adminCenters.length){wrap.innerHTML='<div class="note">None yet — add provinces as admin centres.</div>';return;}
    r.adminCenters.forEach((pid,i)=>{const p=world.provinces.find(x=>x.id===pid); if(!p)return;
      const t=document.createElement("span");t.className="tag";t.innerHTML=`<b>◆ ${esc(p.name)}</b> <span class="x">✕</span>`;
      t.querySelector(".x").onclick=()=>{beginEdit();r.adminCenters.splice(i,1);renderAdminList();renderMap();markDirty();};
      wrap.appendChild(t);});
  };
  renderAdminList();
  $("#radminAdd").addEventListener("click",()=>{const pid=$("#radminSel").value; if(!pid)return;
    if(pid===r.capitalId){flash("That province is already the capital.");return;}
    if(r.adminCenters.includes(pid)){flash("Already an admin centre.");return;}
    beginEdit();r.adminCenters.push(pid);renderAdminList();renderMap();markDirty();});
  $("#rdistpop").addEventListener("click",()=>{
    const total=+$("#rtotpop").value||0;
    const ps=world.provinces.filter(p=>p.realmId===r.id);
    if(!ps.length){flash("No provinces in this realm to populate.");return;}
    const wts=ps.map(p=>Math.max(0,provPopWeight(p,r))*(0.85+0.3*Math.random()));
    const sum=wts.reduce((a,b)=>a+b,0);
    if(sum<=0){flash("All provinces here are Uninhabited — set settlement tiers first (Settlements map mode + Paint).");return;}
    beginEdit();
    ps.forEach((p,i)=>setProvincePopulation(p, total*wts[i]/sum));
    renderMap();renderLeft();renderRealmEditor();markDirty();flash("Distributed "+total.toLocaleString()+" people across "+ps.length+" provinces.");
  });
  $("#rclearpop").addEventListener("click",()=>{
    const ps=world.provinces.filter(p=>p.realmId===r.id);
    if(!ps.length){flash("No provinces in this realm.");return;}
    beginEdit();ps.forEach(p=>{p.pops=[];deriveProvince(p);});
    renderMap();renderLeft();renderRealmEditor();markDirty();flash("Cleared population for "+ps.length+" provinces.");
  });
  $("#rcapw").addEventListener("input",e=>{world.capitalBoost=Math.max(1,+e.target.value||1);markDirty();});
  $("#radmw").addEventListener("input",e=>{world.adminBoost=Math.max(1,+e.target.value||1);markDirty();});
  $("#rpaint").addEventListener("click",()=>{
    if(state.mapmode==="imported"){state.mapmode="political";const ms=$("#mapmode");if(ms)ms.value="political";}
    setTool("paint");flash("Paint mode: click or drag across provinces to assign to "+r.name);renderMap();
  });
  $("#rerase").addEventListener("click",()=>{
    if(state.mapmode==="imported"){state.mapmode="political";const ms=$("#mapmode");if(ms)ms.value="political";}
    state.paintUnclaim=true;state.selRealm=null;setTool("paint");renderLegend();renderMap();
    flash("Erase mode: click or drag across provinces to make them unclaimed.");
  });
  $("#rrecolor").addEventListener("click",()=>{beginEdit();r.color=autoPastelHex();$("#rcolor").value=r.color;renderMap();renderLeft();markDirty();});
  $("#rmergebtn").addEventListener("click",()=>{
    const oid=$("#rmerge").value; if(!oid)return;
    const other=world.realms.find(x=>x.id===oid); if(!other)return;
    if(!confirm(`Merge "${other.name}" into "${r.name}"? Its provinces move here and "${other.name}" is removed.`))return;
    beginEdit();
    world.provinces.forEach(p=>{if(p.realmId===oid){const old=provTrackedValue(p,"realm");p.realmId=r.id;autoLog(p,"realm",old);}});
    if(!r.capitalId && other.capitalId)r.capitalId=other.capitalId;
    world.realms=world.realms.filter(x=>x.id!==oid);
    renderMap();renderLeft();renderRealmEditor();markDirty();flash(`Merged ${other.name} into ${r.name}.`);
  });
  $("#rdel").addEventListener("click",()=>{
    if(!confirm("Delete realm? Provinces become unclaimed."))return;
    beginEdit();
    world.provinces.forEach(p=>{if(p.realmId===r.id){const old=provTrackedValue(p,"realm");p.realmId=null;autoLog(p,"realm",old);}});
    world.realms=world.realms.filter(x=>x.id!==r.id);state.selRealm=null;
    renderMap();renderLeft();ins.innerHTML='<div class="empty">Realm deleted.</div>';markDirty();
  });
}

/* ============================================================
   INSPECTOR — CONTINENT
   ============================================================ */
function renderContinentEditor(){
  if(VIEWER)return renderContinentView();
  const c=world.continents.find(c=>c.id===state.focusedContinent);
  const ins=$("#inspector");
  if(!c){ins.innerHTML='<div class="empty">No continent selected.</div>';return;}
  const np=world.provinces.filter(p=>p.continentId===c.id).length;
  const hasBg = !!(c.bg && c.bg.href);
  const rmImgBtn = hasBg ? '<button class="btn danger" id="cimgdel">Remove image</button>' : '';
  const opacPct = Math.round((hasBg ? (c.bg.opacity ?? 0.6) : 0.6) * 100);
  const scaleX = (hasBg ? (c.bg.scale || 1) : 1);
  const bgControls = hasBg
    ? '<div class="field"><label>Opacity — <b id="cbgov">'+opacPct+'</b>%</label>'
      + '<input id="cbgo" type="range" min="0" max="100" value="'+opacPct+'"/></div>'
      + '<div class="field"><label>Scale — <b id="cbgsv">'+scaleX.toFixed(2)+'</b>×</label>'
      + '<input id="cbgs" type="range" min="20" max="400" value="'+Math.round(scaleX*100)+'"/></div>'
    : '';
  ins.innerHTML=`
    <div class="insTitle"><input id="cname" value="${esc(c.name)}"/></div>
    <div class="note">${np} provinces · floating continent</div>
    <div class="field2">
      <div class="field"><label>Position X</label><input id="cox" type="number" value="${c.ox}"/></div>
      <div class="field"><label>Position Y</label><input id="coy" type="number" value="${c.oy}"/></div>
    </div>
    <div class="field"><label>Description</label><textarea id="cnote">${esc(c.note||"")}</textarea></div>

    <div class="sectionH">Reference map image</div>
    <div class="note">Load your real 2D map for this continent, then trace provinces over it with the Draw tool. The image is just a guide — it never exports as province data.</div>
    <div class="btnrow">
      <button class="btn" id="cimg">🖼 Load reference image</button>
      ${rmImgBtn}
    </div>
    ${bgControls}
    <input type="file" id="cimgInput" accept="image/*" class="hidden"/>

    <div class="btnrow">
      <button class="btn primary" id="cdraw">✎ Draw a province here</button>
      <button class="btn danger" id="cdel">Delete continent</button>
    </div>
    <div class="note">Nudge X/Y to move this island around the void. Use the <span class="kbd">Draw</span> tool then click on the map to outline a new province on this continent.</div>
  `;
  $("#cname").addEventListener("input",e=>{c.name=e.target.value;renderMap();renderLeft();markDirty();});
  $("#cox").addEventListener("input",e=>{c.ox=+e.target.value||0;renderMap();markDirty();});
  $("#coy").addEventListener("input",e=>{c.oy=+e.target.value||0;renderMap();markDirty();});
  $("#cnote").addEventListener("input",e=>{c.note=e.target.value;markDirty();});
  $("#cimg").addEventListener("click",()=>$("#cimgInput").click());
  $("#cimgInput").addEventListener("change",ev=>{
    const f=ev.target.files[0];if(!f)return;const rd=new FileReader();
    rd.onload=()=>{const im=new Image();im.onload=()=>{c.bg={href:rd.result,w:im.naturalWidth,h:im.naturalHeight,opacity:0.6,scale:1};renderMap();renderContinentEditor();focusContinent(c.id);markDirty();};im.src=rd.result;};
    rd.readAsDataURL(f);
  });
  if($("#cimgdel"))$("#cimgdel").addEventListener("click",()=>{delete c.bg;renderMap();renderContinentEditor();markDirty();});
  if($("#cbgo"))$("#cbgo").addEventListener("input",e=>{c.bg.opacity=+e.target.value/100;$("#cbgov").textContent=e.target.value;renderMap();markDirty();});
  if($("#cbgs"))$("#cbgs").addEventListener("input",e=>{c.bg.scale=+e.target.value/100;$("#cbgsv").textContent=(c.bg.scale).toFixed(2);renderMap();markDirty();});
  $("#cdraw").addEventListener("click",()=>{state.focusedContinent=c.id;setTool("draw");flash("Click on the map to place province corners. Press Enter or double-click to finish.");});
  $("#cdel").addEventListener("click",()=>{
    if(!confirm("Delete continent and ALL its provinces?"))return;
    beginEdit();
    world.provinces=world.provinces.filter(p=>p.continentId!==c.id);
    world.continents=world.continents.filter(x=>x.id!==c.id);
    state.focusedContinent=null;renderMap();renderLeft();ins.innerHTML='<div class="empty">Continent deleted.</div>';markDirty();
  });
}

/* ============================================================
   TOOLS: select / draw / paint
   ============================================================ */
const DRAW_TOOLS=["draw","lake","river","conform"];
function setTool(t){
  if(VIEWER && t!=="select") return;   // read-only viewer: selecting/panning only
  state.tool=t;
  if(!DRAW_TOOLS.includes(t)){state.drawCursor=null;state.draft=null;}
  if(t!=="nodes")state.nodeDrag=null;
  state.draftType = t==="lake"?"lake" : t==="river"?"river" : t==="conform"?"conform" : "province";
  $$(".btn.tool").forEach(b=>b.classList.toggle("active",b.dataset.tool===t));
  const m=$("#map");m.classList.toggle("draw",DRAW_TOOLS.includes(t)||t==="nodes"||t==="move"||t==="textlabel");m.classList.toggle("paint",t==="paint");
  if(t!=="select"&&state.tilt){toggleTilt(false);} // tilt off while editing for accurate clicks
  if(DRAW_TOOLS.includes(t)){
    if(!state.focusedContinent&&world.continents.length){state.focusedContinent=world.continents[0].id;}
    const cn=state.focusedContinent?world.continents.find(c=>c.id===state.focusedContinent).name:null;
    if(t==="conform"){
      flash(cn?`Conform on “${cn}”: draw a shape; provinces straddling it snap in to fit. Enter/double-click to apply; Esc to cancel.`:"Select a continent first.");
    } else {
      const what=t==="lake"?"lake":t==="river"?"river":"province";
      flash(cn?`Drawing a ${what} on “${cn}”. Click to add points; Enter/double-click to finish; Esc to cancel.`:"Add a continent first.");
    }
  }
  if(t==="textlabel"){flash("Click anywhere to place a custom label. Then use Select to drag, edit, or delete it.");}
  if(t==="move"){flash("Move: drag a province to reposition it — it snaps to neighboring provinces.");}
  if(t==="nodes"){flash(state.selProvince?"Reshape: drag a corner to move it; double-click a corner to remove, or an edge to add one.":"Select a province first, then use Nodes to reshape it.");}
  if(t==="paint"&&!paintReady()){flash(paintHint());}
  requestRender();
}
function finishDraft(){
  const t=state.draftType, c=state.focusedContinent&&world.continents.find(x=>x.id===state.focusedContinent);
  if(state.draft && c){
    if(t==="conform" && state.draft.length>=3){ conformToShape(state.draft.slice()); return; }
    if(t==="river" && state.draft.length>=2){
      beginEdit(); world.rivers.push({id:uid(),continentId:c.id,points:state.draft.slice(),width:6,name:""});
      state.draft=null;state.drawCursor=null;setTool("select");_geoDirty=true;renderMap();markDirty();flash("River added.");return;
    }
    if(t==="lake" && state.draft.length>=3){
      beginEdit(); world.lakes.push({id:uid(),continentId:c.id,points:state.draft.slice(),name:""});
      state.draft=null;state.drawCursor=null;setTool("select");_geoDirty=true;renderMap();markDirty();flash("Lake added.");return;
    }
    if(t==="province" && state.draft.length>=3){
      beginEdit();
      const rlm=world.realms.find(x=>x.id===state.selRealm);
      const p={id:uid(),name:"New Province",continentId:c.id,points:state.draft.slice(),
        terrain:world.lists.terrains[0],settlement:"Village",resource:world.lists.resources[0],features:[],
        pops:[newPop(1000, rlm?rlm.stateReligion:(world.lists.religions[0]||""), rlm?rlm.dominantCulture:(world.lists.cultures[0]||""), rlm?rlm.dominantRace:(world.lists.races[0]||""), rlm?rlm.dominantLanguage:(world.lists.languages[0]||""))],
        religion:[],culture:[],race:[],language:[],realmId:state.selRealm||null,history:[],notes:""};
      deriveProvince(p);
      world.provinces.push(p);
      state.draft=null;state.drawCursor=null;setTool("select");selectProvince(p.id);markDirty();return;
    }
  }
  state.draft=null;state.drawCursor=null;renderMap();
}
// snap a world point to the nearest existing province vertex (for clean borders)
function snapWorld(wx,wy,excludeId){
  const rad=12/state.cam.scale, rad2=rad*rad;
  let best=null,bd=rad2;
  for(const g of _provGeo){
    if(excludeId && g.p.id===excludeId)continue;
    if(wx<g.minx-rad||wx>g.maxx+rad||wy<g.miny-rad||wy>g.maxy+rad)continue;
    for(const pt of g.pts){const dx=pt[0]-wx,dy=pt[1]-wy,d=dx*dx+dy*dy; if(d<bd){bd=d;best=pt;}}
  }
  return best?{x:best[0],y:best[1],snapped:true}:{x:wx,y:wy,snapped:false};
}
// recompute one province's cached geometry (used during live vertex drag)
function updateProvGeo(p){
  const g=_provGeo.find(x=>x.p.id===p.id); if(!g)return;
  const c=world.continents.find(cc=>cc.id===p.continentId)||{ox:0,oy:0};
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9,sx=0,sy=0;
  g.pts=p.points.map(([x,y])=>{const wx=c.ox+x,wy=c.oy+y;if(wx<minx)minx=wx;if(wy<miny)miny=wy;if(wx>maxx)maxx=wx;if(wy>maxy)maxy=wy;sx+=wx;sy+=wy;return[wx,wy];});
  const n=g.pts.length||1; g.minx=minx;g.miny=miny;g.maxx=maxx;g.maxy=maxy;g.cx=sx/n;g.cy=sy/n;
}
// find a vertex handle of the selected province near the cursor (screen space)
function nodeAt(ev){
  const p=world.provinces.find(x=>x.id===state.selProvince); if(!p)return null;
  const c=world.continents.find(cc=>cc.id===p.continentId)||{ox:0,oy:0};
  const cv=$("#map"),r=cv.getBoundingClientRect(),mx=ev.clientX-r.left,my=ev.clientY-r.top,rad=11;
  for(let i=0;i<p.points.length;i++){const wx=c.ox+p.points[i][0],wy=c.oy+p.points[i][1];
    const sx=(wx-state.cam.x)*state.cam.scale,sy=(wy-state.cam.y)*state.cam.scale;
    if(Math.hypot(sx-mx,sy-my)<=rad)return {p,i};}
  return null;
}
// nearest edge of selected province to a world point (for inserting a vertex)
function edgeAt(wx,wy){
  const p=world.provinces.find(x=>x.id===state.selProvince); if(!p)return null;
  const c=world.continents.find(cc=>cc.id===p.continentId)||{ox:0,oy:0};
  const rad=10/state.cam.scale; let best=null,bd=rad*rad;
  for(let i=0;i<p.points.length;i++){
    const a=p.points[i],b=p.points[(i+1)%p.points.length];
    const ax=c.ox+a[0],ay=c.oy+a[1],bx=c.ox+b[0],by=c.oy+b[1];
    const dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy||1; let t=((wx-ax)*dx+(wy-ay)*dy)/L2; t=Math.max(0,Math.min(1,t));
    const px=ax+dx*t,py=ay+dy*t,d=(px-wx)**2+(py-wy)**2;
    if(d<bd){bd=d;best={p,i:i+1,local:[Math.round(wx-c.ox),Math.round(wy-c.oy)]};}
  }
  return best;
}

function startSplit(p){ state.split={p,pts:[],cur:null}; flash("Split: click two points across “"+p.name+"” to cut it in two (Esc to cancel)."); requestRender(); }
function performSplit(){
  const sp=state.split; if(!sp||sp.pts.length<2){return;}
  const p=sp.p, c=world.continents.find(cc=>cc.id===p.continentId)||{ox:0,oy:0};
  const poly=p.points.map(([x,y])=>[c.ox+x,c.oy+y]);
  const res=splitPolygonByLine(poly,sp.pts[0],sp.pts[1]);
  state.split=null;
  if(!res){flash("That cut didn't divide the province — try a line that fully crosses it.");requestRender();return;}
  beginEdit();
  const toLocal=w=>w.map(([x,y])=>[Math.round(x-c.ox),Math.round(y-c.oy)]);
  const area=poly=>{let s=0;for(let i=0,j=poly.length-1;i<poly.length;j=i++)s+=(poly[j][0]*poly[i][1]-poly[i][0]*poly[j][1]);return Math.abs(s)/2;};
  const a0=area(res[0]),a1=area(res[1]),f0=a0/((a0+a1)||1);
  p.points=toLocal(res[0]);
  const np=JSON.parse(JSON.stringify(p)); np.id=uid(); np.name=p.name+" (2)"; np.points=toLocal(res[1]); np.history=[];
  // divide the people between the two halves by area
  (p.pops||[]).forEach(q=>q.size=Math.round(q.size*f0)); deriveProvince(p);
  (np.pops||[]).forEach(q=>{q.id=uid(); q.size=Math.round(q.size*(1-f0));}); deriveProvince(np);
  world.provinces.push(np);
  _geoDirty=true; renderMap(); renderLeft(); selectProvince(p.id); markDirty(); flash("Province split in two.");
}

// continent whose on-screen name is under the cursor (for dragging names)
function continentLabelAt(ev){
  const cv=$("#map"),r=cv.getBoundingClientRect(),mx=ev.clientX-r.left,my=ev.clientY-r.top;
  for(const cid in _contLabelRects){const q=_contLabelRects[cid];if(mx>=q.x-5&&mx<=q.x+q.w+5&&my>=q.y-5&&my<=q.y+q.h+5)return cid;}
  return null;
}
function customLabelAt(ev){
  const cv=$("#map"),r=cv.getBoundingClientRect(),mx=ev.clientX-r.left,my=ev.clientY-r.top;
  const ids=Object.keys(_customLabelRects);
  for(let i=ids.length-1;i>=0;i--){const q=_customLabelRects[ids[i]];if(mx>=q.x-5&&mx<=q.x+q.w+5&&my>=q.y-6&&my<=q.y+q.h+6)return ids[i];}
  return null;
}
function setupMapInteraction(){
  const cv=$("#map");
  let down=false, dragged=false, sx0=0, sy0=0, camStart=null;

  let painted=false;
  const rel=ev=>{const r=cv.getBoundingClientRect();return [ev.clientX-r.left,ev.clientY-r.top];};
  cv.addEventListener("mousedown",ev=>{
    if(state.regionSel&&state.regionSel.active){ state.regionSel.start=rel(ev); state.regionSel.cur=state.regionSel.start.slice(); return; }
    if(state.split){ const w=screenToWorld(ev); state.split.pts.push([w[0],w[1]]); if(state.split.pts.length>=2)performSplit(); else requestRender(); return; }
    if(state.tilt)return;            // tilt = look-only mode
    if(state.pingOn && state.pingTool!=="pan"){
      if(state.pingTool==="brush"){ const w=screenToWorld(ev); _curStroke={color:state.pingColor,width:state.pingWidth/state.cam.scale,pts:[[w[0],w[1]]]}; pingLayer.strokes.push(_curStroke); down=true; dragged=true; requestRender(); return; }
      if(state.pingTool==="pin"){ const w=screenToWorld(ev); pingLayer.pins.push({x:w[0],y:w[1],color:state.pingColor}); savePings(); requestRender(); return; }
      if(state.pingTool==="erase"){ down=true; dragged=true; pingEraseAt(ev); return; }
    }
    if(state.tool==="select"){ const lid=customLabelAt(ev); if(lid){ beginEdit(); state.customDrag=lid; down=true; dragged=false; return; } }
    if(state.tool==="select" && state.showNames){ const cid=continentLabelAt(ev); if(cid){ beginEdit(); state.labelDrag=cid; down=true; dragged=false; return; } }
    if(state.tool==="nodes"){ const h=nodeAt(ev); if(h){ beginEdit(); state.nodeDrag=h; down=true; dragged=false; return; } }
    if(state.tool==="move"){ const w=screenToWorld(ev); const p=provinceAt(w[0],w[1]); if(p){ beginEdit(); state.moveDrag={p,start:p.points.map(pt=>pt.slice()),grab:[w[0],w[1]]}; down=true; dragged=false; return; } }
    if(state.tool==="paint" && paintReady()) beginEdit();
    down=true; dragged=false; painted=false; sx0=ev.clientX; sy0=ev.clientY; camStart={x:state.cam.x,y:state.cam.y};
  });
  window.addEventListener("mousemove",ev=>{
    if(_curStroke && down){ const w=screenToWorld(ev); _curStroke.pts.push([w[0],w[1]]); requestRender(); return; }
    if(state.pingOn && state.pingTool==="erase" && down){ pingEraseAt(ev); return; }
    if(state.regionSel&&state.regionSel.active&&state.regionSel.start){ state.regionSel.cur=rel(ev); requestRender(); return; }
    if(state.split){ const w=screenToWorld(ev); state.split.cur=[w[0],w[1]]; requestRender(); return; }
    if(state.customDrag){ const w=screenToWorld(ev); const lb=world.labels.find(x=>x.id===state.customDrag); if(lb){lb.x=Math.round(w[0]);lb.y=Math.round(w[1]);} dragged=true; requestRender(); return; }
    if(state.labelDrag){ const w=screenToWorld(ev); const c=world.continents.find(x=>x.id===state.labelDrag); if(c)c.labelPos=[Math.round(w[0]),Math.round(w[1])]; dragged=true; requestRender(); return; }
    if(DRAW_TOOLS.includes(state.tool)){ const w=screenToWorld(ev); state.drawCursor=snapWorld(w[0],w[1],null); requestRender(); return; }
    if(state.nodeDrag){ const w=screenToWorld(ev); const sn=snapWorld(w[0],w[1],state.nodeDrag.p.id);
      const c=world.continents.find(x=>x.id===state.nodeDrag.p.continentId)||{ox:0,oy:0};
      state.nodeDrag.p.points[state.nodeDrag.i]=[Math.round(sn.x-c.ox),Math.round(sn.y-c.oy)];
      updateProvGeo(state.nodeDrag.p); dragged=true; requestRender(); return; }
    if(state.moveDrag){ const w=screenToWorld(ev); const dx=w[0]-state.moveDrag.grab[0], dy=w[1]-state.moveDrag.grab[1];
      const p=state.moveDrag.p, c=world.continents.find(x=>x.id===p.continentId)||{ox:0,oy:0};
      let pts=state.moveDrag.start.map(([x,y])=>[x+dx,y+dy]);
      const rad=12/state.cam.scale; let bestOff=null,bd=rad*rad;
      for(const lp of pts){const wx=c.ox+lp[0],wy=c.oy+lp[1]; const sn=snapWorld(wx,wy,p.id); if(sn.snapped){const ox=sn.x-wx,oy=sn.y-wy,d=ox*ox+oy*oy; if(d<bd){bd=d;bestOff=[ox,oy];}}}
      if(bestOff)pts=pts.map(([x,y])=>[x+bestOff[0],y+bestOff[1]]);
      p.points=pts.map(([x,y])=>[Math.round(x),Math.round(y)]);
      updateProvGeo(p); dragged=true; requestRender(); return; }
    if(!down)return;
    const dx=ev.clientX-sx0, dy=ev.clientY-sy0;
    if(!dragged && Math.hypot(dx,dy)>3) dragged=true;
    if(!dragged) return;
    if(state.tool==="paint" && paintReady()){
      // drag-to-paint: apply the current map mode's value to every province under the cursor
      const [wx,wy]=screenToWorld(ev); const p=provinceAt(wx,wy);
      if(p && paintProvince(p)){ painted=true; requestRender(); }
    } else {
      state.cam.x=camStart.x-dx/state.cam.scale; state.cam.y=camStart.y-dy/state.cam.scale; requestRender();
    }
  });
  window.addEventListener("mouseup",ev=>{
    if(_curStroke){ _curStroke=null; down=false; dragged=false; savePings(); return; }
    if(state.pingOn && state.pingTool==="erase" && down){ down=false; dragged=false; savePings(); return; }
    if(state.regionSel&&state.regionSel.active){
      const rs=state.regionSel, cb=_regionCb; state.regionSel=null; _regionCb=null; requestRender();
      if(rs.start&&rs.cur){
        const ax=rs.start[0],ay=rs.start[1],bx=rs.cur[0],by=rs.cur[1];
        const x0=Math.min(ax,bx),y0=Math.min(ay,by),x1=Math.max(ax,bx),y1=Math.max(ay,by);
        if(x1-x0>8&&y1-y0>8){
          const r={x:state.cam.x+x0/state.cam.scale,y:state.cam.y+y0/state.cam.scale,
                   w:(x1-x0)/state.cam.scale,h:(y1-y0)/state.cam.scale};
          if(cb)cb(r);
        } else flash("Region too small — export cancelled.");
      }
      return;
    }
    if(state.customDrag){ const id=state.customDrag; state.customDrag=null; down=false; if(dragged)markDirty(); else selectCustomLabel(id); return; }
    if(state.labelDrag){ state.labelDrag=null; down=false; markDirty(); return; }
    if(state.nodeDrag){ state.nodeDrag=null; down=false; _geoDirty=true; renderMap(); markDirty(); return; }
    if(state.moveDrag){ state.moveDrag=null; down=false; _geoDirty=true; renderMap(); renderLeft(); markDirty(); return; }
    if(!down)return; down=false;
    if(painted){ _labelsDirty=true; renderLeft(); markDirty(); requestRender(); painted=false; }
    if(state.tilt||dragged)return;   // a drag was a pan or a paint-stroke, not a click
    const [wx,wy]=screenToWorld(ev);
    if(state.tool==="textlabel"){
      const t=prompt("Label text:","");
      if(t&&t.trim()){ beginEdit(); const lb={id:uid(),x:Math.round(wx),y:Math.round(wy),text:t.trim(),size:38,color:"#2b3038"}; world.labels.push(lb); setTool("select"); selectCustomLabel(lb.id); markDirty(); }
      return;
    }
    if(state.tool==="select"){ const lid=customLabelAt(ev); if(lid){ selectCustomLabel(lid); return; } }
    if(DRAW_TOOLS.includes(state.tool)){
      let c=state.focusedContinent?world.continents.find(x=>x.id===state.focusedContinent):null;
      if(!c){const hit=continentAt(wx,wy); if(hit){c=hit; state.focusedContinent=c.id;}}
      if(!c){flash("Pick or add a continent to draw on first.");return;}
      const sc=state.drawCursor?{x:state.drawCursor.x,y:state.drawCursor.y}:{x:wx,y:wy};   // use snapped point
      if(!state.draft)state.draft=[];
      state.draft.push([Math.round(sc.x-c.ox),Math.round(sc.y-c.oy)]); requestRender(); return;
    }
    if(state.editMode){ const ws=waterAt(wx,wy); if(ws){ selectWater(ws.type,ws.id); return; } }
    const p=provinceAt(wx,wy);
    if(p){ onProvinceClick(p); return; }
    const c=continentAt(wx,wy);
    if(c){ state.focusedContinent=c.id; selectContinent(c.id); }
  });
  cv.addEventListener("dblclick",ev=>{
    if(state.tool==="select" && state.showNames){ const cid=continentLabelAt(ev); if(cid){ const c=world.continents.find(x=>x.id===cid); if(c&&c.labelPos){beginEdit();delete c.labelPos;renderMap();markDirty();flash("Name position reset.");} return; } }
    if(DRAW_TOOLS.includes(state.tool)){ev.preventDefault();finishDraft();return;}
    if(state.tool==="nodes"){ ev.preventDefault();
      const h=nodeAt(ev);
      if(h){ if(h.p.points.length>3){beginEdit();h.p.points.splice(h.i,1);_geoDirty=true;renderMap();markDirty();flash("Vertex removed.");} else flash("A province needs at least 3 corners."); return; }
      const [wx,wy]=screenToWorld(ev); const e=edgeAt(wx,wy);
      if(e){beginEdit();e.p.points.splice(e.i,0,e.local);_geoDirty=true;renderMap();markDirty();flash("Vertex added — drag it to reshape.");}
      return;
    }
  });

  cv.addEventListener("wheel",ev=>{
    ev.preventDefault(); if(state.tilt)return;
    const rect=cv.getBoundingClientRect();
    const mx=ev.clientX-rect.left, my=ev.clientY-rect.top;
    const wx=state.cam.x+mx/state.cam.scale, wy=state.cam.y+my/state.cam.scale;
    const f=ev.deltaY>0?0.88:1.14;
    state.cam.scale=Math.max(0.02,Math.min(40,state.cam.scale*f));
    state.cam.x=wx-mx/state.cam.scale; state.cam.y=wy-my/state.cam.scale; requestRender();
  },{passive:false});

  window.addEventListener("keydown",ev=>{
    const inField=(ev.target.tagName==="INPUT"||ev.target.tagName==="TEXTAREA"||ev.target.tagName==="SELECT");
    if((ev.ctrlKey||ev.metaKey)&&!inField){
      const k=ev.key.toLowerCase();
      if(k==="z"&&!ev.shiftKey){ev.preventDefault();doUndo();return;}
      if(k==="y"||(k==="z"&&ev.shiftKey)){ev.preventDefault();doRedo();return;}
    }
    if(ev.key==="Enter"&&DRAW_TOOLS.includes(state.tool))finishDraft();
    if(ev.key==="Escape"){if(state.regionSel){state.regionSel=null;_regionCb=null;flash("Region export cancelled.");}if(state.split){state.split=null;flash("Split cancelled.");}state.draft=null;state.nodeDrag=null;requestRender();}
    if(inField)return;
    if(/^[1-9]$/.test(ev.key)){const m=MAPMODE_BAR[+ev.key-1]; if(m){setMapmode(m[0]);return;}}
    if(ev.key==="v")setTool("select");
    if(ev.key==="d")setTool("draw");
    if(ev.key==="b")setTool("paint");
    if(ev.key==="e")setTool("nodes");
  });
  window.addEventListener("resize",requestRender);
}

/* ============================================================
   VIEW: tilt, world view, focus, zoom
   ============================================================ */
function toggleTilt(force){
  state.tilt=(typeof force==="boolean")?force:!state.tilt;
  $("#map").classList.toggle("tilt",state.tilt);
  $("#toggleTilt").classList.toggle("on",state.tilt);
  if(state.tilt)flash("Tilt view — look only. Toggle off to edit or pan.");
}
function fitTo(b,padFrac){
  const cv=$("#map"); const cw=cv.clientWidth||800, ch=cv.clientHeight||600;
  const pad=1+(padFrac||0.1);
  const s=Math.min(cw/(b.w*pad), ch/(b.h*pad));
  state.cam.scale=Math.max(0.02,Math.min(8,s));
  state.cam.x=b.x-(cw/state.cam.scale-b.w)/2;
  state.cam.y=b.y-(ch/state.cam.scale-b.h)/2;
  requestRender();
}
function worldView(){ fitTo(contentBounds(),0.08); }
function focusContinent(cid){ fitTo(contBoxC(cid),0.25); }
function zoomBy(f){
  const cv=$("#map"); const cw=(cv.clientWidth||800)/2, ch=(cv.clientHeight||600)/2;
  const wx=state.cam.x+cw/state.cam.scale, wy=state.cam.y+ch/state.cam.scale;
  state.cam.scale=Math.max(0.02,Math.min(40,state.cam.scale*f));
  state.cam.x=wx-cw/state.cam.scale; state.cam.y=wy-ch/state.cam.scale; requestRender();
}

/* ============================================================
   MODALS: lists, eras, menu
   ============================================================ */
function openModal(html){const h=$("#modalHost");h.innerHTML=`<div class="modal">${html}</div>`;h.classList.remove("hidden");
  h.onclick=e=>{if(e.target===h)closeModal();};}
function closeModal(){$("#modalHost").classList.add("hidden");$("#modalHost").innerHTML="";}

/* ============================================================
   EXPORT MAP (PNG): whole map / current view / custom region,
   optional legend overlay or side panel.
   ============================================================ */
function currentViewRect(){
  const cv=$("#map");const cw=cv.clientWidth||800,ch=cv.clientHeight||600;
  return {x:state.cam.x,y:state.cam.y,w:cw/state.cam.scale,h:ch/state.cam.scale};
}
function exportRender(rect,outW,mode,legend,legendPos,provNames=true){
  outW=Math.max(300,Math.min(12000,Math.round(outW)));
  // "provincemap": realm colors, but no realm/region names — every province labelled instead.
  const isProvMap=(mode==="provincemap");
  const renderMode=isProvMap?"political":mode;
  if(isProvMap)legend=false;
  const s=outW/rect.w, mapW=outW, mapH=Math.max(1,Math.round(rect.h*s));
  let entries=legend?legendEntries(renderMode):[]; let extra=0; const CAP=80;
  if(entries.length>CAP){extra=entries.length-CAP+1;entries=entries.slice(0,CAP-1);}
  const fs=Math.min(26,Math.max(12,Math.round(outW/110))), rowH=Math.round(fs*1.5), pad=Math.round(fs*0.9), sw=fs;
  const title=MODE_TITLES[mode]||mode;
  const meas=document.createElement("canvas").getContext("2d");meas.font=`${fs}px system-ui,sans-serif`;
  let textW=meas.measureText(title).width;
  entries.forEach(([c,l])=>{textW=Math.max(textW,sw+8+meas.measureText(l).width);});
  if(extra)textW=Math.max(textW,meas.measureText("+"+extra+" more…").width);
  const legW=Math.ceil(textW)+pad*2, legH=pad*2+rowH*(entries.length+1)+(extra?rowH:0);
  const panelR=legend&&legendPos==="panel-right", panelB=legend&&legendPos==="panel-below";
  let canvW=mapW, canvH=mapH;
  if(panelR)canvW=mapW+legW+pad*2;
  if(panelB)canvH=mapH+legH+pad*2;
  const cv=document.createElement("canvas");cv.width=canvW;cv.height=canvH;const ctx=cv.getContext("2d");
  ctx.fillStyle="#e9eef3";ctx.fillRect(0,0,canvW,canvH);
  ctx.save();ctx.beginPath();ctx.rect(0,0,mapW,mapH);ctx.clip();
  const g=ctx.createRadialGradient(mapW/2,mapH*0.35,0,mapW/2,mapH*0.35,Math.max(mapW,mapH)*0.9);
  g.addColorStop(0,"#eaf3fa");g.addColorStop(0.55,"#dbe9f2");g.addColorStop(1,"#cfe0ee");
  ctx.fillStyle=g;ctx.fillRect(0,0,mapW,mapH);
  const prevMode=state.mapmode; state.mapmode=renderMode;
  ctx.setTransform(s,0,0,s,-rect.x*s,-rect.y*s);
  world.continents.forEach(c=>{let lc=_landCache[c.id]; if(lc===undefined)lc=_landCache[c.id]=buildLandCanvas(c.id);
    if(lc){ctx.save();ctx.globalAlpha=0.22;ctx.filter="brightness(0)";ctx.drawImage(lc.canvas,lc.x+10/s,lc.y+16/s,lc.w,lc.h);ctx.restore();
      ctx.drawImage(lc.canvas,lc.x,lc.y,lc.w,lc.h);}});
  if(s>0.12){ctx.lineWidth=1/s;ctx.strokeStyle="rgba(90,98,112,.45)";}
  for(const gp of _provGeo){const pts=gp.pts;if(!pts.length)continue;ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fillStyle=provinceFill(gp.p);ctx.fill();if(s>0.12)ctx.stroke();}
  drawWater(ctx,s);
  if(renderMode!=="political") drawRealmBorders(ctx);
  ctx.setTransform(1,0,0,1,0,0);ctx.textAlign="center";ctx.textBaseline="middle";
  const keySz=Math.max(5,Math.round(mapW/360));   // capital/admin marker size (shared) — small so it doesn't crowd labels
  // markers first, so names/labels render on top of the capital stars & admin diamonds
  drawKeyLocations(ctx, rect.x, rect.y, s, mapW, mapH, keySz);
  if(isProvMap){
    // Label every province, wrapping/rotating/scaling the text to fit its borders.
    const provMaxFs=Math.max(14,Math.round(mapW/120));
    for(const gl of _provGeo){
      if(Math.max((gl.maxx-gl.minx),(gl.maxy-gl.miny))*s<9)continue;
      const X=(gl.cx-rect.x)*s,Y=(gl.cy-rect.y)*s;if(X<-40||Y<-20||X>mapW+40||Y>mapH+20)continue;
      drawFittedLabel(ctx,gl.p.name,X,Y,gl.ang,gl.len*s,gl.thick*s,provMaxFs, _keyLocMap[gl.p.id]?keySz*1.5:0);
    }
  } else if(provNames && s>0.45){const pMax=Math.max(12,Math.round(mapW/160));
    for(const gl of _provGeo){if(Math.max((gl.maxx-gl.minx),(gl.maxy-gl.miny))*s<46)continue;const X=(gl.cx-rect.x)*s,Y=(gl.cy-rect.y)*s;if(X<-40||Y<-20||X>mapW+40||Y>mapH+20)continue;drawFittedLabel(ctx,gl.p.name,X,Y,gl.ang,gl.len*s,gl.thick*s,pMax, _keyLocMap[gl.p.id]?keySz*1.5:0);}}
  // landmass names at their on-map placement (skip small landmasses, like the map)
  const nfs=Math.max(16,Math.round(mapW/110));
  ctx.font=`600 ${nfs}px system-ui,sans-serif`;
  world.continents.forEach(c=>{
    if((_contProvCount[c.id]||0)<30) return;
    const b=contBoxC(c.id);
    const lx=c.labelPos?c.labelPos[0]:b.x+b.w/2, ly=c.labelPos?c.labelPos[1]:b.y-14;
    const X=(lx-rect.x)*s, Y=(ly-rect.y)*s;
    if(X<-200||X>mapW+200||Y<-30||Y>mapH+30) return;
    ctx.lineWidth=Math.max(3,nfs*0.2);ctx.strokeStyle="rgba(255,255,255,.9)";ctx.fillStyle="#46506a";
    ctx.strokeText(c.name,X,Y);ctx.fillText(c.name,X,Y);
  });
  if(!isProvMap){const _lg=computeLabelGroups(renderMode);
  for(const lg of _lg){let fontPx=Math.sqrt(lg.a)*0.20*s;if(fontPx<10)continue;fontPx=Math.min(fontPx,300);
    const X=(lg.x-rect.x)*s,Y=(lg.y-rect.y)*s;if(X<-300||Y<-100||X>mapW+300||Y>mapH+100)continue;
    const txt=(lg.text||"").toUpperCase();if(!txt)continue;
    ctx.font=`600 ${fontPx}px Georgia,serif`;
    const maxW=lg.axisLen*s,straight=ctx.measureText(txt).width+fontPx*0.16*(txt.length-1);
    if(straight>maxW&&maxW>16)fontPx*=maxW/straight; if(fontPx<10)continue;
    ctx.lineWidth=Math.max(2,fontPx*0.16);ctx.strokeStyle="rgba(255,255,255,.85)";ctx.fillStyle="#22262e";
    drawArcText(ctx,txt,X,Y,fontPx,fontPx*0.16,0.18,lg.angle);}}
  drawCustomLabels(ctx, rect.x, rect.y, s, mapW, mapH, false);
  drawScaleBar(ctx, s/distPerWorldUnit(), mapW-Math.round(mapW*0.012), mapH-Math.round(mapW*0.012), Math.max(14,Math.round(mapW/130)), unitLabel());
  state.mapmode=prevMode;ctx.restore();
  if(legend){
    let lx,ly;
    if(panelR){lx=mapW+pad;ly=pad;}
    else if(panelB){lx=pad;ly=mapH+pad;}
    else{const m=Math.round(pad*1.2);lx=legendPos.includes("right")?mapW-legW-m:m;ly=legendPos.includes("bottom")?mapH-legH-m:m;}
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle=(panelR||panelB)?"#ffffff":"rgba(255,255,255,.93)";roundRect(ctx,lx,ly,legW,legH,10);ctx.fill();
    ctx.lineWidth=1.5;ctx.strokeStyle="#d6dde8";ctx.stroke();
    ctx.textAlign="left";ctx.textBaseline="middle";
    ctx.fillStyle="#2b3038";ctx.font=`700 ${fs}px system-ui,sans-serif`;ctx.fillText(title,lx+pad,ly+pad+rowH/2);
    ctx.font=`${fs}px system-ui,sans-serif`;let yy=ly+pad+rowH*1.5;
    entries.forEach(([c,l])=>{ctx.fillStyle=c;ctx.fillRect(lx+pad,yy-sw/2,sw,sw);ctx.lineWidth=1;ctx.strokeStyle="rgba(0,0,0,.2)";ctx.strokeRect(lx+pad,yy-sw/2,sw,sw);ctx.fillStyle="#2b3038";ctx.fillText(l,lx+pad+sw+8,yy);yy+=rowH;});
    if(extra){ctx.fillStyle="#71798a";ctx.fillText("+"+extra+" more…",lx+pad,yy);}
  }
  return cv;
}
function doExport(rect,outW,mode,legend,legendPos){
  if(rect.w<=0||rect.h<=0){flash("Nothing to export.");return;}
  const cv=exportRender(rect,outW,mode,legend,legendPos);
  const a=document.createElement("a");a.href=cv.toDataURL("image/png");a.download=`${world.name}-${mode}.png`;a.click();
  flash("Exported "+(MODE_TITLES[mode]||mode)+" map as PNG.");
}
function openExport(){
  const modeOpts=Object.keys(MODE_TITLES).map(m=>`<option value="${m}" ${m===state.mapmode?"selected":""}>${MODE_TITLES[m]}</option>`).join("");
  openModal(`<button class="btn close" onclick="closeModal()">✕ Close</button><h2>Export map as PNG</h2>
    <div class="field"><label>Map mode</label><select id="exMode">${modeOpts}</select></div>
    <div class="field"><label>Area</label><select id="exArea">
      <option value="whole">Whole map</option>
      <option value="view" selected>Current view</option>
      <option value="region">Custom region — drag a box on the map</option>
    </select></div>
    <div class="field"><label>Output width (pixels) — height scales automatically</label>
      <input id="exW" type="number" value="4000" min="400" max="12000"/></div>
    <div class="field"><label><input type="checkbox" id="exLeg"/> Include a map-mode legend</label></div>
    <div class="field hidden" id="exLegPosWrap"><label>Legend placement</label><select id="exLegPos">
      <option value="tl">Overlay — top-left</option>
      <option value="tr">Overlay — top-right</option>
      <option value="bl">Overlay — bottom-left</option>
      <option value="br" selected>Overlay — bottom-right</option>
      <option value="panel-right">Side panel — right of map</option>
      <option value="panel-below">Side panel — below map</option>
    </select></div>
    <div class="btnrow"><button class="btn primary" id="exGo">Export PNG</button></div>
    <p class="note">Tip: "Custom region" lets you drag a rectangle on the map to export just that area.</p>`);
  $("#exLeg").onchange=e=>$("#exLegPosWrap").classList.toggle("hidden",!e.target.checked);
  const POS={tl:"top-left",tr:"top-right",bl:"bottom-left",br:"bottom-right","panel-right":"panel-right","panel-below":"panel-below"};
  $("#exGo").onclick=()=>{
    const mode=$("#exMode").value, outW=+$("#exW").value||4000, legend=$("#exLeg").checked, legendPos=POS[$("#exLegPos").value], area=$("#exArea").value;
    if(area==="whole"){const b=contentBounds();closeModal();doExport({x:b.x-20,y:b.y-20,w:b.w+40,h:b.h+40},outW,mode,legend,legendPos);}
    else if(area==="view"){closeModal();doExport(currentViewRect(),outW,mode,legend,legendPos);}
    else{closeModal();startRegionSelect(r=>doExport(r,outW,mode,legend,legendPos));}
  };
}
let _regionCb=null;
function startRegionSelect(cb){
  _regionCb=cb; state.regionSel={start:null,cur:null,active:true};
  if(state.tilt)toggleTilt(false);
  flash("Drag a rectangle on the map to set the export region (Esc to cancel).");
}
// The map modes & exact filenames the "Herald" maps folder expects.
const HERALD_EXPORT=[
  ["political","realm.png","Political"],
  ["provincemap","province.png","Province Map"],
  ["terrain","terrain.png","Terrain"],
  ["settlement","settlements.png","Settlements"],
  ["resource","resource.png","Resource"],
  ["religion","religion.png","Religion"],
  ["culture","culture.png","Culture"],
  ["race","racial.png","Racial"],
  ["language","language.png","Language"],
  ["population","population.png","Population"],
];
// Batch-export the relevant map modes as PNGs named for the Herald format,
// into maps/current/ (live) or maps/archive/<phase>/ (archived phase).
function openExportAll(){
  openModal(`<button class="btn close" onclick="closeModal()">✕ Close</button><h2>Export maps (Herald format)</h2>
    <p class="note">Renders the world in the 10 relevant map modes and writes them with Herald's exact filenames: <b>realm, province, terrain, settlements, resource, religion, culture, racial, language, population</b> (.png). The <b>province</b> map shows realm colors with every province named (no realm names).</p>
    <div class="field"><label>Herald <b>maps</b> folder</label><input id="eaBase" type="text" value="Z:\\herald\\maps"/></div>
    <p class="note">Point this at your Herald <b>maps</b> folder (default <b>Z:\\herald\\maps</b>). “Update current” writes to <b>Z:\\herald\\maps\\current</b>; “Archive phase” writes to <b>Z:\\herald\\maps\\archive\\&lt;phase&gt;</b>. A relative name is created inside the Project Sovereign folder instead.</p>
    <div class="field2">
      <div class="field"><label>Output width (px)</label><input id="eaW" type="number" value="4000" min="600" max="12000"/></div>
      <div class="field"><label style="display:block;margin-top:18px"><input type="checkbox" id="eaLeg"/> Bake legend in</label></div>
    </div>
    <div class="btnrow"><button class="btn primary" id="eaCur">⬇ Update current</button></div>
    <p class="note">“Update current” re-renders the maps and writes them to <b>maps/current</b>.</p>
    <div class="sectionH">Archive a phase</div>
    <p class="note">Copies the current maps into <b>maps/archive/&lt;phase&gt;/&lt;set&gt;</b> — a snapshot of the live set (no re-render). Add multiple <b>sets</b> under one phase to record how it changed over time. Leave “Set” blank to auto-number (Set 1, Set 2, …).</p>
    <div class="field2">
      <div class="field"><label>Phase name</label><input id="eaPhase" type="text" placeholder="e.g. Phase II  or  419 AC"/></div>
      <div class="field"><label>Set (optional)</label><input id="eaSet" type="text" placeholder="e.g. Start, After the siege…"/></div>
    </div>
    <div class="btnrow"><button class="btn" id="eaArc">⬇ Archive current → phase / set</button></div>
    <div class="note" id="eaStatus"></div>`);
  async function run(folder){
    const outW=+$("#eaW").value||4000, legend=$("#eaLeg").checked;
    const b=contentBounds(), rect={x:b.x-20,y:b.y-20,w:b.w+40,h:b.h+40};
    const st=$("#eaStatus"); $("#eaCur").disabled=$("#eaArc").disabled=true;
    const files=[];
    for(let i=0;i<HERALD_EXPORT.length;i++){
      const [mode,fname,label]=HERALD_EXPORT[i];
      st.textContent=`Rendering ${label} (${i+1}/${HERALD_EXPORT.length})…`;
      await new Promise(r=>setTimeout(r,10));
      const wantLeg=(mode==="terrain"||mode==="resource"||mode==="population");   // these maps always get a legend
      const useLeg=wantLeg?true:legend;
      const legPos=wantLeg?"bottom-left":"bottom-right";
      const cv=exportRender(rect,outW,mode,useLeg,legPos,false);  // Herald maps: landmass names only, no province names
      files.push({name:fname, data:cv.toDataURL("image/png").split(",")[1]});
    }
    st.textContent="Saving to disk…";
    try{
      const res=await fetch("/api/export",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({folder,files})});
      const j=await res.json();
      if(j.ok) st.innerHTML=`✓ Saved ${j.saved.length} maps to:<br><b>${esc(j.folder)}</b>`;
      else st.textContent="Error: "+(j.error||"export failed");
    }catch(e){ st.textContent="Error: "+e.message; }
    $("#eaCur").disabled=$("#eaArc").disabled=false;
  }
  const base=()=>($("#eaBase").value||"Z:\\herald\\maps").trim().replace(/[\\/]+$/,"");
  $("#eaCur").onclick=()=>run(base()+"/current");
  $("#eaArc").onclick=async()=>{
    const ph=($("#eaPhase").value||"").trim().replace(/[\\/]+/g,"-").replace(/\.\./g,".");
    if(!ph){$("#eaStatus").textContent="Enter a phase name to archive.";return;}
    const set=($("#eaSet").value||"").trim().replace(/[\\/]+/g,"-").replace(/\.\./g,".");
    const st=$("#eaStatus"); $("#eaCur").disabled=$("#eaArc").disabled=true; st.textContent="Archiving the current maps…";
    try{
      const res=await fetch("/api/archive",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({base:base(),phase:ph,set})});
      const j=await res.json();
      if(j.ok) st.innerHTML=`✓ Archived ${j.copied.length} maps to <b>${esc(ph)} / ${esc(j.set)}</b>:<br><span class="note">${esc(j.folder)}</span>`;
      else st.textContent="Error: "+(j.error||"archive failed");
    }catch(e){ st.textContent="Error: "+e.message; }
    $("#eaCur").disabled=$("#eaArc").disabled=false;
  };
}

// keep world data in sync when a list entry is renamed or deleted
function applyListRename(k,ov,nv){
  if(ov===nv||!nv)return;
  if(world.colors[k]&&world.colors[k][ov]!==undefined){world.colors[k][nv]=world.colors[k][ov];delete world.colors[k][ov];}
  const P=world.provinces,R=world.realms;
  const ax=key=>P.forEach(p=>{let ch=false;(p.pops||[]).forEach(q=>{if(q[key]===ov){q[key]=nv;ch=true;}});if(ch)deriveProvince(p);});
  if(k==="religions"){ax("religion");R.forEach(r=>{if(r.stateReligion===ov)r.stateReligion=nv;});}
  else if(k==="cultures"){ax("culture");R.forEach(r=>{if(r.dominantCulture===ov)r.dominantCulture=nv;});}
  else if(k==="races"){ax("race");R.forEach(r=>{if(r.dominantRace===ov)r.dominantRace=nv;});}
  else if(k==="languages"){ax("language");R.forEach(r=>{if(r.dominantLanguage===ov)r.dominantLanguage=nv;});}
  else if(k==="terrains"){P.forEach(p=>{if(p.terrain===ov)p.terrain=nv;});}
  else if(k==="settlements"){P.forEach(p=>{if(p.settlement===ov)p.settlement=nv;});}
  else if(k==="resources"){P.forEach(p=>{if(p.resource===ov)p.resource=nv;});}
  else if(k==="features"){P.forEach(p=>p.features=p.features.map(f=>f===ov?nv:f));}
  else if(k==="governments"){R.forEach(r=>{if(r.government===ov)r.government=nv;});}
  else if(k==="economies"){R.forEach(r=>{if(r.economy===ov)r.economy=nv;});}
}
function listUsageCount(k,v){
  const P=world.provinces,R=world.realms; let n=0;
  const ax=key=>P.forEach(p=>{if((p.pops||[]).some(q=>q[key]===v))n++;});
  if(k==="religions"){ax("religion");} else if(k==="cultures"){ax("culture");}
  else if(k==="races"){ax("race");} else if(k==="languages"){ax("language");}
  else if(k==="terrains")n=P.filter(p=>p.terrain===v).length;
  else if(k==="settlements")n=P.filter(p=>p.settlement===v).length;
  else if(k==="resources")n=P.filter(p=>p.resource===v).length;
  else if(k==="features")n=P.filter(p=>p.features.includes(v)).length;
  else if(k==="governments")n=R.filter(r=>r.government===v).length;
  else if(k==="economies")n=R.filter(r=>r.economy===v).length;
  return n;
}
function applyListDelete(k,v){
  const P=world.provinces,R=world.realms;
  const axDel=key=>P.forEach(p=>{let ch=false;(p.pops||[]).forEach(q=>{if(q[key]===v){q[key]="";ch=true;}});if(ch)deriveProvince(p);});
  if(k==="religions"){axDel("religion");R.forEach(r=>{if(r.stateReligion===v)r.stateReligion="";});}
  else if(k==="cultures"){axDel("culture");R.forEach(r=>{if(r.dominantCulture===v)r.dominantCulture="";});}
  else if(k==="races"){axDel("race");R.forEach(r=>{if(r.dominantRace===v)r.dominantRace="";});}
  else if(k==="languages"){axDel("language");R.forEach(r=>{if(r.dominantLanguage===v)r.dominantLanguage="";});}
  else if(k==="features"){P.forEach(p=>p.features=p.features.filter(f=>f!==v));}
  else if(k==="terrains"){const fb=(world.lists.terrains.find(x=>x!==v))||"Plains";P.forEach(p=>{if(p.terrain===v)p.terrain=fb;});}
  else if(k==="settlements"){const fb=(world.lists.settlements.find(x=>x!==v))||"Uninhabited";P.forEach(p=>{if(p.settlement===v)p.settlement=fb;});}
  else if(k==="resources"){const fb=(world.lists.resources.find(x=>x!==v))||"Grain";P.forEach(p=>{if(p.resource===v)p.resource=fb;});}
  else if(k==="governments"){const fb=(world.lists.governments.find(x=>x!==v))||"";R.forEach(r=>{if(r.government===v)r.government=fb;});}
  else if(k==="economies"){const fb=(world.lists.economies.find(x=>x!==v))||"";R.forEach(r=>{if(r.economy===v)r.economy=fb;});}
}
const LIST_KEYS=[["religions","Religions"],["cultures","Cultures"],["races","Races"],["languages","Languages"],["terrains","Terrains"],["settlements","Settlement tiers"],["resources","Resources"],["features","Features"],["governments","Government types"],["economies","Economy types"]];
const MODE_LIST={religion:"religions",culture:"cultures",race:"races",language:"languages",terrain:"terrains",settlement:"settlements",resource:"resources"};
function randomizeCategory(k){
  world.colors[k]=world.colors[k]||{};
  const start=Math.random()*360;
  world.lists[k].forEach((name,idx)=>{ const h=Math.round((start+idx*137.508)%360); world.colors[k][name]=toHex(`hsl(${h} 60% 56%)`); });
  renderListCard(k); renderMap(); renderLeft(); markDirty(); flash("Randomised the "+k+" palette.");
}
function openLists(focusKey){
  const cards=LIST_KEYS.map(([k,label])=>`<div class="listcard" id="card_${k}"><h3>${label}</h3><div id="lc_${k}"></div>
    <button class="btn tiny" data-add="${k}">＋ add</button>${COLORABLE.includes(k)?`<button class="btn tiny" data-rand="${k}" title="Give this category a fresh random palette">🎲 palette</button>`:""}</div>`).join("");
  openModal(`<button class="btn close" onclick="closeModal()">✕ Close</button><h2>Manage lists</h2>
    <p class="note">These power the map-mode categories, dropdowns and colours. Renaming an entry updates every province/realm using it; deleting one is blocked if it's in use unless you confirm. Click a swatch to recolour, <b>↺</b> to reset it to default, or <b>🎲 palette</b> to recolour a whole category.</p>
    <div class="gridlists">${cards}</div>`);
  LIST_KEYS.forEach(([k])=>renderListCard(k));
  $$("[data-add]").forEach(b=>b.onclick=()=>{world.lists[b.dataset.add].push("New entry");renderListCard(b.dataset.add);renderMap();renderLeft();markDirty();});
  $$("[data-rand]").forEach(b=>b.onclick=()=>randomizeCategory(b.dataset.rand));
  if(focusKey&&$("#card_"+focusKey)){const el2=$("#card_"+focusKey);el2.style.outline="2px solid var(--accent)";el2.scrollIntoView({block:"center"});}
}
const COLORABLE=["religions","cultures","races","languages","terrains","settlements","resources"];
function renderListCard(k){
  const wrap=$("#lc_"+k);if(!wrap)return;wrap.innerHTML="";
  const colorable=COLORABLE.includes(k);
  world.lists[k].forEach((v,i)=>{
    const row=div("li");
    const custom=colorable&&world.colors[k]&&world.colors[k][v]!==undefined;
    const colInput=colorable?`<input class="lcol" type="color" value="${toHex(catColor(k,v))}" title="Map colour" style="width:30px;height:26px;padding:1px;flex:0 0 auto"/><span class="rst" title="Reset to default colour" style="cursor:pointer;font-size:15px;flex:0 0 auto;color:${custom?'var(--accent)':'var(--muted)'}">↺</span>`:"";
    row.innerHTML=`<input class="lname" value="${esc(v)}"/>${colInput}<span class="x" title="Delete">✕</span>`;
    const inp=row.querySelector(".lname");
    inp.addEventListener("change",e=>{const ov=world.lists[k][i],nv=e.target.value.trim();if(!nv){e.target.value=ov;return;}world.lists[k][i]=nv;applyListRename(k,ov,nv);renderMap();renderLeft();markDirty();});
    if(colorable){
      row.querySelector(".lcol").addEventListener("input",e=>{world.colors[k]=world.colors[k]||{};world.colors[k][world.lists[k][i]]=e.target.value;row.querySelector(".rst").style.color="var(--accent)";renderMap();renderLeft();markDirty();});
      row.querySelector(".rst").onclick=()=>{if(world.colors[k])delete world.colors[k][world.lists[k][i]];renderListCard(k);renderMap();renderLeft();markDirty();};
    }
    row.querySelector(".x").onclick=()=>{
      const v0=world.lists[k][i], used=listUsageCount(k,v0);
      if(used>0 && !confirm(`"${v0}" is used by ${used} ${used===1?"place":"places"}. Delete it and clear those references?`))return;
      applyListDelete(k,v0); if(world.colors[k])delete world.colors[k][v0]; world.lists[k].splice(i,1); renderListCard(k); renderMap(); renderLeft(); markDirty();
    };
    wrap.appendChild(row);
  });
}
function openEras(){
  openModal(`<button class="btn close" onclick="closeModal()">✕ Close</button><h2>Ages / timeline</h2>
    <p class="note">Ages let the same world evolve across your campaign. History entries are tagged by age.</p>
    <div id="eraWrap"></div><button class="btn tiny" id="eraAdd">＋ add age</button>`);
  const render=()=>{
    const w=$("#eraWrap");w.innerHTML="";
    world.eras.forEach((e,i)=>{
      const row=div("li");row.style.margin="6px 0";
      row.innerHTML=`<input value="${esc(e.name)}" style="flex:1;background:var(--panel2);border:1px solid var(--line);color:var(--ink);padding:6px;border-radius:6px"/>
        <button class="btn tiny" data-up="${i}">▲</button><button class="btn tiny" data-dn="${i}">▼</button><span class="x" style="color:var(--bad);cursor:pointer">✕</span>`;
      row.querySelector("input").addEventListener("input",ev=>{e.name=ev.target.value;rebuildEraSelect();markDirty();});
      row.querySelector(".x").onclick=()=>{world.eras.splice(i,1);render();rebuildEraSelect();markDirty();};
      row.querySelector("[data-up]").onclick=()=>{if(i>0){[world.eras[i-1],world.eras[i]]=[world.eras[i],world.eras[i-1]];render();rebuildEraSelect();markDirty();}};
      row.querySelector("[data-dn]").onclick=()=>{if(i<world.eras.length-1){[world.eras[i+1],world.eras[i]]=[world.eras[i],world.eras[i+1]];render();rebuildEraSelect();markDirty();}};
      w.appendChild(row);
    });
  };
  render();
  $("#eraAdd").onclick=()=>{world.eras.push({id:uid(),name:"New Age"});render();rebuildEraSelect();markDirty();};
}
async function openMenu(){
  const worlds=await listWorlds();
  openModal(`<button class="btn close" onclick="closeModal()">✕ Close</button><h2>Worlds & data</h2>
    <div class="field"><label>Saved worlds on disk</label>
      <div id="worldsList">${worlds.length?worlds.map(w=>`<div class="li"><span style="flex:1">${esc(w)}</span><button class="btn tiny" data-open="${esc(w)}">Open</button></div>`).join(""):'<div class="note">None yet — saving creates a file named after your world.</div>'}</div></div>
    <div class="btnrow">
      <button class="btn primary" id="mNew">＋ New world</button>
      <button class="btn" id="mSaveAs">💾 Save now</button>
      <button class="btn" id="mExport">⬇ Export JSON</button>
      <button class="btn" id="mArchiveData">🗄 Archive full data to disk…</button>
      <button class="btn" id="mPublish">🌐 Publish player viewer…</button>
      <button class="btn" id="mExportSvg">⬇ Export map (PNG)…</button>
      <button class="btn" id="mExportAll">⬇ Export maps (Herald)…</button>
      <button class="btn" id="mImport">⬆ Import / restore JSON</button>
    </div>
    <p class="note"><b>Export JSON</b> downloads one file containing <i>everything</i> — every province's population, religions, cultures, languages, resources, realms, history and notes. <b>Archive full data to disk</b> saves that same complete snapshot (date-stamped) to a folder so you build up a history you can return to. <b>Import / restore JSON</b> loads any such file back.</p>
    <input type="file" id="fileInput" accept="application/json" class="hidden"/>
    <div class="sectionH">Map scale</div>
    <div class="field2">
      <div class="field"><label>Distance units</label><select id="mUnit">
        <option value="mi" ${world.distanceUnit!=="km"?"selected":""}>Miles</option>
        <option value="km" ${world.distanceUnit==="km"?"selected":""}>Kilometers</option></select></div>
      <div class="field"><label>World width (<span id="mUnitLbl">${unitLabel()}</span>)</label>
        <input id="mScale" type="number" min="10" step="10" value="${Math.round((contentBounds().w||1)*distPerWorldUnit())}"/></div>
    </div>
    <p class="note">Sets the bottom-right distance scale bar. Earth is ~7,900 mi (~12,700 km) across — go bigger for a large world.</p>
    <p class="note">Worlds live as plain JSON in the app's <b>data</b> folder, so you can back them up or share them with players.</p>`);
  $("#mUnit").addEventListener("change",e=>{world.distanceUnit=e.target.value; $("#mUnitLbl").textContent=unitLabel(); $("#mScale").value=Math.round((contentBounds().w||1)*distPerWorldUnit()); renderMap(); markDirty();});
  $("#mScale").addEventListener("change",e=>{const val=+e.target.value; const cw=contentBounds().w||1; if(val>0){const miles=world.distanceUnit==="km"?val/KM_PER_MI:val; world.milesPerUnit=miles/cw; renderMap(); markDirty();}});
  $$("[data-open]").forEach(b=>b.onclick=async()=>{await loadWorld(b.dataset.open);closeModal();});
  $("#mNew").onclick=()=>{if(confirm("Start a fresh world? Unsaved changes to the current one are lost unless saved."))
    {world=normalize(sampleWorld());world.name="New World";world.continents=[];world.provinces=[];world.realms=[];afterLoad();closeModal();}};
  $("#mSaveAs").onclick=()=>saveWorld(false);
  $("#mExport").onclick=()=>downloadText(world.name+" "+tstamp()+".json",JSON.stringify(world,null,2));
  $("#mArchiveData").onclick=archiveDataToDisk;
  $("#mPublish").onclick=publishViewer;
  $("#mExportSvg").onclick=()=>{closeModal();openExport();};
  $("#mExportAll").onclick=()=>{closeModal();openExportAll();};
  $("#mImport").onclick=()=>$("#fileInput").click();
  $("#fileInput").onchange=ev=>{const f=ev.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{world=normalize(JSON.parse(rd.result));afterLoad();saveWorld(true);closeModal();}catch(e){alert("Invalid JSON: "+e.message);}};rd.readAsText(f);};
}

/* ============================================================
   UTIL
   ============================================================ */
function div(cls){const d=document.createElement("div");d.className=cls;return d;}
function esc(s){return (s??"").toString().replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function downloadText(name,text){const b=new Blob([text],{type:"text/plain"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();}
function tstamp(){const d=new Date(),p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}`;}
let _dataArchiveDir="Z:\\herald\\data";
let _viewerPublishDir="Z:\\herald\\viewer";
async function publishViewer(){
  const folder=prompt("Publish the read-only player viewer (index.html, app.js, style.css, world.json) into this folder:",_viewerPublishDir);
  if(!folder)return; _viewerPublishDir=folder.trim();
  try{
    const res=await fetch("/api/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({folder:_viewerPublishDir,world})});
    const j=await res.json();
    if(!j.ok){flash("Error: "+(j.error||"publish failed"));return;}
    flash("Published player viewer → "+j.folder);
    if(confirm("Files written. Push to GitHub now (players see the update in ~1 min)?")){
      flash("Pushing to GitHub…");
      const gr=await fetch("/api/gitpush",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({folder:_viewerPublishDir,message:"Update viewer "+tstamp()})});
      const gj=await gr.json();
      if(gj.ok) flash("Pushed to GitHub ✓ — live in ~1 minute.");
      else alert("Publish succeeded, but the git push didn't complete:\n\n"+(gj.output||gj.error||"unknown")+"\n\nIf this is your first time, do the one-time git setup in "+_viewerPublishDir+" (see instructions), then try again.");
    }
  }catch(e){flash("Error: "+e.message);}
}
async function archiveDataToDisk(){
  const folder=prompt("Save a complete, date-stamped data snapshot into this folder:",_dataArchiveDir);
  if(!folder)return; _dataArchiveDir=folder.trim();
  const name=world.name+" "+tstamp()+".json";
  const data=btoa(unescape(encodeURIComponent(JSON.stringify(world,null,2))));   // base64, unicode-safe
  try{
    const res=await fetch("/api/export",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({folder:_dataArchiveDir,files:[{name,data}]})});
    const j=await res.json();
    if(j.ok)flash("Archived full data → "+j.folder+"\\"+name);
    else flash("Error: "+(j.error||"archive failed"));
  }catch(e){flash("Error: "+e.message);}
}
let flashTimer=null;
function flash(msg){const h=$("#hint");h.textContent=msg;h.classList.add("show");clearTimeout(flashTimer);flashTimer=setTimeout(()=>h.classList.remove("show"),2600);}
function rebuildEraSelect(){
  const s=$("#eraSelect");s.innerHTML=world.eras.map(e=>`<option value="${e.id}" ${e.id===world.currentEraId?"selected":""}>${esc(e.name)}</option>`).join("");
}

/* ============================================================
   BOOT
   ============================================================ */
function afterLoad(){
  $("#worldName").value=world.name;
  loadPings();
  rebuildEraSelect();
  if(!world.currentEraId&&world.eras[0])world.currentEraId=world.eras[0].id;
  state.focusedContinent=world.continents[0]?.id||null;
  // imported maps (province colors, no realms yet) look best in "Imported colors"
  if(world.provinces.some(p=>p.importColor) && !world.realms.length){
    state.mapmode="imported"; const ms=$("#mapmode"); if(ms)ms.value="imported";
  }
  _stars=null; _geoDirty=true;
  rebuildGeo(); worldView(); renderMap(); renderLeft();
  $("#inspector").innerHTML = VIEWER
    ? '<div class="empty">Welcome to the atlas. Switch <b>Map mode</b> up top to recolour the world, and click any province or realm to read its details.</div>'
    : '<div class="empty">Select a province, realm, or continent to edit.<br><br>Use <span class="kbd">Draw</span> to outline a new province, <span class="kbd">Paint</span> to assign provinces to realms.</div>';
}

// bottom-right map-mode buttons (icon + hover tooltip)
// Order matches the number hotkeys 1–9.
const MAPMODE_BAR=[
  ["political","⚑","Political — realms"],
  ["terrain","⛰","Terrain"],
  ["resource","⛏","Resources"],
  ["religion","☩","Religion (dominant)"],
  ["culture","🎭","Culture (dominant)"],
  ["race","👤","Race (dominant)"],
  ["language","🗣","Language (dominant)"],
  ["population","👥","Population"],
  ["settlement","🏘","Settlements"],
];
function buildMapmodeBar(){
  const bar=$("#mapmodeBar"); if(!bar)return; bar.innerHTML="";
  MAPMODE_BAR.forEach(([m,icon,label],i)=>{
    const b=document.createElement("button"); b.className="mmbtn"; b.dataset.mode=m;
    b.title=`${label}  (hotkey ${i+1})`; b.innerHTML=`${icon}<span class="mmkey">${i+1}</span>`;
    b.onclick=()=>setMapmode(m); bar.appendChild(b);
  });
  refreshMapmodeBar();
}
function refreshMapmodeBar(){ $$("#mapmodeBar .mmbtn").forEach(b=>b.classList.toggle("active",b.dataset.mode===state.mapmode)); }
function setMapmode(m){
  state.mapmode=m; state.paintValue=null; state.paintUnclaim=false;
  const ms=$("#mapmode"); if(ms)ms.value=m;
  renderMap(); renderLegend();
  if(state.tool==="paint")flash(paintHint());
}
function updateWorldPop(){
  const el=$("#worldPop"); if(!el)return;
  const total=world.provinces.reduce((a,p)=>a+(p.population||0),0);
  el.textContent="👥 "+total.toLocaleString();
  if($("#popPanel")) buildWorldPopPanel();   // keep an open breakdown fresh
}
const POP_PANEL_AXES=[["race","races","Race"],["religion","religions","Religion"],["culture","cultures","Culture"],["language","languages","Language"]];
function buildWorldPopPanel(){
  const panel=$("#popPanel"); if(!panel)return;
  const grand=world.provinces.reduce((a,p)=>a+(p.population||0),0);
  let html=`<div style="font-weight:700">World population</div><div class="note">${grand.toLocaleString()} people</div>`;
  for(const [key,listKey,label] of POP_PANEL_AXES){
    const {rows}=worldPopBreakdown(key);
    html+=`<h4>${label}</h4>`;
    if(!rows.length){html+='<div class="note">—</div>';continue;}
    for(const r of rows.slice(0,12))
      html+=`<div class="prow"><span class="sw" style="background:${catColor(listKey,r.name)}"></span><span class="nm">${esc(r.name)}</span><span class="vv">${Math.round(r.pct)}% · ${r.size.toLocaleString()}</span></div>`;
  }
  panel.innerHTML=html;
}
function toggleWorldPopPanel(){
  let panel=$("#popPanel");
  if(panel){ panel.remove(); document.removeEventListener("click",_popPanelDismiss,true); return; }
  panel=document.createElement("div"); panel.id="popPanel"; document.body.appendChild(panel);
  buildWorldPopPanel();
  const chip=$("#worldPop").getBoundingClientRect();
  panel.style.top=(chip.bottom+6)+"px";
  let left=chip.left, pw=300; if(left+pw>window.innerWidth-8)left=window.innerWidth-8-pw; if(left<8)left=8;
  panel.style.left=left+"px";
  setTimeout(()=>document.addEventListener("click",_popPanelDismiss,true),0);
}
function _popPanelDismiss(ev){
  const panel=$("#popPanel"); if(!panel)return;
  if(panel.contains(ev.target)||ev.target.id==="worldPop")return;
  panel.remove(); document.removeEventListener("click",_popPanelDismiss,true);
}
function wireTopbar(){
  $("#worldName").addEventListener("input",e=>{world.name=e.target.value;markDirty();});
  $("#eraSelect").addEventListener("change",e=>{world.currentEraId=e.target.value;markDirty();});
  const ms=$("#mapmode"); if(ms)ms.addEventListener("change",e=>setMapmode(e.target.value));
  buildMapmodeBar();
  const wp=$("#worldPop"); if(wp)wp.onclick=toggleWorldPopPanel;
  const bp=$("#btnPing"); if(bp)bp.onclick=togglePing; buildPingBar();
  $$(".btn.tool").forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
  $("#toggleTilt").onclick=()=>toggleTilt();
  $("#worldView").onclick=()=>{worldView();};
  $("#btnNames").onclick=()=>{state.showNames=!state.showNames;$("#btnNames").classList.toggle("on",state.showNames);renderMap();flash(state.showNames?"Landmass names shown — drag a name to reposition it.":"Landmass names hidden.");};
  $("#btnNames").classList.toggle("on",state.showNames);
  $("#btnPanels").onclick=()=>{const hidden=document.body.classList.toggle("panels-hidden");$("#btnPanels").classList.toggle("on",hidden);renderMap();flash(hidden?"Side panels hidden — click Panels again to bring them back.":"Side panels shown.");};
  $("#btnLists").onclick=openLists;
  $("#manageEras").onclick=openEras;
  $("#btnSave").onclick=()=>saveWorld(false);
  $("#btnMenu").onclick=openMenu;
  $("#addContinent").onclick=()=>{
    beginEdit();
    const n=world.continents.length;
    const c={id:uid(),name:"New Continent",ox:200+ (n%3)*1300,oy:200+Math.floor(n/3)*1100,note:""};
    world.continents.push(c);state.focusedContinent=c.id;renderMap();renderLeft();selectContinent(c.id);markDirty();flash("Continent added. Use the Draw tool to add provinces.");
  };
  $("#addRealm").onclick=()=>{
    beginEdit();
    const r={id:uid(),name:"New Realm "+(world.realms.length+1),color:autoPastelHex(),government:world.lists.governments[0],economy:world.lists.economies[0],stateReligion:"",dominantCulture:"",dominantRace:"",leaderName:"",leaderTitle:"",capitalId:null,note:""};
    world.realms.push(r);
    if(state.mapmode==="imported"){state.mapmode="political";const ms=$("#mapmode");if(ms)ms.value="political";}
    renderLeft();selectRealm(r.id);
    setTool("paint");flash("New realm created — click or drag across provinces to paint them into it.");
    markDirty();
  };
  $("#realmSearch").addEventListener("input",renderLeft);
  $("#zin").onclick=()=>zoomBy(1.25);
  $("#zout").onclick=()=>zoomBy(0.8);
  $("#btnUndo").onclick=doUndo;
  $("#btnRedo").onclick=doRedo;
  $("#btnQuit").onclick=async()=>{
    if(!confirm("Save and close Project Sovereign?"))return;
    try{ await saveWorld(true); }catch(e){}
    try{ await fetch("/api/quit",{method:"POST"}); }catch(e){}   // closes the app window + stops the server
    try{ window.close(); }catch(e){}
    setTimeout(()=>{document.body.innerHTML='<div style="padding:40px;font:16px system-ui;color:#444">Project Sovereign has closed. You can close this window (Alt+F4).</div>';},600);
  };
  $("#btnEdit").onclick=()=>{
    state.editMode=!state.editMode;
    document.body.classList.toggle("editing",state.editMode);
    state.draft=null;state.drawCursor=null;state.split=null;state.selWater=null;state.nodeDrag=null;state.moveDrag=null;
    setTool("select");
    flash(state.editMode?"Edit Map mode — draw provinces, rivers and lakes; move, reshape, split and merge.":"View mode.");
  };
}

function applyViewerUI(){
  document.body.classList.add("viewer");
  document.title="Project Sovereign — Atlas";
  const hide=id=>{const e=document.getElementById(id);if(e)e.style.display="none";};
  ["btnEdit","btnUndo","btnRedo","btnSave","btnQuit","btnMenu","btnLists","manageEras","addContinent","addRealm","paneContinents"].forEach(hide);
  // paint tool + the whole edit-map tool group
  const pb=document.querySelector('.btn.tool[data-tool="paint"]'); if(pb)pb.style.display="none";
  const eg=document.querySelector('.topgroup.tools.editonly'); if(eg)eg.style.display="none";
  const wn=$("#worldName"); if(wn)wn.readOnly=true;
  const es=$("#eraSelect"); // era switch just changes which era's history reads as "current"; harmless to keep
  flash("Read-only atlas — click provinces and realms to view their details.");
}
async function boot(){
  wireTopbar();
  setupMapInteraction();
  const worlds=await listWorlds();
  if(worlds.length){ await loadWorld(worlds[0]); }
  else { world=normalize(sampleWorld()); afterLoad(); saveWorld(true); }
}
// Read-only player viewer: load the published static world.json (falls back to
// the live server API so ?viewer works as a preview against the editor).
async function loadStaticWorld(file){
  try{
    const r=await fetch(file,{cache:"no-store"}); if(!r.ok)return false;
    const j=await r.json(); world=normalize(j&&j.world?j.world:j); afterLoad(); return true;
  }catch(e){ return false; }
}
async function bootViewer(){
  wireTopbar();
  setupMapInteraction();
  applyViewerUI();
  let ok=await loadStaticWorld("world.json");
  if(!ok){ try{ const worlds=await listWorlds(); if(worlds.length) ok=await loadWorld(worlds[0]); }catch(e){} }
  if(!ok){ world=normalize(sampleWorld()); afterLoad(); }
}
window.closeModal=closeModal;
(VIEWER?bootViewer:boot)();
/* Project Sovereign — map editor */
/* end of Project Sovereign client */
