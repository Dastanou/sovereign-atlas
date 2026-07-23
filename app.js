/* ============================================================
   PROJECT SOVEREIGN — client app
   EU4-style political map editor for a multi-era D&D campaign.
   ============================================================ */

const SVGNS = "http://www.w3.org/2000/svg";
// Read-only "player viewer" mode: set window.SOVEREIGN_VIEWER=true (published
// build) or add ?viewer to the URL. In this mode nothing can be edited or saved.
// Read-only "player viewer" mode. BOOT_VIEWER = the published/URL flag (never changes).
// VIEWER is the *effective* flag — in the editor a "View Mode" button can preview the viewer.
const BOOT_VIEWER = (typeof window !== "undefined") &&
  (window.SOVEREIGN_VIEWER === true || /[?&]view(er)?\b/i.test(location.search));
let VIEWER = BOOT_VIEWER;
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

/* ---------- resources: regular, prestige (enhanced tiers) & hidden/strategic ---------- */
const REGULAR_RESOURCES=["Grains","Stone","Timber","Fish","Livestock","Cloth","Copper","Stimulants","Semi-Precious Gems","Dyes","Silver","Salt"];
// prestige good -> its base regular resource
const RESOURCE_PRESTIGE={Fruit:"Grains",Sugar:"Grains",Marble:"Stone",Obsidian:"Stone",Hardwood:"Timber",Pitch:"Timber",Whales:"Fish",Honey:"Livestock",Ivory:"Livestock",Papyrus:"Cloth",Silk:"Cloth",Tin:"Copper",Intoxicants:"Stimulants","Precious Gems":"Semi-Precious Gems","Royal Dyes":"Dyes",Gold:"Silver",Spices:"Salt"};
function isPrestige(res){ return RESOURCE_PRESTIGE[res]!==undefined; }
function prestigeOf(base){ return Object.keys(RESOURCE_PRESTIGE).filter(k=>RESOURCE_PRESTIGE[k]===base); }
// Highlight set = the exact selected resource, plus (only if the selection is a base
// regular resource) its prestige goods. Selecting a prestige good highlights only itself.
function resourceBase(res){ return isPrestige(res)?RESOURCE_PRESTIGE[res]:res; }
function inResourceFamily(res,sel){
  if(!res||!sel) return false;
  if(res===sel) return true;                                    // the exact resource
  if(!isPrestige(sel) && RESOURCE_PRESTIGE[res]===sel) return true;  // base → its prestige goods
  return false;
}
function isHiddenRes(res){ return (world&&world.lists&&(world.lists.hiddenResources||[]).includes(res)); }
// Does province p fall inside the current resource spotlight (regular/prestige family OR a hidden resource)?
function resSpotMatch(p,sel){
  if(!sel) return true;
  if(isHiddenRes(sel)) return p.hidden===sel;                   // hidden/strategic: match on the hidden resource
  return inResourceFamily(p.resource,sel);                      // regular + its prestige goods
}
// short display labels for over-long resource names in the compact legend
const RES_LEGEND_ABBR={"Semi-Precious Gems":"S-P Gems"};
function resLabel(res){ return RES_LEGEND_ABBR[res]||res; }
// canonical resource list, ordered base-then-its-prestige-goods
const RESOURCE_LIST=(()=>{const out=[];REGULAR_RESOURCES.forEach(b=>{out.push(b);prestigeOf(b).forEach(p=>out.push(p));});return out;})();
const HIDDEN_RESOURCES=["Horses","Iron","Coal","Saltpeter","Oil","Uranium"];
const HIDDEN_RES_GLYPH={Horses:"🐎",Iron:"⛓️",Coal:"◾",Saltpeter:"🧨",Oil:"🛢️",Uranium:"☢️"};
// Semantic resource colours. Each regular resource has a colour that suits it, and its
// prestige goods share the same hue family (a richer / lighter shade) so families read together.
const RESOURCE_COLORS={
  // Grains — wheat gold; orchard & cane in the warm-amber family
  Grains:"#e3b93e", Fruit:"#e58b3a", Sugar:"#ecd89a",
  // Stone — greys; marble pale, obsidian near-black
  Stone:"#8b9198", Marble:"#d6dbdf", Obsidian:"#3b3f47",
  // Timber — wood browns; hardwood richer, pitch tar-dark
  Timber:"#7b5230", Hardwood:"#5c3a1f", Pitch:"#33251a",
  // Fish — sea blues; whales deeper
  Fish:"#3fa7c0", Whales:"#256f92",
  // Livestock — pastoral tan/leather; honey golden, ivory cream
  Livestock:"#bfa36a", Honey:"#e4a81c", Ivory:"#ece2c8",
  // Cloth — linen warm neutrals; papyrus straw, silk rose sheen
  Cloth:"#c39a86", Papyrus:"#dcc7a0", Silk:"#ce8fb0",
  // Copper — copper orange; tin bronzed
  Copper:"#c0703a", Tin:"#b08a5e",
  // Stimulants — coffee/tea browns; intoxicants reddish
  Stimulants:"#7b5a38", Intoxicants:"#94472b",
  // Semi-Precious Gems — teal-green jewels; precious brighter
  "Semi-Precious Gems":"#3e9e86", "Precious Gems":"#35c0ae",
  // Dyes — vivid magenta/purple; royal deeper
  Dyes:"#a94fa0", "Royal Dyes":"#6b2c8e",
  // Silver — steel; gold warm (both precious metals)
  Silver:"#aeb8c4", Gold:"#e4b62c",
  // Salt — pale white; spices warm
  Salt:"#e6ebee", Spices:"#c4632c",
  // strategic / hidden resources
  Horses:"#9c6b3f", Iron:"#7c8794", Coal:"#33373d", Saltpeter:"#c9b87a", Oil:"#2b2f3a", Uranium:"#5fb84c"
};
// migrate old default resource names to the new set
const RES_MIGRATE={Grain:"Grains",Gold:"Silver",Gems:"Semi-Precious Gems",Wine:"Stimulants",Skystone:"Stone","Magical Reagents":"Dyes","Enchanted Items":"Gold","Aether Crystals":"Precious Gems",Iron:"Copper"};

/* ---------- default lists ---------- */
const DEFAULT_LISTS = {
  religions: ["No Religion", "The Old Faith", "Lumenism", "Ancestor Cult", "The Deep Pact", "Unbelief"],
  cultures: ["No Culture", "Veshkan", "Aurelian", "Highland Clans", "Skyborn", "Marsh-folk"],
  races: ["Human", "Elf", "Dwarf", "Orc", "Halfling", "Goblin", "Dragonborn", "Tiefling", "Aarakocra"],
  languages: ["No Language", "Common", "Old Veshkan", "High Aurelian", "Cant", "Draconic"],
  terrains: ["Plains", "Farmlands", "Steppe", "Savannah", "Forest", "Taiga", "Jungle", "Hills", "Mountains", "Caverns", "Desert", "Marsh", "Tundra", "Glacial", "Coast", "Wasteland", "Floating Reef"],
  settlements: ["Uninhabited", "Nomadic", "Village", "Town", "City", "Megalopolis"],
  resources: RESOURCE_LIST.slice(),
  hiddenResources: HIDDEN_RESOURCES.slice(),
  features: ["Impact Crater", "Arcane Scar", "Ancient Ruin", "Ley-line Nexus", "Floating Monolith", "Sunken City", "Volcanic Rift", "Sacred Grove"],
  governments: ["Feudal Monarchy", "Absolute Monarchy", "Merchant Republic", "Theocracy", "Magocracy", "Tribal Confederation", "City-State", "Hegemony", "Imperial", "Council"],
  economies: ["Uninhabited", "Primitive", "Agrarian", "Trade", "Mercantile", "Industrial", "Arcane-Industrial", "Pastoral", "Plunder", "Mixed"]
};

/* ---------- color helpers ---------- */
const PALETTE = ["#e07a5f","#3d8bfd","#81b29a","#f2cc8f","#b5179e","#4cc9f0","#f72585","#90be6d","#f9844a","#577590","#9d4edd","#43aa8b","#ff9f1c","#2ec4b6","#e71d36","#8338ec","#3a86ff","#fb5607","#ffbe0b","#06d6a0"];
function hashColor(str){let h=0;for(let i=0;i<(str||"").length;i++)h=(h*31+str.charCodeAt(i))>>>0;return `hsl(${h%360} 62% 58%)`;}
function listColor(list, name){const i=list.indexOf(name);return i>=0?PALETTE[i%PALETTE.length]:hashColor(name);}
function ramp(t){t=Math.max(0,Math.min(1,t));const a=[239,122,95],b=[95,208,160];return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(",")})`;}

const TERRAIN_COLORS={Plains:"#a7c957",Farmlands:"#c9d76a",Steppe:"#cabf76",Savannah:"#d3a24a",Forest:"#386641",Taiga:"#566f4d",Jungle:"#2d6a4f",Hills:"#9c8246",Mountains:"#8d99ae",Caverns:"#5e5a6e",Desert:"#e9c46a",Marsh:"#52796f",Tundra:"#cad2c5",Glacial:"#cfe3ec",Coast:"#76c7c0",Wasteland:"#6d597a","Floating Reef":"#48bfe3"};
const SETTLE_COLORS={Uninhabited:"#26304a",Nomadic:"#b79b6a",Village:"#9bb25f",Town:"#e9c46a",City:"#f4a261",Megalopolis:"#e76f51"};
// default province-view banner image per terrain (files in static/img/terrain/); GM-overridable
const TERRAIN_IMAGE_DEFAULTS={Plains:"plains",Farmlands:"farmlands",Steppe:"steppe",Savannah:"savannah",Forest:"forest",
  Taiga:"woods",Jungle:"jungle",Hills:"hills",Mountains:"mountains",Caverns:"cavern",Desert:"desert",Marsh:"marsh",
  Tundra:"arctic",Glacial:"arctic",Wasteland:"drylands"};
// terrain hospitability (population multiplier): grassland/coast thrive, mountains/desert/tundra are harsh
const TERRAIN_HAB={Plains:1.0,Farmlands:1.25,Steppe:0.55,Savannah:0.6,Coast:1.0,Forest:0.65,Taiga:0.3,Jungle:0.6,Hills:0.5,Marsh:0.4,Desert:0.22,Mountains:0.2,Caverns:0.28,Tundra:0.2,Glacial:0.08,Wasteland:0.1,"Floating Reef":0.5};
// ---- pop growth/decline model (GM-tunable via world.tune.pop) ----
const POP_TUNE_DEFAULTS={base:5000, jitter:0.25, declinePct:0.15, ceilSteep:5,
  capitalGrow:1.8, adminGrow:1.3, capitalCeil:1.6, adminCeil:1.3};
const TERRAIN_GROW_DEFAULT={Plains:1.0,Farmlands:1.4,Steppe:0.6,Savannah:0.65,Forest:0.7,Taiga:0.4,Jungle:0.65,Hills:0.6,Mountains:0.35,Caverns:0.4,Desert:0.3,Marsh:0.45,Tundra:0.3,Glacial:0.12,Coast:1.1,Wasteland:0.15,"Floating Reef":0.6};
const TERRAIN_CEIL_DEFAULT={Plains:1.0,Farmlands:2.2,Steppe:0.5,Savannah:0.6,Forest:0.7,Taiga:0.35,Jungle:0.6,Hills:0.6,Mountains:0.3,Caverns:0.45,Desert:0.25,Marsh:0.4,Tundra:0.25,Glacial:0.1,Coast:1.3,Wasteland:0.12,"Floating Reef":0.7};
const SETTLE_CEIL_DEFAULT={Uninhabited:0,Nomadic:9000,Village:35000,Town:130000,City:650000,Megalopolis:2500000};
const SETTLE_GROW_DEFAULT={Uninhabited:0,Nomadic:0.55,Village:1.0,Town:1.15,City:1.3,Megalopolis:1.1};
function popTune(){ return (world.tune&&world.tune.pop)||POP_TUNE_DEFAULTS; }
function terrainGrow(t){ const o=popTune().terrainGrow||{}; return o[t]!=null?o[t]:(TERRAIN_GROW_DEFAULT[t]!=null?TERRAIN_GROW_DEFAULT[t]:1); }
function terrainCeilMod(t){ const o=popTune().terrainCeil||{}; return o[t]!=null?o[t]:(TERRAIN_CEIL_DEFAULT[t]!=null?TERRAIN_CEIL_DEFAULT[t]:1); }
function settleGrow(tier){ const o=popTune().settleGrow||{}; if(o[tier]!=null)return o[tier]; if(SETTLE_GROW_DEFAULT[tier]!=null)return SETTLE_GROW_DEFAULT[tier]; const i=(world.lists.settlements||[]).indexOf(tier); return i<=0?0:1; }
function settleCeilBase(tier){ const o=popTune().settleCeil||{}; if(o[tier]!=null)return o[tier]; if(SETTLE_CEIL_DEFAULT[tier]!=null)return SETTLE_CEIL_DEFAULT[tier]; const i=(world.lists.settlements||[]).indexOf(tier); return i<=0?0:Math.round(20000*Math.pow(4,i-1)); }
// A province's soft population ceiling: settlement tier × terrain × capital/admin.
function growthCeiling(p){
  const base=settleCeilBase(p.settlement); if(base<=0)return 0;
  let c=base*terrainCeilMod(p.terrain);
  const r=p.realmId?world.realms.find(x=>x.id===p.realmId):null;
  if(r){ if(p.id===r.capitalId)c*=popTune().capitalCeil; else if((r.adminCenters||[]).includes(p.id))c*=popTune().adminCeil; }
  return Math.round(c);
}
// Logistic soft cap: growth halves at the ceiling and levels off beyond it.
function ceilDamp(pop,ceil){ if(ceil<=0)return 0; const r=pop/ceil; return 1/(1+Math.exp((r-1)*(popTune().ceilSteep||5))); }
function hubGrow(p){ const r=p.realmId?world.realms.find(x=>x.id===p.realmId):null; if(!r)return 1; if(p.id===r.capitalId)return popTune().capitalGrow; if((r.adminCenters||[]).includes(p.id))return popTune().adminGrow; return 1; }
// Per-race "size": how much each individual counts toward the growth ceiling. <1 = smaller/denser
// (e.g. goblins at 0.5 pack twice as many into the same land); GM-editable via world.tune.raceSize.
function raceSize(race){ const o=(world&&world.tune&&world.tune.raceSize)||{}; return o[race]!=null?Math.max(0.05,o[race]):1; }
function avgRaceSize(p){ let tot=0,eff=0; for(const q of (p.pops||[])){ const s=q.size||0; tot+=s; eff+=s*raceSize(subraceGroup(q.race)); } return tot>0?eff/tot:1; }
// Raw-people ceiling adjusted for how dense the province's races are (smaller races → higher raw ceiling).
function effCeiling(p){ const c=growthCeiling(p); return c>0? c/Math.max(0.1, avgRaceSize(p)) : 0; }
// One growth (dir>0) or decline (dir<0) step for a single province. Returns true if it changed.
function popStep(p,dir){
  const t=popTune(), cur=p.population||0;
  const jit=1+(Math.random()*2-1)*(t.jitter||0);
  if(dir>0){
    const sg=settleGrow(p.settlement); if(sg<=0)return false;            // no growth on uninhabited land
    const ceil=effCeiling(p); const damp=ceilDamp(cur,ceil);              // race-size-aware soft cap
    const inc=Math.round((t.base||5000)*sg*terrainGrow(p.terrain)*hubGrow(p)*damp*jit);
    if(inc<=0)return false;
    growProvincePops(p, inc); return true;                              // distributes by race growth + realm favor
  } else {
    if(cur<=0)return false;
    const pct=Math.max(0,Math.min(0.95,(t.declinePct||0.15)*jit));
    const loss=Math.round(cur*pct); if(loss<=0)return false;
    declineProvincePops(p, loss); return true;                          // favored groups shrink slower
  }
}
// Favour multiplier for a pop group given its realm's identity + the active toggles.
// Weight scales with how many of the toggled criteria the group matches: a group matching
// ALL toggled criteria grows fastest, partial matches grow a bit slower, non-matches stay at
// the baseline (so e.g. with Religion+Admin race on, only admin-race pops of the state religion
// are the top priority, but everyone still grows — just relatively slower).
function favorWeight(q, r){
  if(!r) return 1;
  const crits=[];
  if(state.popFavRace) crits.push((r.adminRaces||[]).includes(subraceGroup(q.race)));
  if(state.popFavRel)  crits.push(!!r.stateReligion    && q.religion===r.stateReligion);
  if(state.popFavCul)  crits.push(!!r.dominantCulture  && q.culture===r.dominantCulture);
  if(state.popFavLang) crits.push(!!r.dominantLanguage && q.language===r.dominantLanguage);
  if(!crits.length) return 1;
  const matches=crits.filter(Boolean).length;
  return 1 + 1.6*(matches/crits.length);   // 1 (none) → 2.6 (all criteria matched)
}
// Resolve the provinces the population tool currently targets.
function popTargets(){
  const sc=state.popScope||"world";
  if(sc==="continent"){ const cid=state.popCont; return cid?world.provinces.filter(p=>p.continentId===cid):[]; }
  if(sc==="realm"){ const rid=state.popRealm; return rid?world.provinces.filter(p=>p.realmId===rid):[]; }
  if(sc==="selected"){ return world.provinces.filter(p=>state.popSel.has(p.id)); }
  return world.provinces.slice();   // world
}
// Apply one grow/decline step to every targeted province (single undo step).
function applyPopStep(){
  const dir=state.popDir||1, targets=popTargets();
  if(!targets.length){ flash("Pick a scope with provinces in it first."); return; }
  beginEdit();
  let n=0; for(const p of targets){ if(popStep(p,dir))n++; }
  if(!n){ _undo.pop(); }   // nothing changed — drop the empty snapshot
  markDirty(); _labelsDirty=true; renderMap(); renderLeft(); updateWorldPop(); renderPopPanel();
  flash((dir>0?"🌱 Grew ":"📉 Reduced ")+n+" province"+(n===1?"":"s")+".");
}
// Add `inc` people to a province, distributed across its pop groups by size × race-growth
// modifier (so encouraged groups grow faster); seeds from the realm identity if empty.
function growProvincePops(p, inc){
  inc=Math.round(inc); if(inc<=0)return;
  p.pops=p.pops||[];
  const cur=p.pops.reduce((a,q)=>a+(q.size||0),0);
  if(cur<=0){ setProvincePopulation(p, inc); return; }
  const r=p.realmId?world.realms.find(x=>x.id===p.realmId):null;
  let tw=0; const ws=p.pops.map(q=>{ const w=(q.size||0)*raceGrowthMod(subraceGroup(q.race))*favorWeight(q,r); tw+=w; return w; });
  if(tw<=0){ setProvincePopulation(p, cur+inc); return; }
  p.pops.forEach((q,i)=>{ q.size=Math.max(0, Math.round((q.size||0) + inc*ws[i]/tw)); });
  deriveProvince(p);
}
// Remove `loss` people from a province, hitting favoured groups less (weight = size / favour).
function declineProvincePops(p, loss){
  p.pops=p.pops||[]; const cur=p.pops.reduce((a,q)=>a+(q.size||0),0);
  if(cur<=0)return; loss=Math.min(Math.round(loss), cur);
  const r=p.realmId?world.realms.find(x=>x.id===p.realmId):null;
  let tw=0; const ws=p.pops.map(q=>{ const w=(q.size||0)/Math.max(0.1, favorWeight(q,r)); tw+=w; return w; });
  if(tw<=0){ setProvincePopulation(p, Math.max(0, cur-loss)); return; }
  p.pops.forEach((q,i)=>{ q.size=Math.max(0, Math.round((q.size||0) - loss*ws[i]/tw)); });
  deriveProvince(p);
}
// Quick growth: raise a realm's population by max(5%, 5,000), water-filled across its
// provinces by the usual growth shaping (terrain, settlement tier, capital/admin, ceiling
// soft-cap & race growth), never overfilling a province past its growth ceiling.
function quickGrowRealm(realmId){
  const all=world.provinces.filter(p=>p.realmId===realmId);
  const provs=all.filter(p=>settleGrow(p.settlement)>0);
  if(!provs.length) return 0;
  const realmPop=all.reduce((a,p)=>a+(p.population||0),0);
  let remaining=Math.max(Math.round(realmPop*0.05), 5000);
  const info=provs.map(p=>{ const pop=p.population||0, ceil=effCeiling(p);
    return { p, headroom:Math.max(0, ceil-pop), give:0,
             w:Math.max(pop,150)*settleGrow(p.settlement)*terrainGrow(p.terrain)*hubGrow(p)*ceilDamp(pop,ceil) }; });
  let elig=info.filter(x=>x.headroom>0.5 && x.w>0);
  for(let pass=0; pass<5 && remaining>0.5 && elig.length; pass++){
    const tw=elig.reduce((a,x)=>a+x.w,0); if(tw<=0)break;
    let dealt=0;
    for(const x of elig){ const want=remaining*x.w/tw; const give=Math.min(want, x.headroom-x.give); x.give+=give; dealt+=give; }
    remaining-=dealt;
    elig=elig.filter(x=>x.give < x.headroom-0.5);
  }
  let added=0;
  info.forEach(x=>{ const inc=Math.round(x.give); if(inc>0){ growProvincePops(x.p, inc); added+=inc; } });
  return added;
}
function applyQuickGrowRealm(){
  const rid=state.popRealm, r=rid&&world.realms.find(x=>x.id===rid);
  if(!r){ flash("Pick a realm first."); return; }
  beginEdit();
  const added=quickGrowRealm(rid);
  if(!added){ _undo.pop(); flash("No room to grow — "+r.name+" is uninhabited or at its ceilings."); return; }
  markDirty(); _labelsDirty=true; renderMap(); renderLeft(); updateWorldPop(); renderPopPanel();
  flash("⚡ Quick-grew "+r.name+" by "+added.toLocaleString()+" people.");
}
// Seed/prune the per-terrain & per-settlement growth tunables so the model always
// has an entry for every current category (incl. ones added manually later).
function seedPopTune(w){
  w.tune=w.tune||{};
  const t=w.tune.pop=Object.assign({}, POP_TUNE_DEFAULTS, w.tune.pop||{});
  t.terrainGrow=t.terrainGrow||{}; t.terrainCeil=t.terrainCeil||{}; t.settleGrow=t.settleGrow||{}; t.settleCeil=t.settleCeil||{};
  (w.lists.terrains||[]).forEach(tr=>{
    if(t.terrainGrow[tr]==null) t.terrainGrow[tr]=(TERRAIN_GROW_DEFAULT[tr]!=null?TERRAIN_GROW_DEFAULT[tr]:1);
    if(t.terrainCeil[tr]==null) t.terrainCeil[tr]=(TERRAIN_CEIL_DEFAULT[tr]!=null?TERRAIN_CEIL_DEFAULT[tr]:1);
  });
  (w.lists.settlements||[]).forEach((s,i)=>{
    if(t.settleGrow[s]==null) t.settleGrow[s]=(SETTLE_GROW_DEFAULT[s]!=null?SETTLE_GROW_DEFAULT[s]:(i<=0?0:1));
    if(t.settleCeil[s]==null) t.settleCeil[s]=(SETTLE_CEIL_DEFAULT[s]!=null?SETTLE_CEIL_DEFAULT[s]:(i<=0?0:Math.round(20000*Math.pow(4,i-1))));
  });
  const T=new Set(w.lists.terrains||[]), S=new Set(w.lists.settlements||[]);
  Object.keys(t.terrainGrow).forEach(k=>{if(!T.has(k))delete t.terrainGrow[k];});
  Object.keys(t.terrainCeil).forEach(k=>{if(!T.has(k))delete t.terrainCeil[k];});
  Object.keys(t.settleGrow).forEach(k=>{if(!S.has(k))delete t.settleGrow[k];});
  Object.keys(t.settleCeil).forEach(k=>{if(!S.has(k))delete t.settleCeil[k];});
}
function terrainHab(t){ const o=(world&&world.tune&&world.tune.terrainHab)||{}; if(o[t]!=null)return o[t]; const v=TERRAIN_HAB[t]; return v!=null?v:0.6; }
function raceGrowthMod(race){ const o=(world&&world.tune&&world.tune.raceGrowth)||{}; return o[race]!=null?o[race]:1; }
// ---- subraces: pops carry a subrace (q.race); races are the groups above them ----
// ---- Regions: named groupings of provinces (may overlap) ----
function regionById(id){ return (world.regions||[]).find(r=>r.id===id)||null; }
function regionsOfProvince(pid){ return (world.regions||[]).filter(r=>(r.provinceIds||[]).includes(pid)); }
function regionColor(rg){ return (rg&&rg.color)||"#8a6fd0"; }
function newRegion(){ const id=uid(); return {id, name:"New Region", description:"", provinceIds:[], color:hashColor(id)}; }
function toggleRegionMember(regionId, pid){
  const rg=regionById(regionId); if(!rg)return;
  rg.provinceIds=rg.provinceIds||[];
  const i=rg.provinceIds.indexOf(pid);
  if(i>=0) rg.provinceIds.splice(i,1); else rg.provinceIds.push(pid);
  markDirty();
}
/* ============================================================
   TECHNOLOGY LEVEL (GURPS-style TL0..TL12) — per-realm Tech Fields
   ============================================================ */
const DEFAULT_TECH_FIELDS=["Transportation","Weapons and Armor","Power","Biotechnology/Medicine","Communications","Architecture","Administration","Magic"];
const TL_NAMES=["Stone Age","Bronze Age","Iron Age","Medieval","Age of Sail","Industrial Revolution","Mechanized Age","Nuclear Age","Digital Age","Microtech Age","Robotic Age","Age of Exotic Matter","Beyond"];
const TL_DEFAULT_DESC=[
  "Stone Age (Prehistory+). Counting; oral tradition.",
  "Bronze Age (3500 B.C.+). Arithmetic; writing.",
  "Iron Age (1200 B.C.+). Geometry; scrolls.",
  "Medieval (600 A.D.+). Algebra; books.",
  "Age of Sail (1450+). Calculus; movable type.",
  "Industrial Revolution (1730+). Mechanical calculators; telegraph.",
  "Mechanized Age (1880+). Electrical calculators; telephone and radio.",
  "Nuclear Age (1940+). Mainframe computers; television.",
  "Digital Age (1980+). Personal computers; global networks.",
  "Microtech Age (2025+?). Artificial intelligence; real-time virtuality.",
  "Robotic Age (2070+?). Nanotechnology blurs distinctions between technologies.",
  "Age of Exotic Matter.",
  "Whatever the GM likes!"];
const TL_COLORS=["#6d4c2f","#c8641b","#e8a71e","#cfc72e","#6fb23a","#1f9e7a","#2f9fc7","#2f6bd0","#33489e","#b84f9e","#d14f6a","#d14030","#333947"];
const TL_STAR_COLOR="#9b5de5";   // a field above its realm's average TL is shown in purple
const TL_MAX=12;
function tlClamp(t){ t=Math.round(+t||0); return t<0?0:(t>TL_MAX?TL_MAX:t); }
function tlColor(t){ t=tlClamp(t); return (world&&world.techColors&&world.techColors[t])||TL_COLORS[t]; }
function techFieldIsDefault(f){ return !(world&&world.techFieldDefault) || world.techFieldDefault[f]!==false; }
function tlName(t){ return TL_NAMES[tlClamp(t)]||("TL"+tlClamp(t)); }
function realmTechFields(r){   // the fields this realm actually has, in the world order then any extras
  if(!r||!r.tech||typeof r.tech!=="object") return [];
  const keys=Object.keys(r.tech), order=(world.techFields||[]);
  const inOrder=order.filter(f=>keys.includes(f));
  const extra=keys.filter(f=>!order.includes(f));
  return inOrder.concat(extra);
}
function realmHasTech(r){ return realmTechFields(r).length>0; }
// Overall TL = average of the realm's Tech Fields (TL0 if none set up yet).
function realmTL(r){
  const fields=realmTechFields(r);
  if(!fields.length) return {avg:0, fields:[], star:false, unset:true};
  let sum=0; fields.forEach(f=>sum+=(+r.tech[f]||0));
  const avg=sum/fields.length;
  const star=fields.some(f=>(+r.tech[f]||0)>avg+1e-9);
  return {avg, fields, star, unset:false};
}
function tlDisplay(avg){ return Number.isInteger(avg)?String(avg):(Math.round(avg*10)/10).toFixed(1); }
// Description for a field at a TL: realm override → world default → the built-in TL blurb.
function techDescFor(r, field, tl){
  tl=tlClamp(tl);
  if(r&&r.techDesc&&r.techDesc[field]&&typeof r.techDesc[field][tl]==="string"&&r.techDesc[field][tl].trim()) return r.techDesc[field][tl];
  if(world.techDesc&&world.techDesc[field]&&typeof world.techDesc[field][tl]==="string"&&world.techDesc[field][tl].trim()) return world.techDesc[field][tl];
  return TL_DEFAULT_DESC[tl]||"";
}
// Give a new realm the Tech Fields flagged "default on new realms" (all at TL0).
function initRealmTech(r){ r.tech=r.tech||{}; (world.techFields||[]).forEach(f=>{ if(techFieldIsDefault(f) && r.tech[f]==null) r.tech[f]=0; }); }
// Rename a Tech Field everywhere (global list, default flag, descriptions, every realm).
function renameTechField(ov,nv){
  nv=(nv||"").trim(); const i=world.techFields.indexOf(ov);
  if(i<0||!nv||nv===ov||world.techFields.includes(nv)) return false;
  world.techFields[i]=nv;
  if(world.techFieldDefault){ if(world.techFieldDefault[ov]!==undefined){world.techFieldDefault[nv]=world.techFieldDefault[ov];delete world.techFieldDefault[ov];} }
  if(world.techDesc && world.techDesc[ov]!==undefined){ world.techDesc[nv]=world.techDesc[ov]; delete world.techDesc[ov]; }
  (world.realms||[]).forEach(r=>{ if(r.tech&&r.tech[ov]!==undefined){r.tech[nv]=r.tech[ov];delete r.tech[ov];}
    if(r.techDesc&&r.techDesc[ov]!==undefined){r.techDesc[nv]=r.techDesc[ov];delete r.techDesc[ov];} });
  (world.discoveries||[]).forEach(d=>{ if(d.field===ov)d.field=nv; });
  return true;
}
// ---- Discoveries: notable techs assigned to a Tech Field + TL; realms acquire them over time ----
function discoveryById(id){ return (world.discoveries||[]).find(d=>d.id===id)||null; }
function realmDiscoveries(r){ return ((r&&r.discoveries)||[]).map(discoveryById).filter(Boolean); }
function discoveriesInField(r, field){ return realmDiscoveries(r).filter(d=>d.field===field).sort((a,b)=>a.tl-b.tl); }
function newDiscovery(){ return {id:uid(), name:"New Discovery", field:(world.techFields||[])[0]||"", tl:0, description:"", color:"#e0a020", realmId:""}; }
function discoveryMaker(d){ return d&&d.realmId ? (world.realms||[]).find(r=>r.id===d.realmId) : null; }
function discoveryColor(d){ const rm=discoveryMaker(d); return (rm&&rm.color) || (d&&d.color) || "#e0a020"; }
// ---- Powers: distinctive traditions (Druidic, Magic, Demonic…) realms wield ----
function powerById(id){ return (world.powers||[]).find(p=>p.id===id)||null; }
function realmPowers(r){ return ((r&&r.powers)||[]).map(powerById).filter(Boolean); }
function realmHasPower(r,id){ return !!(r&&Array.isArray(r.powers)&&r.powers.includes(id)); }
function toggleRealmPower(r,id){ r.powers=r.powers||[]; const i=r.powers.indexOf(id); if(i>=0)r.powers.splice(i,1); else r.powers.push(id); markDirty(); }
function newPower(){ return {id:uid(), name:"New Power", type:"", origin:"", description:"", color:"#7c5cff"}; }
function realmHasDiscovery(r,id){ return !!(r&&Array.isArray(r.discoveries)&&r.discoveries.includes(id)); }
function toggleRealmDiscovery(r,id){ r.discoveries=r.discoveries||[]; const i=r.discoveries.indexOf(id); if(i>=0)r.discoveries.splice(i,1); else r.discoveries.push(id); markDirty(); }
// ============================================================
// GLOBAL COMPENDIUM STORE — characters, role tags, ruler timelines and lore
// live OUTSIDE per-turn snapshots. The same information shows no matter which
// timeline phase you view. Persisted on world.compendiumStore (kept in sync).
// ============================================================
let _compendium=null;
function blankCompendium(){ return {characters:[], charTags:["Commander","Diplomat","Hero"], lore:{}, realmRulers:{}}; }
function normalizeCompendium(src){
  const cp=(src&&typeof src==="object")?src:{}; const out=blankCompendium();
  if(Array.isArray(cp.charTags)&&cp.charTags.length)out.charTags=cp.charTags.slice();
  if(Array.isArray(cp.characters))out.characters=cp.characters.map(c=>({id:c.id||uid(), name:typeof c.name==="string"?c.name:"Character", isRuler:!!c.isRuler, tags:Array.isArray(c.tags)?c.tags.slice():[], description:typeof c.description==="string"?c.description:"", color:c.color||"#c9a86f"}));
  if(cp.lore&&typeof cp.lore==="object")out.lore=JSON.parse(JSON.stringify(cp.lore));
  if(cp.realmRulers&&typeof cp.realmRulers==="object"){ Object.keys(cp.realmRulers).forEach(rid=>{ const arr=cp.realmRulers[rid]; if(Array.isArray(arr))out.realmRulers[rid]=arr.filter(x=>x&&x.charId).map(x=>({charId:x.charId, title:x.title||"", from:x.from||"", to:x.to||"", note:x.note||""})); }); }
  out.characters.forEach(c=>{ c.tags=c.tags.filter(t=>out.charTags.includes(t)); });
  return out;
}
// Build _compendium once per world (from its stored compendium, or migrate legacy fields).
function ensureCompendium(w){
  if(_compendium)return;
  if(w&&w.compendiumStore){ _compendium=normalizeCompendium(w.compendiumStore); }
  else {
    const src={characters:(w&&w.characters)||[], charTags:(w&&w.charTags)||[], lore:(w&&w.compendium)||{}, realmRulers:{}};
    // migrate legacy per-realm leaderName/leaderTitle → a ruler character + a reign
    (w&&w.realms||[]).forEach(r=>{
      if(Array.isArray(r.rulers)&&r.rulers.length){ src.realmRulers[r.id]=r.rulers; return; }
      const nm=(r.leaderName||r.leaderTitle||"").trim(); if(!nm)return;
      let ch=src.characters.find(c=>c.isRuler&&c.name===nm);
      if(!ch){ ch={id:uid(),name:nm,isRuler:true,tags:[],description:"",color:r.color||"#c9a86f"}; src.characters.push(ch); }
      src.realmRulers[r.id]=[{charId:ch.id,title:(r.leaderTitle||""),from:"",to:"",note:""}];
    });
    _compendium=normalizeCompendium(src);
  }
}
// keep the persisted copy on the live world pointing at the global store
function syncCompendiumToWorld(){ if(typeof world!=="undefined"&&world)world.compendiumStore=_compendium; }
// ---- Characters: named people (rulers / commanders / other tagged roles) ----
function allCharacters(){ ensureCompendium(world); return _compendium.characters; }
function allCharTags(){ ensureCompendium(world); return _compendium.charTags; }
function characterById(id){ return allCharacters().find(c=>c.id===id)||null; }
function charName(id){ const c=characterById(id); return c?c.name:""; }
function newCharacter(opts){ opts=opts||{}; return {id:uid(), name:opts.name||"New Character", isRuler:!!opts.isRuler, tags:opts.tags?opts.tags.slice():[], description:"", color:opts.color||"#c9a86f"}; }
function charTagsOf(c){ return (c&&Array.isArray(c.tags))?c.tags.filter(t=>allCharTags().includes(t)):[]; }
function charHasTag(c,t){ return !!(c&&Array.isArray(c.tags)&&c.tags.includes(t)); }
function toggleCharTag(c,t){ c.tags=c.tags||[]; const i=c.tags.indexOf(t); if(i>=0)c.tags.splice(i,1); else c.tags.push(t); markDirty(); }
// a realm's ruler timeline (ordered reigns), stored globally by realm id
function realmRulers(r){ ensureCompendium(world); const id=r&&r.id; if(!id)return []; if(!Array.isArray(_compendium.realmRulers[id]))_compendium.realmRulers[id]=[]; return _compendium.realmRulers[id]; }
// realms this character has ruled (with their reign entry)
function charRealmReigns(charId){ const out=[]; (world.realms||[]).forEach(r=>{ realmRulers(r).forEach((reign,i)=>{ if(reign.charId===charId)out.push({realm:r,reign,index:i}); }); }); return out; }
// forces this character commands (forces are per-snapshot)
function charForces(charId){ return (world.forces||[]).filter(f=>f.commanderCharId===charId); }
// the realm's current ruler = the last reign in the ordered timeline
function realmCurrentReign(r){ const rs=realmRulers(r); return rs.length?rs[rs.length-1]:null; }
function realmCurrentRuler(r){ const reign=realmCurrentReign(r); return reign?characterById(reign.charId):null; }
// Remove a Tech Field from the world and from every realm.
function deleteTechFieldGlobal(f){
  world.techFields=(world.techFields||[]).filter(x=>x!==f);
  if(world.techFieldDefault)delete world.techFieldDefault[f];
  if(world.techDesc)delete world.techDesc[f];
  (world.realms||[]).forEach(r=>{ if(r.tech)delete r.tech[f]; if(r.techDesc)delete r.techDesc[f]; });
}
// Collapsible Tech Level section for a realm panel — shared by editor (editable=true) and viewer.
// The full breakdown body (fields, descriptions, discoveries) — editor-editable or read-only.
function techBreakdownBody(r, editable){
  const tl=realmTL(r);
  if(tl.unset){
    return editable
      ? `<div class="note">No Tech Levels set up yet — this realm reads as <b>TL0</b>.</div><div class="btnrow" style="margin-top:6px"><button class="btn tiny" id="rTechInit">Set up Tech Levels</button></div>`
      : `<div class="note">No Tech Levels were set up for this realm (treated as TL0).</div>`;
  }
  const avg=tl.avg;
  const rows=tl.fields.map(f=>{
    const t=tlClamp(r.tech[f]); const above=(+r.tech[f]||0)>avg+1e-9; const col=above?TL_STAR_COLOR:tlColor(t);
    const discs=discoveriesInField(r,f);
    const discHTML=discs.map(d=>{ const mk=discoveryMaker(d); const dc=discoveryColor(d);
      return `<div class="techDisc" style="--dc:${dc}">
      <div class="techDiscHead"><span class="techDiscName">✦ ${esc(d.name)}</span>${mk?`<span class="techDiscMaker" title="Discovered by ${esc(mk.name)}"><span class="sw" style="background:${mk.color}"></span>${esc(mk.name)}</span>`:""}<span class="techDiscTL" style="background:${dc}">TL${tlClamp(d.tl)}</span>${editable?`<button class="btn tiny rTechDiscDel" data-id="${d.id}" style="color:var(--bad)" title="Remove">✕</button>`:""}</div>
      ${d.description?`<div class="techDiscDesc">${esc(d.description)}</div>`:""}</div>`; }).join("");
    let addDisc="";
    if(editable){ const avail=(world.discoveries||[]).filter(d=>d.field===f && !realmHasDiscovery(r,d.id));
      if(avail.length) addDisc=`<select class="rTechDiscAdd" data-f="${esc(f)}" style="margin-top:4px"><option value="">✦ add a discovery…</option>${avail.map(d=>`<option value="${d.id}">${esc(d.name)} (TL${tlClamp(d.tl)})</option>`).join("")}</select>`; }
    // compact one-line summary; body (era, description, discoveries, edit controls) is collapsed by default
    const summary=`<summary class="techFSum" style="border-left:4px solid ${col}"><span class="techFName">${esc(f)}${above?' <span class="techStar">★</span>':''}</span>${discs.length?`<span class="techFDiscN" title="${discs.length} discoveries">✦${discs.length}</span>`:""}<span class="techFTLv" style="background:${col}">TL${t}</span></summary>`;
    let body;
    if(editable){
      const cust=(r.techDesc&&r.techDesc[f]&&typeof r.techDesc[f][t]==="string")?r.techDesc[f][t]:"";
      body=`<div class="techFRow" style="margin-top:2px"><span class="techFEra" style="flex:1">${esc(tlName(t))}</span>
          <span class="techFTL">TL <input class="rTechTL" data-f="${esc(f)}" type="number" min="0" max="12" step="1" value="${t}"/></span>
          <button class="btn tiny rTechDel" data-f="${esc(f)}" style="color:var(--bad)" title="Remove this field from this realm">✕</button></div>
        <textarea class="rTechDesc" data-f="${esc(f)}" rows="2" placeholder="${esc(TL_DEFAULT_DESC[t]||"")}">${esc(cust)}</textarea>${discHTML}${addDisc}`;
    } else {
      const desc=techDescFor(r,f,t);
      body=`<div class="techFEra">${esc(tlName(t))}</div>${desc?`<div class="techFDesc">${esc(desc)}</div>`:""}${discHTML}`;
    }
    return `<details class="techFieldDet">${summary}<div class="techFBody">${body}</div></details>`;
  }).join("");
  const addable=(world.techFields||[]).filter(f=>!(f in (r.tech||{})));
  const addSel = editable ? `<div class="ppRow" style="margin-top:8px"><select id="rTechAdd"><option value="">＋ add a Tech Field…</option>${addable.map(f=>`<option>${esc(f)}</option>`).join("")}<option value="__new">＋ new field (adds it globally too)…</option></select></div>` : "";
  return `<div class="note" style="margin-bottom:6px">Overall <b>TL ${tlDisplay(avg)}</b>, the average of the fields. Tap a field to expand it. ★ / purple = above average; ✦ = discoveries.${editable?" Custom descriptions override the GM defaults.":""}</div>${rows}${addSel}`;
}
// Called after a realm panel renders — (re)build the always-visible Tech Level side panel.
function wireTechRealmUI(r, editable){ renderTechPanel(); }
// Build / position / wire the Tech Level side panel for the selected realm. It sticks out to the
// left of the realm panel (like the Wonders panel on the province view), and is always shown while
// a realm is selected. On mobile it renders inline at the bottom of the realm sheet.
function renderTechPanel(){
  hideTechPanel();
  const r = state.selRealm ? world.realms.find(x=>x.id===state.selRealm) : null;
  if(!r) return;
  const editable = !VIEWER;
  const tl=realmTL(r);
  const disp = tl.unset ? "TL0" : "TL "+tlDisplay(tl.avg);
  const star = (!tl.unset && tl.star);
  const col = star ? TL_STAR_COLOR : (tl.unset?tlColor(0):tlColor(tl.avg));
  const head=`<div class="techPHead"><span class="techPIco">🔬</span><span class="techPCol"><b class="techPTitle">${esc(r.name)}</b><span class="techPSub">Tech Level</span></span><b class="techPTL${star?' star':''}">${disp}${star?' ★':''}</b></div>`;
  const html=`${head}<div class="techPBody">${techBreakdownBody(r,editable)}</div>`;
  const mobile=document.body.classList.contains("mobile");
  let root;
  if(mobile){ const ins=$("#inspector"); if(!ins)return; root=document.createElement("div"); root.id="techInline"; root.className="techInline"; root.innerHTML=html; ins.appendChild(root); }
  else { root=document.createElement("div"); root.id="techPanel"; ($("#stage")||document.body).appendChild(root); root.innerHTML=html; positionTechPanel(); }
  root.style.setProperty("--tlc", col);   // colour the panel's accent + the TL value
  wireTechPanel(r, editable, root);
}
function hideTechPanel(){ const a=document.getElementById("techPanel"); if(a)a.remove(); const b=document.getElementById("techInline"); if(b)b.remove(); const rt=document.getElementById("right"); if(rt)rt.classList.remove("wideRealm"); }
function positionTechPanel(){
  const panel=document.getElementById("techPanel"), right=$("#right"), stage=$("#stage");
  if(!panel||!right||!stage)return;
  const rr=right.getBoundingClientRect(), ss=stage.getBoundingClientRect();
  panel.style.left="auto";
  panel.style.right=Math.max(8,(ss.right - rr.left + 10))+"px";
  panel.style.top=Math.max(8,(rr.top - ss.top))+"px";
  panel.style.maxHeight=(ss.height - 24)+"px";
}
function wireTechPanel(r, editable, root){
  const rr2=()=>{ editable?renderRealmEditor():renderRealmView(); };   // rebuilds the panel
  if(!editable) return;
  { const b=root.querySelector("#rTechInit"); if(b)b.onclick=()=>{ beginEdit(); initRealmTech(r); markDirty(); rr2(); renderMap(); }; }
  root.querySelectorAll(".rTechTL").forEach(el=>el.addEventListener("change",e=>{ r.tech[el.dataset.f]=tlClamp(e.target.value); markDirty(); rr2(); renderMap(); }));
  root.querySelectorAll(".rTechDesc").forEach(el=>el.addEventListener("input",e=>{ const f=el.dataset.f, t=tlClamp(r.tech[f]); r.techDesc=r.techDesc||{}; r.techDesc[f]=r.techDesc[f]||{}; if(e.target.value.trim())r.techDesc[f][t]=e.target.value; else delete r.techDesc[f][t]; markDirty(); }));
  root.querySelectorAll(".rTechDel").forEach(el=>el.onclick=()=>{ delete r.tech[el.dataset.f]; if(r.techDesc)delete r.techDesc[el.dataset.f]; markDirty(); rr2(); renderMap(); });
  { const s=root.querySelector("#rTechAdd"); if(s)s.onchange=()=>{ let f=s.value; if(!f)return; if(f==="__new"){ f=(prompt("New Tech Field name:")||"").trim(); if(!f){rr2();return;} if(!(world.techFields||[]).includes(f)){world.techFields.push(f); world.techFieldDefault=world.techFieldDefault||{}; world.techFieldDefault[f]=true;}} r.tech=r.tech||{}; if(r.tech[f]==null)r.tech[f]=0; markDirty(); rr2(); renderMap(); }; }
  root.querySelectorAll(".rTechDiscAdd").forEach(el=>el.onchange=()=>{ const id=el.value; if(!id)return; toggleRealmDiscovery(r,id); rr2(); });
  root.querySelectorAll(".rTechDiscDel").forEach(el=>el.onclick=()=>{ toggleRealmDiscovery(r,el.dataset.id); rr2(); });
}
// Click a province on the Regions map: editor toggles it in the active region; viewer opens its region.
function regionProvinceClick(p){
  if(VIEWER){ const regs=regionsOfProvince(p.id); if(regs.length) selectRegion(regs[0].id); else flash("This province isn't in any region."); return; }
  if(!state.selRegion){ flash("Pick or create a region in the legend first, then click provinces to add them."); return; }
  toggleRegionMember(state.selRegion, p.id); renderMap(); buildMapLegend(); renderRegionEditor();
}
function renderTechLegend(box){
  let maxUsed=0; (world.realms||[]).forEach(r=>{ const t=realmTL(r); if(!t.unset) maxUsed=Math.max(maxUsed, Math.round(t.avg)); });
  const hi=Math.min(TL_MAX, Math.max(5, maxUsed+1));
  for(let tl=0; tl<=hi; tl++){
    const row=div("mlRow");
    row.innerHTML=`<span class="sw" style="background:${tlColor(tl)}"></span><b>TL${tl}</b> <span class="note" style="margin-left:6px">${esc(tlName(tl))}</span>`;
    box.appendChild(row);
  }
  { const st=div("mlRow"); st.innerHTML=`<span class="sw" style="background:${TL_STAR_COLOR}"></span><span class="note">★ field above the realm's average</span>`; box.appendChild(st); }
  const note=div("note"); note.style.marginTop="4px"; note.textContent="Realms are coloured by their average TL. Click a realm for its full breakdown.";
  box.appendChild(note);
}
function renderRegionLegend(box){
  const regs=world.regions||[];
  if(!VIEWER){
    const add=document.createElement("button"); add.className="btn tiny"; add.style.margin="0 0 6px"; add.textContent="＋ New region";
    add.onclick=()=>{ beginEdit(); const rg=newRegion(); world.regions.push(rg); markDirty(); selectRegion(rg.id); buildMapLegend(); };
    box.appendChild(add);
  }
  if(!regs.length){ const n=div("note"); n.textContent=VIEWER?"No regions defined.":"No regions yet. Click ＋ New region, then click provinces on the map to add them."; box.appendChild(n); return; }
  regs.forEach(rg=>{
    const row=div("mlRow"+(state.selRegion===rg.id?" active":""));
    row.style.cursor="pointer"; row.dataset.rid=rg.id; row.title=VIEWER?`Highlight ${esc(rg.name)}`:`Edit ${esc(rg.name)}`;
    row.innerHTML=`<span class="sw" style="background:${regionColor(rg)}"></span>${esc(rg.name||"Region")}<span class="note" style="margin-left:auto">${(rg.provinceIds||[]).length}</span>`;
    box.appendChild(row);
  });
  box.querySelectorAll("[data-rid]").forEach(el=>el.onclick=ev=>{ ev.stopPropagation(); const id=el.dataset.rid;
    if(state.selRegion===id){ state.selRegion=null; renderMap(); buildMapLegend(); clearSelection(); }
    else { selectRegion(id); buildMapLegend(); }
  });
}
function selectRegion(id){
  state.selRegion=id; state.selProvince=null;state.selRealm=null;state.selReligion=null;state.selWater=null;state.selLabel=null;state.selForce=null;state.selBattle=null;state.selMonster=null;
  document.body.classList.add("has-sel");
  hideTechPanel();renderMap(); renderRegionEditor(); renderWonderPanel();
}
function renderRegionEditor(){
  if(VIEWER) return renderRegionView();
  const ins=$("#inspector"); const rg=regionById(state.selRegion);
  if(!rg){ins.innerHTML='<div class="empty">No region selected.</div>';return;}
  ins.innerHTML=`
    <div class="insTitle"><input id="rgname" value="${esc(rg.name)}"/>
      <input id="rgcolor" type="color" value="${toHex(regionColor(rg))}" style="width:42px;height:34px;padding:2px"/></div>
    <div class="note">${(rg.provinceIds||[]).length} provinces · click provinces on the map to add or remove them. Provinces may belong to several regions.</div>
    <div class="field"><label>Description <span class="note">(shown to players)</span></label><textarea id="rgdesc" rows="6">${esc(rg.description||"")}</textarea></div>
    <div class="btnrow"><button class="btn tiny" id="rgclear">Clear provinces</button><button class="btn danger" id="rgdel">Delete region</button></div>`;
  $("#rgname").addEventListener("input",e=>{rg.name=e.target.value;markDirty();renderMap();buildMapLegend();});
  $("#rgcolor").addEventListener("input",e=>{rg.color=e.target.value;markDirty();renderMap();buildMapLegend();});
  $("#rgdesc").addEventListener("input",e=>{rg.description=e.target.value;markDirty();});
  $("#rgclear").onclick=()=>{ beginEdit(); rg.provinceIds=[]; markDirty(); renderMap(); renderRegionEditor(); buildMapLegend(); };
  $("#rgdel").onclick=()=>{ if(!confirm(`Delete region "${rg.name}"?`))return; beginEdit(); world.regions=world.regions.filter(x=>x.id!==rg.id); state.selRegion=null; markDirty(); renderMap(); buildMapLegend(); $("#inspector").innerHTML='<div class="empty">Region deleted.</div>'; };
}
function renderRegionView(){
  const ins=$("#inspector"); const rg=regionById(state.selRegion);
  if(!rg){ins.innerHTML='<div class="empty">No region selected.</div>';return;}
  ins.innerHTML=`
    <div class="realmCard" style="--rc:${regionColor(rg)}">
      <div class="realmName" style="font-size:19px">${esc(rg.name)}</div>
      <div class="rvSub">${(rg.provinceIds||[]).length} province${(rg.provinceIds||[]).length===1?"":"s"}</div>
      ${rg.description?`<div class="rvBlock" style="margin-top:8px"><div class="rvText">${esc(rg.description).replace(/\n/g,"<br>")}</div></div>`:'<div class="note" style="margin-top:8px">No description.</div>'}
    </div>`;
}
function subraceGroup(sr){ return (world&&world.subraceOf&&world.subraceOf[sr])||sr; }
function subracesInGroup(g){ return (world.lists.subraces||[]).filter(sr=>subraceGroup(sr)===g); }
// A race group's display colour = its representative subrace's colour (races carry no colour of their own).
function raceGroupColor(g){ const subs=subracesInGroup(g); const rep=subs.length?subs[0]:g; return catColor("subraces",rep); }
function subraceUsage(v){ let n=0; (world&&world.provinces||[]).forEach(p=>{ if((p.pops||[]).some(q=>q.race===v))n++; }); return n; }
function renameSubrace(ov,nv){
  world.provinces.forEach(p=>{ let ch=false; (p.pops||[]).forEach(q=>{ if(q.race===ov){q.race=nv;ch=true;} }); if(ch)deriveProvince(p); });
  if(world.subraceOf&&world.subraceOf[ov]!==undefined){ world.subraceOf[nv]=world.subraceOf[ov]; delete world.subraceOf[ov]; }
  if(world.colors&&world.colors.subraces&&world.colors.subraces[ov]!==undefined){ world.colors.subraces[nv]=world.colors.subraces[ov]; delete world.colors.subraces[ov]; }
}
function deleteSubrace(v){
  const grp=subraceGroup(v);
  const fb=(world.lists.subraces||[]).find(sr=>sr!==v && subraceGroup(sr)===grp) || (world.lists.subraces||[]).find(sr=>sr!==v) || "";
  world.provinces.forEach(p=>{ let ch=false; (p.pops||[]).forEach(q=>{ if(q.race===v){q.race=fb;ch=true;} }); if(ch)deriveProvince(p); });
  const i=(world.lists.subraces||[]).indexOf(v); if(i>=0)world.lists.subraces.splice(i,1);
  if(world.subraceOf)delete world.subraceOf[v]; if(world.colors&&world.colors.subraces)delete world.colors.subraces[v];
}
// province feature categories: Wonders (structures), Resource features, and Misc
const FEATURE_CATS_DEFAULT={"Ancient Ruin":"wonder","Floating Monolith":"wonder","Sunken City":"wonder","Sacred Grove":"wonder","Ley-line Nexus":"resource","Volcanic Rift":"resource","Impact Crater":"misc","Arcane Scar":"misc"};
const FEATURE_CAT_COLORS={wonder:"#e0b34e",resource:"#5fb26a",misc:"#8a93a6"};
const FEATURE_CAT_ORDER=["wonder","resource","misc"];
// "wonder" is retired as a feature type (Wonders are now their own objects) — hidden from the
// UI but kept in the code/data so existing worlds don't break. Only these show/cycle now:
const FEATURE_CAT_VISIBLE=["resource","misc"];
const FEATURE_CAT_LABEL={wonder:"Wonder",resource:"Resource feature",misc:"Misc"};
const FEATURE_CAT_GLYPH={wonder:"🏛️",resource:"💎",misc:"❖"};
function featureCat(name){ return (world.featureCats&&world.featureCats[name])||"misc"; }
function setFeatureCat(name,cat){ world.featureCats=world.featureCats||{}; world.featureCats[name]=cat; }
function featureMeta(name){ world.featureInfo=world.featureInfo||{}; if(!world.featureInfo[name])world.featureInfo[name]={description:""}; return world.featureInfo[name]; }
// military forces (GURPS Mass Combat framework)
const FORCE_DOMAINS={land:{icon:"⚔️",label:"Army"},sea:{icon:"⚓",label:"Fleet"},air:{icon:"✈️",label:"Air Wing"}};
const ELEMENT_CLASSES=["Air Combat (Air)","Armor (Arm)","Artillery (Art)","Cavalry (Cv)","Command, Control, Communications, and Intelligence (C3I)","Engineering (Eng)","Fire (F)","Naval (Nav)","Recon (Rec)","Transport (T)"];
// Mobility options, grouped by element medium (land / water / air). 0 = no mobility.
const MOBILITY_GROUPS=[["",["0 (none)"]],["Land",["Foot","Mechanized (Mech)","Motorized (Motor)","Mounted (Mtd)"]],["Water",["Coastal (Coast)","Sea"]],["Air",["Fast Air (FA)","Slow Air (SA)"]]];
const ALL_MOBILITY=MOBILITY_GROUPS.flatMap(g=>g[1]);
const NEUTRALIZE_CLASSES=["Air","Arm","Art","Cv","C3I","Eng","F","Nav","Rec","T"];
const ELEMENT_FEATURES=["Airborne","All-Weather","Disloyal","Fanatic","Flagship","Hero","Hovercraft","Impetuous","Levy","Marine","Mercenary","Neutralize (Class)","Night","Nocturnal","Sealed","Super-Soldier","Terrain (Type)"];
const EQUIP_QUALITY={"Very Fine":1.5,"Fine":1.0,"Good":0.5,"Basic":0,"Poor":-0.25};   // TS modifiers
const TROOP_QUALITY={"Elite":1.0,"Good":0.5,"Average":0,"Inferior":-0.5};
// Editable library of element templates (GM screen). TL 0 seed = Stone Age Warriors.
const DEFAULT_ELEMENT_TYPES=[
  {name:"Stone Age Warriors", cls:"Fire (F)", ts:2, pts:0, wt:1, mob:"Foot", tl:0, features:[], equip:"Basic", troop:"Average"},
];
function elementTypeList(){ return (world&&Array.isArray(world.elementTypes)&&world.elementTypes.length)?world.elementTypes:DEFAULT_ELEMENT_TYPES; }
function round2(n){ return Math.round(n*100)/100; }                          // trim float noise, keep halves
function elementMult(e){ return 1 + (EQUIP_QUALITY[e.equip]??0) + (TROOP_QUALITY[e.troop]??0); }   // quality-adjusted TS multiplier
function elCount(e){ return Math.max(1, Math.round(+e.count||1)); }          // how many of this element in the block
// block value = base × count × quality, rounded LAST (e.g. 1 TS × 5 × 1.5 = 7.5, not 10)
function elementTS(e){ return round2((+e.ts||0)*elCount(e)*elementMult(e)); }    // block TS (counts toward total)
function elementPTS(e){ return round2((+e.pts||0)*elCount(e)*elementMult(e)); }  // block parenthetical (TS), separate
function elementWT(e){ return round2((+e.wt||0)*elCount(e)); }                    // block transport weight
function elTallyHTML(e){ const m=elementMult(e); return `${elCount(e)}× &nbsp;·&nbsp; TS <b>${elementTS(e)}</b>${e.pts>0?` &nbsp;·&nbsp; (TS) <b>${elementPTS(e)}</b>`:""} &nbsp;·&nbsp; WT <b>${elementWT(e)}</b>${m!==1?` &nbsp;<span class="note">(quality ×${round2(m)})</span>`:""}`; }
function forceTS(f){ return round2((f.elements||[]).reduce((a,e)=>a+elementTS(e),0)); }
function forcePTS(f){ return round2((f.elements||[]).reduce((a,e)=>a+elementPTS(e),0)); }
function migrateElement(e){
  e.name = typeof e.name==="string"?e.name:"";
  e.count = Math.max(1, Math.round(+e.count||1));
  e.color = typeof e.color==="string"?e.color:"";          // optional element colour (none by default)
  e.embroidery = typeof e.embroidery==="string"?e.embroidery:"";  // optional elite/notable emblem
  e.ts=+e.ts||0; e.pts=+e.pts||0; e.wt=+e.wt||0; e.tl=+e.tl||0;
  if(typeof e.mob!=="string") e.mob = e.mob ? "Foot" : "0 (none)";
  if(!ELEMENT_CLASSES.includes(e.cls)) e.cls="Fire (F)";
  e.features = Array.isArray(e.features)?e.features:[];
  e.equip = (EQUIP_QUALITY[e.equip]!==undefined)?e.equip:"Basic";
  e.troop = (TROOP_QUALITY[e.troop]!==undefined)?e.troop:"Average";
  return e;
}
function newElement(typeId){
  const list=elementTypeList();
  const t=(typeId&&list.find(x=>x.id===typeId))||list[0]||{name:"",cls:"Fire (F)",ts:5,pts:0,wt:0,mob:"Foot",tl:1,features:[],equip:"Basic",troop:"Average"};
  return migrateElement({name:t.name||"", count:t.count||1, color:t.color||"", embroidery:t.embroidery||"", ts:t.ts, pts:t.pts, cls:t.cls, wt:t.wt, mob:t.mob, tl:t.tl, features:(t.features||[]).slice(), equip:t.equip, troop:t.troop, type:t.name||""});
}
function newForce(x,y,realmId){ return {id:uid(), name:"New Force", domain:"land", x:Math.round(x), y:Math.round(y), realmId:realmId||null, scale:1,
  elements:[newElement()],
  commander:{name:"", strategy:12, leadership:12},
  intel:{name:"", skill:12},
  quartermaster:{name:"", skill:12} }; }
const MONSTER_DEFAULT_ICON="img/monsters/cyclone.png";
function newMonster(x,y){ return {id:uid(), name:"New Creature", icon:MONSTER_DEFAULT_ICON, description:"", creatureType:"", groupId:null, x:Math.round(x), y:Math.round(y), scale:0.6}; }
// Custom monster images available in static/img/monsters/ — auto-populated from the server at boot.
let MONSTER_IMAGES=[ {name:"Cyclone", src:"img/monsters/cyclone.png"} ];
const DEFAULT_CREATURE_TYPES=[
  {name:"Beast",      color:"#7a8a5a"},
  {name:"Dragon",     color:"#b5472e"},
  {name:"Undead",     color:"#6d7f8a"},
  {name:"Aberration", color:"#7d5aa8"},
  {name:"Elemental",  color:"#3f9fc0"},
  {name:"Fiend",      color:"#8a3d55"},
];
function creatureType(id){ return (world.creatureTypes||[]).find(t=>t.id===id) || null; }
function creatureTypeColorOf(m){ const t=m&&creatureType(m.creatureType); return t?t.color:"#7a3b3b"; }
function creatureTypeName(m){ const t=m&&creatureType(m.creatureType); return t?t.name:""; }
function roll3d6(){ return (1+Math.floor(Math.random()*6))+(1+Math.floor(Math.random()*6))+(1+Math.floor(Math.random()*6)); }
// ---- element field builders (shared by the GM template editor and the force editor) ----
function elClsSelect(v,ro){ return `<select class="elCls" ${ro?"disabled":""}>${ELEMENT_CLASSES.map(c=>`<option ${c===v?"selected":""}>${esc(c)}</option>`).join("")}</select>`; }
function elMobSelect(v,ro){ let h=`<select class="elMob" ${ro?"disabled":""}>`;
  MOBILITY_GROUPS.forEach(([grp,opts])=>{ if(grp)h+=`<optgroup label="${grp}">`; opts.forEach(o=>h+=`<option ${o===v?"selected":""}>${esc(o)}</option>`); if(grp)h+=`</optgroup>`; }); return h+`</select>`; }
function elQualSelect(cls,obj,v,ro){ return `<select class="${cls}" ${ro?"disabled":""}>${Object.keys(obj).map(k=>{const m=obj[k];return `<option value="${esc(k)}" ${k===v?"selected":""}>${esc(k)} (${m>=0?"+":""}${Math.round(m*100)}%)</option>`;}).join("")}</select>`; }
function elFeaturesHTML(e,ro){
  const tags=(e.features||[]).length ? e.features.map((f,i)=>`<span class="tag" data-i="${i}">${esc(f)}${ro?"":` <span class="x">✕</span>`}</span>`).join(" ") : '<span class="note">None</span>';
  const add= ro?"" : `<select class="elFeatAdd" style="margin-top:3px"><option value="">＋ optional feature…</option>${ELEMENT_FEATURES.map(f=>`<option>${esc(f)}</option>`).join("")}</select>`;
  return `<div class="elFeats">${tags}</div>${add}`;
}
function addElementFeature(e, feat){
  e.features=e.features||[];
  if(feat==="Neutralize (Class)"){ const c=(prompt("Neutralize which class? — "+NEUTRALIZE_CLASSES.join(", "))||"").trim(); if(!c)return false; e.features.push("Neutralize ("+c+")"); }
  else if(feat==="Terrain (Type)"){ const t=(prompt("Terrain type? — "+world.lists.terrains.join(", "))||"").trim(); if(!t)return false; e.features.push("Terrain ("+t+")"); }
  else { if(!e.features.includes(feat)) e.features.push(feat); else return false; }
  return true;
}
// Full editable field grid for one element. `withType` adds a template picker (force editor).
function elementFieldGrid(e, ro, withType){
  const typeRow = withType ? `<div class="field"><label>Element type</label><select class="elType" ${ro?"disabled":""}>${
      (world.elementTypes||[]).map(t=>`<option value="${t.id}" ${e.type===t.name?"selected":""}>${esc(t.name)} (TL${t.tl||0})</option>`).join("")
      + ((world.elementTypes||[]).some(t=>t.name===e.type)?"":`<option value="" selected>(custom)</option>`)}</select></div>` : "";
  const cnt=elCount(e);
  return `
    ${typeRow}
    <div class="field2">
      <div class="field"><label>Name</label><input class="elName" value="${esc(e.name||"")}" placeholder="${withType?"e.g. 3rd Legion":"template name"}" ${ro?"disabled":""}/></div>
      <div class="field" style="flex:0 0 68px"><label>Count ×</label><input class="elCount" type="number" min="1" value="${cnt}" title="How many of this element are in this group" ${ro?"disabled":""}/></div>
    </div>
    <div class="field2">
      <div class="field"><label>Class</label>${elClsSelect(e.cls,ro)}</div>
      <div class="field"><label>Mobility</label>${elMobSelect(e.mob,ro)}</div>
    </div>
    <div class="field3">
      <div class="field"><label>TS <span class="note">(each)</span></label><input class="elTs" type="number" min="0" value="${e.ts||0}" ${ro?"disabled":""}/></div>
      <div class="field"><label>(TS) <span class="note">(each)</span></label><input class="elPts" type="number" min="0" value="${e.pts||0}" title="Parenthetical TS — tracked separately, not added to total" ${ro?"disabled":""}/></div>
      <div class="field"><label>WT <span class="note">(each)</span></label><input class="elWt" type="number" value="${e.wt||0}" title="Transport Weight" ${ro?"disabled":""}/></div>
      <div class="field"><label>TL</label><input class="elTl" type="number" min="0" value="${e.tl||0}" ${ro?"disabled":""}/></div>
    </div>
    <div class="field2">
      <div class="field"><label>Equipment quality</label>${elQualSelect("elEquip",EQUIP_QUALITY,e.equip,ro)}</div>
      <div class="field"><label>Troop quality</label>${elQualSelect("elTroop",TROOP_QUALITY,e.troop,ro)}</div>
    </div>
    <div class="field"><label>Optional features</label>${elFeaturesHTML(e,ro)}</div>
    ${ro?"":`<div class="field2">
      <div class="field"><label>Colour <span class="note">(optional)</span></label>
        <span style="display:flex;align-items:center;gap:6px">
          <input type="checkbox" class="elColorOn" ${e.color?"checked":""} title="Give this element a colour"/>
          <input type="color" class="elColor" value="${e.color||'#c0392b'}" ${!e.color?"disabled":""} style="width:40px;height:28px;padding:1px"/>
        </span>
      </div>
      <div class="field"><label>Embroidery <span class="note">(elite emblem)</span></label>
        <input class="elEmb" value="${esc(e.embroidery||'')}" placeholder="e.g. ★ ⚜ 👑" maxlength="10"/></div>
    </div>`}
    <div class="elTally">${elTallyHTML(e)}</div>`;
}
// apply the element's colour accent + elite emblem to its row (works in editor and read-only viewer)
function applyElStyle(row, e){
  row.style.borderColor = e.color || "";
  row.style.boxShadow = e.color ? `inset 5px 0 0 ${e.color}` : "";
  row.classList.toggle("embroidered", !!e.embroidery);
  let em=row.querySelector(":scope > .elEmblem");
  if(e.embroidery){ if(!em){ em=document.createElement("span"); em.className="elEmblem"; em.title="Notable / elite"; row.insertBefore(em, row.firstChild); } em.textContent=e.embroidery; }
  else if(em){ em.remove(); }
}
// Wire the field grid inside `row` to element `e`. Updates the block tally in place
// (so text fields keep focus). `rerender` rebuilds the list (used when features change);
// `onTotals` refreshes any parent totals (force TS badge + map token).
function bindElementFields(row, e, rerender, onTotals){
  const q=s=>row.querySelector(s);
  const tally=()=>{ const t=q(".elTally"); if(t)t.innerHTML=elTallyHTML(e); if(onTotals)onTotals(); markDirty(); };
  const on=(sel,ev,fn)=>{ const el=q(sel); if(el)el.addEventListener(ev,fn); };
  on(".elName","input",x=>{e.name=x.target.value; markDirty(); renderMap();});
  on(".elCount","input",x=>{e.count=Math.max(1,Math.round(+x.target.value||1)); tally();});
  on(".elCls","change",x=>{e.cls=x.target.value; markDirty();});
  on(".elMob","change",x=>{e.mob=x.target.value; markDirty();});
  on(".elTs","input",x=>{e.ts=+x.target.value||0; tally();});
  on(".elPts","input",x=>{e.pts=+x.target.value||0; tally();});
  on(".elWt","input",x=>{e.wt=+x.target.value||0; tally();});
  on(".elTl","input",x=>{e.tl=+x.target.value||0; markDirty();});
  on(".elEquip","change",x=>{e.equip=x.target.value; tally();});
  on(".elTroop","change",x=>{e.troop=x.target.value; tally();});
  on(".elEmb","input",x=>{e.embroidery=x.target.value; applyElStyle(row,e); markDirty();});
  const con=q(".elColorOn"), cp=q(".elColor");
  if(con)con.addEventListener("change",x=>{ e.color = x.target.checked ? (cp?cp.value:"#c0392b") : ""; if(cp)cp.disabled=!x.target.checked; applyElStyle(row,e); markDirty(); });
  if(cp)cp.addEventListener("input",x=>{ e.color=x.target.value; if(con)con.checked=true; applyElStyle(row,e); markDirty(); });
  const fa=q(".elFeatAdd"); if(fa)fa.addEventListener("change",x=>{ const v=x.target.value; x.target.value=""; if(v&&addElementFeature(e,v)&&rerender)rerender(); });
  q(".elFeats") && q(".elFeats").querySelectorAll(".tag .x").forEach(xb=>xb.onclick=()=>{ const i=+xb.parentElement.dataset.i; e.features.splice(i,1); if(rerender)rerender(); });
  applyElStyle(row, e);
}

/* ============================================================
   STATE
   ============================================================ */
let world = null;
let state = {
  tool: "select",
  mapmode: "political",
  selProvince: null,
  selRealm: null,
  selReligion: null,        // religion info panel: selected religion name
  selRaceGroup: null,       // race map: spotlight all subraces of this race group
  selRegion: null,          // region map: active/highlighted region id
  showRegions: false,       // secondary topbar toggle: draw region names on every mapmode
  terrainSel: new Set(),    // terrain map: multi-select set of highlighted terrain types
  focusedContinent: null,   // continent currently targeted for drawing
  tilt: false,
  cam: { x: 0, y: 0, scale: 0.3 },  // x,y = world coord at canvas top-left; scale = px/world-unit
  draft: null,              // in-progress polygon points (local coords) while drawing
  paintValue: null,         // category value to paint (non-political modes)
  paintMixOn: false,        // identity paint: blend several groups by a breakdown instead of one
  paintMixGroups: [],       // [{name,w}] chosen groups + relative weights for the mix
  paintMixJitter: 15,       // mix paint: per-province random ± on the breakdown (%)
  paintUnclaim: false,      // political: paint provinces back to unclaimed
  drawCursor: null,         // live (snapped) cursor while drawing
  nodeDrag: null,           // {p,i} vertex being dragged in Nodes tool
  split: null,              // {p, pts:[], cur:[x,y]} active split-line for a province
  editMode: false,          // map-drawing screen on/off
  showNames: false,         // show landmass names on the map (off by default)
  showWater: true,          // secondary topbar toggle: draw rivers & lakes on every mapmode
  newRiverWidth: 3,         // default width for newly-drawn rivers (thin; max 10)
  newLakeWidth: 1.5,        // default outline width for newly-drawn lakes
  waterEditMode: false,     // terrain map (editor): click to select & reshape existing water
  realmOverlay: true,       // non-political modes: outline realm borders (on by default)
  terrainOverlay: false,    // non-political modes: overlay terrain-region outlines
  selForce: null,           // military mode: selected force id
  forceMoveId: null,        // military mode: force awaiting a move-to click
  selBattle: null,          // military mode: selected battle (pair of force ids)
  hiddenResMode: false,     // resource mode: show & paint hidden/strategic resources
  pingOn: false,            // annotation/ping overlay active
  pingTool: "brush",        // brush | pin | erase | pan
  pingColor: "#e23b3b",
  pingWidth: 6,
  rulerOn: false,           // distance measuring tool
  rulerPts: [],             // world-coord points of the current measurement
  rulerCur: null,           // live cursor point (world coords)
  rulerDone: false,         // measurement finished (frozen) — next click starts a new one
  expandMode: "conquer",    // realm painting: conquer | settle | override
  settleParams: {byReligion:false, byCulture:false, byLanguage:false, byRace:false, settleTier:"Village"},
  labelDrag: null,          // continentId whose name is being dragged
  customDrag: null,         // custom label id being dragged
  selLabel: null,           // selected custom label id
  draftType: "province",    // what the current draft becomes: province | lake | river
  moveDrag: null,           // {p, start:[...points], grab:[wx,wy]} while moving a province
  selWater: null,           // {type:"river"|"lake", id} selected water feature
  popDir: 1,                // population tool: +1 grow / -1 decline
  popScope: "world",        // population tool scope: world | continent | realm | selected
  popCont: null,            // chosen continent id for continent scope
  popRealm: null,           // chosen realm id for realm scope
  popSel: new Set(),        // province ids picked for "selected" scope
  pvPieMode: "pct",         // viewer province pies: "pct" (percentages) | "num" (population numbers)
  convertTarget: null,      // conversion tool: target religion/culture/language value
  convertPct: 30,           // conversion tool: baseline % of pops converted
  convertFast: false,       // conversion tool: fast-spreading religion (→50%)
  convertSel: new Set(),    // conversion tool: selected province ids
  convertCenter: null,      // conversion tool: origin province id (distance falloff)
  convertSelecting: false,  // conversion tool: clicking/dragging selects provinces
  convertPickCenter: false, // conversion tool: next click sets the conversion center
  popFavRel: false,         // pop growth: favor the realm's state religion
  popFavRace: false,        // pop growth: favor the realm's admin races
  popFavCul: false,         // pop growth: favor the realm's dominant culture
  popFavLang: false,        // pop growth: favor the realm's dominant language
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
  syncCompendiumToWorld();
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
  if(j.ok){ _compendium=null; world=normalize(j.world); afterLoad(); return true; }   // switching worlds → rebuild the global compendium
  return false;
}
function normalize(w){
  if(!w || typeof w!=="object" || Array.isArray(w)) w={};   // tolerate empty/garbage input
  if(w.world && typeof w.world==="object" && w.world.provinces) w=w.world;   // accept a {world:…} wrapper
  if(typeof w.name!=="string" || !w.name) w.name="Untitled World";
  w.lists=Object.assign(JSON.parse(JSON.stringify(DEFAULT_LISTS)),w.lists||{});
  w.continents=w.continents||[]; w.realms=w.realms||[]; w.provinces=w.provinces||[]; w.eras=w.eras||[];
  if(!w.eras.length) w.eras=[{id:uid(),name:"First Age"}];   // history entries need at least one age
  if(!w.currentEraId || !w.eras.some(e=>e.id===w.currentEraId)) w.currentEraId=w.eras[0].id;
  w.rivers=w.rivers||[]; w.lakes=w.lakes||[]; w.colors=w.colors||{};
  w.rivers.forEach(rv=>{ if(+rv.width>10) rv.width=10; });   // cap river width to the new maximum
  w.labels=w.labels||[];   // custom map annotations
  // Technology Levels: global field list + default per-field-per-TL descriptions. Existing
  // realms without r.tech are left untouched (treated as "no TLs set up" → TL0) for back-compat.
  w.techFields = Array.isArray(w.techFields)&&w.techFields.length ? w.techFields : DEFAULT_TECH_FIELDS.slice();
  w.techDesc = (w.techDesc&&typeof w.techDesc==="object") ? w.techDesc : {};
  w.techFieldDefault = (w.techFieldDefault&&typeof w.techFieldDefault==="object") ? w.techFieldDefault : {};   // per-field: appear on new realms?
  w.techFields.forEach(f=>{ if(w.techFieldDefault[f]===undefined) w.techFieldDefault[f]=true; });               // existing fields default ON
  w.techColors = (w.techColors&&typeof w.techColors==="object") ? w.techColors : {};                          // per-TL colour overrides
  w.discoveries = Array.isArray(w.discoveries) ? w.discoveries : [];                                          // significant techs, assigned to a field + TL
  w.discoveries.forEach(d=>{ if(!d.id)d.id=uid(); if(typeof d.name!=="string")d.name="Discovery"; if(typeof d.field!=="string")d.field=(w.techFields[0]||""); d.tl=tlClamp(d.tl); if(typeof d.description!=="string")d.description=""; if(!d.color)d.color="#e0a020"; if(typeof d.realmId!=="string")d.realmId=""; });
  w.powers = Array.isArray(w.powers) ? w.powers : [];   // realm powers (Druidic, Magic, Demonic…) with type + origin
  w.powers.forEach(pw=>{ if(!pw.id)pw.id=uid(); if(typeof pw.name!=="string")pw.name="Power"; if(typeof pw.type!=="string")pw.type=""; if(typeof pw.origin!=="string")pw.origin=""; if(typeof pw.description!=="string")pw.description=""; if(!pw.color)pw.color="#7c5cff"; });
  w.compendium = (w.compendium && typeof w.compendium==="object") ? w.compendium : {};   // legacy lore store (migrated into the global compendium)
  // The Compendium (characters, role tags, ruler timelines, lore) is GLOBAL — it lives outside
  // per-turn snapshots in `_compendium` and is carried on w.compendiumStore for persistence.
  if(w.compendiumStore && typeof w.compendiumStore==="object"){ /* kept as-is; loaded by ensureCompendium */ }
  w.regions=Array.isArray(w.regions)?w.regions:[];   // named groupings of provinces (Regions map)
  w.regions.forEach(rg=>{ if(!rg.id)rg.id=uid(); if(typeof rg.name!=="string")rg.name="Region"; if(typeof rg.description!=="string")rg.description=""; rg.provinceIds=Array.isArray(rg.provinceIds)?rg.provinceIds:[]; if(!rg.color)rg.color=hashColor(rg.id); });
  if(!w.milesPerUnit)w.milesPerUnit=10;   // map scale: miles per world unit
  if(w.distanceUnit!=="km")w.distanceUnit="mi";   // display unit for the scale bar
  if(w.capitalBoost==null)w.capitalBoost=1.8;   // population distribution: capital multiplier
  if(w.adminBoost==null)w.adminBoost=1.3;        // population distribution: admin-centre multiplier
  // ensure the Nomadic settlement tier & the Primitive economy exist in older worlds
  if(!w.lists.settlements.includes("Nomadic")){ const i=w.lists.settlements.indexOf("Uninhabited"); w.lists.settlements.splice(i<0?0:i+1,0,"Nomadic"); }
  { const pc=w.lists.economies.indexOf("Primitive Communism"); if(pc>=0)w.lists.economies[pc]="Primitive"; }
  if(!w.lists.economies.includes("Primitive")) w.lists.economies.unshift("Primitive");
  if(!w.lists.economies.includes("Uninhabited")) w.lists.economies.unshift("Uninhabited");
  w.realms.forEach(r=>{ if(r.economy==="Primitive Communism")r.economy="Primitive"; });
  // ensure newer terrain types exist in older worlds
  ["Farmlands","Steppe","Savannah","Taiga","Glacial","Caverns"].forEach(t=>{ if(!w.lists.terrains.includes(t)) w.lists.terrains.push(t); });
  // "unsettled" defaults for lands with no organised society
  if(!w.lists.religions.includes("No Religion")) w.lists.religions.unshift("No Religion");
  if(!w.lists.cultures.includes("No Culture")) w.lists.cultures.unshift("No Culture");
  if(!w.lists.languages.includes("No Language")) w.lists.languages.unshift("No Language");
  // feature categories (Wonder / Resource / Misc)
  w.featureCats=w.featureCats||{};
  (w.lists.features||[]).forEach(f=>{ if(!w.featureCats[f]) w.featureCats[f]=FEATURE_CATS_DEFAULT[f]||"misc"; });
  // per-feature blurb shown in a bubble when clicked
  w.featureInfo = (w.featureInfo && typeof w.featureInfo==="object") ? w.featureInfo : {};
  (w.lists.features||[]).forEach(f=>{ if(!w.featureInfo[f]) w.featureInfo[f]={description:""}; });
  // default province-view banner image per terrain type (GM-editable; per-province override lives on p.terrainImage)
  w.terrainImages = (w.terrainImages && typeof w.terrainImages==="object") ? w.terrainImages : {};
  (w.lists.terrains||[]).forEach(t=>{ if(w.terrainImages[t]===undefined){ const d=TERRAIN_IMAGE_DEFAULTS[t]; if(d) w.terrainImages[t]="img/terrain/"+d+".png"; } });
  // resource overhaul: one-time swap to the canonical regular+prestige list + province migration
  w.lists.hiddenResources=(w.lists.hiddenResources&&w.lists.hiddenResources.length)?w.lists.hiddenResources:HIDDEN_RESOURCES.slice();
  if(!w.resourcesV2){
    w.lists.resources=RESOURCE_LIST.slice();
    const resSet=new Set(w.lists.resources);
    w.provinces.forEach(p=>{ if(!resSet.has(p.resource)) p.resource=RES_MIGRATE[p.resource]||"Grains"; });
    w.resourcesV2=true;
  }
  w.provinces.forEach(p=>{ p.hidden=p.hidden||""; });
  w.provinces=w.provinces.filter(p=>p && Array.isArray(p.points));   // drop provinces with no geometry at all (unrenderable)
  w.provinces.forEach(p=>{
    ["religion","culture","race","language"].forEach(k=>p[k]=p[k]||[]);
    p.features=p.features||[]; p.history=p.history||[];
    if(typeof p.settlementName!=="string") p.settlementName="";   // "" = follow the province name; else a custom settlement name
    if(typeof p.terrainImage!=="string") p.terrainImage="";       // "" = use the terrain default; else a per-province override
    const oldEcon=(typeof p.economy==="string" && p.economy)?p.economy:null;   // old per-province override
    if(!Array.isArray(p.pops)) p.pops=migratePops(p,w.lists);   // one-time migration from the old model
    const r=p.realmId?w.realms.find(x=>x.id===p.realmId):null;
    p.pops.forEach(q=>{ if(!q.economy) q.economy = oldEcon || (r&&r.economy?r.economy:"Primitive"); });   // seed Mode of Production
    deriveProvince(p);                                          // keep population + %s in sync with pops
  });
  // Subraces: pops' "race" value is now a SUBRACE; the race list is the groups above them.
  // With no subraces defined (old files), each race simply becomes its own subrace so nothing breaks.
  w.subraceOf = (w.subraceOf && typeof w.subraceOf==="object") ? w.subraceOf : {};
  if(!(Array.isArray(w.lists.subraces) && w.lists.subraces.length)) w.lists.subraces=(w.lists.races||[]).slice();
  { const set=new Set(w.lists.subraces);
    w.provinces.forEach(p=>(p.pops||[]).forEach(q=>{ if(q.race && !set.has(q.race)){ w.lists.subraces.push(q.race); set.add(q.race); } }));
    w.lists.subraces.forEach(sr=>{ if(!w.subraceOf[sr]) w.subraceOf[sr]=(w.lists.races||[]).includes(sr)?sr:((w.lists.races||[])[0]||sr); });
    Object.keys(w.subraceOf).forEach(sr=>{ if(!set.has(sr)) delete w.subraceOf[sr]; });
  }
  w.realms.forEach(r=>{r.adminCenters=r.adminCenters||[];r.dominantLanguage=r.dominantLanguage||"";
    if(typeof r.description!=="string")r.description="";
    // racial administration (was single "dominantRace") + new racial military — both are race lists
    if(!Array.isArray(r.adminRaces)) r.adminRaces = r.dominantRace ? [r.dominantRace] : [];
    if(!Array.isArray(r.militaryRaces)) r.militaryRaces = [];
    r.dominantRace = r.adminRaces[0] || "";   // keep the single field in sync for pop defaults/state-group logic
  });
  w.forces=w.forces||[];   // military units
  w.forces.forEach(f=>{ if(f.scale==null)f.scale=1; if(typeof f.description!=="string")f.description=""; if(typeof f.commanderCharId!=="string")f.commanderCharId=""; (f.elements||[]).forEach(migrateElement); });
  // army element-type library (editable in the GM screen)
  w.elementTypes = (Array.isArray(w.elementTypes)&&w.elementTypes.length) ? w.elementTypes : DEFAULT_ELEMENT_TYPES.map(t=>({id:uid(),...t}));
  w.elementTypes.forEach(t=>{ if(!t.id)t.id=uid(); migrateElement(t); });
  w.monsters=w.monsters||[];   // free-floating legendary creatures
  w.creatureTypes = (Array.isArray(w.creatureTypes)&&w.creatureTypes.length) ? w.creatureTypes : DEFAULT_CREATURE_TYPES.map(t=>({id:uid(),...t}));
  w.creatureTypes.forEach(t=>{ if(!t.id)t.id=uid(); });
  w.monsterPresets = Array.isArray(w.monsterPresets) ? w.monsterPresets : [];
  w.monsterPresets.forEach(pr=>{ if(!pr.id)pr.id=uid(); pr.name=pr.name||""; pr.icon=pr.icon||MONSTER_DEFAULT_ICON; pr.description=pr.description||""; pr.creatureType=pr.creatureType||""; });
  w.monsterGroups = Array.isArray(w.monsterGroups) ? w.monsterGroups : [];   // legend groupings (ordered)
  w.monsterGroups.forEach(g=>{ if(!g.id)g.id=uid(); g.name=g.name||"Group"; });
  w.monsters.forEach(m=>{ if(!m.id)m.id=uid();
    m.icon=m.icon||MONSTER_DEFAULT_ICON; m.description=typeof m.description==="string"?m.description:"";
    m.creatureType=m.creatureType||""; if(m.groupId===undefined)m.groupId=null; if(m.scale==null)m.scale=0.6; });
  // Wonders (great projects) — their own objects, attached to a province. No longer a "Feature".
  w.wonders = Array.isArray(w.wonders) ? w.wonders : [];
  w.wonders.forEach((x,i)=>{ if(!x.id)x.id=uid(); x.name=x.name||"New Wonder"; x.image=x.image||"";
    x.description=typeof x.description==="string"?x.description:""; x.provinceId=x.provinceId||null;
    x.holySite=!!x.holySite; if(typeof x.order!=="number")x.order=i;
    if(!Array.isArray(x.religions)) x.religions = x.religion ? [x.religion] : [];   // migrate single → multi
    delete x.religion; });
  // Religion info panels: symbol image + description, keyed by religion name
  w.religionInfo = (w.religionInfo && typeof w.religionInfo==="object") ? w.religionInfo : {};
  (w.lists.religions||[]).forEach(rn=>{ if(!w.religionInfo[rn]) w.religionInfo[rn]={symbol:"",description:""}; });
  w.tune=w.tune||{};           // GM-editable simulation values
  w.tune.terrainHab=w.tune.terrainHab||{};
  w.tune.raceGrowth=w.tune.raceGrowth||{};
  w.tune.raceSize=w.tune.raceSize||{};   // per-race density (people-per-ceiling-slot); 1 = human baseline
  w.tune.settleFactors=w.tune.settleFactors||null;
  seedPopTune(w);              // pop growth/decline tunables (per-terrain & per-settlement)
  // migrate any old per-province monster pins into free map objects
  w.provinces.forEach(p=>{ if(p.monster && (p.monster.name||p.monster.icon)){
    let cx=0,cy=0; (p.points||[]).forEach(([x,y])=>{cx+=x;cy+=y;});
    const n=(p.points||[]).length||1; const cont=w.continents.find(c=>c.id===p.continentId)||{ox:0,oy:0};
    w.monsters.push({id:uid(),name:p.monster.name||"",icon:p.monster.icon||"🐉",x:Math.round(cont.ox+cx/n),y:Math.round(cont.oy+cy/n),scale:1.4});
    delete p.monster;
  }});
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
const POP_AXES=["religion","culture","race","language","economy"];
function newPop(size,rel,cul,race,lang,econ){return {id:uid(),size:Math.max(0,Math.round(size||0)),religion:rel||"",culture:cul||"",race:race||"",language:lang||"",economy:econ||""};}
// [religion,culture,race,language,economy] a new pop should get: a realm's identity, or "unsettled" defaults
// a representative subrace to seed for a race group (first subrace in the group, else the group name)
function defaultSubraceForGroup(g){ return subracesInGroup(g)[0] || g || (world.lists.subraces&&world.lists.subraces[0]) || ""; }
function defaultPopIdentity(r){
  return r ? [r.stateReligion, r.dominantCulture, defaultSubraceForGroup(r.dominantRace), r.dominantLanguage, r.economy||"Primitive"]
           : ["No Religion", "No Culture", (world.lists.subraces&&world.lists.subraces[0])||(world.lists.races[0]||""), "No Language", "Primitive"];
}
function axisFromPops(pops,key){
  const m={}; let tot=0;
  for(const q of pops){const v=q[key]||""; if(!v||!(q.size>0))continue; m[v]=(m[v]||0)+q.size; tot+=q.size;}
  if(tot<=0)return [];
  return Object.entries(m).map(([name,sz])=>({name,pct:Math.round(sz/tot*100)})).sort((a,b)=>b.pct-a.pct);
}
// combine pop groups identical in every category (sizes summed) — for optimisation
function mergePops(p){
  // Merge identical pop groups IN PLACE — reuse the existing objects rather than
  // cloning them, so any input elements bound to a pop stay bound to the live object.
  const by=new Map(), out=[];
  for(const q of (p.pops||[])){
    q.religion=q.religion||""; q.culture=q.culture||""; q.race=q.race||"";
    q.language=q.language||""; q.economy=q.economy||"";
    q.size=Math.max(0,Math.round(q.size||0));
    if(!q.id)q.id=uid();
    const key=JSON.stringify([q.religion,q.culture,q.race,q.language,q.economy]);
    if(by.has(key)) by.get(key).size+=q.size;   // fold duplicate into the kept object
    else { by.set(key,q); out.push(q); }
  }
  p.pops=out;
}
// Recompute a province's totals & axis breakdowns from its pops WITHOUT merging
// identical groups — so the pop editor can hold two identical groups apart while
// you build a brand-new one.
function recomputeProvince(p){
  p.pops=Array.isArray(p.pops)?p.pops:[];
  p.population=p.pops.reduce((a,q)=>a+(q.size||0),0);
  p.religion=axisFromPops(p.pops,"religion");
  p.culture=axisFromPops(p.pops,"culture");
  p.race=axisFromPops(p.pops,"race");
  p.language=axisFromPops(p.pops,"language");
  p.economy=axisFromPops(p.pops,"economy");
}
function deriveProvince(p){
  p.pops=Array.isArray(p.pops)?p.pops:[];
  if(p.ocean){ p.pops=[]; p.population=0; p.religion=[];p.culture=[];p.race=[];p.language=[];p.economy=[]; return; }   // water province: no people
  mergePops(p);
  recomputeProvince(p);
}
// Consolidate identical pop groups for a province once it's no longer being edited.
function commitProvincePops(id){
  const p=world.provinces.find(x=>x.id===id); if(!p)return;
  deriveProvince(p);
}
function migratePops(p,lists){
  const pop=p.population||0; if(pop<=0)return [];
  const def={religion:"No Religion",culture:"No Culture",race:(lists.races[0]||""),language:"No Language"};
  const ax=key=>(p[key]&&p[key].length)?p[key]:[{name:def[key],pct:100}];
  const rels=ax("religion"),culs=ax("culture"),races=ax("race"),langs=ax("language");
  const econ = (typeof p.economy==="string" && p.economy) ? p.economy : "Primitive";   // old string override, else Primitive
  const out=[];
  for(const r of rels)for(const c of culs)for(const ra of races)for(const l of langs){
    const size=Math.round(pop*(r.pct/100)*(c.pct/100)*(ra.pct/100)*(l.pct/100));
    if(size>0)out.push(newPop(size,r.name,c.name,ra.name,l.name,econ));
  }
  if(!out.length)out.push(newPop(pop,dominant(p.religion),dominant(p.culture),dominant(p.race),dominant(p.language),econ));
  return out;
}
// Scale a province's pops so their total equals `target` (used by realm Distribute).
function setProvincePopulation(p,target){
  target=Math.max(0,Math.round(target||0));
  p.pops=Array.isArray(p.pops)?p.pops:[];
  if(target<=0){ p.pops=[]; deriveProvince(p); return; }
  const cur=p.pops.reduce((a,q)=>a+(q.size||0),0);
  if(!p.pops.length){
    if(target>0){const id=defaultPopIdentity(world.realms.find(x=>x.id===p.realmId)); p.pops=[newPop(target, id[0], id[1], id[2], id[3], id[4])];}
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
// ---- population simulation ----
function settlePopFactor(s){                 // 0 = no people; higher tiers hold more
  const idx=world.lists.settlements.indexOf(s);
  const over=(world.tune&&world.tune.settleFactors)||null;
  const table=over&&over.length?over:[0,0.4,1,1.8,3,4.5];   // Uninhabited, Nomadic, Village, Town, City, Megalopolis
  if(idx<=0) return 0;
  return table[idx]!=null?table[idx]:1.8;
}
function keyLocPopFactor(p){
  const role=_keyLocMap[p.id];
  if(role==="capital") return world.capitalBoost??1.8;
  if(role==="admin")   return world.adminBoost??1.3;
  return 1;
}
function genProvincePop(p, baseline, variance, opt){
  let f=baseline;
  if(opt.terrain) f*=terrainHab(p.terrain);
  if(opt.settle){ const sf=settlePopFactor(p.settlement); if(sf<=0) return 0; f*=sf; }
  if(opt.key) f*=keyLocPopFactor(p);
  f*= 1 + (Math.random()*2-1)*(variance||0);
  return Math.max(0, Math.round(f));
}
function growProvincePop(p, growPct, variance, opt){
  const cur=(p.pops||[]).reduce((a,q)=>a+(q.size||0),0);
  if(cur<=0) return 0;                        // people only grow where people already are
  let g=growPct/100;
  if(opt.terrain) g*=terrainHab(p.terrain);   // hospitable places grow faster
  g*= 1 + (Math.random()*2-1)*(variance||0);
  return Math.max(0, Math.round(cur*(1+g)));
}
// Grow each pop group individually so per-race growth modifiers apply.
function growGenericPops(p, growPct, variance, opt){
  p.pops=p.pops||[];
  const cur=p.pops.reduce((a,q)=>a+(q.size||0),0);
  if(cur<=0){ return; }                        // people only grow where people already are
  const base=growPct/100 * (opt.terrain?terrainHab(p.terrain):1);
  for(const q of p.pops){
    let g=base*(1+(Math.random()*2-1)*(variance||0));
    g*=raceGrowthMod(q.race);                   // GM-tunable per-race growth
    q.size=Math.max(0,Math.round(q.size*(1+g)));
  }
  deriveProvince(p);
}
function provsInRect(rect){
  const out=[]; for(const g of _provGeo){ if(g.cx>=rect.x&&g.cx<=rect.x+rect.w&&g.cy>=rect.y&&g.cy<=rect.y+rect.h)out.push(g.p); }
  return out;
}
// realm growth with state-group prioritisation
function matchesState(q, r, axes){
  if(axes.religion && q.religion!==r.stateReligion) return false;
  if(axes.culture  && q.culture !==r.dominantCulture) return false;
  if(axes.language && q.language!==r.dominantLanguage) return false;
  if(axes.race     && q.race    !==r.dominantRace) return false;
  return true;
}
function ensureStatePop(p, r, axes){   // give the state group a foothold if it isn't present
  p.pops=p.pops||[];
  if(p.pops.some(q=>q.size>0 && matchesState(q,r,axes))) return;
  const cur=p.pops.reduce((a,q)=>a+(q.size||0),0);
  p.pops.push(newPop(Math.max(50,Math.round(cur*0.02)), r.stateReligion, r.dominantCulture, r.dominantRace, r.dominantLanguage, r.economy||"Primitive"));
}
function growRealmPops(p, growPct, variance, opt, r, prio){
  if(prio.seed) ensureStatePop(p, r, prio.axes);
  p.pops=p.pops||[];
  const base=growPct/100 * (opt.terrain?terrainHab(p.terrain):1);
  for(const q of p.pops){
    let g=base*(1+(Math.random()*2-1)*variance);
    g*=raceGrowthMod(q.race);                   // GM-tunable per-race growth
    if(prio.on && matchesState(q,r,prio.axes)) g=g*1.5+0.03;   // a slight edge for the state group
    q.size=Math.max(0,Math.round(q.size*(1+g)));
  }
  deriveProvince(p);
}

/* ============================================================
   CANVAS RENDERER  (scales to thousands of provinces)
   ============================================================ */
let _geoDirty=true, _renderQueued=false, _provGeo=[], _contBox={}, _stars=null;
let _coastSegs=[];   // ocean-tile edges that border a land province (dark coastline), rebuilt with geometry
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
    case "tech": return p=>p.realmId;   // show realm names on the Tech Level map too
    case "religion": return p=>axisLabelName(p,"religion");
    case "culture": return p=>axisLabelName(p,"culture");
    case "race": return p=>axisLabelName(p,"race");
    case "language": return p=>axisLabelName(p,"language");
    case "terrain": return null;   // terrain uses custom labels, not auto region names
    case "settlement": return p=>(p.settlement&&p.settlement!=="Uninhabited")?p.settlement:null;
    case "economy": return p=>economyOf(p);
    case "resource": return null;   // resource uses custom labels, not auto region names
    default: return null;
  }
}
function economyOf(p){   // dominant Mode of Production across this province's pops
  return dominant(p.economy) || ((p.population>0) ? "Primitive" : "Uninhabited");
}
function labelText(mode,val){ if(mode==="political"||mode==="tech"){const r=world.realms.find(r=>r.id===val);return r?r.name:"";} return val; }
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
      minx:gp.minx,miny:gp.miny,maxx:gp.maxx,maxy:gp.maxy,
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
  for(let i=0;i<n;i++){const it=items[i];
    // Political: one label per realm across ALL its land (so a realm spanning landmasses
    // gets a single name that floats over the void between them). Other modes: contiguous pockets.
    const key = (mode==="political"||mode==="tech") ? ("R:"+it.val) : find(i);
    let g=groups[key]; if(!g){g={val:it.val,sx:0,sy:0,sxx:0,syy:0,sxy:0,a:0,members:[]};groups[key]=g;}
    g.sx+=it.cx*it.area; g.sy+=it.cy*it.area; g.a+=it.area;
    g.sxx+=it.cx*it.cx*it.area; g.syy+=it.cy*it.cy*it.area; g.sxy+=it.cx*it.cy*it.area;
    g.members.push(it);
  }
  const out=[];
  for(const k in groups){const g=groups[k]; const text=labelText(mode,g.val); if(!text)continue;
    const mx=g.sx/g.a, my=g.sy/g.a;
    const Sxx=g.sxx/g.a-mx*mx, Syy=g.syy/g.a-my*my, Sxy=g.sxy/g.a-mx*my;
    let angle=0.5*Math.atan2(2*Sxy,(Sxx-Syy)||1e-9);
    if(angle>Math.PI/2)angle-=Math.PI; if(angle<-Math.PI/2)angle+=Math.PI;
    // Real oriented bounding box of the member provinces, in the label's axis frame,
    // measured symmetrically about the (centered) label so it can't spill past the
    // nearer territory edge on either side. This confines the label to its region.
    const ca=Math.cos(angle), sa=Math.sin(angle);
    let uRmax=0,uLmax=0,vTmax=0,vBmax=0;
    for(const it of g.members){
      const corners=[[it.minx,it.miny],[it.maxx,it.miny],[it.minx,it.maxy],[it.maxx,it.maxy]];
      for(const [x,y] of corners){
        const du=x-mx, dv=y-my; const u=du*ca+dv*sa, v=-du*sa+dv*ca;
        if(u>=0) uRmax=Math.max(uRmax,u); else uLmax=Math.max(uLmax,-u);
        if(v>=0) vTmax=Math.max(vTmax,v); else vBmax=Math.max(vBmax,-v);
      }
    }
    let axisLen, minorLen;
    if(mode==="political"||mode==="tech"){
      // realm names span their whole territory (and float over the void when it crosses landmasses)
      axisLen=Math.max(8,(uRmax+uLmax))*0.95;
      minorLen=Math.max(6,(vTmax+vBmax));
    } else {
      const halfMajor=Math.max(4, Math.min(uRmax,uLmax));   // symmetric half-width that stays inside the region
      const halfMinor=Math.max(3, Math.min(vTmax,vBmax));
      axisLen=halfMajor*2*0.90;                             // usable label width, with a small margin
      minorLen=halfMinor*2;                                 // usable label height (font capped against this)
    }
    out.push({text,val:g.val,x:mx,y:my,a:g.a,angle,axisLen,minorLen});
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
    // label anchor: the pole of inaccessibility (widest interior point) so the name sits inside
    // the actual land even for concave / ring provinces. Its HEIGHT is capped to the inscribed
    // width there so it can't bulge across a border; its length still uses the major axis (clipping
    // trims the ends to the outline). Cached per-province and recomputed only when the shape changes.
    let lx=cx, ly=cy, llen=len, lthick=thick;
    if(pts.length>=3){
      const sig=pts.length+"|"+Math.round(minx)+","+Math.round(miny)+","+Math.round(maxx)+","+Math.round(maxy);
      let pole=(p._pole&&p._pole.sig===sig)?p._pole:null;
      if(!pole){ const q=poleOfInaccessibility(pts,minx,miny,maxx,maxy); pole={sig,x:q.x,y:q.y,r:q.r}; p._pole=pole; }
      lx=pole.x; ly=pole.y;
      lthick=Math.min(thick, Math.max(6, pole.r*2*0.9));
    }
    _provGeo.push({p,pts,minx,miny,maxx,maxy,cx,cy,ang,len,thick,lx,ly,llen,lthick});
  });
  // ocean tiles sit on the BACK layer: draw them first (behind all land), and since
  // provinceAt() picks the topmost hit, clicks still prefer the land province on top.
  _provGeo.sort((a,b)=>(a.p.ocean?0:1)-(b.p.ocean?0:1));
  world.continents.forEach(c=>{ _contBox[c.id]=continentBox(c.id); });
  _contProvCount={}; world.provinces.forEach(p=>{_contProvCount[p.continentId]=(_contProvCount[p.continentId]||0)+1;});
  _keyLocMap={}; world.realms.forEach(r=>{if(r.capitalId)_keyLocMap[r.capitalId]="capital";(r.adminCenters||[]).forEach(pid=>{if(!_keyLocMap[pid])_keyLocMap[pid]="admin";});});
  _landCache={};   // silhouettes rebuilt lazily for the new geometry
  _realmBorderCache={}; _terrainBorderCache={};   // border overlays rebuilt lazily too
  // typical province width (world units) → drives the region/province zoom handoff
  if(_provGeo.length){const ws=_provGeo.map(g=>g.maxx-g.minx).sort((a,b)=>a-b);_medProvW=Math.max(2,ws[Math.floor(ws.length/2)]);}
  computeCoastSegs();   // dark coastline only where ocean tiles touch land
}
// Collect the ocean-tile edges that abut a land province, so the coastline outline is drawn ONLY
// where water meets land (not between ocean tiles or along open sea).
function computeCoastSegs(){
  _coastSegs=[];
  const oceans=_provGeo.filter(g=>g.p.ocean); if(!oceans.length) return;
  const epsB=Math.max(0.8,(_medProvW||20)*0.10);
  const dists=[epsB*0.4, epsB*0.8, epsB*1.3, epsB*2, epsB*3];   // march outward; the FIRST province hit decides
  // topmost province at (x,y) other than the given ocean tile (so a probe still inside its own tile is ignored)
  const provAt=(x,y,exclId)=>{ for(let i=_provGeo.length-1;i>=0;i--){ const gg=_provGeo[i]; if(gg.p.id===exclId)continue;
    if(x<gg.minx||x>gg.maxx||y<gg.miny||y>gg.maxy)continue; if(pointInPoly(gg.pts,x,y))return gg.p; } return null; };
  for(const g of oceans){ const pts=g.pts, N=pts.length; if(N<3)continue;
    // decide which perpendicular side is OUTSIDE once, using the LONGEST edge (unambiguous),
    // then apply it to every edge — reliable even on tiny / concave segments.
    let refI=0,refL=-1; for(let i=0;i<N;i++){const a=pts[i],b=pts[(i+1)%N];const l=(b[0]-a[0])**2+(b[1]-a[1])**2;if(l>refL){refL=l;refI=i;}}
    { const a=pts[refI],b=pts[(refI+1)%N]; let dx=b[0]-a[0],dy=b[1]-a[1]; const L=Math.hypot(dx,dy)||1; dx/=L;dy/=L;
      var outSign = pointInPoly(pts,(a[0]+b[0])/2+dy*epsB,(a[1]+b[1])/2-dx*epsB) ? -1 : 1; }   // is the right-normal side inside?
    for(let i=0;i<N;i++){ const a=pts[i], b=pts[(i+1)%N];
      let dx=b[0]-a[0], dy=b[1]-a[1]; const L=Math.hypot(dx,dy)||1; dx/=L; dy/=L;
      const nx=dy*outSign, ny=-dx*outSign;                              // outward normal
      const mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2;
      let coast=false;
      for(const d of dists){ const q=provAt(mx+nx*d, my+ny*d, g.p.id); if(q){ coast=!q.ocean; break; } }   // first neighbour wins: land→coast, ocean→none
      if(coast) _coastSegs.push([a[0],a[1],b[0],b[1]]);
    }
  }
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
// Feature icons: wonders on the Settlements map, resource features on the Resource map.
function drawFeatureIcons(ctx,cam,s,cw,ch,cat){
  const glyph=FEATURE_CAT_GLYPH[cat]||"❖", col=FEATURE_CAT_COLORS[cat]||"#8a93a6";
  ctx.save(); ctx.font='15px "Segoe UI Emoji",system-ui,sans-serif'; ctx.textAlign="center"; ctx.textBaseline="middle";
  for(const g of _provGeo){
    if((g.maxx-g.minx)*s<12) continue;                 // skip tiny provinces at overview zoom
    const p=g.p; if(!(p.features && p.features.some(f=>featureCat(f)===cat))) continue;
    const X=(g.cx-cam.x)*s, Y=(g.cy-cam.y)*s-8; if(X<-20||Y<-20||X>cw+20||Y>ch+20) continue;
    ctx.beginPath(); ctx.arc(X,Y,10,0,7); ctx.fillStyle="rgba(255,255,255,.85)"; ctx.fill();
    ctx.lineWidth=1.6; ctx.strokeStyle=col; ctx.stroke();
    ctx.fillText(glyph,X,Y);
  }
  ctx.restore();
}
// Monster map: free-floating, draggable, scalable legendary-creature tokens.
function isImgIcon(s){ return typeof s==="string" && (/^(img\/|data:|https?:)/i.test(s) || /\.(png|jpe?g|svg|webp|gif)$/i.test(s)); }
function drawMonsters(ctx,cam,s,cw,ch){
  ctx.save(); ctx.textAlign="center"; ctx.textBaseline="middle";
  for(const m of world.monsters){
    const sc=m.scale||0.6, R=13*sc*s;             // world-anchored: size scales with zoom (constant vs. the map)
    const X=(m.x-cam.x)*s, Y=(m.y-cam.y)*s; if(X<-R*3-40||Y<-R*3-40||X>cw+R*3+40||Y>ch+R*3+40)continue;
    const selm=state.selMonster===m.id, icon=m.icon||MONSTER_DEFAULT_ICON, ctcol=creatureTypeColorOf(m);
    // circular frame coloured by creature type (white disc behind so icons/emoji read on any terrain)
    ctx.beginPath(); ctx.arc(X,Y,R,0,7); ctx.fillStyle="rgba(255,255,255,.92)"; ctx.fill();
    ctx.lineWidth=Math.max(1.5,R*0.14); ctx.strokeStyle=selm?(state.moveMode==="monster"?"#e0b24e":"#2b3038"):ctcol; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(X,Y,R-ctx.lineWidth*0.5,0,7); ctx.clip();   // keep art inside the frame
    if(isImgIcon(icon)){
      const im=ensureImg(icon), D=R*2.0;
      if(im && im.complete && im.naturalWidth){ ctx.drawImage(im, X-D/2, Y-D/2, D, D); }
      else { ctx.font=`${Math.max(6,Math.round(16*sc*s))}px "Segoe UI Emoji",system-ui,sans-serif`; ctx.fillStyle="#2b3038"; ctx.fillText("🐉",X,Y); }
    } else {
      ctx.font=`${Math.max(6,Math.round(17*sc*s))}px "Segoe UI Emoji",system-ui,sans-serif`; ctx.fillStyle="#2b3038"; ctx.fillText(icon,X,Y);
    }
    ctx.restore();
    if(m.name){ ctx.font="600 11px system-ui,sans-serif"; ctx.lineWidth=3.2; ctx.strokeStyle="rgba(255,255,255,.92)"; ctx.strokeText(m.name,X,Y+R+11); ctx.fillStyle="#5a2330"; ctx.fillText(m.name,X,Y+R+11); }
  }
  ctx.restore();
}
function monsterAt(wx,wy){
  // world-anchored radius (matches the drawn image extent in world units)
  for(let i=world.monsters.length-1;i>=0;i--){const m=world.monsters[i];const r=13*(m.scale||1.4)*1.3;const dx=m.x-wx,dy=m.y-wy;if(dx*dx+dy*dy<r*r)return m;}
  return null;
}
// Military map: force tokens + battle overlays.
function forceAt(wx,wy){
  for(let i=world.forces.length-1;i>=0;i--){const f=world.forces[i];const r=(15*(f.scale||1))/state.cam.scale;const dx=f.x-wx,dy=f.y-wy;if(dx*dx+dy*dy<r*r)return f;}
  return null;
}
// Keep force tokens from landing exactly on top of each other, so overlapping
// (battling) forces stay individually clickable and can be separated again.
function separateForce(f, minGap){
  minGap = minGap || 16;
  for(let iter=0; iter<12; iter++){
    let moved=false;
    for(const o of world.forces){ if(o.id===f.id)continue;
      let dx=f.x-o.x, dy=f.y-o.y, d=Math.hypot(dx,dy);
      if(d<minGap){
        if(d<0.01){ dx=(Math.random()*2-1); dy=(Math.random()*2-1); d=Math.hypot(dx,dy)||1; }
        const push=(minGap-d);
        f.x=Math.round(f.x+dx/d*push); f.y=Math.round(f.y+dy/d*push); moved=true;
      }
    }
    if(!moved)break;
  }
}
function detectBattles(){   // pairs of opposing forces close enough to fight
  const out=[], F=world.forces, near=28;
  for(let i=0;i<F.length;i++)for(let j=i+1;j<F.length;j++){
    const a=F[i],b=F[j]; if(a.realmId&&b.realmId&&a.realmId===b.realmId)continue;   // same realm = not a battle
    const dx=a.x-b.x,dy=a.y-b.y; if(dx*dx+dy*dy<=near*near) out.push([a,b]);
  }
  return out;
}
function drawForces(ctx,cam,s,cw,ch){
  ctx.save(); ctx.textAlign="center"; ctx.textBaseline="middle";
  for(const f of world.forces){
    const sc=f.scale||1, R=15*sc;
    const X=(f.x-cam.x)*s, Y=(f.y-cam.y)*s; if(X<-R*3||Y<-R*3||X>cw+R*3||Y>ch+R*3)continue;
    const r=world.realms.find(x=>x.id===f.realmId), col=r?r.color:"#5a6172";
    const selm=state.selForce===f.id;
    // white body keeps the emoji legible on any realm colour
    ctx.beginPath();ctx.arc(X,Y,R,0,7);ctx.fillStyle="#ffffffee";ctx.fill();
    // realm-coloured ring (identity)
    ctx.lineWidth=selm?3.5:2.5;ctx.strokeStyle=(state.moveMode==="force"&&selm)?"#e0b24e":col;ctx.stroke();
    // thin dark casing just outside the ring so the token never blends into a same-coloured province
    ctx.beginPath();ctx.arc(X,Y,R+(selm?2.4:1.8),0,7);ctx.lineWidth=1.3;ctx.strokeStyle="rgba(14,18,26,.72)";ctx.stroke();
    ctx.font=`${Math.round(16*sc)}px "Segoe UI Emoji",system-ui,sans-serif`;ctx.fillText((FORCE_DOMAINS[f.domain]||FORCE_DOMAINS.land).icon,X,Y);
    // TS badge
    ctx.font="700 10px system-ui,sans-serif";const ts=""+forceTS(f);
    const bw=ctx.measureText(ts).width+8;ctx.fillStyle=col;roundRect(ctx,X+R*0.55,Y+R*0.4,bw,14,7);ctx.fill();ctx.fillStyle="#fff";ctx.fillText(ts,X+R*0.55+bw/2,Y+R*0.4+7);
    if(f.name){ctx.font="600 11px system-ui,sans-serif";ctx.lineWidth=3.2;ctx.strokeStyle="rgba(255,255,255,.92)";ctx.strokeText(f.name,X,Y-R-7);ctx.fillStyle="#22313f";ctx.fillText(f.name,X,Y-R-7);}
  }
  // battle overlays
  for(const [a,b] of detectBattles()){
    const mx=((a.x+b.x)/2-cam.x)*s, my=((a.y+b.y)/2-cam.y)*s; if(mx<-40||my<-40||mx>cw+40||my>ch+40)continue;
    ctx.beginPath();ctx.arc(mx,my,17,0,7);ctx.fillStyle="#d8746ce6";ctx.fill();ctx.lineWidth=2.5;ctx.strokeStyle="#fff";ctx.stroke();
    ctx.font='18px "Segoe UI Emoji",system-ui,sans-serif';ctx.fillText("💥",mx,my);
  }
  ctx.restore();
}
function battleAt(wx,wy){
  const r=18/state.cam.scale, r2=r*r;
  for(const [a,b] of detectBattles()){const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=mx-wx,dy=my-wy;if(dx*dx+dy*dy<r2)return [a,b];}
  return null;
}
// Resource-map icons: ✦ on prestige-good provinces, and (when toggled) hidden/strategic resource glyphs.
// cache of loaded religion-symbol images for on-map holy-site markers
const _symImgCache={};
function getSymImg(src){ if(!src)return null; let im=_symImgCache[src]; if(!im){ im=_symImgCache[src]=new Image(); im.onload=()=>requestRender(); im.onerror=()=>{}; im.src=src; } return im; }
// Holy-site markers on the Religion map (like wonders on Settlements): a sun by default,
// or the faith's symbol image if it has one. When a faith is spotlighted, only its sites show.
function drawHolySiteMarkers(ctx,cam,s,cw,ch){
  const spot=(state.legendFilter && state.legendFilter.mode==="religion") ? state.legendFilter.value : null;
  ctx.save(); ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.font='15px "Segoe UI Emoji",system-ui,sans-serif';
  for(const g of _provGeo){
    if((g.maxx-g.minx)*s<12) continue;
    const p=g.p, rels=holyReligionsOfProvince(p); if(!rels.length)continue;
    if(spot && !rels.includes(spot)) continue;                       // spotlight: only that faith's sites
    const rel = (spot && rels.includes(spot)) ? spot : (rels.find(r=>religionMeta(r).symbol) || rels[0]);
    const sym = religionMeta(rel).symbol;
    const feat=p.features&&p.features.some(f=>featureCat(f)==="resource");
    const X=(g.cx-cam.x)*s, Y=(g.cy-cam.y)*s-8-(feat?15:0); if(X<-20||Y<-20||X>cw+20||Y>ch+20)continue;
    ctx.beginPath(); ctx.arc(X,Y,11,0,7); ctx.fillStyle="rgba(255,255,255,.9)"; ctx.fill();
    ctx.lineWidth=1.8; ctx.strokeStyle=catColor("religions",rel); ctx.stroke();
    const img=sym?getSymImg(sym):null;
    if(img && img.complete && img.naturalWidth){ ctx.save(); ctx.beginPath(); ctx.arc(X,Y,9,0,7); ctx.clip(); ctx.drawImage(img,X-9,Y-9,18,18); ctx.restore(); }
    else { ctx.fillStyle="#e0a020"; ctx.fillText("☀",X,Y); }
    if(rels.length>1){ ctx.fillStyle=catColor("religions",rel); ctx.beginPath(); ctx.arc(X+8,Y-8,4.5,0,7); ctx.fill();
      ctx.fillStyle="#fff"; ctx.font='8px system-ui,sans-serif'; ctx.fillText(String(rels.length),X+8,Y-8); ctx.font='15px "Segoe UI Emoji",system-ui,sans-serif'; }
  }
  ctx.restore();
}
function drawResourceIcons(ctx,cam,s,cw,ch){
  const hid=state.hiddenResMode;
  const selHidden=isHiddenRes(state.selResource)?state.selResource:null;   // spotlighting a hidden resource
  ctx.save(); ctx.font='14px "Segoe UI Emoji",system-ui,sans-serif'; ctx.textAlign="center"; ctx.textBaseline="middle";
  for(const g of _provGeo){
    if((g.maxx-g.minx)*s<12) continue;
    const p=g.p, h=(hid&&p.hidden) || (selHidden&&p.hidden===selHidden?p.hidden:false);
    // hide the prestige ✦ marker on provinces dimmed by the resource spotlight
    const pres=isPrestige(p.resource) && !(state.selResource && !resSpotMatch(p,state.selResource));
    if(!pres && !h) continue;
    const feat=p.features&&p.features.some(f=>featureCat(f)==="resource");
    const X=(g.cx-cam.x)*s, Y=(g.cy-cam.y)*s-8-(feat?15:0); if(X<-20||Y<-20||X>cw+20||Y>ch+20) continue;
    ctx.beginPath(); ctx.arc(X,Y,10,0,7); ctx.fillStyle="rgba(255,255,255,.85)"; ctx.fill(); ctx.lineWidth=1.6;
    if(h){ ctx.strokeStyle="#5a4a2a"; ctx.stroke(); ctx.fillStyle="#2b3038"; ctx.fillText(HIDDEN_RES_GLYPH[p.hidden]||"⛏",X,Y); }
    else { ctx.strokeStyle="#c9930f"; ctx.stroke(); ctx.fillStyle="#c9930f"; ctx.fillText("✦",X,Y); }
  }
  ctx.restore();
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
  const boxW=boxLen*0.80, boxH=Math.max(9, boxThick*0.76 - Math.abs(perpShift)*1.6);
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
// next number for a numbered pin: 1 + the highest number currently on the map (so it resets to 1 when cleared)
function nextPinNum(){ let m=0; for(const pn of pingLayer.pins){ if(typeof pn.n==="number" && pn.n>m)m=pn.n; } return m+1; }
function drawPingsDevice(ctx,cam,s,cw,ch){
  for(const pn of pingLayer.pins){
    const X=(pn.x-cam.x)*s, Y=(pn.y-cam.y)*s; if(X<-20||Y<-20||X>cw+20||Y>ch+20)continue;
    const numbered=typeof pn.n==="number", r=numbered?9.5:7;
    ctx.save(); ctx.fillStyle=pn.color||"#e23b3b"; ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.lineJoin="round";
    ctx.beginPath(); ctx.arc(X,Y-12,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X-5,Y-8); ctx.lineTo(X,Y); ctx.lineTo(X+5,Y-8); ctx.closePath(); ctx.fill(); ctx.stroke();
    if(numbered){
      ctx.font=`bold ${Math.round(r*1.25)}px system-ui,sans-serif`; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.lineWidth=2.6; ctx.strokeStyle="rgba(0,0,0,.55)"; ctx.strokeText(String(pn.n),X,Y-12);
      ctx.fillStyle="#fff"; ctx.fillText(String(pn.n),X,Y-12);
    }
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
      <button class="pbtn ptool" data-pt="numpin" title="Drop a numbered pin (auto-increments; resets on Clear)">#️⃣</button>
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
  if(state.pingOn && state.rulerOn){ state.rulerOn=false; state.rulerPts=[]; state.rulerCur=null; const br=$("#btnRuler"); if(br)br.classList.remove("on"); const mm=$("#map"); if(mm)mm.classList.remove("measuring"); }
  const b=$("#btnPing"); if(b)b.classList.toggle("on",state.pingOn);
  const bar=$("#pingBar"); if(bar)bar.classList.toggle("hidden",!state.pingOn);
  if(state.pingOn){ if(state.pingTool==="pan")state.pingTool="brush"; refreshPingBar(); flash("Ping mode on — draw to mark the map; ✋ to pan. Pings stay until the map is updated."); }
  else flash("Ping mode off.");
  const m=$("#map"); if(m)m.classList.toggle("pinging",state.pingOn && state.pingTool!=="pan");
  renderMap();
}
/* ---------- ruler / distance measuring ---------- */
function fmtDist(d){ return d>=100?Math.round(d).toLocaleString():(d>=10?d.toFixed(0):d.toFixed(1)); }
function drawRuler(ctx,cam,s,cw,ch){
  const pts=state.rulerPts||[]; if(!pts.length)return;
  const all=pts.slice(); if(state.rulerOn && state.rulerCur) all.push(state.rulerCur);
  const scr=p=>[(p[0]-cam.x)*s,(p[1]-cam.y)*s];
  const per=distPerWorldUnit(), unit=unitLabel();
  ctx.save(); ctx.lineCap="round"; ctx.lineJoin="round";
  // dashed connecting line
  if(all.length>=2){ ctx.setLineDash([7,5]); ctx.lineWidth=2.5; ctx.strokeStyle="#1c6fd6";
    ctx.beginPath(); const [x0,y0]=scr(all[0]); ctx.moveTo(x0,y0);
    for(let i=1;i<all.length;i++){const [X,Y]=scr(all[i]); ctx.lineTo(X,Y);} ctx.stroke(); ctx.setLineDash([]); }
  // vertices
  for(let i=0;i<all.length;i++){ const [X,Y]=scr(all[i]); ctx.beginPath(); ctx.arc(X,Y,4.5,0,7);
    ctx.fillStyle="#fff"; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle="#1c6fd6"; ctx.stroke(); }
  // segment distance labels + running total
  ctx.font="600 12px system-ui,sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
  let total=0;
  for(let i=1;i<all.length;i++){ const a=all[i-1], b=all[i];
    const d=Math.hypot(b[0]-a[0],b[1]-a[1])*per; total+=d;
    const A=scr(a), B=scr(b), X=(A[0]+B[0])/2, Y=(A[1]+B[1])/2, label=fmtDist(d)+" "+unit;
    ctx.lineWidth=3.5; ctx.strokeStyle="rgba(255,255,255,.92)"; ctx.strokeText(label,X,Y-9);
    ctx.fillStyle="#14477e"; ctx.fillText(label,X,Y-9); }
  if(all.length>=2){ const L=scr(all[all.length-1]), label="Σ "+fmtDist(total)+" "+unit;
    ctx.font="700 13px system-ui,sans-serif";
    ctx.lineWidth=4; ctx.strokeStyle="rgba(255,255,255,.92)"; ctx.strokeText(label,L[0],L[1]+18);
    ctx.fillStyle="#0f3a6b"; ctx.fillText(label,L[0],L[1]+18); }
  ctx.restore();
}
function toggleRuler(){
  state.rulerOn=!state.rulerOn;
  if(state.rulerOn){
    if(state.pingOn){ state.pingOn=false; const pb=$("#pingBar"); if(pb)pb.classList.add("hidden"); const bpg=$("#btnPing"); if(bpg)bpg.classList.remove("on"); }
    state.rulerPts=[]; state.rulerCur=null; state.rulerDone=false;
    flash("Ruler on — click points to measure; double-click to finish, drag to pan, Esc to clear.");
  } else { state.rulerPts=[]; state.rulerCur=null; state.rulerDone=false; flash("Ruler off."); }
  const b=$("#btnRuler"); if(b)b.classList.toggle("on",state.rulerOn);
  const m=$("#map"); if(m)m.classList.toggle("measuring",state.rulerOn);
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
function _distToSeg(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy||1;let t=((px-ax)*dx+(py-ay)*dy)/L2;t=t<0?0:t>1?1:t;const qx=ax+dx*t,qy=ay+dy*t;return Math.hypot(px-qx,py-qy);}
// "pole of inaccessibility": the interior point farthest from any edge (largest inscribed circle
// centre). Used to anchor a label inside concave / ring-shaped provinces whose centroid falls in a
// gap. Returns {x,y,r} where r is the distance to the nearest edge.
function poleOfInaccessibility(pts,minx,miny,maxx,maxy){
  const edgeDist=(x,y)=>{let m=Infinity;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const d=_distToSeg(x,y,pts[j][0],pts[j][1],pts[i][0],pts[i][1]);if(d<m)m=d;}return m;};
  const w=(maxx-minx)||1, h=(maxy-miny)||1, N=12;
  let best={x:(minx+maxx)/2,y:(miny+maxy)/2,r:0};
  for(let gi=0;gi<=N;gi++)for(let gj=0;gj<=N;gj++){ const x=minx+w*gi/N, y=miny+h*gj/N;
    if(!pointInPoly(pts,x,y))continue; const d=edgeDist(x,y); if(d>best.r)best={x,y,r:d}; }
  let step=Math.max(w,h)/N;
  for(let pass=0;pass<4;pass++){ step*=0.5; const bx=best.x,by=best.y;
    for(let gi=-1;gi<=1;gi++)for(let gj=-1;gj<=1;gj++){ if(!gi&&!gj)continue; const x=bx+step*gi,y=by+step*gj;
      if(!pointInPoly(pts,x,y))continue; const d=edgeDist(x,y); if(d>best.r)best={x,y,r:d}; } }
  return best;
}
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
  // coastline: a thin dark line only where ocean tiles meet land, so water reads clearly at a glance
  if(_coastSegs.length){
    ctx.save(); ctx.lineCap="round"; ctx.lineWidth=1.6/s; ctx.strokeStyle="rgba(18,36,60,.9)";
    ctx.beginPath(); for(const sg of _coastSegs){ ctx.moveTo(sg[0],sg[1]); ctx.lineTo(sg[2],sg[3]); } ctx.stroke();
    ctx.restore();
  }
  // identity maps: diagonal hatching for large-minority / melting-pot provinces
  drawAxisStripes(ctx, state.mapmode, s);
  // prestige goods get a gold outline on the resource map
  if(state.mapmode==="resource"){
    ctx.lineWidth=2.5/s; ctx.strokeStyle="#e8b21f"; ctx.lineJoin="round";
    for(const gp of _provGeo){ if(!isPrestige(gp.p.resource))continue;
      if(state.selResource && !resSpotMatch(gp.p,state.selResource))continue;   // hide outline on dimmed provinces
      const pts=gp.pts; if(!pts.length)continue;
      ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]); ctx.closePath(); ctx.stroke(); }
  }

  // lakes & rivers on top of land
  drawWater(ctx,s);

  // realm-border overlay — Realms toggle, on any mapmode except political (always on for Tech Level,
  // where realms share TL colours and need their boundaries + names to stay legible)
  if(state.mapmode!=="political" && (state.realmOverlay || state.mapmode==="tech")) drawRealmBorders(ctx);
  // terrain-region outline overlay — Terrain toggle, on any mapmode except terrain
  if(state.mapmode!=="terrain" && state.terrainOverlay) drawTerrainBorders(ctx);

  // player ping/annotation strokes (world space, over the map)
  drawPingsWorld(ctx);

  // selected province highlight
  if(state.selProvince){const gs=_provGeo.find(g=>g.p.id===state.selProvince);if(gs){const pts=gs.pts;ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.lineWidth=2.5/s;ctx.strokeStyle="#24364f";ctx.stroke();}}
  // population tool multi-selection (Select scope)
  if(!VIEWER && state.mapmode==="population" && state.popScope==="selected" && state.popSel && state.popSel.size){
    ctx.lineWidth=2.5/s; ctx.strokeStyle="#2bd4a0"; ctx.fillStyle="rgba(43,212,160,.20)";
    for(const gs of _provGeo){ if(!state.popSel.has(gs.p.id))continue; const pts=gs.pts;
      ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fill();ctx.stroke(); }
  }
  // conversion tool selection (Religion / Culture / Language maps) + origin center
  if(!VIEWER && CONVERT_AXES[state.mapmode] && state.convertSel && state.convertSel.size){
    ctx.lineWidth=2.5/s; ctx.strokeStyle="#c98b2b"; ctx.fillStyle="rgba(201,139,43,.22)";
    for(const gs of _provGeo){ if(!state.convertSel.has(gs.p.id))continue; const pts=gs.pts;
      ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fill();ctx.stroke(); }
    if(state.convertCenter){ const gc=_provGeo.find(g=>g.p.id===state.convertCenter);
      if(gc){ const pts=gc.pts; ctx.lineWidth=4/s; ctx.strokeStyle="#e0b24e";
        ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.stroke();
        ctx.fillStyle="#e0b24e"; ctx.beginPath(); ctx.arc(gc.cx,gc.cy,5/s,0,7); ctx.fill(); } }
  }

  // draft polygon being drawn (+ rubber-band preview to the snapped cursor)
  if(state.draft&&state.focusedContinent){const c=world.continents.find(x=>x.id===state.focusedContinent);if(c){
    if(state.draft.length>1){ctx.lineWidth=1.5/s;ctx.strokeStyle="#6ea8ff";ctx.beginPath();ctx.moveTo(c.ox+state.draft[0][0],c.oy+state.draft[0][1]);for(let i=1;i<state.draft.length;i++)ctx.lineTo(c.ox+state.draft[i][0],c.oy+state.draft[i][1]);ctx.stroke();}
    if(state.drawCursor&&state.draft.length){const last=state.draft[state.draft.length-1];ctx.setLineDash([5/s,4/s]);ctx.lineWidth=1.2/s;ctx.strokeStyle="#6ea8ff";ctx.beginPath();ctx.moveTo(c.ox+last[0],c.oy+last[1]);ctx.lineTo(state.drawCursor.x,state.drawCursor.y);ctx.stroke();ctx.setLineDash([]);}
    ctx.fillStyle="#6ea8ff";state.draft.forEach(pt=>{ctx.beginPath();ctx.arc(c.ox+pt[0],c.oy+pt[1],4/s,0,7);ctx.fill();});}}
  // draw cursor + snap indicator (Draw tool)
  if(state.tool==="draw"&&state.drawCursor){ctx.beginPath();ctx.arc(state.drawCursor.x,state.drawCursor.y,(state.drawCursor.snapped?6:3.5)/s,0,7);ctx.fillStyle=state.drawCursor.snapped?"#e0b24e":"#6ea8ff";ctx.fill();if(state.drawCursor.snapped){ctx.lineWidth=1.5/s;ctx.strokeStyle="#a9791f";ctx.stroke();}}
  // vertex handles (Nodes tool, selected province)
  if(state.tool==="nodes"&&state.selProvince){const sp=world.provinces.find(x=>x.id===state.selProvince);const c=sp&&world.continents.find(cc=>cc.id===sp.continentId);if(sp&&c){ctx.fillStyle="#fff";ctx.strokeStyle="#24364f";ctx.lineWidth=1.5/s;for(const pt of sp.points){ctx.beginPath();ctx.arc(c.ox+pt[0],c.oy+pt[1],5/s,0,7);ctx.fill();ctx.stroke();}}}
  // reshape handles on the selected river / lake (editor)
  if(!VIEWER && state.selWater){ const arr=state.selWater.type==="lake"?world.lakes:world.rivers; const obj=arr.find(x=>x.id===state.selWater.id); const c=obj&&world.continents.find(cc=>cc.id===obj.continentId);
    if(obj&&c){ ctx.fillStyle="#eaf3ff"; ctx.strokeStyle="#2c5788"; ctx.lineWidth=1.5/s; for(const pt of obj.points){ ctx.beginPath(); ctx.arc(c.ox+pt[0],c.oy+pt[1],5/s,0,7); ctx.fill(); ctx.stroke(); } } }
  // split cut line preview
  if(state.split){const a=state.split.pts[0],b=(state.split.pts.length>1?state.split.pts[1]:state.split.cur);ctx.setLineDash([6/s,4/s]);ctx.lineWidth=1.6/s;ctx.strokeStyle="#d8746c";if(a&&b){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}ctx.setLineDash([]);ctx.fillStyle="#d8746c";state.split.pts.forEach(pt=>{ctx.beginPath();ctx.arc(pt[0],pt[1],4/s,0,7);ctx.fill();});}

  // labels (drawn in device space so text stays a constant size)
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.textAlign="center"; ctx.textBaseline="middle";

  // Two zoom levels with a short crossfade so the handoff isn't jarring:
  // zoomed out → realm / region names; zoomed in → province names.
  const KEY_SZ=6;                          // capital/admin marker size (small, fixed)
  const PROV_CAP=13;                       // max province-name font (px) — keeps them uniform &amp; inside borders
  const nameZoom = 58/_medProvW;           // lower = province names appear earlier when zooming in
  const band = nameZoom*0.3;               // fade width around the threshold
  const provAlpha = clamp01((s-(nameZoom-band))/(2*band));
  const regionAlpha = 1-provAlpha;

  if(_labelsDirty || _labelMode!==state.mapmode){ _labelGroups=computeLabelGroups(state.mapmode); _labelMode=state.mapmode; _labelsDirty=false; }

  // realm / region names — fade out as we zoom in.
  // When a legend item is highlighted, only that value's region label is shown.
  const _lf = (state.legendFilter && state.legendFilter.mode===state.mapmode && state.mapmode!=="tech") ? state.legendFilter : null;   // tech spotlight is by TL, not realm id — keep realm names visible
  if(regionAlpha>0.02){
    ctx.globalAlpha=regionAlpha;
    for(const lg of _labelGroups){
      if(_lf && lg.val!==_lf.value) continue;
      if(state.mapmode==="terrain" && state.terrainSel && state.terrainSel.size && !state.terrainSel.has(lg.val)) continue;   // terrain multi-select hides other labels
      if(state.mapmode==="race" && state.selRaceGroup && subraceGroup(lg.val)!==state.selRaceGroup) continue;   // race group spotlight hides other labels
      let fontPx=Math.sqrt(lg.a)*0.135*s; if(fontPx<9) continue; fontPx=Math.min(fontPx,160);
      if(lg.minorLen) fontPx=Math.min(fontPx, lg.minorLen*s*0.52);   // keep the label within the region's short axis
      if(fontPx<9) continue;
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
      const sx=(gl.lx-cam.x)*s, sy=(gl.ly-cam.y)*s; if(sx<-60||sy<-40||sx>cw+60||sy>ch+40)continue;
      // clip the name to the province polygon so it can never spill past its borders
      ctx.save(); const pts=gl.pts;
      ctx.beginPath(); ctx.moveTo((pts[0][0]-cam.x)*s,(pts[0][1]-cam.y)*s);
      for(let i=1;i<pts.length;i++) ctx.lineTo((pts[i][0]-cam.x)*s,(pts[i][1]-cam.y)*s);
      ctx.closePath(); ctx.clip();
      drawFittedLabel(ctx,gl.p.name,sx,sy,gl.ang,gl.llen*s,gl.lthick*s,PROV_CAP, _keyLocMap[gl.p.id]?KEY_SZ*1.8:0);
      ctx.restore();
    }
    // capital & admin markers — small fixed size, appearing with the province names
    drawKeyLocations(ctx, cam.x, cam.y, s, cw, ch, KEY_SZ);
    ctx.globalAlpha=1;
  }

  // mapmode overlays — drawn independently of the province-name zoom fade so
  // forces/monsters/markers never disappear when you zoom in far enough for
  // province names to appear. Each has its own size/viewport culling.
  if(state.mapmode==="resource"){ drawFeatureIcons(ctx,cam,s,cw,ch,"resource"); drawResourceIcons(ctx,cam,s,cw,ch); }
  else if(state.mapmode==="monster") drawMonsters(ctx,cam,s,cw,ch);
  else if(state.mapmode==="military") drawForces(ctx,cam,s,cw,ch);
  else if(state.mapmode==="religion") drawHolySiteMarkers(ctx,cam,s,cw,ch);

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

  // region names (toggleable, on every mapmode; placed at each region's province centroid)
  if(state.showRegions && (world.regions||[]).length){
    const cen={}; for(const g of _provGeo) cen[g.p.id]=[g.cx,g.cy];
    ctx.font="700 13px Georgia,serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
    for(const rg of world.regions){
      const ids=(rg.provinceIds||[]).filter(id=>cen[id]); if(!ids.length) continue;
      let mx=0,my=0; ids.forEach(id=>{mx+=cen[id][0];my+=cen[id][1];}); mx/=ids.length; my/=ids.length;
      const sx=(mx-cam.x)*s, sy=(my-cam.y)*s; if(sx<-200||sx>cw+200||sy<-30||sy>ch+30) continue;
      const nm=(rg.name||"Region").toUpperCase();
      ctx.lineWidth=3.5; ctx.strokeStyle="rgba(255,255,255,.9)"; ctx.strokeText(nm,sx,sy);
      ctx.fillStyle=regionColor(rg); ctx.fillText(nm,sx,sy);
    }
    ctx.textAlign="left"; ctx.textBaseline="alphabetic";
  }

  // custom labels
  drawCustomLabels(ctx, cam.x, cam.y, s, cw, ch, true);
  // ping pins (device space, constant size)
  drawPingsDevice(ctx, cam, s, cw, ch);
  // ruler / distance measurement
  drawRuler(ctx, cam, s, cw, ch);

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
  if(name==="No Religion"||name==="No Culture"||name==="No Language")return "#8a93a6";   // unsettled = neutral grey
  if(key==="economies"&&name==="Uninhabited")return "#2b3348";   // empty land
  const cm=world.colors&&world.colors[key]; if(cm&&cm[name])return cm[name];
  if(key==="terrains")return TERRAIN_COLORS[name]||hashColor(name);
  if(key==="settlements")return SETTLE_COLORS[name]||"#39415e";
  if(key==="resources")return RESOURCE_COLORS[name]||listColor(world.lists[key]||[],name);
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
const OCEAN_FILL="#3f78b8";   // default ocean-tile colour — matches the lake/water fill
function provinceFill(p){
  // Terrain map multi-select spotlight — ocean tiles match the "__ocean__" key (before the ocean early-return)
  if(state.mapmode==="terrain" && state.terrainSel && state.terrainSel.size){
    const key = p.ocean ? "__ocean__" : p.terrain;
    if(!state.terrainSel.has(key)) return "#333a46";
    return p.ocean ? (p.oceanColor||OCEAN_FILL) : catColor("terrains",p.terrain);
  }
  if(p.ocean) return p.oceanColor || OCEAN_FILL;   // ocean tiles render as sea (or a custom colour) on every mapmode
  if(state.mapmode==="region"){
    const rg=state.selRegion?regionById(state.selRegion):null;
    if(rg && (rg.provinceIds||[]).length){ return (rg.provinceIds.includes(p.id)) ? regionColor(rg) : "#333a46"; }   // spotlight the active (non-empty) region
    const regs=regionsOfProvince(p.id);
    if(!regs.length) return "#3a4256";                      // not in any region
    return regionColor(regs[0]);                            // colour by the first region it belongs to
  }
  if(state.legendFilter && state.legendFilter.mode===state.mapmode && !provinceMatchesLegend(p,state.legendFilter.value)) return "#333a46";  // legend spotlight
  switch(state.mapmode){
    case "political":{const r=world.realms.find(r=>r.id===p.realmId);return r?r.color:"#39415e";}
    case "terrain":return catColor("terrains",p.terrain);
    case "settlement":return catColor("settlements",p.settlement);
    case "religion":return colorByAxis(p.religion,"religions");
    case "culture":return colorByAxis(p.culture,"cultures");
    case "race":{
      if(state.selRaceGroup && !(p.race||[]).some(e=>subraceGroup(e.name)===state.selRaceGroup)) return "#333a46";
      return colorByAxis(p.race,"subraces");
    }
    case "language":return colorByAxis(p.language,"languages");
    case "population":return popColor(p.population);
    case "tolerance":return ramp((p.tolerance??50)/100);
    case "resource":{
      if(state.selResource && !resSpotMatch(p,state.selResource)) return "#333a46";  // dim non-matching
      return catColor("resources",p.resource);
    }
    case "economy":return catColor("economies",economyOf(p));
    case "tech":{
      const r=world.realms.find(x=>x.id===p.realmId);
      if(r) return tlColor(realmTL(r).avg);                 // realm land → coloured by its overall TL
      if((p.population||0)>0) return tlColor(0);             // inhabited but not in a realm → assume TL0
      return "#2b3348";                                     // uninhabited → neutral (assume nothing)
    }
    case "monster":return catColor("terrains",p.terrain);                 // terrain backdrop for context
    case "military":return catColor("terrains",p.terrain);   // terrain backdrop + realm outlines; tokens on top
    case "imported":return p.importColor||"#39415e";
    default:return "#39415e";
  }
}
function colorByAxis(arr,key){const d=dominant(arr);return d?catColor(key,d):"#39415e";}
// ---- identity "melting pot" shading (religion / culture / race / language) ----
// Solid dominant colour when a group holds > 2/3. Diagonal hatch (dominant + minority)
// when the majority is 1/2–2/3 AND another group is ≥ 1/4. Diagonal hatch (dominant + black)
// when no group reaches 1/2. Otherwise solid.
const AXIS_CAT={religion:"religions",culture:"cultures",race:"subraces",language:"languages"};
// Diagonal band colour sequence: the dominant group takes every other band, and the minorities
// cycle evenly through the bands in between (a lone minority just alternates two colours). Returns
// the repeat sequence, or null for a solid fill.
function axisPattern(p,key){
  const arr=p[key]; if(!arr||!arr.length)return null;
  const tot=arr.reduce((a,e)=>a+(e.pct||0),0)||100;
  const groups=arr.map(e=>({name:e.name,frac:(e.pct||0)/tot})).filter(g=>g.frac>0.04).sort((a,b)=>b.frac-a.frac);
  if(groups.length<2 || groups[0].frac>=0.75) return null;          // ≥75% one group → solid fill
  const cat=AXIS_CAT[key]||key;
  const dom=catColor(cat,groups[0].name);
  const minors=groups.slice(1,4).map(g=>catColor(cat,g.name));      // up to 3 distinct minorities
  const rest=1-groups[0].frac-groups.slice(1,4).reduce((a,g)=>a+g.frac,0);
  if(rest>=0.08) minors.push("#141518");                            // remaining smaller minorities → black
  const seq=[]; for(const m of minors){ seq.push(dom); seq.push(m); }   // D, m0, D, m1, D, m2, …
  return seq;
}
function axisLabelName(p,key){             // name for the label map, or null if too fragmented (no ≥½ majority)
  const arr=p[key]; if(!arr||!arr.length)return null;
  return (arr[0].pct/100)>=0.5 ? arr[0].name : null;
}
// EU4-style diagonal hatching (top-right → bottom-left) for large-minority / melting-pot provinces.
function drawAxisStripes(ctx,key,s){
  if(!AXIS_CAT[key])return;
  const spot = (state.legendFilter && state.legendFilter.mode===state.mapmode) ? state.legendFilter : null;
  const bw=Math.max(2.5, (_medProvW||30)*0.10);      // world-space band width → static on the map, scales with zoom
  const step=bw*Math.SQRT2;                          // c=x+y spacing so bands tile edge-to-edge (no overlap/gap)
  ctx.save(); ctx.lineCap="butt"; ctx.lineWidth=bw;
  for(const gp of _provGeo){
    const p=gp.p;
    if(spot && !provinceMatchesLegend(p,spot.value)) continue;       // don't hatch dimmed provinces
    if(key==="race" && state.selRaceGroup && !(p.race||[]).some(e=>subraceGroup(e.name)===state.selRaceGroup))continue;
    if((gp.maxx-gp.minx)*s<5 && (gp.maxy-gp.miny)*s<5) continue;     // too small on screen to bother
    const seq=axisPattern(p,key); if(!seq)continue;
    const pts=gp.pts; if(pts.length<3)continue;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]); ctx.closePath(); ctx.clip();
    // bands sit on a GLOBAL diagonal grid (lines x+y = k·step) so they line up across province borders
    const c0=gp.minx+gp.miny, c1=gp.maxx+gp.maxy, start=Math.floor(c0/step)*step;
    for(let c=start;c<=c1+step;c+=step){ const k=Math.round(c/step); ctx.strokeStyle=seq[((k%seq.length)+seq.length)%seq.length];
      ctx.beginPath(); ctx.moveTo(c-gp.miny,gp.miny); ctx.lineTo(c-gp.maxy,gp.maxy); ctx.stroke(); }
    ctx.restore();
  }
  ctx.restore();
}

/* ============================================================
   AUTOMATIC HISTORY TRACKER
   Logs a dated entry whenever a tracked, map-mode attribute changes.
   ============================================================ */
const FIELD_TITLES={realm:"Ownership",terrain:"Terrain",settlement:"Settlement",resource:"Resource",religion:"Religion",culture:"Culture",race:"Race",language:"Language",economy:"Mode of Production"};
function provTrackedValue(p,field){
  if(field==="realm")return p.realmId?(world.realms.find(r=>r.id===p.realmId)?.name||"Unknown realm"):"Unclaimed";
  if(field==="terrain")return p.terrain||"—";
  if(field==="settlement")return p.settlement||"—";
  if(field==="resource")return p.resource||"—";
  if(field==="economy")return economyOf(p);
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
  syncCompendiumToWorld();   // compendium is global — never reverted by map undo/redo
  state.selProvince=null; state.draft=null; _labelsDirty=true;
  rebuildGeo(); renderMap(); renderLeft();
  $("#inspector").innerHTML='<div class="empty">Select a province, realm, or continent to edit.</div>';
  markDirty();
}
function doUndo(){ if(!_undo.length){flash("Nothing to undo.");return;} _redo.push(JSON.stringify(world)); restoreSnapshot(_undo.pop()); flash("Undo"); }
function doRedo(){ if(!_redo.length){flash("Nothing to redo.");return;} _undo.push(JSON.stringify(world)); restoreSnapshot(_redo.pop()); flash("Redo"); }
// Dedicated undo for realm-expansion paint strokes (conquer / settle / override).
// A full-world snapshot is taken before each expansion stroke, so restoring it puts
// every pop — including migrated settlers — back exactly where it was.
let _expandUndo=[];
function beginExpandStroke(){
  if(VIEWER)return; if(state.tool!=="paint"||state.mapmode!=="political"||!state.selRealm||state.paintUnclaim)return;
  try{ _expandUndo.push({snap:JSON.stringify(world), realm:(world.realms.find(r=>r.id===state.selRealm)||{}).name||"", mode:state.expandMode||"conquer"}); }catch(e){return;}
  if(_expandUndo.length>25)_expandUndo.shift();
}
function undoLastExpansion(){
  if(VIEWER)return;
  if(!_expandUndo.length){ flash("No expansion to undo."); return; }
  const e=_expandUndo.pop();
  restoreSnapshot(e.snap);   // full-world restore → all pops (incl. settlers) return
  flash("Reverted last "+(e.mode||"expansion")+(e.realm?" of "+e.realm:"")+" — pops restored.");
}
// GM-screen population operations (seed / grow / add people): snapshot before each so a single button reverses it.
let _growUndo=[];
function pushGrowUndo(){ if(VIEWER)return; try{_growUndo.push(JSON.stringify(world));}catch(e){return;} if(_growUndo.length>20)_growUndo.shift(); }
function undoLastGrowth(){ if(!_growUndo.length){ flash("Nothing to undo."); return; } restoreSnapshot(_growUndo.pop()); flash("Reverted the last population change."); }

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
    const thr=(rv.width||3)/2+8/state.cam.scale, pts=rv.points;
    for(let k=0;k<pts.length-1;k++){const ax=c.ox+pts[k][0],ay=c.oy+pts[k][1],bx=c.ox+pts[k+1][0],by=c.oy+pts[k+1][1];
      const dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy||1;let t=((wx-ax)*dx+(wy-ay)*dy)/L2;t=Math.max(0,Math.min(1,t));
      if((ax+dx*t-wx)**2+(ay+dy*t-wy)**2 < thr*thr)return {type:"river",id:rv.id};}}
  return null;
}
function selectWater(type,id){state.selWater={type,id};state.selProvince=null;state.selRealm=null;document.body.classList.add("has-sel");renderMap();renderWaterEditor();}
// Handle on the currently-selected water feature under the cursor (for reshaping).
function waterNodeAt(ev){
  const w=state.selWater; if(!w)return null;
  const arr=w.type==="lake"?world.lakes:world.rivers, obj=arr.find(x=>x.id===w.id); if(!obj)return null;
  const c=world.continents.find(cc=>cc.id===obj.continentId)||{ox:0,oy:0};
  const cv=$("#map"),r=cv.getBoundingClientRect(),mx=ev.clientX-r.left,my=ev.clientY-r.top,rad=11;
  for(let i=0;i<obj.points.length;i++){ const wx=c.ox+obj.points[i][0],wy=c.oy+obj.points[i][1];
    const sx=(wx-state.cam.x)*state.cam.scale,sy=(wy-state.cam.y)*state.cam.scale;
    if(Math.hypot(sx-mx,sy-my)<=rad)return {obj,c,i}; }
  return null;
}
// Is water-editing active (terrain map in the editor with the Edit toggle on)?
function waterEditActive(){ return !VIEWER && state.waterEditMode && state.mapmode==="terrain"; }
function renderWaterEditor(){
  const ins=$("#inspector"),w=state.selWater; if(!w)return;
  const arr=w.type==="lake"?world.lakes:world.rivers, obj=arr.find(x=>x.id===w.id);
  if(!obj){ins.innerHTML='<div class="empty">Not found.</div>';return;}
  ins.innerHTML=`<div class="insTitle"><input id="wname" value="${esc(obj.name||"")}" placeholder="${w.type==="lake"?"Lake name":"River name"}"/></div>
    <div class="note">${w.type==="lake"?"Lake (water polygon)":"River (water line)"}</div>
    ${w.type==="river"
      ? `<div class="field"><label>Width — <b id="wwv">${obj.width||3}</b></label><input id="wwidth" type="range" min="1" max="10" step="0.5" value="${obj.width||3}"/></div>`
      : `<div class="field"><label>Outline width — <b id="wwv">${obj.width||1.5}</b></label><input id="wwidth" type="range" min="0.5" max="12" step="0.5" value="${obj.width||1.5}"/></div>`}
    <div class="note">Drag the round handles on the map to reshape this ${w.type}.</div>
    <div class="btnrow"><button class="btn danger" id="wdel">Delete ${w.type}</button></div>`;
  $("#wname").addEventListener("input",e=>{obj.name=e.target.value;markDirty();renderMap();});
  if($("#wwidth"))$("#wwidth").addEventListener("input",e=>{obj.width=+e.target.value;$("#wwv").textContent=e.target.value;renderMap();markDirty();});
  $("#wdel").addEventListener("click",()=>{beginEdit();const a=w.type==="lake"?world.lakes:world.rivers,idx=a.findIndex(x=>x.id===w.id);if(idx>=0)a.splice(idx,1);state.selWater=null;_geoDirty=true;renderMap();ins.innerHTML='<div class="empty">Deleted.</div>';markDirty();});
}
function drawWater(ctx,s){
  if(state.showWater!==false) for(const lk of world.lakes){const c=world.continents.find(cc=>cc.id===lk.continentId);if(!c||lk.points.length<3)continue;
    ctx.beginPath();ctx.moveTo(c.ox+lk.points[0][0],c.oy+lk.points[0][1]);for(let i=1;i<lk.points.length;i++)ctx.lineTo(c.ox+lk.points[i][0],c.oy+lk.points[i][1]);ctx.closePath();
    ctx.fillStyle="#3f78b8";ctx.fill();
    const selL=state.selWater&&state.selWater.type==="lake"&&state.selWater.id===lk.id;
    ctx.lineWidth=(selL?2.5:(lk.width||1.2))/s;ctx.strokeStyle=selL?"#8fc0ff":"#2c5788";ctx.stroke();}
  ctx.lineCap="round";ctx.lineJoin="round";
  if(state.showWater!==false) for(const rv of world.rivers){const c=world.continents.find(cc=>cc.id===rv.continentId);if(!c||rv.points.length<2)continue;
    ctx.beginPath();ctx.moveTo(c.ox+rv.points[0][0],c.oy+rv.points[0][1]);for(let i=1;i<rv.points.length;i++)ctx.lineTo(c.ox+rv.points[i][0],c.oy+rv.points[i][1]);
    const selR=state.selWater&&state.selWater.type==="river"&&state.selWater.id===rv.id;
    ctx.lineWidth=Math.max(rv.width||3,0.8/s);ctx.strokeStyle=selR?"#8fc0ff":"#3f78b8";ctx.stroke();}
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
  if(state.paintErase) return m==="political"||PAINTABLE_MODES.includes(m);
  if(m==="political")return !!state.selRealm || state.paintUnclaim;
  if(MIX_MODES.includes(m) && state.paintMixOn) return paintMixReady();
  return PAINTABLE_MODES.includes(m) && state.paintValue!=null && state.paintValue!=="";
}
function paintHint(){
  if(PAINTABLE_MODES.includes(state.mapmode))return "Pick what to paint in the Paint panel (bottom-left), then click or drag on the map.";
  return "Painting isn't available in this map mode.";
}
// Editor-only floating Paint panel (bottom-left): choose what/how to paint per map mode.
let _paintCollapsed=true, _popCollapsed=true, _convCollapsed=true;   // collapse state for the map tool panels (collapsed by default, like the legend)
function renderPaintPanel(){
  let box=document.getElementById("paintPanel");
  const show = !VIEWER && !document.body.classList.contains("editing") && PAINTABLE_MODES.includes(state.mapmode);
  if(!show){ if(box)box.remove(); return; }
  if(!box){ box=document.createElement("div"); box.id="paintPanel"; ($("#stage")||document.body).appendChild(box); }
  const painting = state.tool==="paint";
  const head=`<div class="ppHead"><button class="ppCaret" id="ppCaret" title="Collapse / expand">${_paintCollapsed?"▸":"▾"}</button><b>🖌 Paint</b><span class="note" style="margin-left:6px">${esc(MODE_TITLES[state.mapmode]||state.mapmode)}</span>
    <button class="btn tiny${!painting?" primary":""}" id="ppSelect" style="margin-left:auto" title="Stop painting (select / pan)">🖐</button></div>`;
  let html="";
  if(state.mapmode==="political"){
    const realmOpts=world.realms.map(r=>`<option value="${r.id}" ${(!state.paintUnclaim&&state.selRealm===r.id)?"selected":""}>${esc(r.name)}</option>`).join("");
    html+=`<div class="ppRow"><select id="ppRealm"><option value="">— pick a realm —</option>${realmOpts}</select></div>
      <div class="ppModes">
        <button class="btn tiny ppMode${state.expandMode==="conquer"?" primary":""}" data-exm="conquer">Conquer</button>
        <button class="btn tiny ppMode${state.expandMode==="settle"?" primary":""}" data-exm="settle">Settle</button>
        <button class="btn tiny ppMode${state.expandMode==="override"?" primary":""}" data-exm="override">Override</button>
      </div>
      <div class="note">Conquer keeps people · Settle moves settlers in from across the realm · Override replaces them with the realm's identity.</div>
      ${state.expandMode==="settle"?`<div class="ppRow"><button class="btn tiny" id="ppSettleCfg" style="flex:1">⚙ Settle options…</button></div>`:""}
      <div class="ppRow"><button class="btn tiny${(painting&&state.paintUnclaim)?" danger":""}" id="ppErase">🧹 Erase (unclaim)</button><button class="btn tiny" id="ppUndo">↶ Undo</button></div>`;
  } else {
    const isMix = MIX_MODES.includes(state.mapmode);
    const mixOn = isMix && state.paintMixOn;
    const entries=legendEntries(state.mapmode).filter(e=>e[2]!==undefined);
    const inMix=v=>(state.paintMixGroups||[]).some(g=>g.name===v);
    const chips=entries.map(([c,l,v])=>{ const sel = mixOn ? inMix(v) : (painting && !state.paintErase && state.paintValue===v);
      return `<button class="ppChip${sel?" sel":""}" data-v="${esc(String(v))}"><span class="sw" style="background:${c}"></span>${esc(l)}</button>`; }).join("");
    const mixToggle = isMix ? `<div class="ppModes"><button class="btn tiny ppMode${!mixOn?" primary":""}" id="ppMixSingle" title="Paint one group across the province">Single</button><button class="btn tiny ppMode${mixOn?" primary":""}" id="ppMixMulti" title="Blend several groups by a breakdown">Mix</button></div>` : "";
    let mixEditor="";
    if(mixOn){
      const gs=state.paintMixGroups||[]; const cat=AXIS_CAT[state.mapmode]||state.mapmode;
      const rows=gs.length ? gs.map((g,i)=>
        `<div class="pmixRow"><span class="sw" style="background:${catColor(cat,g.name)}"></span><span class="nm">${esc(g.name)}</span><input class="pmixW" data-i="${i}" type="number" min="0" max="100" step="1" value="${Math.round(+g.w||0)}"/><span class="pmixPct">%</span><span class="pmixX" data-i="${i}" title="Remove">✕</span></div>`).join("")
        : '<div class="note">Click groups above to add them to the mix.</div>';
      mixEditor=`<div class="pmixBox">${rows}<div class="ppRow" style="margin-top:5px"><label class="note" style="flex:1;display:flex;align-items:center">Randomness ±<input id="pmixJit" type="number" min="0" max="90" value="${state.paintMixJitter}" style="width:50px;margin:0 4px"/>%</label></div></div>`;
    }
    let waterRow="";
    if(state.mapmode==="terrain"){
      const drawingWater = state.tool==="river"||state.tool==="lake";
      const wKey = state.tool==="lake" ? "newLakeWidth" : "newRiverWidth";
      const wDef = state.tool==="lake" ? 1.5 : 3, wVal = state[wKey]||wDef;
      const widthSlider = drawingWater
        ? `<div class="ppRow"><label class="note" style="flex:1;display:flex;align-items:center;gap:6px">${state.tool==="lake"?"Lake outline":"River"} width<input id="ppWaterW" type="range" min="${state.tool==="lake"?0.5:1}" max="${state.tool==="lake"?12:10}" step="0.5" value="${wVal}" style="flex:1"/><b id="ppWaterWV">${wVal}</b></label></div>`
        : "";
      waterRow = `<div class="note" style="margin-top:8px">Water</div>
        <div class="ppModes">
          <button class="btn tiny${state.tool==="river"?" primary":""}" id="ppRiver" title="Draw a river — click points, Enter/double-click to finish">〜 River</button>
          <button class="btn tiny${state.tool==="lake"?" primary":""}" id="ppLake" title="Draw a lake — click points, Enter/double-click to finish">💧 Lake</button>
          <button class="btn tiny${state.waterEditMode?" primary":""}" id="ppWaterEdit" title="Click an existing river/lake to select it, then drag its handles or change its width">✎ Edit</button>
        </div>${widthSlider}`;
    }
    html+=mixToggle+`<div class="ppChips">${chips||'<span class="note">Nothing to paint here.</span>'}</div>${mixEditor}${waterRow}
      <div class="ppRow"><button class="btn tiny${(painting&&state.paintErase)?" danger":""}" id="ppErase">🧹 Erase</button><button class="btn tiny" id="ppUndo">↶ Undo</button></div>`;
  }
  box.innerHTML=head+`<div class="ppBody">${html}</div>`;
  box.classList.toggle("collapsed",_paintCollapsed);
  { const cc=$("#ppCaret"); if(cc)cc.onclick=()=>{ _paintCollapsed=!_paintCollapsed; renderPaintPanel(); }; }
  $("#ppSelect").onclick=()=>{ state.paintErase=false; setTool("select"); renderPaintPanel(); };
  { const u=$("#ppUndo"); if(u)u.onclick=()=>doUndo(); }
  { const e=$("#ppErase"); if(e)e.onclick=()=>{ state.paintErase=true; state.paintValue=null; state.paintUnclaim=(state.mapmode==="political"); setTool("paint"); renderPaintPanel(); flash("Erase mode — click/drag over provinces."); }; }
  if(state.mapmode==="political"){
    const rs=$("#ppRealm"); if(rs)rs.onchange=ev=>{ const v=ev.target.value; if(!v)return; state.selRealm=v; state.paintUnclaim=false; state.paintErase=false; setTool("paint"); renderPaintPanel(); const rr=world.realms.find(x=>x.id===v); flash("Painting with "+(rr?rr.name:"realm")+" ("+state.expandMode+")."); };
    box.querySelectorAll(".ppMode").forEach(b=>b.onclick=()=>{ state.expandMode=b.dataset.exm; renderPaintPanel(); });
    { const sc=$("#ppSettleCfg"); if(sc)sc.onclick=openSettleConfig; }
  } else {
    const mixOn = MIX_MODES.includes(state.mapmode) && state.paintMixOn;
    box.querySelectorAll(".ppChip").forEach(b=>b.onclick=()=>{
      const v=b.dataset.v;
      if(mixOn){
        const gs=state.paintMixGroups=state.paintMixGroups||[];
        const idx=gs.findIndex(g=>g.name===v);
        if(idx>=0){ gs.splice(idx,1); normalizeMix(null); }        // remove → rebalance to 100
        else { gs.push({name:v, w:0}); gs.forEach(g=>g.w=100/gs.length); normalizeMix(null); }   // add → even split summing to 100
        state.paintErase=false; setTool("paint"); renderPaintPanel();
      } else {
        state.paintValue=v; state.paintErase=false; setTool("paint"); renderPaintPanel(); flash("Painting: "+v);
      }
    });
    { const s=$("#ppMixSingle"); if(s)s.onclick=()=>{ state.paintMixOn=false; renderPaintPanel(); }; }
    { const mm=$("#ppMixMulti"); if(mm)mm.onclick=()=>{ state.paintMixOn=true; state.paintErase=false; setTool("paint"); renderPaintPanel(); flash("Mix paint — pick groups above and set their breakdown."); }; }
    box.querySelectorAll(".pmixW").forEach(el=>el.addEventListener("change",e=>{ const i=+el.dataset.i; if(state.paintMixGroups[i]){ state.paintMixGroups[i].w=Math.max(0,Math.min(100,+e.target.value||0)); normalizeMix(i); renderPaintPanel(); } }));
    box.querySelectorAll(".pmixX").forEach(el=>el.onclick=()=>{ state.paintMixGroups.splice(+el.dataset.i,1); normalizeMix(null); renderPaintPanel(); });
    { const j=$("#pmixJit"); if(j)j.addEventListener("input",e=>{ state.paintMixJitter=Math.max(0,Math.min(90,+e.target.value||0)); }); }
    { const rb=$("#ppRiver"); if(rb)rb.onclick=()=>{ state.paintErase=false; state.waterEditMode=false; setTool(state.tool==="river"?"select":"river"); renderPaintPanel(); }; }
    { const lb=$("#ppLake"); if(lb)lb.onclick=()=>{ state.paintErase=false; state.waterEditMode=false; setTool(state.tool==="lake"?"select":"lake"); renderPaintPanel(); }; }
    { const eb=$("#ppWaterEdit"); if(eb)eb.onclick=()=>{ state.waterEditMode=!state.waterEditMode; if(state.waterEditMode){ setTool("select"); flash("Click a river or lake to select it, then drag its round handles or change its width."); } else { state.selWater=null; } renderPaintPanel(); renderMap(); }; }
    { const ww=$("#ppWaterW"); if(ww)ww.addEventListener("input",e=>{ const k=state.tool==="lake"?"newLakeWidth":"newRiverWidth"; state[k]=+e.target.value; const v=$("#ppWaterWV"); if(v)v.textContent=e.target.value; }); }
  }
}
// Editor-only population growth/decline tool — bottom-left of the Population map.
function renderPopPanel(){
  let box=document.getElementById("popPanel");
  const show = !VIEWER && !document.body.classList.contains("editing") && state.mapmode==="population";
  if(!show){ if(box)box.remove(); return; }
  if(!box){ box=document.createElement("div"); box.id="popPanel"; ($("#stage")||document.body).appendChild(box); }
  const dir=state.popDir||1, sc=state.popScope||"world";
  const scopeBtn=(v,l)=>`<button class="btn tiny ppMode${sc===v?" primary":""}" data-sc="${v}">${l}</button>`;
  let extra="";
  if(sc==="continent"){
    const opts=world.continents.map(c=>`<option value="${c.id}" ${state.popCont===c.id?"selected":""}>${esc(c.name)}</option>`).join("");
    extra=`<div class="ppRow"><select id="popCont"><option value="">— pick a continent —</option>${opts}</select></div>`;
  } else if(sc==="realm"){
    const opts=world.realms.map(r=>`<option value="${r.id}" ${state.popRealm===r.id?"selected":""}>${esc(r.name)}</option>`).join("");
    extra=`<div class="ppRow"><select id="popRealm"><option value="">— pick a realm —</option>${opts}</select></div>
      <div class="ppRow"><button class="btn tiny" id="popQuick" style="flex:1" ${state.popRealm?"":"disabled"} title="Raise this realm's population by 5% or 5,000 (whichever is higher), spread by the usual growth rules and ceilings">⚡ Quick grow (+5% / +5,000)</button></div>`;
  } else if(sc==="selected"){
    extra=`<div class="note" style="margin:4px 0">Click provinces on the map to add/remove them. Selected: <b>${state.popSel.size}</b></div>
      <div class="ppRow"><button class="btn tiny" id="popClearSel">Clear selection</button></div>`;
  }
  const n=popTargets().length;
  const head=`<div class="ppHead"><button class="ppCaret" id="popCaret" title="Collapse / expand">${_popCollapsed?"▸":"▾"}</button><b>👥 Population</b><span class="note" style="margin-left:6px">${dir>0?"Growth":"Decline"}</span></div>`;
  box.innerHTML=head+`<div class="ppBody">
    <div class="ppModes">
      <button class="btn tiny ppMode${dir>0?" primary":""}" data-dir="1">🌱 Grow</button>
      <button class="btn tiny ppMode${dir<0?" danger":""}" data-dir="-1">📉 Reduce</button>
    </div>
    <div class="note" style="margin:6px 0 2px">Favor <span class="note">(grow faster · decline slower)</span></div>
    <div class="ppModes">
      <button class="btn tiny ppMode${state.popFavRel?" primary":""}" data-fav="rel" title="Favor pops of each realm's state religion">☩ Religion</button>
      <button class="btn tiny ppMode${state.popFavRace?" primary":""}" data-fav="race" title="Favor pops of each realm's admin races">👑 Admin race</button>
    </div>
    <div class="ppModes">
      <button class="btn tiny ppMode${state.popFavCul?" primary":""}" data-fav="cul" title="Favor pops of each realm's dominant culture">🎭 Culture</button>
      <button class="btn tiny ppMode${state.popFavLang?" primary":""}" data-fav="lang" title="Favor pops of each realm's dominant language">🗣 Language</button>
    </div>
    <div class="note" style="margin:6px 0 2px">Apply to</div>
    <div class="ppModes">${scopeBtn("world","World")}${scopeBtn("continent","Continent")}${scopeBtn("realm","Realm")}${scopeBtn("selected","Select")}</div>
    ${extra}
    <div class="ppRow"><button class="btn ${dir>0?"primary":"danger"}" id="popApply" style="flex:1">${dir>0?"🌱 Grow":"📉 Reduce"} · ${n} prov${n===1?"":"s"}</button><button class="btn tiny" id="popUndo" title="Undo">↶</button></div>
    <div class="note">Baseline ${(popTune().base||5000).toLocaleString()} ±${Math.round((popTune().jitter||0)*100)}%, shaped by terrain, settlement tier, capital/admin &amp; each province's growth ceiling. Tune it in the GM Screen.</div></div>`;
  box.classList.toggle("collapsed",_popCollapsed);
  { const cc=$("#popCaret"); if(cc)cc.onclick=()=>{ _popCollapsed=!_popCollapsed; renderPopPanel(); }; }
  box.querySelectorAll("[data-dir]").forEach(b=>b.onclick=()=>{ state.popDir=+b.dataset.dir; renderPopPanel(); });
  box.querySelectorAll("[data-fav]").forEach(b=>b.onclick=()=>{ const k={rel:"popFavRel",race:"popFavRace",cul:"popFavCul",lang:"popFavLang"}[b.dataset.fav]; state[k]=!state[k]; renderPopPanel(); });
  box.querySelectorAll("[data-sc]").forEach(b=>b.onclick=()=>{ state.popScope=b.dataset.sc; renderPopPanel(); renderMap(); });
  { const s=$("#popCont"); if(s)s.onchange=e=>{ state.popCont=e.target.value||null; renderPopPanel(); }; }
  { const s=$("#popRealm"); if(s)s.onchange=e=>{ state.popRealm=e.target.value||null; renderPopPanel(); }; }
  { const q=$("#popQuick"); if(q)q.onclick=applyQuickGrowRealm; }
  { const c=$("#popClearSel"); if(c)c.onclick=()=>{ state.popSel.clear(); renderPopPanel(); renderMap(); }; }
  $("#popApply").onclick=applyPopStep;
  $("#popUndo").onclick=()=>{ doUndo(); renderPopPanel(); };
}
/* ============================================================
   POP CONVERSION TOOL — editor-only, on the Religion / Culture /
   Language maps. Convert a % of a province's pops toward a chosen
   faith/culture/language, boosted for "fast-spreading" religions and
   for pops that have none yet, optionally radiating from a center.
   ============================================================ */
const CONVERT_AXES={religion:["religions","Religion","☩"],culture:["cultures","Culture","🎭"],language:["languages","Language","🗣"]};
const CONVERT_SENTINEL={religion:"No Religion",culture:"No Culture",language:"No Language"};
function convertAxis(){ return CONVERT_AXES[state.mapmode] ? state.mapmode : null; }
function convertSelectActive(){ return !VIEWER && state.convertSelecting && convertAxis() && !document.body.classList.contains("editing"); }
function convertHandleClick(p){
  if(state.convertPickCenter){ state.convertCenter=p.id; state.convertSel.add(p.id); state.convertPickCenter=false; }
  else { if(state.convertSel.has(p.id)){ state.convertSel.delete(p.id); if(state.convertCenter===p.id)state.convertCenter=null; } else state.convertSel.add(p.id); }
  renderMap(); renderConvertPanel();
}
// Apply the conversion to every selected province.
function applyConversion(){
  const m=convertAxis(); if(!m) return;
  const T=state.convertTarget; if(!T){ flash("Pick a target "+m+" to convert toward."); return; }
  const provs=world.provinces.filter(p=>state.convertSel.has(p.id));
  if(!provs.length){ flash("Select one or more provinces first."); return; }
  const base=Math.max(0,Math.min(100,+state.convertPct||0))/100;
  const rate=(m==="religion"&&state.convertFast)?Math.max(0.50,base):base;
  const sentinel=CONVERT_SENTINEL[m];
  // province centroids for distance falloff
  const cen={}; for(const g of _provGeo) cen[g.p.id]=[g.cx,g.cy];
  let center=null, maxD=1;
  if(state.convertCenter && cen[state.convertCenter]){
    center=cen[state.convertCenter];
    for(const p of provs){ const c=cen[p.id]; if(c){ const d=Math.hypot(c[0]-center[0],c[1]-center[1]); if(d>maxD)maxD=d; } }
  }
  beginEdit();
  let converted=0, touched=0;
  for(const p of provs){
    if(!(p.pops&&p.pops.length)) continue;
    let factor=1;
    if(center){ const c=cen[p.id]; const d=c?Math.hypot(c[0]-center[0],c[1]-center[1]):maxD; factor=Math.max(0.30, 1-(d/maxD)*0.70); }
    const old=provTrackedValue(p,m); let any=false;
    for(const q of p.pops.slice()){
      if(!(q.size>0) || q[m]===T) continue;
      const unfaithed = !q[m] || q[m]===sentinel;
      let eff=rate*factor; if(unfaithed) eff=Math.min(0.98, eff*1.7);
      const moved=Math.round(q.size*eff); if(moved<=0) continue;
      q.size-=moved; converted+=moved; any=true;
      p.pops.push(newPop(moved, m==="religion"?T:q.religion, m==="culture"?T:q.culture, q.race, m==="language"?T:q.language, q.economy));
    }
    if(any){ p.pops=p.pops.filter(q=>(q.size||0)>0); deriveProvince(p); autoLog(p,m,old); touched++; }
  }
  renderMap(); renderLegend(); renderLeft(); markDirty();
  flash(converted>0 ? `Converted ~${converted.toLocaleString()} people to ${T} across ${touched} province${touched===1?"":"s"}.` : "No pops were eligible to convert.");
  renderConvertPanel();
}
function renderConvertPanel(){
  let box=document.getElementById("convPanel");
  const m=convertAxis();
  const show = !VIEWER && !document.body.classList.contains("editing") && !!m;
  if(!show){ if(box)box.remove(); state.convertSelecting=false; state.convertPickCenter=false; return; }
  if(!box){ box=document.createElement("div"); box.id="convPanel"; ($("#stage")||document.body).appendChild(box); }
  const [listKey,label,icon]=CONVERT_AXES[m];
  const list=world.lists[listKey]||[];
  if(state.convertTarget && !list.includes(state.convertTarget)) state.convertTarget=null;   // reset when switching axis
  const opts=list.map(v=>`<option value="${esc(v)}" ${state.convertTarget===v?"selected":""}>${esc(v)}</option>`).join("");
  const n=state.convertSel.size;
  const centerName=state.convertCenter ? (world.provinces.find(p=>p.id===state.convertCenter)||{}).name : null;
  const head=`<div class="ppHead"><button class="ppCaret" id="convCaret" title="Collapse / expand">${_convCollapsed?"▸":"▾"}</button><b>🔀 Convert</b><span class="note" style="margin-left:6px">${icon} ${label}</span></div>`;
  box.innerHTML=head+`<div class="ppBody">
    <div class="ppRow"><select id="convTarget"><option value="">— convert toward… —</option>${opts}</select></div>
    <div class="ppRow"><label class="note" style="flex:1">Baseline %<input id="convPct" type="number" min="0" max="100" value="${state.convertPct}" style="width:62px;margin-left:6px"/></label></div>
    ${m==="religion"?`<div class="ppModes"><button class="btn tiny ppMode${state.convertFast?" primary":""}" id="convFast" title="Fast-spreading faith — raises the conversion rate to at least 50%">⚡ Fast-spreading (→50%)</button></div>`:""}
    <div class="note" style="margin:6px 0 2px">Provinces</div>
    <div class="ppModes">
      <button class="btn tiny ppMode${state.convertSelecting?" primary":""}" id="convSelect" title="Click or drag provinces on the map to add/remove them">${state.convertSelecting?"✓ ":""}🖌 Select</button>
      <button class="btn tiny" id="convClear" title="Clear the selection">Clear</button>
    </div>
    <div class="note" style="margin:2px 0">Selected: <b>${n}</b></div>
    <div class="ppModes">
      <button class="btn tiny ppMode${state.convertPickCenter?" primary":""}" id="convCenter" title="Pick one province the conversion radiates from — farther provinces convert less">${state.convertPickCenter?"◎ Click a province…":"🎯 Set center"}</button>
      ${state.convertCenter?`<button class="btn tiny" id="convCenterClear" title="Clear the conversion center">✕</button>`:""}
    </div>
    ${centerName?`<div class="note" style="margin:2px 0">Center: <b>${esc(centerName)}</b></div>`:`<div class="note" style="margin:2px 0">No center — every province converts evenly.</div>`}
    <div class="ppRow"><button class="btn primary" id="convApply" style="flex:1" ${(!state.convertTarget||!n)?"disabled":""}>🔀 Convert · ${n} prov${n===1?"":"s"}</button><button class="btn tiny" id="convUndo" title="Undo">↶</button></div>
    <div class="note">Pops with no ${label.toLowerCase()} yet convert more readily. Every conversion is a single undo.</div></div>`;
  box.classList.toggle("collapsed",_convCollapsed);
  { const cc=$("#convCaret"); if(cc)cc.onclick=()=>{ _convCollapsed=!_convCollapsed; renderConvertPanel(); }; }
  { const s=$("#convTarget"); if(s)s.onchange=e=>{ state.convertTarget=e.target.value||null; renderConvertPanel(); }; }
  { const s=$("#convPct"); if(s)s.oninput=e=>{ state.convertPct=Math.max(0,Math.min(100,+e.target.value||0)); }; }
  { const f=$("#convFast"); if(f)f.onclick=()=>{ state.convertFast=!state.convertFast; renderConvertPanel(); }; }
  { const b=$("#convSelect"); if(b)b.onclick=()=>{ state.convertSelecting=!state.convertSelecting; if(state.convertSelecting)state.convertPickCenter=false; renderConvertPanel(); flash(state.convertSelecting?"Click or drag provinces to select them.":"Selection paused."); }; }
  { const b=$("#convClear"); if(b)b.onclick=()=>{ state.convertSel.clear(); state.convertCenter=null; renderConvertPanel(); renderMap(); }; }
  { const b=$("#convCenter"); if(b)b.onclick=()=>{ state.convertPickCenter=!state.convertPickCenter; if(state.convertPickCenter)state.convertSelecting=false; renderConvertPanel(); flash(state.convertPickCenter?"Click the province the conversion radiates from.":""); }; }
  { const b=$("#convCenterClear"); if(b)b.onclick=()=>{ state.convertCenter=null; renderConvertPanel(); renderMap(); }; }
  { const b=$("#convApply"); if(b)b.onclick=applyConversion; }
  { const b=$("#convUndo"); if(b)b.onclick=()=>{ doUndo(); renderConvertPanel(); }; }
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
    p.pops=[newPop(0,r.stateReligion,r.dominantCulture,defaultSubraceForGroup(r.dominantRace),r.dominantLanguage,r.economy||"Primitive")];
    deriveProvince(p);
    autoLog(p,"religion",oR);autoLog(p,"culture",oC);autoLog(p,"language",oL);
    ch=true;
  }
  return ch;
}
// Realm expansion applied when a province is painted into realm r.
function expandPaint(p, r){
  const mode=state.expandMode||"conquer";
  if(mode==="conquer") return;                      // add to realm, change nothing else
  if(mode==="override"){                            // wipe pops, replace with same-size realm-identity pop
    const total=(p.pops||[]).reduce((a,q)=>a+(q.size||0),0);
    p.pops = total>0 ? [newPop(total, r.stateReligion, r.dominantCulture, defaultSubraceForGroup(r.dominantRace), r.dominantLanguage, r.economy||"Primitive")] : [];
    deriveProvince(p);
    return;
  }
  if(mode==="settle"){ settleProvince(p, r); return; }
  if(mode==="settle_DISABLED"){                              // migrate % of realm pops into this province
    const sp=state.settleParams||{}; const pct=Math.max(0,Math.min(100,sp.pct??8))/100; if(pct<=0)return;
    const match=q=>{
      if(sp.byReligion && q.religion!==r.stateReligion) return false;
      if(sp.byCulture  && q.culture !==r.dominantCulture) return false;
      if(sp.byLanguage && q.language!==r.dominantLanguage) return false;
      if(sp.byRace     && q.race    !==r.dominantRace) return false;
      return true;
    };
    const migrants={};
    for(const src of world.provinces){
      if(src===p || src.realmId!==r.id) continue;
      let took=false;
      for(const q of (src.pops||[])){
        if(!(q.size>0) || !match(q)) continue;
        const take=Math.floor(q.size*pct); if(take<=0) continue;
        q.size-=take; took=true;
        const key=[q.religion,q.culture,q.race,q.language,q.economy].join("");
        migrants[key]=(migrants[key]||0)+take;
      }
      if(took) deriveProvince(src);
    }
    p.pops=p.pops||[];
    for(const key in migrants){ const [rel,cul,rac,lan,econ]=key.split(""); p.pops.push(newPop(migrants[key],rel,cul,rac,lan,econ)); }
    deriveProvince(p);
  }
}
// Uninhabited land settled for the first time can only hold a few hundred, scaled by terrain.
function uninhabitedSettleCap(p){ return Math.max(80, Math.min(600, Math.round(250*terrainCeilMod(p.terrain)))); }
// Settle: pull ~2–3% of matching pops from across the realm into the newly-claimed province,
// favouring higher-population provinces a little, capped so the province only gains roughly half
// its existing population (or a terrain-scaled few hundred if it was uninhabited). Pops that don't
// fit stay where they are — nothing is deleted.
function settleProvince(p, r){
  const sp=state.settleParams||{};
  const match=q=>{
    if(sp.byReligion && q.religion!==r.stateReligion) return false;
    if(sp.byRace     && !((r.adminRaces||[]).includes(subraceGroup(q.race)))) return false;   // race = the realm's admin races (groups)
    if(sp.byCulture  && q.culture !==r.dominantCulture) return false;
    if(sp.byLanguage && q.language!==r.dominantLanguage) return false;
    return true;
  };
  const existing=(p.pops||[]).reduce((a,q)=>a+(q.size||0),0);
  if(existing<=0 && (!p.settlement || p.settlement==="Uninhabited")){          // first settlers → set a default tier
    const tier=sp.settleTier||"Village";
    if(world.lists.settlements.includes(tier) && p.settlement!==tier){ const o=provTrackedValue(p,"settlement"); p.settlement=tier; autoLog(p,"settlement",o); }
  }
  const cap = existing<=0 ? uninhabitedSettleCap(p) : Math.round(existing*0.5);
  if(cap<=0)return;
  const sources=world.provinces.filter(s=>s!==p && s.realmId===r.id);
  const rate=0.02+Math.random()*0.01;                                          // 2–3% base draw
  let maxMatch=0;
  const info=sources.map(s=>{ let m=0; for(const q of (s.pops||[])) if(q.size>0&&match(q))m+=q.size; if(m>maxMatch)maxMatch=m; return {s,match:m,potential:0}; });
  info.forEach(si=>{ si.potential = si.match>0 ? si.match*rate*(1+0.4*(si.match/(maxMatch||1))) : 0; });   // favour high-pop provinces
  const totalPot=info.reduce((a,si)=>a+si.potential,0); if(totalPot<=0)return;
  const scale = totalPot>cap ? cap/totalPot : 1;                               // scale down so arrivals ≤ cap
  const migrants=new Map();
  info.forEach(si=>{ if(si.potential<=0)return; let take=Math.min(si.match, Math.round(si.potential*scale)); if(take<=0)return;
    const mps=(si.s.pops||[]).filter(q=>q.size>0&&match(q)); const mtot=mps.reduce((a,q)=>a+q.size,0)||1; let moved=0;
    mps.forEach((q,idx)=>{ let t = idx===mps.length-1 ? (take-moved) : Math.round(take*q.size/mtot); t=Math.min(t, q.size); if(t<=0)return; q.size-=t; moved+=t;
      const key=[q.religion,q.culture,q.race,q.language,q.economy].join(""); migrants.set(key,(migrants.get(key)||0)+t); });
    deriveProvince(si.s);
  });
  p.pops=p.pops||[];
  migrants.forEach((size,key)=>{ if(size<=0)return; const a=key.split(""); p.pops.push(newPop(size,a[0],a[1],a[2],a[3],a[4])); });
  deriveProvince(p);
}
function openSettleConfig(){
  const sp=state.settleParams||(state.settleParams={});
  const tierOpts=(world.lists.settlements||[]).filter(t=>t!=="Uninhabited").map(t=>`<option value="${esc(t)}" ${sp.settleTier===t?"selected":""}>${esc(t)}</option>`).join("");
  openModal(`<button class="btn close" onclick="closeModal()">✕ Close</button><h2>🧑‍🤝‍🧑 Settle options</h2>
    <p class="note">When you paint a province into a realm in <b>Settle</b> mode, ~2–3% of the realm's people migrate into it (favouring bigger provinces), capped at about half the province's current population — or a terrain-scaled few hundred if it was empty. Pops that don't fit stay put.</p>
    <div class="note" style="margin:2px 0">Only send pops that match <b>all</b> ticked traits (tick none = anyone may settle):</div>
    <div class="ppModes" style="flex-wrap:wrap">
      <button class="btn tiny ppMode${sp.byReligion?" primary":""}" data-sf="byReligion">☩ Religion</button>
      <button class="btn tiny ppMode${sp.byRace?" primary":""}" data-sf="byRace">👑 Admin race</button>
      <button class="btn tiny ppMode${sp.byCulture?" primary":""}" data-sf="byCulture">🎭 Culture</button>
      <button class="btn tiny ppMode${sp.byLanguage?" primary":""}" data-sf="byLanguage">🗣 Language</button>
    </div>
    <div class="field" style="margin-top:8px"><label>Default settlement tier for newly-inhabited land</label>
      <select id="stTier">${tierOpts}</select></div>`);
  const host=document.querySelector("#modalHost .modal");
  host.querySelectorAll("[data-sf]").forEach(b=>b.onclick=()=>{ const k=b.dataset.sf; sp[k]=!sp[k]; b.classList.toggle("primary",!!sp[k]); markDirty(); });
  { const t=$("#stTier"); if(t)t.onchange=e=>{ sp.settleTier=e.target.value; markDirty(); }; }
}
function openExpandPopup(r){
  const sp=state.settleParams||{pct:8}, m=state.expandMode||"conquer";
  openModal(`<button class="btn close" onclick="closeModal()">✕ Close</button><h2>Expand ${esc(r.name)}</h2>
    <p class="note">Choose what painting provinces into this realm does. This stays active until you change it.</p>
    <div class="field"><label><input type="radio" name="exm" value="conquer" ${m==="conquer"?"checked":""}/> <b>Conquer</b> — add provinces to the realm and change nothing else (keep their people & details).</label></div>
    <div class="field"><label><input type="radio" name="exm" value="settle" ${m==="settle"?"checked":""}/> <b>Settle</b> — add the province and move settlers into it from across the realm.</label></div>
    <div id="exSettle" class="${m==="settle"?"":"hidden"}" style="margin:2px 0 8px 22px">
      <div class="field2"><div class="field"><label>Settlers: % of matching pops taken from each realm province</label><input id="exPct" type="number" min="0" max="100" value="${sp.pct??8}"/></div><div class="field"></div></div>
      <div class="note">Only pops matching the ticked traits migrate (tick none = anyone can settle):</div>
      <label style="font-size:13px"><input type="checkbox" id="exRel" ${sp.byReligion?"checked":""}/> Religion</label>
      <label style="font-size:13px;margin-left:10px"><input type="checkbox" id="exCul" ${sp.byCulture?"checked":""}/> Culture</label>
      <label style="font-size:13px;margin-left:10px"><input type="checkbox" id="exLan" ${sp.byLanguage?"checked":""}/> Language</label>
      <label style="font-size:13px;margin-left:10px"><input type="checkbox" id="exRac" ${sp.byRace?"checked":""}/> Race</label>
    </div>
    <div class="field"><label><input type="radio" name="exm" value="override" ${m==="override"?"checked":""}/> <b>Override</b> — replace the province's population with an equal number of the realm's own religion, culture, language & race.</label></div>
    <div class="btnrow"><button class="btn primary" id="exGo">🖌 Start painting</button></div>`);
  const syncSettle=()=>{const val=document.querySelector('input[name="exm"]:checked').value; $("#exSettle").classList.toggle("hidden",val!=="settle");};
  $$('input[name="exm"]').forEach(el=>el.addEventListener("change",syncSettle));
  $("#exGo").onclick=()=>{
    state.expandMode=document.querySelector('input[name="exm"]:checked').value;
    state.settleParams={pct:Math.max(0,Math.min(100,+$("#exPct").value||0)), byReligion:$("#exRel").checked, byCulture:$("#exCul").checked, byLanguage:$("#exLan").checked, byRace:$("#exRac").checked};
    closeModal();
    if(state.mapmode==="imported"){state.mapmode="political";const ms=$("#mapmode");if(ms)ms.value="political";}
    selectRealm(r.id); setTool("paint");
    flash("Painting "+r.name+" — "+state.expandMode+" mode. Click or drag across provinces.");
    renderMap();
  };
}
// Identity axes that support "mix" painting (blend several groups by a breakdown).
const MIX_MODES=["religion","culture","race","language"];
let _mixStrokeSet=null;   // provinces already mix-painted in the current stroke (avoids re-rolling on drag)
function paintMixReady(){ return state.paintMixOn && (state.paintMixGroups||[]).some(g=>g.name && (+g.w>0)); }
// Keep the mix breakdown summing to 100. If keepIdx is given, pin that group's
// value and redistribute the remainder among the others proportionally; otherwise
// scale everything to total 100 (used after add/remove).
function normalizeMix(keepIdx){
  const gs=state.paintMixGroups||[]; if(!gs.length) return;
  if(gs.length===1){ gs[0].w=100; return; }
  if(keepIdx!=null && gs[keepIdx]){
    let v=Math.max(0,Math.min(100,+gs[keepIdx].w||0)); gs[keepIdx].w=v;
    const others=gs.filter((_,i)=>i!==keepIdx); const rem=100-v;
    const osum=others.reduce((a,g)=>a+(+g.w||0),0);
    if(osum<=0) others.forEach(g=>g.w=rem/others.length);
    else others.forEach(g=>g.w=rem*((+g.w||0)/osum));
  } else {
    const s=gs.reduce((a,g)=>a+(+g.w||0),0);
    if(s<=0) gs.forEach(g=>g.w=100/gs.length);
    else gs.forEach(g=>g.w=(+g.w||0)/s*100);
  }
  gs.forEach(g=>g.w=Math.round(g.w));
}
// Redistribute a province's pops across the selected groups on axis m, by the
// chosen weights ± a per-province random jitter. Other axes are preserved
// (each pop is split proportionally), so only the painted axis changes.
function paintMixApply(p, m){
  if(!(p.pops&&p.pops.length))return false;
  const groups=(state.paintMixGroups||[]).filter(g=>g.name && (+g.w>0));
  if(!groups.length) return false;
  const jit=Math.max(0,Math.min(90,+state.paintMixJitter||0))/100;
  const w=groups.map(g=>({name:g.name, w:Math.max(0,(+g.w)*(1+(Math.random()*2-1)*jit))}));
  let wsum=w.reduce((a,g)=>a+g.w,0); if(wsum<=0){ w.forEach(g=>g.w=1); wsum=w.length; }
  w.forEach(g=>g.frac=g.w/wsum);
  const out=[];
  for(const q of p.pops){
    const s=Math.round(q.size||0); if(s<=0) continue;
    let assigned=0;
    w.forEach((g,idx)=>{
      let take = idx===w.length-1 ? (s-assigned) : Math.round(s*g.frac);
      take=Math.max(0, Math.min(take, s-assigned)); assigned+=take;
      if(take<=0) return;
      out.push(newPop(take, m==="religion"?g.name:q.religion, m==="culture"?g.name:q.culture,
                            m==="race"?g.name:q.race, m==="language"?g.name:q.language, q.economy));
    });
  }
  p.pops=out; deriveProvince(p);   // deriveProvince merges identical groups
  return true;
}
function paintProvince(p){   // returns true if it changed something (and auto-logs it)
  const m=state.mapmode;
  const fieldMap={political:"realm",terrain:"terrain",settlement:"settlement",resource:"resource",religion:"religion",culture:"culture",race:"race",language:"language",economy:"economy"};
  const field=fieldMap[m]; if(!field)return false;
  const erasing=!!state.paintErase;
  const old=provTrackedValue(p,field); let changed=false;
  if(m==="political"){
    const v=(erasing||state.paintUnclaim)?null:state.selRealm;
    if(!erasing && !state.paintUnclaim && !v) return false;
    if(p.realmId!==v){ p.realmId=v; changed=true; if(v){const rr=world.realms.find(x=>x.id===v); if(rr)expandPaint(p,rr);} }
  } else {
    const mixActive = MIX_MODES.includes(m) && state.paintMixOn && paintMixReady();
    if(!erasing && !mixActive && (state.paintValue==null||state.paintValue==="")) return false;
    if(m==="terrain"){ const v=erasing?"":state.paintValue; if(p.terrain!==v){p.terrain=v;changed=true;} }
    else if(m==="settlement"){ const v=erasing?"Uninhabited":state.paintValue; if(p.settlement!==v){p.settlement=v;changed=true;} }
    else if(m==="resource"){
      if(state.hiddenResMode){ const nv=erasing?"":(state.paintValue==="__none__"?"":state.paintValue); if(p.hidden!==nv){p.hidden=nv;changed=true;} }
      else { const v=erasing?"":state.paintValue; if(p.resource!==v){p.resource=v;changed=true;} }
    }
    else{ // religion/culture/race/language/economy — convert EVERY pop group in the province
      if(!(p.pops&&p.pops.length))return false;   // no people here to convert/erase
      if(!erasing && MIX_MODES.includes(m) && state.paintMixOn && paintMixReady()){
        if(_mixStrokeSet && _mixStrokeSet.has(p.id)) return false;   // only roll once per province per stroke
        if(paintMixApply(p,m)){ if(_mixStrokeSet)_mixStrokeSet.add(p.id); changed=true; }
      } else {
        const v=erasing?"":state.paintValue; let any=false;
        p.pops.forEach(q=>{if(q[m]!==v){q[m]=v;any=true;}});
        if(any){deriveProvince(p);changed=true;}
      }
    }
  }
  if(changed)autoLog(p,field,old);
  return changed;
}
function onProvinceClick(p){
  // Population tool, "Select" scope: clicking toggles the province in the multi-selection.
  if(!VIEWER && state.mapmode==="population" && state.popScope==="selected"){
    if(state.popSel.has(p.id)) state.popSel.delete(p.id); else state.popSel.add(p.id);
    renderMap(); renderPopPanel(); return;
  }
  // Conversion tool: selecting provinces / picking a center
  if(convertSelectActive()||state.convertPickCenter){ if(convertAxis()){ convertHandleClick(p); return; } }
  // Regions map: editor toggles province membership in the active region; viewer opens the region it's in
  if(state.mapmode==="region"){ regionProvinceClick(p); return; }
  // Tech map: click a realm to spotlight all realms of the same TL and open its breakdown
  if(state.mapmode==="tech"){ if(p.realmId){ const rr=world.realms.find(x=>x.id===p.realmId); state.legendFilter={mode:"tech",value:Math.round(realmTL(rr).avg)}; selectRealm(p.realmId); renderMap(); } else selectProvince(p.id); return; }
  if(state.tool==="paint"){
    if(!paintReady()){flash(paintHint());return;}
    if(paintProvince(p)){ _labelsDirty=true; renderMap(); renderLeft(); markDirty(); }
    return;
  }
  if(state.mapmode==="resource") spotlightResource(p);
  else if(state.mapmode==="race"){ const d=dominant(p.race); if(d) setRaceGroup(subraceGroup(d)); }
  else spotlightProvinceItem(p);
  selectProvince(p.id);
}
// Clicking a province in political/religion/culture/language/terrain highlights that item's
// provinces (minorities included). Clicking another province of the SAME category keeps the
// highlight on (only switches to a different category, or add a terrain to the set) — clearing
// is done by clicking the legend entry again or clicking empty space.
function spotlightProvinceItem(p){
  if(!["political","religion","culture","language","terrain"].includes(state.mapmode)) return;
  if(state.mapmode==="terrain"){ if(!p.ocean) addTerrainSel(p.terrain); return; }   // terrain multi-select: clicking adds (ocean tiles are highlighted only via the legend)
  const v = dominant(p[state.mapmode]);
  const val = state.mapmode==="political" ? (p.realmId||"__none__") : v;
  if(val==null||val==="") return;
  state.legendFilter={mode:state.mapmode,value:val};   // set (a province click never toggles the highlight off)
  renderLegend();
}
// Terrain map: toggle a terrain in/out of the multi-select set (used by legend clicks).
function toggleTerrainSel(t){
  if(t==null||t==="") return;
  if(!state.terrainSel) state.terrainSel=new Set();
  if(state.terrainSel.has(t)) state.terrainSel.delete(t); else state.terrainSel.add(t);
  renderLegend(); renderMap();
}
// Terrain map: add a terrain to the multi-select set (province clicks — never removes).
function addTerrainSel(t){
  if(t==null||t==="") return;
  if(!state.terrainSel) state.terrainSel=new Set();
  if(!state.terrainSel.has(t)){ state.terrainSel.add(t); renderLegend(); renderMap(); }
}
// Race map: set the highlighted race group (province clicks — never toggles off).
function setRaceGroup(g){ if(state.selRaceGroup!==g){ state.selRaceGroup=g; renderMap(); buildMapLegend(); } }
// Resource map: spotlight a province's resource (province clicks — never toggles off).
function spotlightResource(p){ const sel=p.resource||null; if(sel && state.selResource!==sel){ state.selResource=sel; updateResSpot(); renderMap(); } }
// Resource map: click a province to spotlight its whole resource family (base + prestige
// goods), greying the rest. Click the same family again (or the void) to clear.
function toggleResourceHighlight(p){
  const sel = p.resource || null;
  state.selResource = (sel && state.selResource===sel) ? null : sel;   // store the exact resource
  updateResSpot();
}
// Resource map: click a province to spotlight its whole resource family (base + prestige
// goods), greying the rest. Click the same family again (or the void) to clear.
function toggleResourceHighlight(p){
  const sel = p.resource || null;
  state.selResource = (sel && state.selResource===sel) ? null : sel;   // store the exact resource
  updateResSpot();
}
// Click a legend entry (view/select mode) to spotlight only matching provinces.
function legendClickValue(v){
  if(state.mapmode==="population")return;              // population legend is a reference key only — not clickable
  if(state.mapmode==="resource"){                     // resources reuse the family spotlight + banner
    state.selResource = (state.selResource===v) ? null : v;
    updateResSpot(); renderMap(); return;
  }
  if(state.mapmode==="terrain"){ toggleTerrainSel(v); return; }   // terrain: multi-select highlight
  const cur=state.legendFilter;
  state.legendFilter = (cur && cur.mode===state.mapmode && cur.value===v) ? null : {mode:state.mapmode, value:v};
  renderLegend(); renderMap();
}
// Does a province match the active legend spotlight for the current map mode?
function provinceMatchesLegend(p, value){
  const has=(arr)=>(arr||[]).some(e=>e.name===value);   // minority-inclusive: any pop group of that value
  switch(state.mapmode){
    case "political":  return value==="__none__" ? !p.realmId : p.realmId===value;
    case "terrain":    return p.terrain===value;
    case "settlement": return p.settlement===value;
    case "religion":   return has(p.religion);
    case "culture":    return has(p.culture);
    case "race":       return has(p.race);
    case "language":   return has(p.language);
    case "economy":    return economyOf(p)===value;
    case "tech":{ const rr=world.realms.find(x=>x.id===p.realmId); const tl = rr ? Math.round(realmTL(rr).avg) : ((p.population||0)>0?0:null); return tl!==null && tl===value; }
    default:           return true;
  }
}
// On-map banner naming the highlighted resource and the prestige goods included with it.
function updateResSpot(){
  let el=document.getElementById("resSpot");
  if(state.mapmode!=="resource" || !state.selResource){ if(el)el.remove(); return; }
  if(!el){ el=document.createElement("div"); el.id="resSpot"; ($("#stage")||document.body).appendChild(el); }
  const sel=state.selResource, sw=c=>`<span class="rsw" style="background:${c}"></span>`;
  const glyph=isHiddenRes(sel)?(HIDDEN_RES_GLYPH[sel]||"⛏")+" ":"";
  let html=`<span class="rsLbl">Showing</span> ${sw(catColor("resources",sel))}<b>${glyph}${esc(sel)}</b>`;
  if(isHiddenRes(sel)) html+=`<span class="rsPlus">strategic resource</span>`;
  else if(isPrestige(sel)) html+=`<span class="rsPlus">prestige good</span>`;
  else { const pg=prestigeOf(sel); if(pg.length) html+=`<span class="rsPlus">+ prestige:</span> `+pg.map(x=>`${sw(catColor("resources",x))}${esc(x)}`).join(" "); }
  html+=`<span class="rsX" title="Clear highlight">✕</span>`;
  el.innerHTML=html;
  el.querySelector(".rsX").onclick=()=>{ state.selResource=null; updateResSpot(); renderMap(); };
}
// ---- wonders (great projects) & religion-info helpers ----
function wondersOf(pid){ return (world.wonders||[]).filter(w=>w.provinceId===pid).sort((a,b)=>(a.order||0)-(b.order||0)); }
function newWonder(pid){ const n=(world.wonders||[]).filter(w=>w.provinceId===pid).length; return {id:uid(),name:"New Wonder",image:"",description:"",provinceId:pid,holySite:false,religions:[],order:n}; }
function religionMeta(name){ world.religionInfo=world.religionInfo||{}; if(!world.religionInfo[name])world.religionInfo[name]={symbol:"",description:""}; return world.religionInfo[name]; }
function wonderReligions(w){ return (w.holySite && Array.isArray(w.religions)) ? w.religions : []; }
function holyWondersOf(rel){ return (world.wonders||[]).filter(w=>w.holySite && (w.religions||[]).includes(rel)).sort((a,b)=>(a.order||0)-(b.order||0)); }
// religions a province is a holy site for (union across its holy wonders)
function holyReligionsOfProvince(p){ const s=new Set(); wondersOf(p.id).forEach(w=>wonderReligions(w).forEach(r=>s.add(r))); return [...s]; }
function holySiteProvincesOf(rel){ const seen=new Set(),out=[]; holyWondersOf(rel).forEach(w=>{ if(w.provinceId&&!seen.has(w.provinceId)){seen.add(w.provinceId); const p=world.provinces.find(x=>x.id===w.provinceId); if(p)out.push(p);} }); return out; }
function selectProvince(id){
  if(state.selProvince && state.selProvince!==id) commitProvincePops(state.selProvince);   // fold identical groups on leaving a province
  state.selProvince=id;state.selRealm=null;state.selReligion=null;state.selWater=null;state.selLabel=null;
  const p=world.provinces.find(p=>p.id===id);
  if(p) state.focusedContinent=p.continentId;
  document.body.classList.add("has-sel");
  hideTechPanel();
  renderMap();renderLeft();renderProvinceEditor();renderWonderPanel();
}
function selectRealm(id){
  if(state.selProvince) commitProvincePops(state.selProvince);
  state.selRealm=id;state.selProvince=null;state.selReligion=null;state.selWater=null;state.selLabel=null;state.paintUnclaim=false;
  document.body.classList.add("has-sel");
  renderLeft();renderRealmEditor();renderWonderPanel();
}
function selectReligion(name){
  if(state.selProvince) commitProvincePops(state.selProvince);
  state.selReligion=name;state.selProvince=null;state.selRealm=null;state.selWater=null;state.selLabel=null;state.selForce=null;state.selBattle=null;state.selMonster=null;
  document.body.classList.add("has-sel");
  hideTechPanel();renderMap();renderReligionEditor();renderWonderPanel();
}
function selectContinent(id){
  if(state.selProvince) commitProvincePops(state.selProvince);
  state.focusedContinent=id;state.selProvince=null;state.selRealm=null;state.selReligion=null;state.selWater=null;state.selLabel=null;
  document.body.classList.add("has-sel");
  hideTechPanel();renderMap();renderLeft();renderContinentEditor();renderWonderPanel();
}
function selectCustomLabel(id){
  if(state.selProvince) commitProvincePops(state.selProvince);
  state.selLabel=id;state.selProvince=null;state.selRealm=null;state.selReligion=null;state.selWater=null;
  document.body.classList.add("has-sel");
  renderMap();renderLabelEditor();renderWonderPanel();
}
function clearSelection(){   // click on empty void: deselect and hide the inspector
  if(state.selProvince) commitProvincePops(state.selProvince);
  state.selProvince=null;state.selRealm=null;state.selReligion=null;state.selWater=null;state.selLabel=null;state.selForce=null;state.selBattle=null;state.selMonster=null;state.selResource=null;state.selRaceGroup=null;state.legendFilter=null;
  if(state.terrainSel)state.terrainSel.clear();
  state.selRegion=null;
  document.body.classList.remove("has-sel");
  updateResSpot();
  hideTechPanel();renderMap();renderLegend();renderWonderPanel();
}
function selectForce(id){
  state.selForce=id;state.selBattle=null;state.selMonster=null;state.selProvince=null;state.selRealm=null;state.selReligion=null;state.selWater=null;state.selLabel=null;
  document.body.classList.add("has-sel");
  hideTechPanel();renderMap();renderForceEditor();renderLegend();renderWonderPanel();
}
function selectBattle(aId,bId){
  state.selBattle=[aId,bId];state.selForce=null;state.selMonster=null;state.moveMode=null;state.selProvince=null;state.selRealm=null;state.selReligion=null;state.selWater=null;state.selLabel=null;
  document.body.classList.add("has-sel");
  renderMap();renderBattleView();renderWonderPanel();
}
function selectMonster(id){
  state.selMonster=id;state.selForce=null;state.selBattle=null;state.selProvince=null;state.selRealm=null;state.selReligion=null;state.selWater=null;state.selLabel=null;
  document.body.classList.add("has-sel");
  hideTechPanel();renderMap();renderMonsterEditor();renderLegend();renderWonderPanel();
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
// ===== Wonders: box panel (floating on desktop, inline in the sheet on mobile) =====
function wonderHolyIconsHTML(w){
  return wonderReligions(w).map(rel=>{ const sym=religionMeta(rel).symbol;
    return `<button class="wpHoly" data-rel="${esc(rel)}" title="Holy site of ${esc(rel)} — open faith">${sym?`<img src="${esc(sym)}" alt=""/>`:"☀"}</button>`;
  }).join("");
}
function wonderCardHTML(w){
  const banner=w.image?`<div class="wpBanner"><img src="${esc(w.image)}" alt="${esc(w.name)}"/></div>`:"";
  return `<div class="wpCard">
    <div class="wpHead"><span class="wpHolies">${wonderHolyIconsHTML(w)}</span><span class="wpName">${esc(w.name)}</span></div>
    ${banner}
    ${w.description?`<div class="wpDesc">${esc(w.description).replace(/\n/g,"<br>")}</div>`:""}
  </div>`;
}
function renderWonderPanel(){
  const mobile=document.body.classList.contains("mobile");
  const prevInline=document.getElementById("wonderInline"); if(prevInline)prevInline.remove();
  let wp=document.getElementById("wonderPanel");
  const p = (VIEWER && state.selProvince) ? world.provinces.find(x=>x.id===state.selProvince) : null;
  const list = p ? wondersOf(p.id) : [];
  if(!list.length){ if(wp)wp.remove(); const nav=document.getElementById("wonderNav"); if(nav)nav.remove(); return; }
  const cards=list.map(wonderCardHTML).join("");
  if(mobile){                                     // mobile: render inline at the bottom of the province sheet
    if(wp)wp.remove(); const nav=document.getElementById("wonderNav"); if(nav)nav.remove();
    const ins=$("#inspector"); if(!ins)return;
    const box=document.createElement("div"); box.id="wonderInline"; box.className="wonderInline"; box.innerHTML=cards;
    ins.appendChild(box);
    box.querySelectorAll(".wpHoly").forEach(b=>b.onclick=()=>selectReligion(b.dataset.rel));
    return;
  }
  if(!wp){ wp=document.createElement("div"); wp.id="wonderPanel"; ($("#stage")||document.body).appendChild(wp); }
  wp.innerHTML=`<div class="wpScroll">${cards}</div>`;
  wp.querySelectorAll(".wpHoly").forEach(b=>b.onclick=()=>selectReligion(b.dataset.rel));
  renderWonderNav(list.length);
  positionWonderPanel();
}
// left-side numbered jump buttons (only when a province holds several wonders)
function renderWonderNav(n){
  let nav=document.getElementById("wonderNav");
  if(!n || n<2){ if(nav)nav.remove(); return; }
  if(!nav){ nav=document.createElement("div"); nav.id="wonderNav"; ($("#stage")||document.body).appendChild(nav); }
  nav.innerHTML="";
  for(let i=0;i<n;i++){ const b=document.createElement("button"); b.className="wnDot"+(i===0?" active":""); b.textContent=(i+1);
    b.title="Jump to wonder "+(i+1); b.onclick=()=>scrollToWonder(i); nav.appendChild(b); }
  // keep the active dot in sync as the box is scrolled
  const wp=document.getElementById("wonderPanel"), sc=wp&&wp.querySelector(".wpScroll");
  if(sc)sc.onscroll=()=>{ const cards=wp.querySelectorAll(".wpCard"); let act=0;
    cards.forEach((c,k)=>{ if(c.offsetTop - sc.scrollTop <= 12) act=k; });
    nav.querySelectorAll(".wnDot").forEach((d,k)=>d.classList.toggle("active",k===act)); };
}
function scrollToWonder(i){
  const wp=document.getElementById("wonderPanel"); if(!wp)return;
  const sc=wp.querySelector(".wpScroll"), cards=wp.querySelectorAll(".wpCard");
  if(!sc||!cards[i])return;
  sc.scrollTo({top:cards[i].offsetTop, behavior:"smooth"});
  const nav=document.getElementById("wonderNav");
  if(nav)nav.querySelectorAll(".wnDot").forEach((d,k)=>d.classList.toggle("active",k===i));
}
function positionWonderPanel(){
  const wp=document.getElementById("wonderPanel"), right=$("#right"), stage=$("#stage");
  if(!wp||!right||!stage)return;
  if(document.body.classList.contains("mobile")){ wp.style.right="8px"; wp.style.left="8px"; wp.style.top="auto"; wp.style.bottom="calc(50vh + 6px)"; positionWonderNav(); return; }
  const r=right.getBoundingClientRect(), s=stage.getBoundingClientRect();
  wp.style.left="auto"; wp.style.top="auto";
  wp.style.right=Math.max(8,(s.right - r.left + 10))+"px";
  wp.style.bottom=Math.max(8,(s.bottom - r.bottom))+"px";
  positionWonderNav();
}
function positionWonderNav(){
  const nav=document.getElementById("wonderNav"), wp=document.getElementById("wonderPanel"), stage=$("#stage");
  if(!nav||!wp||!stage)return;
  const w=wp.getBoundingClientRect(), s=stage.getBoundingClientRect();
  nav.style.bottom="auto";
  if(document.body.classList.contains("mobile")){ nav.style.right="auto"; nav.style.left="6px"; nav.style.top=Math.max(6,(w.top - s.top + 4))+"px"; return; }
  nav.style.left="auto";
  nav.style.right=Math.max(8,(s.right - w.left + 8))+"px";   // just to the left of the wonder box
  nav.style.top=Math.max(6,(w.top - s.top))+"px";            // aligned near the top of the box
}
// ===== Religion info panel (like realms) =====
function renderReligionEditor(){
  if(VIEWER)return renderReligionView();
  const ins=$("#inspector"); const name=state.selReligion;
  if(!name){ins.innerHTML='<div class="empty">No religion selected.</div>';return;}
  const meta=religionMeta(name), col=catColor("religions",name);
  const holyW=holyWondersOf(name);
  const provName=w=>{const p=world.provinces.find(x=>x.id===w.provinceId);return p?p.name:"unplaced";};
  const cand=(world.wonders||[]).filter(w=>!(w.holySite&&(w.religions||[]).includes(name)));
  ins.innerHTML=`
    <div class="insTitle"><span class="rvDot" style="background:${col};width:16px;height:16px"></span><b style="flex:1;font-size:17px">${esc(name)}</b></div>
    ${meta.symbol?`<div class="relSymbol"><img src="${esc(meta.symbol)}" alt=""/></div>`:""}
    <div class="field"><label>Symbol image ${RELIGION_IMAGES.length?"":'<span class="note">(drop files into static/img/religions/)</span>'}</label>
      <div style="display:flex;gap:6px"><select id="relSymPick" style="flex:1">${imagePickerOptions(RELIGION_IMAGES, meta.symbol)}</select><button class="btn tiny" id="relRescan" title="Rescan the image folder">🔄</button></div></div>
    <div class="field"><label>Description <span class="note">(shown in the viewer)</span></label><textarea id="relDesc" rows="4">${esc(meta.description||"")}</textarea></div>
    <div class="sectionH">Holy wonders (${holyW.length})</div>
    <div class="list" id="relHolyList">${holyW.length?holyW.map(w=>`<div class="li" style="display:flex;align-items:center"><span style="flex:1">🏛️ ${esc(w.name)} <span class="note">— ${esc(provName(w))}</span></span><button class="btn tiny hwRemove" data-wid="${w.id}" title="Remove as holy site">✕</button></div>`).join(""):'<div class="note">None yet.</div>'}</div>
    <div class="field"><label>Add a holy wonder</label>
      <select id="relAddHoly"><option value="">— pick from existing wonders —</option>${cand.map(w=>`<option value="${w.id}">${esc(w.name)} (${esc(provName(w))})</option>`).join("")}</select></div>
    <div class="note">Wonders are created inside a province's editor. Marking one here flags it as a holy site of ${esc(name)}.</div>`;
  $("#relSymPick").addEventListener("change",e=>{meta.symbol=e.target.value;markDirty();renderReligionEditor();renderMap();renderWonderPanel();});
  { const rr=$("#relRescan"); if(rr)rr.onclick=async()=>{ await loadExtraImages(); renderReligionEditor(); flash(RELIGION_IMAGES.length+" image(s) in static/img/religions/."); }; }
  $("#relDesc").addEventListener("input",e=>{meta.description=e.target.value;markDirty();});
  ins.querySelectorAll(".hwRemove").forEach(b=>b.onclick=()=>{ const w=(world.wonders||[]).find(x=>x.id===b.dataset.wid); if(w){ beginEdit(); const i=(w.religions||[]).indexOf(name); if(i>=0)w.religions.splice(i,1); if(!(w.religions||[]).length)w.holySite=false; markDirty(); renderReligionEditor(); renderMap(); } });
  $("#relAddHoly").addEventListener("change",e=>{ const w=(world.wonders||[]).find(x=>x.id===e.target.value); if(w){ beginEdit(); w.holySite=true; w.religions=w.religions||[]; if(!w.religions.includes(name))w.religions.push(name); markDirty(); renderReligionEditor(); renderMap(); } });
}
function renderReligionView(){
  const ins=$("#inspector"); const name=state.selReligion;
  if(!name){ins.innerHTML='<div class="empty">No religion selected.</div>';return;}
  const meta=religionMeta(name), col=catColor("religions",name);
  const holyW=holyWondersOf(name), holyP=holySiteProvincesOf(name);
  ins.innerHTML=`
    <div class="realmCard" style="--rc:${col}">
      <div class="relHead"><span class="rvDot" style="background:${col};width:16px;height:16px"></span><span class="realmName">${esc(name)}</span></div>
      ${meta.symbol?`<div class="relSymbol"><img src="${esc(meta.symbol)}" alt=""/></div>`:""}
      ${meta.description?`<div class="rvBlock rvDesc">${esc(meta.description).replace(/\n/g,"<br>")}</div>`:""}
      <div class="sectionH">Holy sites (${holyP.length})</div>
      <div class="list">${holyP.length?holyP.map(p=>`<div class="li pvp" data-pid="${p.id}" style="cursor:pointer">⛪ ${esc(p.name)}</div>`).join(""):'<div class="note">None</div>'}</div>
      <div class="sectionH">Holy wonders (${holyW.length})</div>
      <div class="list">${holyW.length?holyW.map(w=>`<div class="li hwlink" data-wid="${w.id}" style="cursor:pointer">🏛️ ${esc(w.name)}</div>`).join(""):'<div class="note">None</div>'}</div>
    </div>`;
  ins.querySelectorAll(".pvp").forEach(el=>el.onclick=()=>{ const p=world.provinces.find(x=>x.id===el.dataset.pid); if(p){zoomToProvince(p);selectProvince(p.id);} });
  ins.querySelectorAll(".hwlink").forEach(el=>el.onclick=()=>{ const w=(world.wonders||[]).find(x=>x.id===el.dataset.wid); if(w&&w.provinceId){ const p=world.provinces.find(x=>x.id===w.provinceId); if(p){zoomToProvince(p);selectProvince(p.id);} } });
}

/* ============================================================
   MILITARY — force editor & battle framework (GURPS Mass Combat)
   ============================================================ */
// Read-only army view (site + mobile viewer): everything as plain text, no controls.
function renderForceView(){
  const ins=$("#inspector"); const f=world.forces.find(x=>x.id===state.selForce);
  if(!f){ins.innerHTML='<div class="empty">No force selected.</div>';return;}
  const r=world.realms.find(x=>x.id===f.realmId), dom=(FORCE_DOMAINS[f.domain]||FORCE_DOMAINS.land);
  const row=(l,v)=>`<div class="rvRow"><span class="rvLbl">${l}</span><span class="rvVal">${(v===0||v)?v:"—"}</span></div>`;
  const pct=m=>(m>=0?"+":"")+Math.round((m||0)*100)+"%";
  const els=(f.elements||[]).map((e,i)=>{
    const mult=elementMult(e), each=round2((+e.ts||0)*mult), eachP=round2((+e.pts||0)*mult);
    const tsCell = mult!==1 ? `${e.ts||0} → <b>${each}</b>` : `${e.ts||0}`;
    const ptsCell = mult!==1 ? `${e.pts||0} → ${eachP}` : `${e.pts||0}`;
    const feats=(e.features||[]).length?e.features.map(x=>`<span class="tag">${esc(x)}</span>`).join(" "):"—";
    const style=e.color?` style="border-color:${e.color};box-shadow:inset 5px 0 0 ${e.color}"`:"";
    return `<div class="elRow${e.embroidery?' embroidered':''}"${style}>
      ${e.embroidery?`<span class="elEmblem">${esc(e.embroidery)}</span>`:""}
      <div class="elViewName">${esc(e.name||("Element "+(i+1)))}${elCount(e)>1?` <span class="note">×${elCount(e)}</span>`:""}</div>
      ${row("Class",esc(e.cls))}
      ${row("Mobility",esc(e.mob))}
      ${row("TS "+(mult!==1?"<span class='note'>(each→modified)</span>":"<span class='note'>(each)</span>"),tsCell)}
      ${e.pts>0?row("(TS) <span class='note'>(each)</span>",ptsCell):""}
      ${row("WT <span class='note'>(each)</span>",e.wt||0)}
      ${row("TL",e.tl||0)}
      ${row("Equipment",esc(e.equip)+` <span class="note">(${pct(EQUIP_QUALITY[e.equip])})</span>`)}
      ${row("Troops",esc(e.troop)+` <span class="note">(${pct(TROOP_QUALITY[e.troop])})</span>`)}
      ${row("Features",feats)}
      <div class="elTally">${elTallyHTML(e)}</div>
    </div>`;
  }).join("");
  const leaderRow=(l,c,skillLbls)=> row(l, (c&&c.name)? `${esc(c.name)} <span class="note">(${skillLbls})</span>` : "—");
  ins.innerHTML=`
    <div class="realmCard" style="--rc:${r?r.color:'#5a6172'}">
      <div class="realmName" style="font-size:19px">${dom.icon} ${esc(f.name)}</div>
      <div class="rvSub">${esc(dom.label)}${r?` · ${esc(r.name)}`:" · Independent"}</div>
      <div class="rvBlock rvGov">
        ${row("Total TS", forceTS(f))}
        ${forcePTS(f)>0?row("Total (TS)", forcePTS(f)):""}
      </div>
      ${f.description?`<div class="rvBlock rvDesc">${esc(f.description).replace(/\n/g,"<br>")}</div>`:""}
      <div class="sectionH">Elements (${(f.elements||[]).length})</div>
      ${els||'<div class="note">None</div>'}
      <div class="sectionH">Command</div>
      <div class="rvBlock rvSociety">
        ${(function(){ const ch=f.commanderCharId?characterById(f.commanderCharId):null; const stats=f.commander?`Strategy ${f.commander.strategy}, Leadership ${f.commander.leadership}`:"";
          return ch ? row("Commander", `${compChip("character",ch.id,{label:ch.name,color:ch.color})} <span class="note">(${stats})</span>`) : leaderRow("Commander", f.commander, stats); })()}
        ${leaderRow("Intelligence Chief", f.intel, f.intel?`Intelligence Analysis ${f.intel.skill}`:"")}
        ${leaderRow("Quartermaster", f.quartermaster, f.quartermaster?`Administration ${f.quartermaster.skill}`:"")}
      </div>
    </div>`;
  ins.querySelectorAll(".compChip").forEach(el=>el.onclick=()=>openCompendium(el.dataset.cat, el.dataset.val));
}
function renderForceEditor(){
  if(VIEWER)return renderForceView();
  const ins=$("#inspector"); const f=world.forces.find(x=>x.id===state.selForce);
  if(!f){ins.innerHTML='<div class="empty">No force selected.</div>';return;}
  const ro=VIEWER;
  const realmOpts=`<option value="">— Independent —</option>`+world.realms.map(r=>`<option value="${r.id}" ${f.realmId===r.id?"selected":""}>${esc(r.name)}</option>`).join("");
  const domOpts=Object.entries(FORCE_DOMAINS).map(([k,v])=>`<option value="${k}" ${f.domain===k?"selected":""}>${v.icon} ${esc(v.label)}</option>`).join("");
  const els=(f.elements||[]).map((e,i)=>`
    <div class="elRow" data-i="${i}">
      ${ro?"":`<div class="elRowHead"><button class="btn tiny elDel" title="Remove element">✕</button></div>`}
      ${elementFieldGrid(e, ro, true)}
    </div>`).join("");
  ins.innerHTML=`
    <div class="insTitle"><input id="fname" value="${esc(f.name)}" ${ro?"disabled":""}/></div>
    <div class="field2">
      <div class="field"><label>Type</label><select id="fdom" ${ro?"disabled":""}>${domOpts}</select></div>
      <div class="field"><label>Allegiance</label><select id="frealm" ${ro?"disabled":""}>${realmOpts}</select></div>
    </div>
    <div class="note">Total Troop Strength (TS): <b id="fts">${forceTS(f)}</b>${forcePTS(f)>0?` · parenthetical (TS): <b>${forcePTS(f)}</b>`:""}</div>
    <div class="field"><label>Description <span class="note">(shown in the viewer below Total TS)</span></label><textarea id="fdesc" rows="3" placeholder="Notes about this force…">${esc(f.description||"")}</textarea></div>
    ${ro?"":`<div class="btnrow"><button class="btn${state.moveMode==="force"&&state.selForce===f.id?" primary":""}" id="fmove">✥ ${state.moveMode==="force"&&state.selForce===f.id?"Moving… (click to stop)":"Move"}</button><button class="btn danger" id="fdel">Delete</button></div>
    <div class="field"><label>Token size — <b id="fscv">${(f.scale||1).toFixed(1)}×</b></label><input id="fscale" type="range" min="0.6" max="3" step="0.1" value="${f.scale||1}"/></div>`}

    <div class="sectionH">Elements</div>
    <div class="note">Each element is a body of troops with a Troop Strength (TS), Class, Weight (WT), Mobility (Mob) and Tech Level (TL).</div>
    <div id="fels">${els}</div>
    ${ro?"":`<button class="btn tiny" id="feladd" style="margin-top:6px">＋ Add element</button>`}

    ${ro?"":`<div class="sectionH">Organise</div>
    <div class="field2">
      <div class="field"><label>Merge another force into this</label><select id="fmergesel"></select></div>
      <div style="flex:0 0 auto;display:flex;align-items:flex-end"><button class="btn" id="fmergebtn">⇔ Merge</button></div>
    </div>
    <div class="note">Merging keeps the stronger Commander (by Strategy + Leadership) and the higher-skilled Intelligence Chief &amp; Quartermaster; all elements combine.</div>
    <div class="btnrow" style="margin-top:6px"><button class="btn" id="fsplitbtn">✂ Split off a detachment</button></div>
    <div class="note">Split moves half the elements into a new force placed alongside. Leaders stay with this force; the detachment starts without a commander until you assign one.</div>`}

    <div class="sectionH">Commander (optional)</div>
    <div class="field"><label>Character <span class="note">(from the Compendium — a ruler can also command)</span></label>
      <select id="fcchar" ${ro?"disabled":""}><option value="">— none / custom name —</option>${allCharacters().map(c=>`<option value="${c.id}" ${f.commanderCharId===c.id?"selected":""}>${esc(c.name)}${c.isRuler?" 👑":""}</option>`).join("")}<option value="__new">＋ New character…</option></select></div>
    <div class="field"><label>Name ${f.commanderCharId?'<span class="note">(from character)</span>':""}</label><input id="fcname" value="${esc(f.commanderCharId?charName(f.commanderCharId):(f.commander?.name||""))}" placeholder="—" ${(ro||f.commanderCharId)?"disabled":""}/></div>
    <div class="field2">
      <div class="field"><label>Strategy</label><input id="fcstr" type="number" value="${f.commander?.strategy??12}" ${ro?"disabled":""}/></div>
      <div class="field"><label>Leadership</label><input id="fclead" type="number" value="${f.commander?.leadership??12}" ${ro?"disabled":""}/></div>
    </div>

    <div class="sectionH">Staff (optional)</div>
    <div class="field2">
      <div class="field"><label>Intelligence Chief</label><input id="finame" value="${esc(f.intel?.name||"")}" placeholder="—" ${ro?"disabled":""}/></div>
      <div class="field" style="flex:0 0 90px"><label>Intel. Analysis</label><input id="fiskill" type="number" value="${f.intel?.skill??12}" ${ro?"disabled":""}/></div>
    </div>
    <div class="field2">
      <div class="field"><label>Quartermaster</label><input id="fqname" value="${esc(f.quartermaster?.name||"")}" placeholder="—" ${ro?"disabled":""}/></div>
      <div class="field" style="flex:0 0 90px"><label>Administration</label><input id="fqskill" type="number" value="${f.quartermaster?.skill??12}" ${ro?"disabled":""}/></div>
    </div>`;
  // colour accent + elite emblem on every element block (editor and read-only viewer)
  const felsBox=$("#fels"); if(felsBox)felsBox.querySelectorAll(".elRow").forEach(row=>{ const e=f.elements[+row.dataset.i]; if(e)applyElStyle(row,e); });
  if(ro)return;
  const upd=()=>{ $("#fts").textContent=forceTS(f); renderMap(); markDirty(); };
  $("#fname").addEventListener("input",e=>{f.name=e.target.value;renderMap();markDirty();});
  $("#fdom").addEventListener("change",e=>{f.domain=e.target.value;renderMap();markDirty();});
  $("#frealm").addEventListener("change",e=>{f.realmId=e.target.value||null;renderMap();markDirty();});
  { const fd=$("#fdesc"); if(fd)fd.addEventListener("input",e=>{f.description=e.target.value;markDirty();}); }
  $("#fmove").addEventListener("click",()=>{ if(state.moveMode==="force"){ state.moveMode=null; } else { state.moveMode="force"; flash("Move mode on — click the map to relocate “"+f.name+"”. Click Move again (or Esc) to stop."); } renderMap(); renderForceEditor(); });
  { const sc=$("#fscale"); if(sc)sc.addEventListener("input",e=>{ f.scale=+e.target.value; $("#fscv").textContent=(+e.target.value).toFixed(1)+"×"; renderMap(); markDirty(); }); }
  $("#fdel").addEventListener("click",()=>{ if(!confirm("Delete this force?"))return; beginEdit(); world.forces=world.forces.filter(x=>x.id!==f.id); state.selForce=null; state.moveMode=null; clearSelection(); ins.innerHTML='<div class="empty">Force deleted.</div>'; markDirty(); });
  f.commander=f.commander||{name:"",strategy:12,leadership:12};
  f.intel=f.intel||{name:"",skill:12}; f.quartermaster=f.quartermaster||{name:"",skill:12};
  { const cc=$("#fcchar"); if(cc)cc.onchange=()=>{
      const v=cc.value;
      if(v==="__new"){ const name=(prompt("New character name:")||"").trim(); if(name){ const ch=newCharacter({name,tags:["Commander"]}); allCharacters().push(ch); f.commanderCharId=ch.id; f.commander.name=ch.name; } markDirty(); renderForceEditor(); return; }
      f.commanderCharId=v||"";
      if(v){ const ch=characterById(v); if(ch){ f.commander.name=ch.name; if(!charHasTag(ch,"Commander")&&(world&&_compendium&&_compendium.charTags.includes("Commander")))ch.tags.push("Commander"); } }
      markDirty(); renderForceEditor();
    }; }
  { const fn=$("#fcname"); if(fn)fn.addEventListener("input",e=>{ if(f.commanderCharId)return; f.commander.name=e.target.value;markDirty();}); }
  $("#fcstr").addEventListener("input",e=>{f.commander.strategy=+e.target.value||0;markDirty();});
  $("#fclead").addEventListener("input",e=>{f.commander.leadership=+e.target.value||0;markDirty();});
  $("#finame").addEventListener("input",e=>{f.intel.name=e.target.value;markDirty();});
  $("#fiskill").addEventListener("input",e=>{f.intel.skill=+e.target.value||0;markDirty();});
  $("#fqname").addEventListener("input",e=>{f.quartermaster.name=e.target.value;markDirty();});
  $("#fqskill").addEventListener("input",e=>{f.quartermaster.skill=+e.target.value||0;markDirty();});
  $("#fels").querySelectorAll(".elRow").forEach(row=>{
    const i=+row.dataset.i, e=f.elements[i]; if(!e)return;
    { const et=row.querySelector(".elType"); if(et)et.addEventListener("change",ev=>{ const t=(world.elementTypes||[]).find(x=>x.id===ev.target.value); if(t){ const keepName = e.name && !(world.elementTypes||[]).some(x=>x.name===e.name); Object.assign(e,{type:t.name,name:keepName?e.name:t.name,cls:t.cls,ts:+t.ts||0,pts:+t.pts||0,wt:+t.wt||0,mob:t.mob,tl:+t.tl||0,features:(t.features||[]).slice(),equip:t.equip,troop:t.troop}); renderForceEditor(); renderMap(); markDirty(); } }); }
    bindElementFields(row, e, ()=>renderForceEditor(), ()=>{ const b=$("#fts"); if(b)b.textContent=forceTS(f); renderMap(); });
    const del=row.querySelector(".elDel"); if(del)del.addEventListener("click",()=>{ if(f.elements.length<=1){flash("A force needs at least one element.");return;} beginEdit(); f.elements.splice(i,1); renderForceEditor(); renderMap(); markDirty(); });
  });
  $("#feladd").addEventListener("click",()=>{ beginEdit(); f.elements.push(newElement()); renderForceEditor(); renderMap(); markDirty(); });
  // merge / split
  { const sel=$("#fmergesel"); const others=world.forces.filter(x=>x.id!==f.id);
    if(sel){ sel.innerHTML = others.length? others.map(o=>`<option value="${o.id}">${esc(o.name)} (TS ${forceTS(o)}${o.domain!==f.domain?", "+(FORCE_DOMAINS[o.domain]||FORCE_DOMAINS.land).label:""})</option>`).join("") : `<option value="">— no other forces —</option>`; }
    const mb=$("#fmergebtn"); if(mb)mb.addEventListener("click",()=>{ const oid=sel&&sel.value; const o=oid&&world.forces.find(x=>x.id===oid); if(!o){flash("No other force to merge.");return;} if(!confirm(`Merge “${o.name}” into “${f.name}”? “${o.name}” will be removed.`))return; mergeForces(f,o); });
    const sb=$("#fsplitbtn"); if(sb)sb.addEventListener("click",()=>{ splitForce(f); });
  }
}
function leaderScore(c){ return (c&&c.name?1000:0)+((c&&c.strategy)||0)+((c&&c.leadership)||0); }
function mergeForces(target,src){
  beginEdit();
  const before=(target.elements||[]).length, add=(src.elements||[]).length;
  target.elements=(target.elements||[]).concat(src.elements||[]);   // keep every element from both — no override/dedup
  // keep the stronger commander; higher-skilled intel & quartermaster
  if(leaderScore(src.commander)>leaderScore(target.commander)) target.commander={...src.commander};
  if(((src.intel&&src.intel.skill)||0)+((src.intel&&src.intel.name)?100:0) > ((target.intel&&target.intel.skill)||0)+((target.intel&&target.intel.name)?100:0)) target.intel={...src.intel};
  if(((src.quartermaster&&src.quartermaster.skill)||0)+((src.quartermaster&&src.quartermaster.name)?100:0) > ((target.quartermaster&&target.quartermaster.skill)||0)+((target.quartermaster&&target.quartermaster.name)?100:0)) target.quartermaster={...src.quartermaster};
  world.forces=world.forces.filter(x=>x.id!==src.id);
  markDirty(); selectForce(target.id); renderLegend(); flash(`Merged — “${target.name}” now has all ${before+add} elements.`);
}
function splitForce(f){
  if((f.elements||[]).length<2){ flash("Need at least 2 elements to split off a detachment."); return; }
  const rows=f.elements.map((e,i)=>`<label class="splitRow"><input type="checkbox" data-i="${i}"/>
    <span class="splitName">${esc(e.name||("Element "+(i+1)))}</span>
    <span class="note">${esc(e.cls)} · ${elCount(e)}× · TS ${elementTS(e)}</span></label>`).join("");
  openModal(`<button class="btn close" onclick="closeModal()">✕ Close</button><h2>✂ Split “${esc(f.name)}”</h2>
    <p class="note">Tick the elements to move into a new detachment; unticked ones stay with “${esc(f.name)}”. Every element is preserved — none are lost or merged. Leaders stay with the parent force.</p>
    <div class="field"><label>New detachment name</label><input id="splitName" value="${esc(f.name+" (detachment)")}"/></div>
    <div id="splitList">${rows}</div>
    <div class="btnrow" style="margin-top:8px"><button class="btn primary" id="splitGo">✂ Split off selected</button></div>`);
  $("#splitGo").onclick=()=>{
    const idxs=[...$("#splitList").querySelectorAll("input:checked")].map(c=>+c.dataset.i);
    if(!idxs.length){ flash("Tick at least one element to split off."); return; }
    if(idxs.length>=f.elements.length){ flash("Leave at least one element with the parent force."); return; }
    beginEdit();
    const moved=[];
    idxs.sort((a,b)=>b-a).forEach(i=>{ moved.unshift(f.elements.splice(i,1)[0]); });   // descending so indices stay valid
    const det=newForce(f.x+18, f.y+18, f.realmId);
    det.name=($("#splitName").value.trim())||(f.name+" (detachment)");
    det.domain=f.domain; det.scale=f.scale||1; det.elements=moved;
    world.forces.push(det); separateForce(det);
    closeModal(); markDirty(); selectForce(det.id); renderLegend(); flash("Detachment “"+det.name+"” split off from “"+f.name+"”.");
  };
}
// Pre-rolled GURPS Mass Combat battle summary (framework — no logistics).
function monsterIconHTML(m,cls){ return isImgIcon(m.icon)?`<img class="${cls||''}" src="${esc(m.icon)}"/>`:`<span class="${cls||''} monEmoji">${esc(m.icon||"🐉")}</span>`; }
function renderMonsterEditor(){
  const ins=$("#inspector"); const m=world.monsters.find(x=>x.id===state.selMonster);
  if(!m){ins.innerHTML='<div class="empty">No creature selected.</div>';return;}
  const ct=creatureType(m.creatureType), ctcol=ct?ct.color:"#7a3b3b", ctname=ct?ct.name:"";
  if(VIEWER){        // viewer: name, icon, creature type, description only — panel coloured by creature type
    ins.innerHTML=`
      <div class="monCard" style="--ct:${ctcol}">
        <div class="monCardHead">
          <span class="monFrame" style="border-color:${ctcol}">${monsterIconHTML(m,"monBigIcon")}</span>
          <div class="monHeadText"><div class="monName">${esc(m.name||"(unnamed)")}</div>${ctname?`<div class="monType" style="color:${ctcol}">${esc(ctname)}</div>`:""}</div>
        </div>
        ${m.description?`<div class="monDesc">${esc(m.description)}</div>`:'<div class="note">No description.</div>'}
      </div>`;
    return;
  }
  const presetOpts=`<option value="">— pick a preset —</option>`+world.monsterPresets.map(pr=>`<option value="${pr.id}">${esc(pr.name||"(unnamed)")}</option>`).join("");
  const typeOpts=`<option value="">— none —</option>`+world.creatureTypes.map(t=>`<option value="${t.id}" ${m.creatureType===t.id?"selected":""}>${esc(t.name)}</option>`).join("");
  ins.innerHTML=`
    <div class="insTitle" style="border-bottom:3px solid ${ctcol};padding-bottom:4px"><input id="mname" value="${esc(m.name||"")}" placeholder="Creature name"/></div>
    <div class="field2">
      <div class="field"><label>Load from preset</label><select id="mpreset">${presetOpts}</select></div>
      <div class="field"><label>Creature type</label><select id="mtype">${typeOpts}</select></div>
    </div>
    <div class="field2">
      <div class="field"><label>Icon <span class="note">(emoji or image)</span></label><input id="mico" value="${esc(m.icon||"")}" placeholder="🐉 or img/monsters/…"/></div>
      <div class="field"><label>Size — <b id="mscv">${(m.scale||0.6).toFixed(1)}×</b></label><input id="mscale" type="range" min="0.3" max="4" step="0.1" value="${m.scale||0.6}"/></div>
    </div>
    <div class="field"><label>Images <span class="note">(from img/monsters/)</span></label><div class="monImgRow">${MONSTER_IMAGES.map(mi=>`<button class="monImgBtn${m.icon===mi.src?' sel':''}" data-src="${esc(mi.src)}" title="${esc(mi.name)}"><img src="${esc(mi.src)}"/></button>`).join("")}</div></div>
    <div class="field"><label>Description</label><textarea id="mdesc" rows="4" placeholder="What is this creature?">${esc(m.description||"")}</textarea></div>
    <div class="btnrow"><button class="btn${state.moveMode==="monster"?" primary":""}" id="mmove">✥ ${state.moveMode==="monster"?"Moving… (click to stop)":"Move"}</button><button class="btn danger" id="mdel">Delete</button></div>`;
  $("#mname").addEventListener("input",e=>{m.name=e.target.value;renderMap();renderLegend();markDirty();});
  $("#mtype").addEventListener("change",e=>{m.creatureType=e.target.value;renderMap();renderLegend();renderMonsterEditor();markDirty();});
  $("#mico").addEventListener("input",e=>{m.icon=e.target.value;renderMap();renderLegend();markDirty();});
  $("#mdesc").addEventListener("input",e=>{m.description=e.target.value;renderLegend();markDirty();});
  ins.querySelectorAll(".monImgBtn").forEach(b=>b.addEventListener("click",()=>{ m.icon=b.dataset.src; renderMap();renderLegend();renderMonsterEditor();markDirty(); }));
  $("#mscale").addEventListener("input",e=>{m.scale=+e.target.value;$("#mscv").textContent=(+e.target.value).toFixed(1)+"×";renderMap();markDirty();});
  $("#mpreset").addEventListener("change",e=>{ const pr=world.monsterPresets.find(x=>x.id===e.target.value); if(!pr)return;
    beginEdit(); m.name=pr.name||m.name; m.icon=pr.icon||m.icon; m.description=pr.description||""; m.creatureType=pr.creatureType||"";
    renderMap();renderLegend();renderMonsterEditor();markDirty(); flash("Loaded preset “"+(pr.name||"")+"” — edit freely for this creature."); });
  $("#mmove").addEventListener("click",()=>{ if(state.moveMode==="monster"){ state.moveMode=null; } else { state.moveMode="monster"; flash("Move mode on — click the map to relocate “"+(m.name||"creature")+"”. Click Move again (or Esc) to stop."); } renderMap(); renderMonsterEditor(); });
  $("#mdel").addEventListener("click",()=>{ if(!confirm("Delete this creature?"))return; beginEdit(); world.monsters=world.monsters.filter(x=>x.id!==m.id); state.selMonster=null; state.moveMode=null; clearSelection(); ins.innerHTML='<div class="empty">Creature deleted.</div>'; markDirty(); });
}
function battleSummary(a,b){
  const tsa=forceTS(a), tsb=forceTS(b);
  const stratA=a.commander?.strategy||10, stratB=b.commander?.strategy||10;
  const rA=roll3d6(), rB=roll3d6();
  // strategy contest margin (skill − roll); higher wins the pre-battle maneuver
  const marA=stratA-rA, marB=stratB-rB;
  const manoeuvre = marA===marB ? "Even" : (marA>marB? a.name : b.name);
  // effective TS after a small strategy edge (±10% per margin step, capped)
  const edge=Math.max(-3,Math.min(3,marA-marB));
  const effA=Math.round(tsa*(1+0.10*Math.max(0,edge))), effB=Math.round(tsb*(1+0.10*Math.max(0,-edge)));
  const ratio = effB? (effA/effB) : 99;
  let victor, vlabel;
  if(ratio>=2){victor=a.name;vlabel="Decisive";}
  else if(ratio>=1.25){victor=a.name;vlabel="Clear";}
  else if(ratio>1/1.25){victor="—";vlabel="Indecisive";}
  else if(ratio>1/2){victor=b.name;vlabel="Clear";}
  else {victor=b.name;vlabel="Decisive";}
  // casualty fractions scale with how lopsided the fight is (framework placeholder)
  const base=0.10, lose=Math.min(0.6, base + Math.abs(Math.log(ratio))*0.18);
  const win=Math.max(0.03, base - Math.abs(Math.log(ratio))*0.05);
  const aLoss = victor===a.name?win:(victor===b.name?lose:base);
  const bLoss = victor===b.name?win:(victor===a.name?lose:base);
  return {tsa,tsb,rA,rB,stratA,stratB,manoeuvre,effA,effB,ratio,victor,vlabel,
          aCas:Math.round(tsa*aLoss),bCas:Math.round(tsb*bLoss)};
}
function renderBattleView(){
  const ins=$("#inspector"); if(!state.selBattle){ins.innerHTML='<div class="empty">No battle.</div>';return;}
  const a=world.forces.find(x=>x.id===state.selBattle[0]), b=world.forces.find(x=>x.id===state.selBattle[1]);
  if(!a||!b){ins.innerHTML='<div class="empty">Battle resolved — forces moved apart.</div>';state.selBattle=null;return;}
  const s=state.battleRoll&&state.battleRoll.key===a.id+b.id? state.battleRoll.data : (state.battleRoll={key:a.id+b.id,data:battleSummary(a,b)}).data;
  const side=(f,cas,eff)=>`<div class="bside">
      <div class="bname">${esc(f.name)}</div>
      <div class="note">${(FORCE_DOMAINS[f.domain]||FORCE_DOMAINS.land).label} · TS ${forceTS(f)}${f.commander?.name?` · Cmdr ${esc(f.commander.name)}`:""}</div>
      <div class="brow2"><span>Strategy roll</span><b>${f===a?s.stratA+" vs 3d6="+s.rA:s.stratB+" vs 3d6="+s.rB}</b></div>
      <div class="brow2"><span>Effective TS</span><b>${eff}</b></div>
      <div class="brow2"><span>Est. casualties</span><b>${cas.toLocaleString()} TS</b></div>
    </div>`;
  ins.innerHTML=`
    <div class="insTitle" style="display:flex;align-items:center;gap:8px">💥 Battle</div>
    <div class="note">Pre-rolled GURPS Mass Combat summary (framework — no logistics). Reroll for a fresh engagement.</div>
    ${side(a,s.aCas,s.effA)}
    <div style="text-align:center;font-size:20px;margin:6px 0">⚔️</div>
    ${side(b,s.bCas,s.effB)}
    <div class="sectionH">Result</div>
    <div class="brow2"><span>Pre-battle maneuver</span><b>${esc(s.manoeuvre)}</b></div>
    <div class="brow2"><span>Force ratio</span><b>${s.ratio>=99?"∞":s.ratio.toFixed(2)} : 1</b></div>
    <div class="brow2"><span>Outcome</span><b>${s.vlabel}${s.victor!=="—"?" — "+esc(s.victor):" (draw)"}</b></div>
    ${VIEWER?"":`<div class="btnrow" style="margin-top:10px"><button class="btn" id="brebtn">🎲 Reroll battle</button></div>`}`;
  if(!VIEWER){ const rb=$("#brebtn"); if(rb)rb.addEventListener("click",()=>{ state.battleRoll={key:a.id+b.id,data:battleSummary(a,b)}; renderBattleView(); }); }
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
const MODE_TITLES={political:"Political",provincemap:"Province Map",terrain:"Terrain",settlement:"Settlements",religion:"Religions",culture:"Cultures",race:"Races",language:"Languages",population:"Population",resource:"Resources",economy:"Modes of Production",monster:"Monsters",military:"Military",region:"Regions",tech:"Tech Level",imported:"Imported colors"};
function legendEntries(mode){           // [color, label, paintValue]
  const L=world.lists, e=[];
  if(mode==="political"){e.push(["#39415e","Unclaimed","__none__"]);world.realms.forEach(r=>e.push([r.color,r.name,r.id]));}
  else if(mode==="terrain"){L.terrains.forEach(t=>e.push([catColor("terrains",t),t,t]));
    if(world.provinces.some(p=>p.ocean)) e.push([OCEAN_FILL,"🌊 Ocean","__ocean__"]);}
  else if(mode==="settlement")L.settlements.forEach(s=>e.push([catColor("settlements",s),s,s]));
  else if(mode==="religion")L.religions.forEach(x=>e.push([catColor("religions",x),x,x]));
  else if(mode==="culture")L.cultures.forEach(x=>e.push([catColor("cultures",x),x,x]));
  else if(mode==="race")(L.subraces||[]).forEach(x=>e.push([catColor("subraces",x),x,x]));
  else if(mode==="language")L.languages.forEach(x=>e.push([catColor("languages",x),x,x]));
  else if(mode==="resource"){
    if(state.hiddenResMode){
      e.push(["#39415e","— none —","__none__"]);
      (L.hiddenResources||[]).forEach(x=>e.push([catColor("resources",x),(HIDDEN_RES_GLYPH[x]||"⛏")+" "+x,x]));
    } else {
      L.resources.forEach(x=>e.push([catColor("resources",x), isPrestige(x)?("★ "+x):x, x]));
    }
  }
  else if(mode==="economy")L.economies.forEach(x=>e.push([catColor("economies",x),x,x]));
  else if(mode==="population"){[[0,"Uninhabited"],[1000,"~1,000"],[5000,"~5,000"],[10000,"~10,000 (high)"],[50000,"~50,000"],[150000,"100,000+ (metropolis)"]].forEach(([v,l])=>e.push([popColor(v),l]));}
  return e;
}
const PAINTABLE_MODES=["political","terrain","settlement","religion","culture","race","language","resource","economy"];
// compact floating legend shown directly on the map (mobile)
function buildMapLegend(){
  const box=$("#mapLegend"); if(!box)return;
  if(typeof world==="undefined" || !world || state.mapmode==="imported"){ box.classList.add("hidden"); return; }
  if(state.mapmode==="monster" || state.mapmode==="military" || state.mapmode==="resource" || state.mapmode==="race" || state.mapmode==="region" || state.mapmode==="tech"){   // custom legends rendered right on the map
    box.classList.remove("hidden");
    box.innerHTML=`<button class="mlHead">${esc(MODE_TITLES[state.mapmode]||"Legend")}</button><div class="mlList" id="mlCustomBody"></div>`;
    box.querySelector(".mlHead").onclick=()=>box.classList.toggle("open");
    const body=box.querySelector("#mlCustomBody");
    if(state.mapmode==="monster") renderMonsterLegend(body);
    else if(state.mapmode==="military") renderForceLegend(body);
    else if(state.mapmode==="race") renderRaceLegend(body);
    else if(state.mapmode==="region") renderRegionLegend(body);
    else if(state.mapmode==="tech") renderTechLegend(body);
    else renderResourceLegend(body);
    return;
  }
  const entries=legendEntries(state.mapmode);
  if(!entries.length){ box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  const rows=entries.map(([c,l,v],idx)=>{
    const active = v!==undefined && ((state.mapmode==="resource")? state.selResource===v
      : (state.mapmode==="terrain") ? (state.terrainSel && state.terrainSel.has(v))
      : (state.legendFilter && state.legendFilter.mode===state.mapmode && state.legendFilter.value===v));
    return `<div class="mlRow${active?' active':''}" data-vi="${idx}"${v!==undefined?' style="cursor:pointer"':''}><span class="sw" style="background:${c}"></span>${esc(l)}</div>`;
  }).join("");
  box.innerHTML=`<button class="mlHead">${esc(MODE_TITLES[state.mapmode]||"Legend")}</button><div class="mlList">${rows}</div>`;
  box.querySelector(".mlHead").onclick=()=>box.classList.toggle("open");
  // tap a legend entry: political → open that realm's info; other modes → spotlight matching provinces
  box.querySelectorAll(".mlRow").forEach(row=>{
    const idx=+row.dataset.vi, ent=entries[idx], v=ent&&ent[2];
    if(v===undefined)return;
    row.onclick=(ev)=>{ ev.stopPropagation();
      if(state.mapmode==="political"){ legendClickValue(v); if(v!=="__none__")selectRealm(v); }     // spotlight realm + open its panel
      else if(state.mapmode==="religion"){ legendClickValue(v); selectReligion(v); }                // spotlight + open faith panel
      else { legendClickValue(v); }
    };
  });
}
// Resource legend: each regular resource on a row with its prestige goods to the right,
// then a section listing the strategic (hidden) resources.
// Race legend: subraces grouped under their race group. Click a group or subrace to spotlight
// the whole group on the map (like the resource-family spotlight).
function renderRaceLegend(box){
  // subraces organized under their race group (group order follows world.lists.races);
  // clicking a group header or any of its subraces highlights the whole group.
  const subs=world.lists.subraces||[];
  const order=(world.lists.races||[]).slice();
  // include any race groups referenced by subraces but missing from the races list, then sort by list order
  const groups=[]; const seen=new Set();
  for(const g of order){ groups.push(g); seen.add(g); }
  for(const sr of subs){ const g=subraceGroup(sr); if(!seen.has(g)){ groups.push(g); seen.add(g); } }
  for(const g of groups){
    const members=subs.filter(sr=>subraceGroup(sr)===g);
    if(!members.length) continue;
    const head=div("mlRaceGroup"+(state.selRaceGroup===g?" active":""));
    head.dataset.grp=g; head.style.cursor="pointer"; head.title=`Highlight all ${esc(g)} subraces`;
    head.innerHTML=`<span class="mlRaceGroupName">${esc(g)}</span>`;
    box.appendChild(head);
    members.forEach(sr=>{
      const row=div("mlRow mlSubRow"+(state.selRaceGroup===g?" active":""));
      row.dataset.grp=g; row.style.cursor="pointer"; row.title=`Highlight all ${esc(g)} subraces`;
      row.innerHTML=`<span class="sw" style="background:${catColor('subraces',sr)}"></span>${esc(sr)}`;
      box.appendChild(row);
    });
  }
  box.querySelectorAll("[data-grp]").forEach(el=>{ el.onclick=ev=>{ ev.stopPropagation(); toggleRaceGroup(el.dataset.grp); }; });
}
function toggleRaceGroup(g){ state.selRaceGroup = (state.selRaceGroup===g) ? null : g; renderMap(); buildMapLegend(); }
function renderResourceLegend(box){
  const list=world.lists.resources||[];
  const act=res=>state.selResource===res;
  const item=(res,cls,star)=>`<span class="resLegItem${cls?" "+cls:""}${act(res)?" active":""}" data-res="${esc(res)}" title="${esc(res)}"><span class="sw" style="background:${catColor("resources",res)}"></span>${star?"★ ":""}${esc(resLabel(res))}</span>`;
  const shown=new Set();
  REGULAR_RESOURCES.forEach(base=>{
    if(!list.includes(base))return;
    shown.add(base);
    const pres=prestigeOf(base).filter(p=>list.includes(p)); pres.forEach(p=>shown.add(p));
    const row=div("resLegRow");
    // base in column 1, first prestige in column 2, second prestige in column 3 (grid keeps them aligned)
    row.innerHTML=item(base,"resLegBase",false)+pres.map(p=>item(p,"resLegPresCell",true)).join("");
    box.appendChild(row);
  });
  // any custom / orphaned resources not covered above
  list.filter(x=>!shown.has(x)).forEach(x=>{ const row=div("resLegRow"); row.innerHTML=item(x,"resLegBase",isPrestige(x)); box.appendChild(row); });
  // strategic (hidden) resources — reference section
  const hid=world.lists.hiddenResources||[];
  if(hid.length){
    const h=div("resLegSection"); h.textContent="Strategic (hidden) resources"; box.appendChild(h);
    const wrap=div("resLegHidden");
    hid.forEach(x=>{ const c=div("resLegItem"+(act(x)?" active":"")); c.dataset.res=x; c.title=x;
      c.innerHTML=`<span class="sw" style="background:${catColor("resources",x)}"></span>${HIDDEN_RES_GLYPH[x]||"⛏"} ${esc(resLabel(x))}`; wrap.appendChild(c); });
    box.appendChild(wrap);
  }
  // click a regular/prestige/hidden resource to spotlight it on the map
  box.querySelectorAll("[data-res]").forEach(el=>{ el.onclick=ev=>{ ev.stopPropagation(); legendClickValue(el.dataset.res); buildMapLegend(); }; });
}
function renderForceLegend(box){
  if(!VIEWER){ const b=document.createElement("button"); b.className="btn tiny primary"; b.style.marginBottom="6px"; b.textContent="＋ Add force";
    b.onclick=addForceAtCenter; box.appendChild(b); }
  if(!world.forces.length){ const n=div("note"); n.textContent=VIEWER?"No forces on the map.":"No forces yet. Click ＋ Add force, then use ✥ Move to place it."; box.appendChild(n); return; }
  world.forces.forEach(f=>{
    const r=world.realms.find(x=>x.id===f.realmId), col=r?r.color:"#5a6172";
    const row=div("li"+(state.selForce===f.id?" sel":""));
    row.innerHTML=`<span class="swatch" style="background:${col}"></span>${(FORCE_DOMAINS[f.domain]||FORCE_DOMAINS.land).icon} ${esc(f.name)} <span class="note" style="margin-left:auto">TS ${forceTS(f)}</span>`;
    if(state.selForce===f.id){row.style.outline="2px solid var(--accent)";row.style.borderRadius="6px";}
    row.style.cursor="pointer"; row.onclick=()=>{selectForce(f.id);centerOn(f.x,f.y);};
    box.appendChild(row);
  });
}
const _monGroupCollapsed=new Set();
function moveMonsterInLegend(m,dir){
  const a=world.monsters, i=a.indexOf(m); let j=i+dir;
  while(j>=0&&j<a.length&&a[j].groupId!==m.groupId) j+=dir;   // swap with nearest neighbour in the same group/list
  if(j<0||j>=a.length)return; [a[i],a[j]]=[a[j],a[i]]; renderLegend(); markDirty();
}
function monsterLegendRow(m, ed){
  const row=div("li"+(state.selMonster===m.id?" sel":""));
  const ic=m.icon||MONSTER_DEFAULT_ICON;
  const icHTML=isImgIcon(ic)?`<img class="monRowIcon" src="${esc(ic)}"/>`:`<span style="width:16px;display:inline-block;text-align:center">${esc(ic)}</span>`;
  const grp = ed ? `<select class="mRowGrp" title="Group" style="max-width:82px;margin-left:4px"><option value="">(none)</option>${world.monsterGroups.map(g=>`<option value="${g.id}" ${m.groupId===g.id?"selected":""}>${esc(g.name)}</option>`).join("")}</select>` : "";
  row.style.display="flex"; row.style.alignItems="center"; row.style.gap="5px"; row.style.cursor="pointer";
  row.innerHTML=`${icHTML}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name||"(unnamed)")}</span>${grp}${ed?`<span class="monReorder"><button class="btn tiny mUp">↑</button><button class="btn tiny mDn">↓</button></span>`:""}`;
  if(state.selMonster===m.id){row.style.outline="2px solid var(--accent)";row.style.borderRadius="6px";}
  row.addEventListener("click",ev=>{ if(ev.target.closest("select,button"))return; selectMonster(m.id); centerOn(m.x,m.y); });
  if(ed){
    row.querySelector(".mRowGrp").addEventListener("change",e=>{ m.groupId=e.target.value||null; renderLegend(); markDirty(); });
    row.querySelector(".mUp").addEventListener("click",()=>moveMonsterInLegend(m,-1));
    row.querySelector(".mDn").addEventListener("click",()=>moveMonsterInLegend(m,1));
  }
  return row;
}
function renderMonsterLegend(box){
  const ed=!VIEWER;
  if(ed){
    const bar=div(""); bar.style.cssText="display:flex;gap:6px;margin-bottom:6px";
    const b=document.createElement("button"); b.className="btn tiny primary"; b.textContent="＋ Creature"; b.onclick=addMonsterAtCenter; bar.appendChild(b);
    const g=document.createElement("button"); g.className="btn tiny"; g.textContent="＋ Group"; g.onclick=()=>{ world.monsterGroups.push({id:uid(),name:"New Group"}); renderLegend(); markDirty(); }; bar.appendChild(g);
    box.appendChild(bar);
  }
  if(!world.monsters.length && !world.monsterGroups.length){ const n=div("note"); n.textContent=VIEWER?"No legendary creatures.":"No creatures yet. Click ＋ Creature, then ✥ Move to place it."; box.appendChild(n); return; }
  const groups=world.monsterGroups||[];
  groups.forEach((grp,gi)=>{
    const members=world.monsters.filter(m=>m.groupId===grp.id);
    const collapsed=_monGroupCollapsed.has(grp.id);
    const gEl=div("monGroup"+(collapsed?" collapsed":""));
    const head=div("monGroupHead");
    head.innerHTML=`<span class="caret">${collapsed?"▸":"▾"}</span>`
      +(ed?`<input class="mgName" value="${esc(grp.name)}" style="flex:1;min-width:0"/>`:`<span style="flex:1">${esc(grp.name)}</span>`)
      +`<span class="note">${members.length}</span>`
      +(ed?`<span class="monReorder"><button class="btn tiny mgUp">↑</button><button class="btn tiny mgDn">↓</button><button class="btn tiny mgDel" style="color:var(--bad)">✕</button></span>`:"");
    head.addEventListener("click",ev=>{ if(ev.target.closest("input,button"))return; if(collapsed)_monGroupCollapsed.delete(grp.id); else _monGroupCollapsed.add(grp.id); renderLegend(); });
    if(ed){
      head.querySelector(".mgName").addEventListener("input",e=>{grp.name=e.target.value;markDirty();});
      head.querySelector(".mgUp").addEventListener("click",()=>{ if(gi>0){const a=world.monsterGroups;[a[gi-1],a[gi]]=[a[gi],a[gi-1]];renderLegend();markDirty();} });
      head.querySelector(".mgDn").addEventListener("click",()=>{ const a=world.monsterGroups; if(gi<a.length-1){[a[gi+1],a[gi]]=[a[gi],a[gi+1]];renderLegend();markDirty();} });
      head.querySelector(".mgDel").addEventListener("click",()=>{ if(!confirm(`Delete group "${grp.name}"? Its creatures become ungrouped (not deleted).`))return; world.monsters.forEach(m=>{if(m.groupId===grp.id)m.groupId=null;}); world.monsterGroups.splice(gi,1); renderLegend(); markDirty(); });
    }
    gEl.appendChild(head);
    const body=div("monGroupBody");
    if(!members.length){ const n=div("note"); n.style.padding="4px 8px"; n.textContent="(empty — assign creatures to this group)"; body.appendChild(n); }
    members.forEach(m=>body.appendChild(monsterLegendRow(m,ed)));
    gEl.appendChild(body);
    box.appendChild(gEl);
  });
  // ungrouped creatures
  const ungrouped=world.monsters.filter(m=>!m.groupId || !groups.some(g=>g.id===m.groupId));
  ungrouped.forEach(m=>box.appendChild(monsterLegendRow(m,ed)));
}
function centerOn(wx,wy){
  const cv=$("#map"); const cw=cv.clientWidth||800, ch=cv.clientHeight||600;
  state.cam.x=wx-(cw/state.cam.scale)/2; state.cam.y=wy-(ch/state.cam.scale)/2; requestRender();
}
function renderLegend(){
  refreshMapmodeBar();
  buildMapLegend();
  renderPaintPanel();
  renderPopPanel();
  renderConvertPanel();
  const box=$("#legend");box.innerHTML="";
  if(state.mapmode==="imported"){box.innerHTML='<div class="note">Original imported province colors.</div>';return;}
  if(state.mapmode==="military"){ renderForceLegend(box); return; }
  if(state.mapmode==="monster"){ renderMonsterLegend(box); return; }
  const paintable=PAINTABLE_MODES.includes(state.mapmode) && !VIEWER;
  legendEntries(state.mapmode).forEach(([c,l,v])=>{
    const d=div("li");d.innerHTML=`<span class="swatch" style="background:${c}"></span>${esc(l)}`;
    if(v!==undefined){                                          // legend clicks ONLY spotlight — never paint
      const active=(state.mapmode==="resource") ? (state.selResource===v)
                  : (state.legendFilter && state.legendFilter.mode===state.mapmode && state.legendFilter.value===v);
      if(active){d.style.outline="2px solid var(--accent)";d.style.borderRadius="6px";}
      d.style.cursor="pointer"; d.title="Click to show only these provinces (click again or the map to clear)";
      d.onclick=()=>legendClickValue(v);
    }
    box.appendChild(d);
  });
  if(paintable){
    const h=div("note");h.style.marginTop="6px";h.textContent="Click an entry, then click/drag on the map to paint it.";box.appendChild(h);
    const lk=MODE_LIST[state.mapmode];
    if(state.mapmode==="race"){const mb=document.createElement("button");mb.className="btn tiny";mb.style.marginTop="6px";mb.textContent="✎ Edit race groups & subraces (GM Screen)";mb.onclick=()=>openGM2();box.appendChild(mb);}
    else if(lk){const mb=document.createElement("button");mb.className="btn tiny";mb.style.marginTop="6px";mb.textContent="✎ Edit / add "+({governments:"governments",religions:"religions",cultures:"cultures",languages:"languages",terrains:"terrains",settlements:"settlements",resources:"resources"}[lk]||lk);mb.onclick=()=>openLists(lk);box.appendChild(mb);}
    if(state.mapmode!=="political"){
      const rob=document.createElement("button");rob.className="btn tiny"+(state.realmOverlay?" primary":"");rob.style.marginTop="6px";rob.style.marginLeft="6px";
      rob.textContent=(state.realmOverlay?"✓ ":"")+"⚑ Realm borders";
      rob.title="Outline every realm's borders on top of this map mode";
      rob.onclick=()=>{state.realmOverlay=!state.realmOverlay;renderLegend();renderMap();};
      box.appendChild(rob);
      const tb=document.createElement("button");tb.className="btn tiny"+(state.terrainOverlay?" primary":"");tb.style.marginTop="6px";tb.style.marginLeft="6px";
      tb.textContent=(state.terrainOverlay?"✓ ":"")+"⛰ Terrain outlines";
      tb.title="Overlay terrain-region outlines on this map mode";
      tb.onclick=()=>{state.terrainOverlay=!state.terrainOverlay;renderLegend();renderMap();};
      box.appendChild(tb);
    }
    if(state.mapmode==="resource"){
      const hb=document.createElement("button");hb.className="btn tiny"+(state.hiddenResMode?" primary":"");hb.style.marginTop="6px";hb.style.marginLeft="6px";
      hb.textContent=(state.hiddenResMode?"✓ ":"")+"⛏ Strategic (hidden) resources";
      hb.title="Show and paint hidden strategic resources (Iron, Coal, Oil…) on top of the normal resources";
      hb.onclick=()=>{state.hiddenResMode=!state.hiddenResMode;state.paintValue=null;renderLegend();renderMap();flash(state.hiddenResMode?"Painting strategic resources — pick one from the legend.":"Back to normal resources.");};
      box.appendChild(hb);
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
function slugify(s){ return (s||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,""); }
// Province-view banner image: per-province override → GM default for the terrain → slug fallback.
function provTerrainImageURL(p){
  if(p.terrainImage) return p.terrainImage;
  const d=(world.terrainImages&&world.terrainImages[p.terrain]); if(d) return d;
  return "img/terrain/"+slugify(p.terrain||"")+".png";
}
// small inline SVG pie for a population-breakdown axis
function pieSVG(arr,listKey,size){
  size=size||70; const r=size/2;
  const data=(arr||[]).filter(e=>e.pct>0).sort((a,b)=>b.pct-a.pct);
  if(!data.length) return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r-1}" fill="#39415e"/></svg>`;
  const total=data.reduce((a,e)=>a+e.pct,0)||1;
  if(data.length===1) return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r-1}" fill="${catColor(listKey,data[0].name)}"/></svg>`;
  let ang=-Math.PI/2, paths="";
  for(const e of data){
    const frac=e.pct/total, a2=ang+frac*2*Math.PI;
    const x1=(r+ (r-1)*Math.cos(ang)).toFixed(2), y1=(r+(r-1)*Math.sin(ang)).toFixed(2);
    const x2=(r+ (r-1)*Math.cos(a2)).toFixed(2), y2=(r+(r-1)*Math.sin(a2)).toFixed(2);
    const large=frac>0.5?1:0;
    paths+=`<path d="M${r},${r} L${x1},${y1} A${r-1},${r-1} 0 ${large} 1 ${x2},${y2} Z" fill="${catColor(listKey,e.name)}"/>`;
    ang=a2;
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${paths}</svg>`;
}
function shortNum(n){ n=Math.round(n||0); if(n<1000)return String(n); if(n<1e6){const v=n/1000;return (v<10?v.toFixed(1):Math.round(v))+"k";} const v=n/1e6;return (v<10?v.toFixed(1):Math.round(v))+"M"; }
// pie for one identity axis; shows each group's % and its actual head-count (full number on hover)
function pieCell(label,p,key,listKey){
  const m={}; let tot=0;
  for(const q of (p.pops||[])){ const v=q[key]; if(!v||!(q.size>0))continue; m[v]=(m[v]||0)+q.size; tot+=q.size; }
  const data=Object.entries(m).map(([name,size])=>({name,size,pct:tot?size/tot*100:0})).sort((a,b)=>b.size-a.size);
  const numMode=state.pvPieMode==="num";
  const leg = data.length ? data.slice(0,5).map(e=>`<div class="pvLeg" title="${esc(e.name)}: ${e.size.toLocaleString()} people (${Math.round(e.pct)}%)"><span class="sw" style="background:${catColor(listKey,e.name)}"></span><span class="nm">${esc(e.name)}</span><span class="pvLegVal">${numMode?shortNum(e.size):Math.round(e.pct)+"%"}</span></div>`).join("")
                          : '<div class="note">—</div>';
  return `<div class="pvPie"><div class="pvPieH">${label}</div>${pieSVG(data,listKey,72)}<div class="pvLegs">${leg}</div></div>`;
}
function renderProvinceView(){
  const p=world.provinces.find(x=>x.id===state.selProvince); const ins=$("#inspector");
  if(!p){ins.innerHTML='<div class="empty">No province selected.</div>';return;}
  if(p.ocean){ const oc=p.oceanColor||OCEAN_FILL; ins.innerHTML=`<div class="provCard" style="--rc:${oc};--tc:${oc}"><div class="provName">${esc(p.name)}</div><div class="provSettName">🌊 Ocean</div></div>`; return; }
  const realm=world.realms.find(r=>r.id===p.realmId);
  const cont=world.continents.find(c=>c.id===p.continentId);
  const rc=realm?realm.color:"#6f8fc9";
  const terr=p.terrain||"", terrCol=catColor("terrains",terr);
  const row=(l,v)=>`<div class="pvRow"><span class="pvLbl">${l}</span><span class="pvVal">${(v===0||v)?v:"—"}</span></div>`;
  const feats=(p.features&&p.features.length)
    ? p.features.map(f=>{const cat=featureCat(f),c=FEATURE_CAT_COLORS[cat];return `<span class="pvFeat" data-f="${esc(f)}" title="Click for details" style="cursor:pointer"><span class="sw" style="background:${c}"></span>${esc(f)}</span>`;}).join("")
    : '<span class="pvVal">None</span>';
  const featKey=FEATURE_CAT_VISIBLE.map(cat=>`<span class="pvKey"><span class="sw" style="background:${FEATURE_CAT_COLORS[cat]}"></span>${FEATURE_CAT_LABEL[cat]}</span>`).join("");
  const hist=(p.history&&p.history.length)?p.history.map(h=>{const era=world.eras.find(e=>e.id===h.eraId);
    return `<div class="h"><div class="meta">${era?esc(era.name):""}${h.auto?" · auto":""}</div><div style="font-weight:600">${esc(h.title)}</div>${h.text?`<div class="note">${esc(h.text)}</div>`:""}</div>`;}).join(""):'<div class="note">No recorded history.</div>';
  ins.innerHTML=`
    <div class="provCard" style="--rc:${rc};--tc:${terrCol}">
      <div class="provName">${esc(p.name)}</div>
      <div class="provSettName">${esc(p.settlementName||p.name)}</div>
      <div class="provBanner" style="background-image:url('${esc(provTerrainImageURL(p))}')"><span>${esc(terr||"Unknown terrain")}</span></div>

      <div class="pvBlock pvTerr">
        ${row("Terrain", terr?`<span class="pvDot" style="background:${terrCol}"></span>${esc(terr)}`:"—")}
        ${row("Settlement", esc(p.settlement||"—"))}
      </div>

      <div class="pvBlock pvGeo">
        ${row("Realm", realm?`<a href="#" id="pvRealm"><span class="sw" style="background:${realm.color}"></span>${esc(realm.name)}</a>`:'Unclaimed')}
        ${row("Continent", cont?esc(cont.name):"—")}
      </div>

      <div class="pvBlock pvFeatBlock">
        <div class="pvBlockH">Features</div>
        <div class="pvFeats">${feats}</div>
        <div class="pvKeyRow">${featKey}</div>
      </div>

      <div class="pvBlock pvEcon">
        ${row("Population", (p.population||0).toLocaleString())}
        ${row("Mode of Production", esc(economyOf(p)))}
        ${row("Resource", (isPrestige(p.resource)?"★ ":"")+esc(p.resource||"—")+(isPrestige(p.resource)?" (prestige)":""))}
        ${row("Hidden resource", p.hidden?((HIDDEN_RES_GLYPH[p.hidden]||"⛏")+" "+esc(p.hidden)):"—")}
      </div>

      <div class="pvBlock pvPopBlock">
        <div class="pvBlockH pvPopHead">Population breakdown
          <span class="pvPieToggle" title="Show percentages or population numbers">
            <button class="pvTg${state.pvPieMode!=="num"?" on":""}" data-pm="pct">%</button>
            <button class="pvTg${state.pvPieMode==="num"?" on":""}" data-pm="num"># People</button>
          </span>
        </div>
        <div class="pvPies">
          ${pieCell("Religion",p,"religion","religions")}
          ${pieCell("Culture",p,"culture","cultures")}
          ${pieCell("Race",p,"race","subraces")}
          ${pieCell("Language",p,"language","languages")}
        </div>
      </div>

      <details class="histBox"><summary>History${p.history&&p.history.length?` (${p.history.length})`:""}</summary><div class="histBody">${hist}</div></details>
    </div>
  `;
  const rl=$("#pvRealm"); if(rl&&realm)rl.onclick=e=>{e.preventDefault();selectRealm(realm.id);};
  ins.querySelectorAll(".pvFeat[data-f]").forEach(el=>el.onclick=()=>showFeatureBubble(el.dataset.f, el, false));
  ins.querySelectorAll(".pvTg[data-pm]").forEach(b=>b.onclick=()=>{ state.pvPieMode=b.dataset.pm; renderProvinceView(); });
}
// A small blurb bubble for a feature (read-only in the viewer, editable in the editor).
let _featBubbleEl=null;
function closeFeatureBubble(){ if(_featBubbleEl){ _featBubbleEl.remove(); _featBubbleEl=null; document.removeEventListener("mousedown",_featBubbleOutside,true); } }
function _featBubbleOutside(e){ if(_featBubbleEl && !_featBubbleEl.contains(e.target)) closeFeatureBubble(); }
function showFeatureBubble(name, anchor, editable){
  closeFeatureBubble();
  const meta=featureMeta(name), cat=featureCat(name), col=FEATURE_CAT_COLORS[cat];
  const b=document.createElement("div"); b.className="featBubble"; _featBubbleEl=b;
  b.innerHTML=`<div class="fbHead"><span class="sw" style="background:${col}"></span><b>${esc(name)}</b><button class="fbX" title="Close">✕</button></div>`
    +(editable
       ? `<textarea class="fbDesc" rows="4" placeholder="Describe this feature… (shown to players)">${esc(meta.description||"")}</textarea>`
       : `<div class="fbBody">${meta.description?esc(meta.description).replace(/\n/g,"<br>"):'<span class="note">No description yet.</span>'}</div>`);
  document.body.appendChild(b);
  const r=anchor.getBoundingClientRect();
  b.style.left=Math.max(8, Math.min(window.innerWidth-b.offsetWidth-8, r.left))+"px";
  b.style.top=Math.min(window.innerHeight-b.offsetHeight-8, r.bottom+6)+"px";
  b.querySelector(".fbX").onclick=closeFeatureBubble;
  if(editable){ const ta=b.querySelector(".fbDesc"); ta.addEventListener("input",e=>{meta.description=e.target.value;markDirty();}); ta.focus(); }
  setTimeout(()=>document.addEventListener("mousedown",_featBubbleOutside,true),0);
}
// A clickable Compendium chip (opens the relevant Compendium entry).
function compChip(cat, val, opts){ opts=opts||{}; const label=opts.label!=null?opts.label:val;
  const sw=opts.color?`<span class="rvDot" style="background:${opts.color}"></span>`:"";
  return `<button class="rvChip compChip" data-cat="${esc(cat)}" data-val="${esc(String(val))}">${sw}${esc(label)}</button>`; }
function renderRealmView(){
  const r=world.realms.find(x=>x.id===state.selRealm); const ins=$("#inspector");
  if(!r){ins.innerHTML='<div class="empty">No realm selected.</div>';return;}
  const provs=world.provinces.filter(p=>p.realmId===r.id);
  const pop=provs.reduce((a,p)=>a+(p.population||0),0);
  const cap=r.capitalId&&world.provinces.find(p=>p.id===r.capitalId);
  const admins=(r.adminCenters||[]).map(id=>world.provinces.find(p=>p.id===id)).filter(Boolean);
  const curReign=realmCurrentReign(r), curRuler=realmCurrentRuler(r);
  const rulerChip = curRuler ? compChip("character", curRuler.id, {label:(curReign&&curReign.title?curReign.title+" ":"")+curRuler.name, color:curRuler.color}) : "—";
  const row=(l,v)=>`<div class="rvRow"><span class="rvLbl">${l}</span><span class="rvVal">${v||"—"}</span></div>`;
  const raceTags=(arr)=>(arr&&arr.length) ? arr.map(x=>compChip("race",x,{color:raceGroupColor(x)})).join("") : `<span class="rvVal">—</span>`;
  const powers=realmPowers(r);
  ins.innerHTML=`
    <div class="realmCard realmView2" style="--rc:${r.color}">
      <div class="realmName rvBig">${esc(r.name)}</div>
      <div class="rvStatRow"><span class="rvStatPop">👥 ${pop.toLocaleString()}</span><span class="rvStatProv">🗺 ${provs.length} province${provs.length===1?"":"s"}</span></div>
      <div class="rvCols">
        <div class="rvColL">
          <div class="rvBlock rvGov">
            ${row("Government", r.government?compChip("government",r.government):"—")}
            ${row("Mode of Production", r.economy?compChip("economy",r.economy,{color:catColor('economies',r.economy)}):"—")}
            ${row("Current ruler", rulerChip)}
          </div>
          <div class="rvBlock rvSociety">
            ${row("Religion", r.stateReligion?compChip("religion",r.stateReligion,{color:catColor('religions',r.stateReligion)}):"—")}
            ${row("Culture", r.dominantCulture?compChip("culture",r.dominantCulture,{color:catColor('cultures',r.dominantCulture)}):"—")}
            ${row("Language", r.dominantLanguage?compChip("language",r.dominantLanguage,{color:catColor('languages',r.dominantLanguage)}):"—")}
          </div>
          <div class="rvBlock rvRacial">
            <div class="rvRow"><span class="rvLbl">Racial Admin</span><span class="rvVal rvRaces">${raceTags(r.adminRaces)}</span></div>
            <div class="rvRow"><span class="rvLbl">Racial Mil.</span><span class="rvVal rvRaces">${raceTags(r.militaryRaces)}</span></div>
          </div>
          <div class="rvBlock rvPowers">
            <div class="rvBlockH">✨ Powers</div>
            <div class="rvPowerChips">${powers.length?powers.map(pw=>compChip("power",pw.id,{label:pw.name+(pw.type?` · ${pw.type}`:""),color:pw.color})).join(""):'<span class="rvVal">—</span>'}</div>
          </div>
          <div class="rvBlock rvGeo">
            ${row("Capital", cap?`⭐ ${esc(cap.name)}`:"—")}
            <div class="rvRow"><span class="rvLbl">Admin centres</span><span class="rvVal">${admins.length?admins.map(p=>`<span class="rvChip">◆ ${esc(p.name)}</span>`).join(""):"—"}</span></div>
          </div>
          ${r.description?`<div class="rvBlock rvDesc">${esc(r.description).replace(/\n/g,"<br>")}</div>`:""}
        </div>
        <div class="rvColR">
          <div class="rvBlock rvTechBlock"><div class="rvBlockH">🔬 Tech Level</div>${techBreakdownBody(r,false)}</div>
        </div>
      </div>
      <details class="rvProvinces">
        <summary>Provinces (${provs.length})</summary>
        <input id="rvProvSearch" class="rvSearch" type="text" placeholder="🔍 Search provinces…" autocomplete="off"/>
        <div class="list" id="rvProvList">${provs.map(p=>`<div class="li pvp" data-pid="${p.id}" data-name="${esc((p.name||'').toLowerCase())}" style="cursor:pointer;display:flex">${esc(p.name)}<span class="note" style="margin-left:auto">${(p.population||0).toLocaleString()}</span></div>`).join("")||'<div class="note">None</div>'}</div>
      </details>
    </div>
  `;
  { const rt=$("#right"); if(rt)rt.classList.add("wideRealm"); }
  ins.querySelectorAll(".compChip").forEach(el=>el.onclick=()=>openCompendium(el.dataset.cat, el.dataset.val));
  $$(".pvp").forEach(el=>el.onclick=()=>selectProvince(el.dataset.pid));
  const srch=$("#rvProvSearch");
  if(srch)srch.addEventListener("input",e=>{const q=e.target.value.trim().toLowerCase();
    $$("#rvProvList .pvp").forEach(el=>{ el.style.display = (!q||el.dataset.name.includes(q))?"flex":"none"; });});
}

/* ============================================================
   COMPENDIUM — a manually-opened reference of powers, leaders,
   religions, cultures, discoveries, etc. across the world.
   Chips in the realm view open it focused on a given entry.
   ============================================================ */
function comp_realmNames(pred){ return world.realms.filter(pred).map(r=>r.name); }
function comp_usedBlock(names){ return names.length?`<div class="cmpUsed"><span class="cmpUsedL">Realms</span> ${names.map(esc).join(", ")}</div>`:""; }
function compendiumCats(){
  const cats=[];
  const subCount=(u)=>u.length?`${u.length} realm${u.length===1?"":"s"}`:"";
  // Powers
  cats.push({ cat:"power", label:"✨ Powers", entries:(world.powers||[]).map(pw=>{
    const used=comp_realmNames(r=>realmHasPower(r,pw.id));
    return { id:pw.id, name:pw.name, color:pw.color||"#7c5cff", sub:pw.type||"", used,
      ref:`${pw.type?`<div class="cmpRow"><b>Type</b> ${esc(pw.type)}</div>`:""}${pw.origin?`<div class="cmpRow"><b>Origin</b> ${esc(pw.origin).replace(/\n/g,"<br>")}</div>`:""}`,
      desc:pw.description };
  }) });
  // Discoveries
  cats.push({ cat:"discovery", label:"🔬 Discoveries", entries:(world.discoveries||[]).map(d=>{
    const mk=discoveryMaker(d), used=comp_realmNames(r=>realmHasDiscovery(r,d.id));
    return { id:d.id, name:d.name, color:discoveryColor(d), sub:`${esc(d.field||"")} · TL${tlClamp(d.tl)}`, used,
      ref:`<div class="cmpRow"><b>Field</b> ${esc(d.field||"—")} &nbsp; <b>TL</b> ${tlClamp(d.tl)}</div>${mk?`<div class="cmpRow"><b>Discovered by</b> ${esc(mk.name)}</div>`:""}`,
      desc:d.description };
  }) });
  // Characters (people — rulers, commanders, other roles)
  cats.push({ cat:"character", label:"👤 Characters", entries:allCharacters().map(c=>{
    const roles=[]; if(c.isRuler)roles.push("Ruler"); charTagsOf(c).forEach(t=>roles.push(t));
    return { id:c.id, name:c.name, color:c.color||"#c9a86f", sub:roles.join(" · "), used:[], ref:"", desc:c.description||"" };
  }) });
  // Realms (with their ruler timeline)
  cats.push({ cat:"realm", label:"🏰 Realms", entries:(world.realms||[]).map(r=>{
    const cur=realmCurrentRuler(r);
    return { id:r.id, name:r.name, color:r.color, sub:cur?`Ruler: ${cur.name}`:"", used:[], ref:"", desc:"" };
  }) });
  // Religions
  cats.push({ cat:"religion", label:"🕮 Religions", entries:(world.lists&&world.lists.religions||[]).map(n=>{
    const meta=(world.religionInfo&&world.religionInfo[n])||{}, used=comp_realmNames(r=>r.stateReligion===n);
    return { id:n, name:n, color:catColor("religions",n), sub:subCount(used), used, ref:"", desc:meta.description||"" };
  }) });
  // Cultures
  cats.push({ cat:"culture", label:"🎭 Cultures", entries:(world.lists&&world.lists.cultures||[]).map(n=>{
    const used=comp_realmNames(r=>r.dominantCulture===n);
    return { id:n, name:n, color:catColor("cultures",n), sub:subCount(used), used, ref:"", desc:"" };
  }) });
  // Languages
  cats.push({ cat:"language", label:"🗣 Languages", entries:(world.lists&&world.lists.languages||[]).map(n=>{
    const used=comp_realmNames(r=>r.dominantLanguage===n);
    return { id:n, name:n, color:catColor("languages",n), sub:subCount(used), used, ref:"", desc:"" };
  }) });
  // Governments
  cats.push({ cat:"government", label:"🏛 Governments", entries:Array.from(new Set(world.realms.map(r=>r.government).filter(Boolean))).map(n=>{
    const used=comp_realmNames(r=>r.government===n);
    return { id:n, name:n, color:"#7c8698", sub:subCount(used), used, ref:"", desc:"" };
  }) });
  // Modes of production
  cats.push({ cat:"economy", label:"⚒ Modes of Production", entries:Array.from(new Set(world.realms.map(r=>r.economy).filter(Boolean))).map(n=>{
    const used=comp_realmNames(r=>r.economy===n);
    return { id:n, name:n, color:catColor("economies",n), sub:subCount(used), used, ref:"", desc:"" };
  }) });
  // Races
  cats.push({ cat:"race", label:"🧬 Races", entries:(world.lists&&world.lists.races||[]).map(n=>{
    const used=comp_realmNames(r=>(r.adminRaces||[]).includes(n)||(r.militaryRaces||[]).includes(n));
    return { id:n, name:n, color:raceGroupColor(n), sub:subCount(used), used, ref:"", desc:"" };
  }) });
  return cats.filter(c=>c.entries.length);
}
// resolve the underlying object whose canonical description is edited (or null → lore-only)
function compTargetObj(cat,id){
  if(cat==="power")return (world.powers||[]).find(x=>x.id===id)||null;
  if(cat==="discovery")return (world.discoveries||[]).find(x=>x.id===id)||null;
  if(cat==="religion")return religionMeta(id);
  if(cat==="character")return characterById(id);
  return null;
}
let _compState={cat:null,val:null,open:null};
function compEntryFind(cat,id){ const cats=compendiumCats(); const c=cats.find(x=>x.cat===cat); if(!c)return null; return c.entries.find(e=>String(e.id)===String(id))||null; }
function compLoreKey(cat,id){ return cat+"::"+id; }
function compLore(cat,id){ ensureCompendium(world); const e=_compendium.lore[compLoreKey(cat,id)]; return (e&&typeof e.lore==="string")?e.lore:""; }
function setCompLore(cat,id,text){ ensureCompendium(world); const k=compLoreKey(cat,id); const t=(text||"").replace(/\s+$/,""); if(t){ _compendium.lore[k]=_compendium.lore[k]||{}; _compendium.lore[k].lore=text; } else if(_compendium.lore[k]){ delete _compendium.lore[k]; } markDirty(); }
function openCompendium(focusCat, focusVal){
  const cats=compendiumCats();
  if(!cats.length){ openModal(`<div class="cmpWrap"><div class="cmpHead"><span class="cmpTitle">📖 Compendium</span><button class="btn ghost" onclick="closeModal()">✕</button></div><div class="note" style="padding:20px">Nothing recorded yet — add powers, discoveries, leaders and more, then check back.</div></div>`); return; }
  // pick active category
  let active=cats.find(c=>c.cat===focusCat)||cats[0];
  _compState={cat:active.cat, val:focusVal||null, open:null};
  // a chip click (focusVal) jumps straight to that entry's full page
  if(focusVal!=null && active.entries.some(e=>String(e.id)===String(focusVal))) _compState.open=String(focusVal);
  const tabs=cats.map(c=>`<button class="cmpTab${c.cat===active.cat?" on":""}" data-cat="${c.cat}">${c.label} <span class="cmpN">${c.entries.length}</span></button>`).join("");
  openModal(`<div class="cmpWrap">
    <div class="cmpHead"><span class="cmpTitle">📖 Compendium</span><input id="cmpSearch" class="txt" placeholder="🔍 Search…" autocomplete="off"/><button class="btn ghost" onclick="closeModal()">✕</button></div>
    <div class="cmpBody"><div class="cmpTabs" id="cmpTabs">${tabs}</div><div class="cmpMain" id="cmpMain"></div></div>
  </div>`);
  $$("#cmpTabs .cmpTab").forEach(b=>b.onclick=()=>{ _compState={cat:b.dataset.cat,val:null,open:null}; renderCompMain(); $$("#cmpTabs .cmpTab").forEach(x=>x.classList.toggle("on",x.dataset.cat===b.dataset.cat)); });
  const s=$("#cmpSearch"); if(s)s.addEventListener("input",renderCompMain);
  renderCompMain();
}
function renderCompMain(){
  const wrap=$(".cmpWrap"); const main=$("#cmpMain"); if(!main)return;
  const editable=!VIEWER;
  // ---- DETAIL PAGE ----
  if(_compState.open!=null){
    if(wrap)wrap.classList.add("cmpDetailMode");
    const e=compEntryFind(_compState.cat,_compState.open);
    main.innerHTML=renderCompDetail(_compState.cat,e,editable);
    const back=$("#cmpBack"); if(back)back.onclick=()=>{ _compState.open=null; renderCompMain(); };
    main.querySelectorAll(".cmpProvLink").forEach(el=>el.onclick=()=>{ const p=world.provinces.find(x=>x.id===el.dataset.pid); if(p){ closeModal(); zoomToProvince(p); selectProvince(p.id); } });
    main.querySelectorAll(".cmpWonderLink").forEach(el=>el.onclick=()=>{ const w=(world.wonders||[]).find(x=>x.id===el.dataset.wid); if(w&&w.provinceId){ const p=world.provinces.find(x=>x.id===w.provinceId); if(p){ closeModal(); zoomToProvince(p); selectProvince(p.id); } } });
    main.querySelectorAll(".cmpRealmLink").forEach(el=>el.onclick=()=>{ const r=world.realms.find(x=>x.id===el.dataset.rid); if(r){ closeModal(); selectRealm(r.id); } });
    main.querySelectorAll(".cmpForceLink").forEach(el=>el.onclick=()=>{ const f=(world.forces||[]).find(x=>x.id===el.dataset.fid); if(f){ closeModal(); if(typeof selectForce==="function")selectForce(f.id); } });
    // cross-reference: jump to another compendium entry's page
    main.querySelectorAll(".cmpXref").forEach(el=>el.onclick=()=>{ const cat=el.dataset.cat; _compState={cat,val:null,open:el.dataset.id}; $$("#cmpTabs .cmpTab").forEach(x=>x.classList.toggle("on",x.dataset.cat===cat)); renderCompMain(); });
    if(editable){
      const obj=compTargetObj(_compState.cat,_compState.open);
      // structured field inputs (bound to the underlying object)
      main.querySelectorAll(".cmpFld").forEach(el=>{
        if(!obj)return; const k=el.dataset.k;
        el.value = (el.type==="color") ? toHex(obj[k]||"#7c5cff") : (obj[k]!=null?obj[k]:"");
        el.addEventListener("input",()=>{ let v=el.value; if(k==="tl")v=tlClamp(v); obj[k]=v; markDirty(); if(el.dataset.live)renderCompDetailHeader(); });
        el.addEventListener("change",()=>{ if(el.dataset.reload)renderCompMain(); });
      });
      // universal lore article
      const lore=main.querySelector(".cmpLoreEdit");
      if(lore){ lore.value=compLore(_compState.cat,_compState.open); lore.addEventListener("input",()=>setCompLore(_compState.cat,_compState.open,lore.value)); }
      if(_compState.cat==="character")wireCharacterEdit(main,_compState.open);
      if(_compState.cat==="realm")wireRealmRulerEdit(main,_compState.open);
    }
    main.scrollTop=0;
    return;
  }
  // ---- LIST ----
  if(wrap)wrap.classList.remove("cmpDetailMode");
  const cats=compendiumCats(); const c=cats.find(x=>x.cat===_compState.cat)||cats[0]; if(!c)return;
  const q=($("#cmpSearch")?.value||"").trim().toLowerCase();
  const list=c.entries.filter(e=>!q||(e.name||"").toLowerCase().includes(q)||(e.sub||"").toLowerCase().includes(q));
  const addBtn = (editable && c.cat==="character") ? `<button class="btn primary cmpAddNew" id="cmpAddChar" style="margin-bottom:10px">＋ New character</button>` : "";
  main.innerHTML=addBtn+(list.length?list.map(e=>`
    <div class="cmpEntry" data-id="${esc(String(e.id))}" tabindex="0">
      <div class="cmpEntryH"><span class="rvDot" style="background:${e.color||"#7c8698"}"></span><span class="cmpEntryName">${esc(e.name||"—")}</span>${e.sub?`<span class="cmpEntrySub">${esc(e.sub)}</span>`:""}<span class="cmpEntryGo">›</span></div>
    </div>`).join(""):'<div class="note" style="padding:20px">Nothing here yet.</div>');
  main.querySelectorAll(".cmpEntry").forEach(el=>el.onclick=()=>{ _compState.open=el.dataset.id; renderCompMain(); });
  const addC=main.querySelector("#cmpAddChar"); if(addC)addC.onclick=()=>{ const ch=newCharacter({name:"New Character"}); allCharacters().push(ch); markDirty(); _compState.open=ch.id; renderCompMain(); };
}
// Character page wiring (ruler toggle + role tags)
function wireCharacterEdit(main, id){
  const c=characterById(id); if(!c)return;
  const rul=main.querySelector("#chIsRuler"); if(rul){ rul.checked=!!c.isRuler; rul.addEventListener("change",()=>{ c.isRuler=rul.checked; markDirty(); renderCompMain(); }); }
  main.querySelectorAll(".chTagX").forEach(el=>el.onclick=()=>{ toggleCharTag(c,el.dataset.tag); renderCompMain(); });
  const addSel=main.querySelector("#chTagAdd"); if(addSel)addSel.onchange=()=>{ const v=addSel.value; if(v){ if(!charHasTag(c,v))c.tags.push(v); markDirty(); renderCompMain(); } };
  const newT=main.querySelector("#chNewTag"); if(newT)newT.addEventListener("keydown",ev=>{ if(ev.key==="Enter"){ ev.preventDefault(); const v=newT.value.trim(); if(v){ const tags=allCharTags(); if(!tags.includes(v))tags.push(v); if(!charHasTag(c,v))c.tags.push(v); markDirty(); renderCompMain(); } } });
  const del=main.querySelector("#chDelete"); if(del)del.onclick=()=>{ if(!confirm("Delete this character? They'll be removed from any realm timelines and army commands."))return;
    _compendium.characters=_compendium.characters.filter(x=>x.id!==id);
    Object.keys(_compendium.realmRulers).forEach(rid=>{ _compendium.realmRulers[rid]=_compendium.realmRulers[rid].filter(rg=>rg.charId!==id); });
    (world.forces||[]).forEach(f=>{ if(f.commanderCharId===id)f.commanderCharId=""; });
    markDirty(); _compState.open=null; renderCompMain(); };
}
// Realm page wiring (ruler timeline editor)
function wireRealmRulerEdit(main, id){
  const r=world.realms.find(x=>x.id===id); if(!r)return; const rulers=realmRulers(r);
  const rr=()=>renderCompMain();
  main.querySelectorAll(".rulerChar").forEach(el=>el.addEventListener("change",()=>{ rulers[+el.dataset.i].charId=el.value; markDirty(); rr(); }));
  main.querySelectorAll(".rulerTitle").forEach(el=>el.addEventListener("input",()=>{ rulers[+el.dataset.i].title=el.value; markDirty(); }));
  main.querySelectorAll(".rulerFrom").forEach(el=>el.addEventListener("input",()=>{ rulers[+el.dataset.i].from=el.value; markDirty(); }));
  main.querySelectorAll(".rulerTo").forEach(el=>el.addEventListener("input",()=>{ rulers[+el.dataset.i].to=el.value; markDirty(); }));
  main.querySelectorAll(".rulerNote").forEach(el=>el.addEventListener("input",()=>{ rulers[+el.dataset.i].note=el.value; markDirty(); }));
  main.querySelectorAll(".rulerDel").forEach(el=>el.onclick=()=>{ rulers.splice(+el.dataset.i,1); markDirty(); rr(); });
  main.querySelectorAll(".rulerUp").forEach(el=>el.onclick=()=>{ const i=+el.dataset.i; if(i>0){ const t=rulers[i-1]; rulers[i-1]=rulers[i]; rulers[i]=t; markDirty(); rr(); } });
  main.querySelectorAll(".rulerDn").forEach(el=>el.onclick=()=>{ const i=+el.dataset.i; if(i<rulers.length-1){ const t=rulers[i+1]; rulers[i+1]=rulers[i]; rulers[i]=t; markDirty(); rr(); } });
  const add=main.querySelector("#rulerAdd"); if(add)add.onclick=()=>{ const first=allCharacters().find(c=>c.isRuler); rulers.push({charId:first?first.id:"",title:"",from:"",to:"",note:""}); markDirty(); rr(); };
  const nc=main.querySelector("#rulerNewChar"); if(nc)nc.onclick=()=>{ const name=(prompt("New ruler character name:")||"").trim(); if(!name)return; const ch=newCharacter({name,isRuler:true}); allCharacters().push(ch); rulers.push({charId:ch.id,title:"",from:"",to:"",note:""}); markDirty(); rr(); };
}
// live-update just the detail header name/color while typing (no full re-render → keeps focus)
function renderCompDetailHeader(){
  const e=compEntryFind(_compState.cat,_compState.open); if(!e)return;
  const nm=$("#cmpMain .cmpDetName"); if(nm)nm.textContent=e.name||"—";
  const dot=$("#cmpMain .cmpDetHead .rvDot"); if(dot)dot.style.background=e.color||"#7c8698";
}
// editable structured fields per category (editor only)
function compEditFields(cat, e){
  if(cat==="power")return `<div class="cmpEditGrid">
      <label class="cmpF"><span>Name</span><input class="txt cmpFld" data-k="name" data-live="1"/></label>
      <label class="cmpF"><span>Type</span><input class="txt cmpFld" data-k="type"/></label>
      <label class="cmpF"><span>Colour</span><input type="color" class="cmpFld" data-k="color" data-live="1"/></label>
      <label class="cmpF cmpFWide"><span>Origin (where &amp; how it began)</span><textarea class="txt cmpFld" data-k="origin" rows="3"></textarea></label>
      <label class="cmpF cmpFWide"><span>Description</span><textarea class="txt cmpFld" data-k="description" rows="4"></textarea></label>
    </div>`;
  if(cat==="discovery")return `<div class="cmpEditGrid">
      <label class="cmpF"><span>Name</span><input class="txt cmpFld" data-k="name" data-live="1"/></label>
      <label class="cmpF"><span>TL</span><input type="number" min="0" max="12" class="txt cmpFld" data-k="tl" data-reload="1"/></label>
      <label class="cmpF cmpFWide"><span>Description</span><textarea class="txt cmpFld" data-k="description" rows="4"></textarea></label>
    </div>`;
  if(cat==="religion")return `<div class="cmpEditGrid">
      <label class="cmpF cmpFWide"><span>Description</span><textarea class="txt cmpFld" data-k="description" rows="5"></textarea></label>
    </div>`;
  return "";
}
// ---- Character page (rulers/commanders/etc.) ----
function renderCharacterPage(e, editable){
  const c=characterById(e.id); if(!c)return '<div class="cmpDetail"><button class="btn ghost cmpBack" id="cmpBack">← Compendium</button><div class="note" style="padding:20px">Not found.</div></div>';
  const tags=charTagsOf(c);
  const roles=[]; if(c.isRuler)roles.push("👑 Ruler"); tags.forEach(t=>roles.push(t));
  const reigns=charRealmReigns(c.id), forces=charForces(c.id);
  const reignRows = reigns.length ? reigns.map(({realm,reign})=>`<div class="li cmpXref" data-cat="realm" data-id="${realm.id}" style="cursor:pointer">🏰 <b>${esc(realm.name)}</b>${reign.title?` — ${esc(reign.title)}`:""}${(reign.from||reign.to)?` <span class="note">(${esc(reign.from||"?")}–${esc(reign.to||"present")})</span>`:""}</div>`).join("") : '<div class="note">Not recorded as a ruler of any realm.</div>';
  const forceRows = forces.length ? forces.map(f=>{ const r=world.realms.find(x=>x.id===f.realmId); return `<div class="li cmpForceLink" data-fid="${f.id}" style="cursor:pointer">⚔ <b>${esc(f.name)}</b>${r?` <span class="note">— ${esc(r.name)}</span>`:""}</div>`; }).join("") : '<div class="note">Not commanding any army.</div>';
  let body;
  if(editable){
    const tagChips = tags.length?tags.map(t=>`<span class="tag">${esc(t)} <span class="x chTagX" data-tag="${esc(t)}">✕</span></span>`).join(""):'<span class="note">No role tags yet.</span>';
    const tagOpts = allCharTags().filter(t=>!tags.includes(t)).map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");
    body=`<div class="cmpEditGrid">
        <label class="cmpF"><span>Name</span><input class="txt cmpFld" data-k="name" data-live="1"/></label>
        <label class="cmpF"><span>Colour</span><input type="color" class="cmpFld" data-k="color" data-live="1"/></label>
        <label class="cmpF cmpFWide cmpCheck"><input type="checkbox" id="chIsRuler"/> <span>Is a ruler <span class="note">(can be placed on realm reign timelines)</span></span></label>
        <label class="cmpF cmpFWide"><span>Description</span><textarea class="txt cmpFld" data-k="description" rows="5"></textarea></label>
      </div>
      <div class="cmpSecH">🏷 Role tags <span class="note">(Commander, Diplomat, …)</span></div>
      <div class="cmpTagChips" id="chTags">${tagChips}</div>
      <div class="cmpTagAddRow"><select id="chTagAdd"><option value="">＋ add role tag…</option>${tagOpts}</select><input id="chNewTag" class="txt" placeholder="or type a new role + Enter"/></div>`;
  } else {
    body=c.description?`<div class="cmpDesc">${esc(c.description).replace(/\n/g,"<br>")}</div>`:'<span class="note">No description yet.</span>';
  }
  return `<div class="cmpDetail">
    <button class="btn ghost cmpBack" id="cmpBack">← Compendium</button>
    <div class="cmpDetHead"><span class="rvDot" style="background:${c.color};width:20px;height:20px"></span><span class="cmpDetName">${esc(c.name)}</span></div>
    <div class="cmpDetSub">${roles.length?roles.map(esc).join(" · "):"Character"}</div>
    <div class="cmpDetBody">${body}
      <div class="cmpSecH">👑 Reigns</div><div class="list">${reignRows}</div>
      <div class="cmpSecH">⚔ Commands</div><div class="list">${forceRows}</div>
      ${editable?'<div style="margin-top:16px"><button class="btn danger" id="chDelete">🗑 Delete character</button></div>':""}
    </div>
  </div>`;
}
// ---- Realm page (ruler timeline) ----
function renderRealmPage(e, editable){
  const r=world.realms.find(x=>x.id===e.id); if(!r)return '<div class="cmpDetail"><button class="btn ghost cmpBack" id="cmpBack">← Compendium</button><div class="note" style="padding:20px">Not found.</div></div>';
  const rulers=realmRulers(r);
  const cur=realmCurrentRuler(r);
  let timeline;
  if(editable){
    const opts=(sel)=>`<option value="">— pick a ruler —</option>`+allCharacters().filter(c=>c.isRuler).map(c=>`<option value="${c.id}" ${c.id===sel?"selected":""}>${esc(c.name)}</option>`).join("");
    timeline = (rulers.length?rulers.map((rg,i)=>`
      <div class="rulerRow" data-i="${i}">
        <div class="rulerRowTop"><span class="rulerOrd">${i+1}</span>
          <select class="rulerChar" data-i="${i}">${opts(rg.charId)}</select>
          <button class="btn tiny rulerUp" data-i="${i}" title="Earlier">▲</button>
          <button class="btn tiny rulerDn" data-i="${i}" title="Later">▼</button>
          <button class="btn tiny danger rulerDel" data-i="${i}" title="Remove">✕</button></div>
        <div class="rulerRowFields">
          <input class="rulerTitle" data-i="${i}" placeholder="Title (e.g. King)" value="${esc(rg.title||"")}"/>
          <input class="rulerFrom" data-i="${i}" placeholder="From" value="${esc(rg.from||"")}"/>
          <input class="rulerTo" data-i="${i}" placeholder="To" value="${esc(rg.to||"")}"/></div>
        <textarea class="rulerNote" data-i="${i}" rows="2" placeholder="Short description of this reign…">${esc(rg.note||"")}</textarea>
      </div>`).join(""):'<div class="note">No rulers yet — add the first below.</div>')
      + `<div class="rulerAddRow"><button class="btn tiny" id="rulerAdd">＋ Add reign</button><button class="btn tiny" id="rulerNewChar">＋ New ruler character</button></div>
         <div class="note">Order runs earliest → latest; the last entry is the realm's current ruler.</div>`;
  } else {
    timeline = rulers.length?rulers.map((rg,i)=>{ const c=characterById(rg.charId); return `
      <div class="rulerViewRow cmpXref" data-cat="character" data-id="${esc(rg.charId)}" style="cursor:pointer">
        <span class="rulerOrd">${i+1}</span>
        <div class="rulerViewMain"><span class="rulerViewName">${c?esc(c.name):"(unknown)"}</span>${rg.title?` <span class="rulerViewTitle">${esc(rg.title)}</span>`:""}${(rg.from||rg.to)?`<span class="note"> (${esc(rg.from||"?")}–${esc(rg.to||"present")})</span>`:""}${i===rulers.length-1?' <span class="rulerCurrent">current</span>':""}${rg.note?`<div class="rulerViewNote">${esc(rg.note).replace(/\n/g,"<br>")}</div>`:""}</div>
      </div>`; }).join("") : '<div class="note">No rulers recorded.</div>';
  }
  const lore=compLore("realm", r.id);
  const loreBlock = editable
    ? `<div class="cmpSecH">📜 Compendium article</div><textarea class="cmpLoreEdit" rows="7" placeholder="Write about ${esc(r.name)}…"></textarea>`
    : (lore?`<div class="cmpSecH">📜 About</div><div class="cmpLoreView">${esc(lore).replace(/\n/g,"<br>")}</div>`:"");
  return `<div class="cmpDetail">
    <button class="btn ghost cmpBack" id="cmpBack">← Compendium</button>
    <div class="cmpDetHead"><span class="rvDot" style="background:${r.color};width:20px;height:20px"></span><span class="cmpDetName">${esc(r.name)}</span></div>
    <div class="cmpDetSub">${cur?`Current ruler: ${esc(cur.name)}`:"No current ruler"} · <span class="li cmpRealmLink" data-rid="${r.id}" style="display:inline;cursor:pointer;padding:0">🗺 open on map</span></div>
    <div class="cmpDetBody">
      <div class="cmpSecH">👑 Rulers timeline</div>
      <div class="rulerTimeline">${timeline}</div>
      ${loreBlock}
    </div>
  </div>`;
}
// A full "page" for a single compendium entry, with a Back button to the list.
function renderCompDetail(cat, e, editable){
  if(!e) return '<div class="cmpDetail"><button class="btn ghost cmpBack" id="cmpBack">← Compendium</button><div class="note" style="padding:20px">Not found.</div></div>';
  if(cat==="character")return renderCharacterPage(e, editable);
  if(cat==="realm")return renderRealmPage(e, editable);
  const used=e.used||[];
  const usedBlock=used.length?`<div class="cmpUsed"><span class="cmpUsedL">Realms</span> ${used.map(esc).join(", ")}</div>`:"";
  let extra="";
  if(cat==="religion"){
    const holyP=holySiteProvincesOf(e.id), holyW=holyWondersOf(e.id);
    extra=`<div class="cmpSecH">⛪ Holy sites (${holyP.length})</div>
      <div class="list">${holyP.length?holyP.map(p=>`<div class="li cmpProvLink" data-pid="${p.id}" style="cursor:pointer">⛪ ${esc(p.name)}</div>`).join(""):'<div class="note">None</div>'}</div>
      <div class="cmpSecH">🏛️ Holy wonders (${holyW.length})</div>
      <div class="list">${holyW.length?holyW.map(w=>`<div class="li cmpWonderLink" data-wid="${w.id}" style="cursor:pointer">🏛️ ${esc(w.name)}</div>`).join(""):'<div class="note">None</div>'}</div>`;
  }
  let bodyHTML;
  if(editable){
    const editFields=compEditFields(cat,e);
    const canDesc=(cat==="power"||cat==="discovery"||cat==="religion");   // desc lives on the object, edited in editFields
    const loreSection = canDesc ? "" : `<div class="cmpSecH">📜 Compendium article</div>
      <textarea class="cmpLoreEdit" rows="9" placeholder="Write the encyclopedia article for ${esc(e.name)}…"></textarea>`;
    bodyHTML=`${e.ref?`<div class="cmpRefBox">${e.ref}</div>`:""}
      ${editFields}
      ${loreSection}
      ${usedBlock}`;
  } else {
    const lore=compLore(cat,e.id);
    const descHTML=e.desc?`<div class="cmpDesc">${esc(e.desc).replace(/\n/g,"<br>")}</div>`:"";
    const loreHTML=lore?`<div class="cmpSecH">📜 About</div><div class="cmpLoreView">${esc(lore).replace(/\n/g,"<br>")}</div>`:"";
    const hasAny=e.ref||descHTML||loreHTML||usedBlock;
    bodyHTML=hasAny?`${e.ref||""}${descHTML}${loreHTML}${usedBlock}`:'<span class="note">No details recorded yet.</span>';
  }
  return `<div class="cmpDetail">
    <button class="btn ghost cmpBack" id="cmpBack">← Compendium</button>
    <div class="cmpDetHead"><span class="rvDot" style="background:${e.color||'#7c8698'};width:20px;height:20px"></span><span class="cmpDetName">${esc(e.name||'—')}</span></div>
    ${e.sub?`<div class="cmpDetSub">${e.sub}</div>`:""}
    <div class="cmpDetBody">${bodyHTML}</div>
    ${extra}
  </div>`;
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
// Minimal editor for ocean tiles — just a name, colour, shape tools and delete.
function renderOceanTileEditor(p){
  const ins=$("#inspector");
  ins.innerHTML=`
    <div class="insTitle"><input id="pname" value="${esc(p.name)}"/></div>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin:2px 0 8px"><input type="checkbox" id="pocean" checked/> 🌊 Ocean tile <span class="note">(water only — no people or details)</span></label>
    <div class="field2">
      <div class="field"><label>Water colour</label><input id="poceancol" type="color" value="${toHex(p.oceanColor||OCEAN_FILL)}" style="width:100%;height:34px;padding:2px"/></div>
      <div class="field" style="display:flex;align-items:flex-end"><button class="btn tiny" id="poceanreset" style="width:100%" title="Reset to the default ocean colour">↺ Match ocean</button></div>
    </div>
    <div class="field2">
      <div class="field"><label>Continent</label><select id="pcont">${world.continents.map(c=>`<option value="${c.id}" ${p.continentId===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></div>
      <div class="field"></div>
    </div>
    <div class="sectionH">Shape</div>
    <div class="btnrow"><button class="btn" id="pnodes">✦ Reshape (nodes)</button><button class="btn" id="psplit">✂ Split</button></div>
    <div class="field2" style="margin-top:6px">
      <div class="field"><label>Merge a neighbor into this</label><select id="pmerge"></select></div>
      <div style="flex:0 0 auto;display:flex;align-items:flex-end"><button class="btn" id="pmergebtn">Merge</button></div>
    </div>
    <div class="btnrow"><button class="btn danger" id="pdel">Delete tile</button></div>`;
  $("#pname").addEventListener("input",e=>{p.name=e.target.value;markDirty();renderMap();renderLeft();});
  $("#pocean").addEventListener("change",e=>{ beginEdit(); p.ocean=e.target.checked; deriveProvince(p); renderProvinceEditor(); renderMap(); renderLeft(); markDirty(); });
  $("#poceancol").addEventListener("input",e=>{ p.oceanColor=e.target.value; markDirty(); renderMap(); });
  $("#poceanreset").onclick=()=>{ delete p.oceanColor; markDirty(); renderMap(); renderOceanTileEditor(p); };
  $("#pcont").addEventListener("change",e=>{p.continentId=e.target.value;renderMap();renderLeft();markDirty();});
  $("#pnodes").addEventListener("click",()=>setTool("nodes"));
  $("#psplit").addEventListener("click",()=>startSplit(p));
  const cand=world.provinces.filter(x=>x.id!==p.id && x.continentId===p.continentId && provincesShareVertex(p,x));
  const ms=$("#pmerge");
  ms.innerHTML = cand.length ? cand.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("") : `<option value="">— no adjacent tiles —</option>`;
  $("#pmergebtn").addEventListener("click",()=>{
    const oid=ms.value; const b=oid&&world.provinces.find(x=>x.id===oid); if(!b){flash("No adjacent tile to merge.");return;}
    const c=world.continents.find(cc=>cc.id===p.continentId)||{ox:0,oy:0};
    const A=p.points.map(([x,y])=>[c.ox+x,c.oy+y]), B=b.points.map(([x,y])=>[c.ox+x,c.oy+y]);
    const merged=mergeAdjacentPolys(A,B)||mergeAdjacentPolys(B,A);
    if(!merged){flash("These tiles don't share a full border edge.");return;}
    beginEdit();
    p.points=merged.map(([x,y])=>[Math.round(x-c.ox),Math.round(y-c.oy)]);
    world.provinces=world.provinces.filter(x=>x.id!==oid);
    _geoDirty=true; renderMap(); renderLeft(); selectProvince(p.id); markDirty(); flash("Tiles merged.");
  });
  $("#pdel").addEventListener("click",()=>{
    if(!confirm("Delete this ocean tile?"))return;
    beginEdit(); world.provinces=world.provinces.filter(x=>x.id!==p.id);
    state.selProvince=null; renderMap(); renderLeft(); $("#inspector").innerHTML='<div class="empty">Ocean tile deleted.</div>'; markDirty();
  });
}
function renderProvinceEditor(){
  if(VIEWER)return renderProvinceView();
  const p=world.provinces.find(p=>p.id===state.selProvince);
  const ins=$("#inspector");
  if(!p){ins.innerHTML='<div class="empty">No province selected.</div>';return;}
  if(p.ocean) return renderOceanTileEditor(p);
  const realmOpts=`<option value="">— Unclaimed —</option>`+world.realms.map(r=>`<option value="${r.id}" ${p.realmId===r.id?"selected":""}>${esc(r.name)}</option>`).join("");
  const opt=(list,v)=>list.map(o=>`<option ${o===v?"selected":""}>${esc(o)}</option>`).join("");
  ins.innerHTML=`
    <div class="insTitle"><input id="pname" value="${esc(p.name)}"/></div>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin:2px 0 6px"><input type="checkbox" id="pocean"/> 🌊 Ocean tile <span class="note">(water only — no people or details)</span></label>
    <div class="field"><label>Settlement name <span class="note">(blank = same as province)</span></label><input id="psettname" value="${esc(p.settlementName||"")}" placeholder="${esc(p.name)}"/></div>
    <div class="field2">
      <div class="field"><label>Realm</label><select id="prealm">${realmOpts}</select></div>
      <div class="field"><label>Continent</label><select id="pcont">${world.continents.map(c=>`<option value="${c.id}" ${p.continentId===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></div>
    </div>
    <div class="field2">
      <div class="field"><label>Terrain</label><select id="pterr">${opt(world.lists.terrains,p.terrain)}</select></div>
      <div class="field"><label>Settlement</label><select id="psett">${opt(world.lists.settlements,p.settlement)}</select></div>
    </div>
    <div class="field"><label>Terrain image override <span class="note">(blank = terrain default; doesn't change terrain)</span></label>
      <select id="ptimg"><option value="">— use ${esc(p.terrain||"terrain")} default —</option>${TERRAIN_IMAGES.map(mi=>`<option value="${esc(mi.src)}" ${p.terrainImage===mi.src?"selected":""}>${esc(mi.name)}</option>`).join("")}${(p.terrainImage&&!TERRAIN_IMAGES.some(mi=>mi.src===p.terrainImage))?`<option value="${esc(p.terrainImage)}" selected>(current) ${esc(p.terrainImage)}</option>`:""}</select></div>
    <div id="ptimgPrev" style="margin:2px 0 6px">${provTerrainImageURL(p)?`<img src="${esc(provTerrainImageURL(p))}" style="width:100%;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--line)"/>`:""}</div>
    <div class="field2">
      <div class="field"><label>Top resource</label><select id="pres">${opt(world.lists.resources,p.resource)}</select></div>
      <div class="field"><label>Strategic resource (hidden)</label><select id="phidden"><option value="" ${!p.hidden?"selected":""}>— none —</option>${(world.lists.hiddenResources||[]).map(o=>`<option ${o===p.hidden?"selected":""}>${esc(o)}</option>`).join("")}</select></div>
    </div>

    <div class="sectionH">Notable features</div>
    <div id="pfeat"></div>

    <div class="sectionH">Wonders (great projects)</div>
    <div class="note">Placed in this province. Each has an image, name and description, and can be flagged as a holy site of a religion. In the viewer they appear as a box attached to this province's panel.</div>
    <div id="pwonders"></div>
    <button class="btn tiny" id="pwonderAdd" style="margin-top:6px">＋ Add wonder</button>

    ${p.ocean?"":`<div class="sectionH">Population — <span id="ppopTot">${(p.population||0).toLocaleString()}</span> · <span id="ppopN">${p.pops.length}</span> group(s)</div>
    <div class="note">Each group is a chunk of people sharing one religion, culture, race and language. Add groups for minorities — the map-mode percentages update automatically from the groups.</div>
    <div id="ppops"></div>
    <button class="btn tiny" id="ppopAdd" style="margin-top:6px">＋ Add pop group</button>`}

    <div class="sectionH">History</div>
    <details class="histBox"><summary>Recorded events</summary><div id="phist" class="hist"></div></details>
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
  $("#pname").addEventListener("input",e=>{p.name=e.target.value;const sn=$("#psettname");if(sn)sn.placeholder=e.target.value;renderMapLabelsSoon();renderLeft();markDirty();});
  { const sn=$("#psettname"); if(sn)sn.addEventListener("input",e=>{p.settlementName=e.target.value;markDirty();}); }
  bindTracked("pterr","terrain",v=>p.terrain=v);
  { const ti=$("#ptimg"); if(ti)ti.addEventListener("change",e=>{ p.terrainImage=e.target.value; markDirty(); const pv=$("#ptimgPrev"); const u=provTerrainImageURL(p); if(pv)pv.innerHTML=u?`<img src="${esc(u)}" style="width:100%;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--line)"/>`:""; }); }
  bindTracked("psett","settlement",v=>p.settlement=v);
  bindTracked("pres","resource",v=>p.resource=v);
  { const ph=$("#phidden"); if(ph)ph.addEventListener("change",e=>{p.hidden=e.target.value;renderMap();markDirty();}); }
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
  renderProvinceWonders(p);
  { const wa=$("#pwonderAdd"); if(wa)wa.addEventListener("click",()=>{ beginEdit(); world.wonders.push(newWonder(p.id)); renderProvinceWonders(p); markDirty(); }); }
  // ocean/water toggle
  { const oc=$("#pocean"); if(oc)oc.addEventListener("change",e=>{ beginEdit(); p.ocean=e.target.checked; if(p.ocean){ p.pops=[]; p.settlement="Uninhabited"; } deriveProvince(p); renderProvinceEditor(); renderMap(); renderLeft(); markDirty(); }); }
  // population pop-groups (skipped for ocean provinces)
  if(!p.ocean){
    renderPops(p);
    { const pa=$("#ppopAdd"); if(pa)pa.addEventListener("click",()=>{
      beginEdit();
      const id=defaultPopIdentity(world.realms.find(x=>x.id===p.realmId));
      p.pops.push(newPop(1000, id[0], id[1], id[2], id[3], id[4]));
      recomputeProvince(p); renderProvinceEditor(); renderMap(); renderLeft(); markDirty();   // no merge while editing — lets you build a new group
    }); }
  }
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
  const list=world.lists[ {religion:"religions",culture:"cultures",race:"subraces",language:"languages"}[key] ];
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
  const list=world.lists[ {religion:"religions",culture:"cultures",race:"subraces",language:"languages"}[key] ];
  const total=p[key].reduce((s,e)=>s+(+e.pct||0),0)||1;
  p[key].forEach(e=>{const s=document.createElement("span");s.style.width=(e.pct/total*100)+"%";s.style.background=listColor(list,e.name);s.title=`${e.name} ${e.pct}%`;bar.appendChild(s);});
}
function renderPops(p){
  const wrap=$("#ppops"); if(!wrap)return; wrap.innerHTML="";
  const sel=(list,v,cls,title)=>`<select class="${cls}" title="${title||''}"><option value="">—</option>${list.map(o=>`<option value="${esc(o)}" ${o===v?"selected":""}>${esc(o)}</option>`).join("")}</select>`;
  if(!p.pops.length){wrap.innerHTML='<div class="note">No people here yet — add a pop group.</div>';return;}
  const totals=()=>{const t=$("#ppopTot");if(t)t.textContent=(p.population||0).toLocaleString();const n=$("#ppopN");if(n)n.textContent=p.pops.length;};
  p.pops.forEach((q,i)=>{
    const row=div("popRow");
    row.style.borderLeft=`5px solid ${q.race?catColor("subraces",q.race):"#39415e"}`;   // tint by subrace colour
    row.innerHTML=`<div class="popHead"><input class="psize" type="number" min="0" value="${q.size||0}" title="People in this group"/><span class="x" title="Remove group">✕</span></div>
      <div class="popAxes">${sel(world.lists.religions,q.religion,"prel","Religion")}${sel(world.lists.cultures,q.culture,"pcul","Culture")}${sel(world.lists.subraces,q.race,"prace","Subrace")}${sel(world.lists.languages,q.language,"plang","Language")}${sel(world.lists.economies,q.economy,"pecon2","Mode of Production")}</div>`;
    const updSize=()=>{recomputeProvince(p);totals();renderMap();renderLeft();markDirty();};
    const updAxis=(k,val)=>{q[k]=val;recomputeProvince(p);totals();renderMap();renderLeft();markDirty();};   // no merge while the province is open — identical groups fold together on deselect
    row.querySelector(".psize").addEventListener("input",e=>{q.size=Math.max(0,+e.target.value||0);updSize();});
    row.querySelector(".prel").addEventListener("change",e=>updAxis("religion",e.target.value));
    row.querySelector(".pcul").addEventListener("change",e=>updAxis("culture",e.target.value));
    row.querySelector(".prace").addEventListener("change",e=>updAxis("race",e.target.value));
    row.querySelector(".plang").addEventListener("change",e=>updAxis("language",e.target.value));
    row.querySelector(".pecon2").addEventListener("change",e=>updAxis("economy",e.target.value));
    row.querySelector(".x").onclick=()=>{beginEdit();p.pops.splice(i,1);recomputeProvince(p);renderProvinceEditor();renderMap();renderLeft();markDirty();};
    wrap.appendChild(row);
  });
}
function renderFeatures(p){
  const wrap=$("#pfeat");wrap.innerHTML="";
  p.features.forEach((f,i)=>{
    const cat=featureCat(f), col=FEATURE_CAT_COLORS[cat];
    const t=document.createElement("span");t.className="tag";t.style.borderColor=col;
    t.innerHTML=`<span class="fcat" title="${FEATURE_CAT_LABEL[cat]} — click to change type" style="width:11px;height:11px;border-radius:3px;background:${col};display:inline-block;cursor:pointer"></span> <b>${esc(f)}</b> <span class="x">✕</span>`;
    t.querySelector(".fcat").onclick=()=>{const cur=featureCat(f);const vi=FEATURE_CAT_VISIBLE.indexOf(cur);setFeatureCat(f,FEATURE_CAT_VISIBLE[(vi+1)%FEATURE_CAT_VISIBLE.length]);renderFeatures(p);renderMap();markDirty();};
    { const nb=t.querySelector("b"); if(nb){ nb.style.cursor="pointer"; nb.title="Click to edit this feature's description"; nb.onclick=()=>showFeatureBubble(f,t,true); } }
    t.querySelector(".x").onclick=()=>{p.features.splice(i,1);renderFeatures(p);renderMap();markDirty();};
    wrap.appendChild(t);
  });
  const sel=document.createElement("select");sel.className="sel";sel.style.marginTop="6px";
  sel.innerHTML=`<option value="">＋ add feature…</option>`+world.lists.features.map(f=>`<option>${esc(f)}</option>`).join("")+`<option value="__custom">Custom…</option>`;
  sel.onchange=()=>{let v=sel.value;if(v==="__custom"){v=(prompt("Feature name:")||"").trim();}if(v){p.features.push(v);if(!world.lists.features.includes(v))world.lists.features.push(v);if(!world.featureCats[v])world.featureCats[v]="misc";renderFeatures(p);renderMap();markDirty();}sel.value="";};
  wrap.appendChild(sel);
  const note=div("note");note.style.marginTop="4px";note.innerHTML=`Types: <span style="color:${FEATURE_CAT_COLORS.resource}">■ Resource feature</span> (💎 on Resource map) · <span style="color:${FEATURE_CAT_COLORS.misc}">■ Misc</span>. Click a feature's colour to change its type. <span class="note">(Wonders are now their own section above.)</span>`;
  wrap.appendChild(note);
}
function moveWonder(p,w,dir){
  const list=wondersOf(p.id), i=list.indexOf(w), j=i+dir; if(j<0||j>=list.length)return;
  [list[i],list[j]]=[list[j],list[i]]; list.forEach((x,k)=>x.order=k); markDirty();
}
function renderProvinceWonders(p){
  const box=$("#pwonders"); if(!box)return; box.innerHTML="";
  { const rb=document.createElement("button"); rb.className="btn tiny"; rb.style.marginBottom="6px"; rb.textContent="🔄 Rescan image folder";
    rb.onclick=async()=>{ await loadExtraImages(); renderProvinceWonders(p); flash(WONDER_IMAGES.length+" image(s) in static/img/wonders/."); };
    box.appendChild(rb); }
  const list=wondersOf(p.id);
  list.forEach((w,i)=>{
    const relChips=(w.religions||[]).map((rn,ri)=>`<span class="tag woRelTag" data-ri="${ri}"><span class="sw" style="background:${catColor('religions',rn)}"></span>${esc(rn)} <span class="x">✕</span></span>`).join("")||'<span class="note">No religions yet.</span>';
    const row=div("elRow");
    row.innerHTML=`
      <div class="elRowHead"><span style="flex:1;font-weight:600">🏛️ Wonder</span><span class="monReorder"><button class="btn tiny woUp">↑</button><button class="btn tiny woDn">↓</button><button class="btn tiny woDel" style="color:var(--bad)">✕</button></span></div>
      <div class="field"><label>Name</label><input class="woName" value="${esc(w.name||"")}"/></div>
      <div class="field"><label>Image ${WONDER_IMAGES.length?"":'<span class="note">(drop files into static/img/wonders/)</span>'}</label>
        <select class="woImgPick">${imagePickerOptions(WONDER_IMAGES, w.image)}</select></div>
      ${w.image?`<div class="wpBanner" style="margin:2px 0 6px"><img src="${esc(w.image)}" alt=""/></div>`:""}
      <div class="field"><label>Description</label><textarea class="woDesc" rows="3">${esc(w.description||"")}</textarea></div>
      <label style="font-size:13px;display:flex;align-items:center;gap:6px;margin:2px 0"><input type="checkbox" class="woHoly" ${w.holySite?"checked":""}/> Holy site</label>
      <div class="field woRelWrap" style="${w.holySite?"":"display:none"}"><label>Holy site of <span class="note">(one or more religions)</span></label>
        <div class="woRels raceMulti">${relChips}</div>
        <select class="woRelAdd"><option value="">＋ add religion…</option>${(world.lists.religions||[]).map(rn=>`<option>${esc(rn)}</option>`).join("")}</select></div>`;
    row.querySelector(".woName").addEventListener("input",e=>{w.name=e.target.value;markDirty();renderWonderPanel();});
    row.querySelector(".woImgPick").addEventListener("change",e=>{w.image=e.target.value;markDirty();renderProvinceWonders(p);renderWonderPanel();});
    row.querySelector(".woDesc").addEventListener("input",e=>{w.description=e.target.value;markDirty();renderWonderPanel();});
    row.querySelector(".woHoly").addEventListener("change",e=>{ w.holySite=e.target.checked; if(!w.holySite)w.religions=[]; markDirty(); renderProvinceWonders(p); renderWonderPanel(); renderMap(); });
    row.querySelectorAll(".woRelTag .x").forEach(x=>x.onclick=()=>{ const ri=+x.closest(".woRelTag").dataset.ri; (w.religions||[]).splice(ri,1); markDirty(); renderProvinceWonders(p); renderWonderPanel(); renderMap(); });
    { const add=row.querySelector(".woRelAdd"); if(add)add.addEventListener("change",e=>{ const v=e.target.value; if(v){ w.religions=w.religions||[]; if(!w.religions.includes(v)){ w.religions.push(v); markDirty(); renderProvinceWonders(p); renderWonderPanel(); renderMap(); } } }); }
    row.querySelector(".woUp").addEventListener("click",()=>{ moveWonder(p,w,-1); renderProvinceWonders(p); renderWonderPanel(); });
    row.querySelector(".woDn").addEventListener("click",()=>{ moveWonder(p,w,1); renderProvinceWonders(p); renderWonderPanel(); });
    row.querySelector(".woDel").addEventListener("click",()=>{ if(!confirm(`Delete wonder "${w.name}"?`))return; beginEdit(); world.wonders=world.wonders.filter(x=>x.id!==w.id); renderProvinceWonders(p); markDirty(); renderWonderPanel(); });
    box.appendChild(row);
  });
  if(!list.length){ const n=div("note"); n.textContent="No wonders here yet."; box.appendChild(n); }
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
  { const rt=$("#right"); if(rt)rt.classList.remove("wideRealm"); }
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
      <div class="field"><label>Mode of Production (realm default)</label><select id="recon">${opt(world.lists.economies,r.economy)}</select></div>
    </div>
    <div class="field2">
      <div class="field"><label>State religion</label><select id="rrel"><option value="">— none —</option>${opt(world.lists.religions,r.stateReligion)}</select></div>
      <div class="field"><label>Capital</label><select id="rcap">${capOpts}</select></div>
    </div>
    <div class="field2">
      <div class="field"><label>Culture</label><select id="rcul"><option value="">—</option>${opt(world.lists.cultures,r.dominantCulture)}</select></div>
      <div class="field"><label>Language</label><select id="rlang"><option value="">—</option>${opt(world.lists.languages,r.dominantLanguage)}</select></div>
    </div>
    <div class="field2">
      <div class="field"><label>Racial Administration (one or more)</label>
        <div id="radminRaces" class="raceMulti"></div>
        <select id="radminSelRace"><option value="">＋ add race…</option>${world.lists.races.map(x=>`<option>${esc(x)}</option>`).join("")}</select></div>
      <div class="field"><label>Racial Military (one or more)</label>
        <div id="rmilRaces" class="raceMulti"></div>
        <select id="rmilSelRace"><option value="">＋ add race…</option>${world.lists.races.map(x=>`<option>${esc(x)}</option>`).join("")}</select></div>
    </div>
    <div class="sectionH">👑 Ruler</div>
    <div class="field2">
      <div class="field"><label>Current ruler <span class="note">(a Compendium character)</span></label>
        <select id="rRuler"><option value="">— none —</option>${allCharacters().filter(c=>c.isRuler).map(c=>`<option value="${c.id}" ${realmCurrentReign(r)&&realmCurrentReign(r).charId===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}<option value="__new">＋ New ruler character…</option></select></div>
      <div class="field" style="display:flex;align-items:flex-end"><button class="btn" id="rRulerTimeline" title="Edit the full succession timeline in the Compendium">🕑 Ruler timeline…</button></div>
    </div>
    <div class="note" style="margin:-2px 0 6px">${(function(){const cur=realmCurrentReign(r); if(!cur)return "No current ruler set."; const c=characterById(cur.charId); return "Current: "+(c?esc(c.name):"(unknown)")+(cur.title?` — ${esc(cur.title)}`:"")+". Full succession &amp; dates in the Compendium.";})()}</div>
    <div class="field"><label>Description <span class="note">(shown in the viewer, below Capital/Admin)</span></label><textarea id="rdesc" rows="3">${esc(r.description||"")}</textarea></div>
    <div class="field"><label>Notes <span class="note">(private — not shown in the viewer)</span></label><textarea id="rnote">${esc(r.note||"")}</textarea></div>

    <div class="sectionH">✨ Powers</div>
    <div class="raceMulti" id="rPowerChips">${realmPowers(r).map(pw=>`<span class="tag" style="border-color:${pw.color}"><span class="swatch" style="background:${pw.color}"></span>${esc(pw.name)}${pw.type?` <span class="note">(${esc(pw.type)})</span>`:""} <span class="x" data-pid="${pw.id}">✕</span></span>`).join("")||'<span class="note">None — add powers below (define them in the GM Screen).</span>'}</div>
    <select id="rPowerAdd" style="margin-top:4px"><option value="">＋ add a power…</option>${(world.powers||[]).filter(pw=>!realmHasPower(r,pw.id)).map(pw=>`<option value="${pw.id}">${esc(pw.name)}${pw.type?` (${esc(pw.type)})`:""}</option>`).join("")}</select>

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

    <div class="sectionH">Expand this realm</div>
    <div class="field"><label>When you paint provinces into this realm, they are…</label>
      <select id="rexmode">
        <option value="conquer" ${state.expandMode==="conquer"?"selected":""}>Conquered — added, nothing else changes</option>
        <option value="settle" ${state.expandMode==="settle"?"selected":""}>Settled — migrate settlers into them</option>
        <option value="override" ${state.expandMode==="override"?"selected":""}>Overridden — replace pops with realm identity</option>
      </select></div>
    <div id="rexSettle" class="${state.expandMode==="settle"?"":"hidden"}" style="margin:2px 0 6px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel2)">
      <div class="field2"><div class="field"><label>Settlers: % of matching pops from each realm province</label><input id="rexPct" type="number" min="0" max="100" value="${state.settleParams.pct??8}"/></div><div class="field"></div></div>
      <div class="note">Only pops matching the ticked traits migrate (tick none = anyone can settle):</div>
      <label style="font-size:13px"><input type="checkbox" id="rexRel" ${state.settleParams.byReligion?"checked":""}/> Religion</label>
      <label style="font-size:13px;margin-left:10px"><input type="checkbox" id="rexCul" ${state.settleParams.byCulture?"checked":""}/> Culture</label>
      <label style="font-size:13px;margin-left:10px"><input type="checkbox" id="rexLan" ${state.settleParams.byLanguage?"checked":""}/> Language</label>
      <label style="font-size:13px;margin-left:10px"><input type="checkbox" id="rexRac" ${state.settleParams.byRace?"checked":""}/> Race</label>
    </div>
    <div class="btnrow" style="margin-top:6px"><button class="btn" id="rexUndo">↶ Undo last expansion</button></div>
    <div class="note">Reverts the most recent conquer/settle/override paint — moved settlers return to their origin provinces.</div>
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
  // Attach delete first so nothing later in the wiring can block it.
  $("#rdel").addEventListener("click",()=>{
    if(!confirm("Delete realm? Provinces become unclaimed."))return;
    beginEdit();
    world.provinces.forEach(p=>{if(p.realmId===r.id){const old=provTrackedValue(p,"realm");p.realmId=null;autoLog(p,"realm",old);}});
    world.realms=world.realms.filter(x=>x.id!==r.id);state.selRealm=null;
    renderMap();renderLeft();$("#inspector").innerHTML='<div class="empty">Realm deleted.</div>';markDirty();
    flash("Realm deleted — its provinces are now unclaimed.");
  });
  const b=(id,fn)=>{const e=$("#"+id); if(e)e.addEventListener("input",ev=>{fn(ev.target.value);renderMap();renderLeft();markDirty();});};
  $("#rname").addEventListener("input",e=>{r.name=e.target.value;renderLeft();renderMap();markDirty();});
  $("#rcolor").addEventListener("input",e=>{r.color=e.target.value;renderMap();renderLeft();markDirty();});
  { const s=$("#rPowerAdd"); if(s)s.onchange=()=>{ if(s.value){ toggleRealmPower(r,s.value); renderRealmEditor(); } }; }
  $$("#rPowerChips .x[data-pid]").forEach(x=>x.onclick=()=>{ toggleRealmPower(r,x.dataset.pid); renderRealmEditor(); });
  wireTechRealmUI(r,true);
  b("rgov",v=>r.government=v);b("recon",v=>r.economy=v);b("rrel",v=>r.stateReligion=v);
  b("rcul",v=>r.dominantCulture=v);b("rlang",v=>r.dominantLanguage=v);
  // Ruler: set the current ruler (appends a reign so they become current) or open the full timeline
  { const sel=$("#rRuler"); if(sel)sel.onchange=()=>{
      const v=sel.value; const rulers=realmRulers(r);
      if(v==="__new"){ const name=(prompt("New ruler character name:")||"").trim(); if(name){ const ch=newCharacter({name,isRuler:true}); allCharacters().push(ch); rulers.push({charId:ch.id,title:"",from:"",to:"",note:""}); markDirty(); } renderRealmEditor(); renderMap(); return; }
      if(!v){ /* leave timeline intact; just note no change */ renderRealmEditor(); return; }
      const cur=rulers[rulers.length-1];
      if(!cur){ rulers.push({charId:v,title:"",from:"",to:"",note:""}); }
      else if(cur.charId!==v){ rulers.push({charId:v,title:"",from:"",to:"",note:""}); }   // new succession entry → becomes current
      markDirty(); renderRealmEditor(); renderMap();
    }; }
  { const b2=$("#rRulerTimeline"); if(b2)b2.onclick=()=>openCompendium("realm", r.id); }
  // multi-race pickers: Racial Administration (keeps dominantRace in sync) + Racial Military
  const renderRaceMulti=(key,listId)=>{
    const wrap=$("#"+listId); if(!wrap)return; const arr=r[key]||(r[key]=[]);
    wrap.innerHTML = arr.length ? arr.map((x,i)=>`<span class="tag" data-i="${i}" style="border-color:${raceGroupColor(x)}"><span class="swatch" style="background:${raceGroupColor(x)}"></span>${esc(x)} <span class="x">✕</span></span>`).join(" ") : '<span class="note">None</span>';
    wrap.querySelectorAll(".tag .x").forEach(xb=>xb.onclick=()=>{ const i=+xb.parentElement.dataset.i; arr.splice(i,1); if(key==="adminRaces")r.dominantRace=arr[0]||""; renderRaceMulti(key,listId); renderMap(); renderLeft(); markDirty(); });
  };
  renderRaceMulti("adminRaces","radminRaces"); renderRaceMulti("militaryRaces","rmilRaces");
  { const s=$("#radminSelRace"); if(s)s.addEventListener("change",e=>{ const v=e.target.value; e.target.value=""; if(!v)return; r.adminRaces=r.adminRaces||[]; if(!r.adminRaces.includes(v))r.adminRaces.push(v); r.dominantRace=r.adminRaces[0]||""; renderRaceMulti("adminRaces","radminRaces"); renderMap(); renderLeft(); markDirty(); }); }
  { const s=$("#rmilSelRace"); if(s)s.addEventListener("change",e=>{ const v=e.target.value; e.target.value=""; if(!v)return; r.militaryRaces=r.militaryRaces||[]; if(!r.militaryRaces.includes(v))r.militaryRaces.push(v); renderRaceMulti("militaryRaces","rmilRaces"); markDirty(); }); }
  $("#rcap").addEventListener("change",e=>{r.capitalId=e.target.value||null;renderMap();markDirty();});
  $("#rnote").addEventListener("input",e=>{r.note=e.target.value;markDirty();});
  { const rd=$("#rdesc"); if(rd)rd.addEventListener("input",e=>{r.description=e.target.value;markDirty();}); }
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
  const rexUpd=()=>{state.settleParams={pct:Math.max(0,Math.min(100,+($("#rexPct")?.value)||0)),byReligion:$("#rexRel")?.checked,byCulture:$("#rexCul")?.checked,byLanguage:$("#rexLan")?.checked,byRace:$("#rexRac")?.checked};};
  const rexm=$("#rexmode"); if(rexm)rexm.addEventListener("change",e=>{state.expandMode=e.target.value;const rs=$("#rexSettle");if(rs)rs.classList.toggle("hidden",e.target.value!=="settle");});
  ["rexPct","rexRel","rexCul","rexLan","rexRac"].forEach(id=>{const el=$("#"+id); if(el)el.addEventListener("input",rexUpd);});
  { const ub=$("#rexUndo"); if(ub)ub.addEventListener("click",undoLastExpansion); }
  $("#rpaint").addEventListener("click",()=>{
    if(rexm)state.expandMode=rexm.value; rexUpd();
    if(state.mapmode==="imported"){state.mapmode="political";const ms=$("#mapmode");if(ms)ms.value="political";}
    state.selRealm=r.id; setTool("paint");
    flash("Paint mode ("+state.expandMode+"): click or drag across provinces to expand "+r.name+".");
    renderMap();
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
  renderPaintPanel();
  requestRender();
}
function finishDraft(){
  const t=state.draftType, c=state.focusedContinent&&world.continents.find(x=>x.id===state.focusedContinent);
  if(state.draft && c){
    if(t==="conform" && state.draft.length>=3){ conformToShape(state.draft.slice()); return; }
    if(t==="river" && state.draft.length>=2){
      beginEdit(); world.rivers.push({id:uid(),continentId:c.id,points:state.draft.slice(),width:Math.min(10,Math.max(1,+state.newRiverWidth||3)),name:""});
      state.draft=null;state.drawCursor=null;setTool("select");_geoDirty=true;renderMap();markDirty();flash("River added.");return;
    }
    if(t==="lake" && state.draft.length>=3){
      beginEdit(); world.lakes.push({id:uid(),continentId:c.id,points:state.draft.slice(),width:Math.max(0.5,+state.newLakeWidth||1.5),name:""});
      state.draft=null;state.drawCursor=null;setTool("select");_geoDirty=true;renderMap();markDirty();flash("Lake added.");return;
    }
    if(t==="province" && state.draft.length>=3){
      beginEdit();
      const rid=defaultPopIdentity(world.realms.find(x=>x.id===state.selRealm));
      const p={id:uid(),name:"New Province",continentId:c.id,points:state.draft.slice(),
        terrain:world.lists.terrains[0],settlement:"Village",resource:world.lists.resources[0],features:[],
        pops:[newPop(1000, rid[0], rid[1], rid[2], rid[3], rid[4])],
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
    if(Date.now()-(window._lastTouchEnd||0)<700) return;   // ignore mouse events synthesized from a touch tap (mobile)
    if(state.regionSel&&state.regionSel.active){ state.regionSel.start=rel(ev); state.regionSel.cur=state.regionSel.start.slice(); return; }
    if(state.split){ const w=screenToWorld(ev); state.split.pts.push([w[0],w[1]]); if(state.split.pts.length>=2)performSplit(); else requestRender(); return; }
    if(state.tilt)return;            // tilt = look-only mode
    if(state.rulerOn){ down=true; dragged=false; sx0=ev.clientX; sy0=ev.clientY; camStart={x:state.cam.x,y:state.cam.y}; return; }
    if(state.pingOn && state.pingTool!=="pan"){
      if(state.pingTool==="brush"){ const w=screenToWorld(ev); _curStroke={color:state.pingColor,width:state.pingWidth/state.cam.scale,pts:[[w[0],w[1]]]}; pingLayer.strokes.push(_curStroke); down=true; dragged=true; requestRender(); return; }
      if(state.pingTool==="pin"||state.pingTool==="numpin"){ const w=screenToWorld(ev); const pn={x:w[0],y:w[1],color:state.pingColor}; if(state.pingTool==="numpin")pn.n=nextPinNum(); pingLayer.pins.push(pn); savePings(); requestRender(); return; }
      if(state.pingTool==="erase"){ down=true; dragged=true; pingEraseAt(ev); return; }
    }
    if(state.tool==="select"){ const lid=customLabelAt(ev); if(lid){ beginEdit(); state.customDrag=lid; down=true; dragged=false; return; } }
    if(state.tool==="select" && state.showNames){ const cid=continentLabelAt(ev); if(cid){ beginEdit(); state.labelDrag=cid; down=true; dragged=false; return; } }
    if(!VIEWER && state.selWater){ const h=waterNodeAt(ev); if(h){ beginEdit(); state.waterNodeDrag=h; down=true; dragged=false; return; } }   // reshape selected river/lake
    if(state.tool==="nodes"){ const h=nodeAt(ev); if(h){ beginEdit(); state.nodeDrag=h; down=true; dragged=false; return; } }
    if(state.tool==="move"){ const w=screenToWorld(ev); const p=provinceAt(w[0],w[1]); if(p){ beginEdit(); state.moveDrag={p,start:p.points.map(pt=>pt.slice()),grab:[w[0],w[1]]}; down=true; dragged=false; return; } }
    if(state.tool==="paint" && paintReady()){ beginEdit(); beginExpandStroke(); _mixStrokeSet=new Set(); }
    down=true; dragged=false; painted=false; sx0=ev.clientX; sy0=ev.clientY; camStart={x:state.cam.x,y:state.cam.y};
  });
  window.addEventListener("mousemove",ev=>{
    if(state.rulerOn && !state.rulerDone && state.rulerPts.length && !down){ const w=screenToWorld(ev); state.rulerCur=[w[0],w[1]]; requestRender(); }
    if(_curStroke && down){ const w=screenToWorld(ev); _curStroke.pts.push([w[0],w[1]]); requestRender(); return; }
    if(state.pingOn && state.pingTool==="erase" && down){ pingEraseAt(ev); return; }
    if(state.regionSel&&state.regionSel.active&&state.regionSel.start){ state.regionSel.cur=rel(ev); requestRender(); return; }
    if(state.split){ const w=screenToWorld(ev); state.split.cur=[w[0],w[1]]; requestRender(); return; }
    if(state.customDrag){ const w=screenToWorld(ev); const lb=world.labels.find(x=>x.id===state.customDrag); if(lb){lb.x=Math.round(w[0]);lb.y=Math.round(w[1]);} dragged=true; requestRender(); return; }
    if(state.labelDrag){ const w=screenToWorld(ev); const c=world.continents.find(x=>x.id===state.labelDrag); if(c)c.labelPos=[Math.round(w[0]),Math.round(w[1])]; dragged=true; requestRender(); return; }
    if(DRAW_TOOLS.includes(state.tool)){ const w=screenToWorld(ev); state.drawCursor=snapWorld(w[0],w[1],null); requestRender(); return; }
    if(state.waterNodeDrag){ const w=screenToWorld(ev); const h=state.waterNodeDrag;
      h.obj.points[h.i]=[Math.round(w[0]-h.c.ox),Math.round(w[1]-h.c.oy)]; dragged=true; markDirty(); requestRender(); return; }
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
    if(convertSelectActive() && !state.convertPickCenter){
      const [wx,wy]=screenToWorld(ev); const p=provinceAt(wx,wy);
      if(p && !state.convertSel.has(p.id)){ state.convertSel.add(p.id); renderConvertPanel(); requestRender(); }
      return;
    }
    if(!VIEWER && state.mapmode==="region" && state.selRegion){   // drag to add provinces to the active region (drag on empty space still pans)
      const [wx,wy]=screenToWorld(ev); const p=provinceAt(wx,wy);
      if(p){ const rg=regionById(state.selRegion); if(rg && !(rg.provinceIds||[]).includes(p.id)){ rg.provinceIds.push(p.id); markDirty(); requestRender(); buildMapLegend(); renderRegionEditor(); } return; }
    }
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
    if(state.waterNodeDrag){ state.waterNodeDrag=null; down=false; markDirty(); return; }
    if(state.customDrag){ const id=state.customDrag; state.customDrag=null; down=false; if(dragged)markDirty(); else selectCustomLabel(id); return; }
    if(state.labelDrag){ state.labelDrag=null; down=false; markDirty(); return; }
    if(state.nodeDrag){ state.nodeDrag=null; down=false; _geoDirty=true; renderMap(); markDirty(); return; }
    if(state.moveDrag){ state.moveDrag=null; down=false; _geoDirty=true; renderMap(); renderLeft(); markDirty(); return; }
    if(!down)return; down=false;
    if(painted){ _labelsDirty=true; renderLeft(); markDirty(); requestRender(); painted=false; }
    if(state.tilt||dragged)return;   // a drag was a pan or a paint-stroke, not a click
    const [wx,wy]=screenToWorld(ev);
    if(state.rulerOn){ if(state.rulerDone){ state.rulerPts=[]; state.rulerDone=false; } state.rulerPts.push([wx,wy]); state.rulerCur=null; requestRender(); return; }
    if(state.mapmode==="military"){
      // sticky move: while Move is toggled on, every click relocates the selected force
      if(state.moveMode==="force" && state.selForce && !VIEWER){ const f=world.forces.find(x=>x.id===state.selForce); if(f){ beginEdit(); f.x=Math.round(wx); f.y=Math.round(wy); separateForce(f); markDirty(); renderMap(); } return; }
      const bt=battleAt(wx,wy); if(bt){ selectBattle(bt[0].id,bt[1].id); return; }
      const f=forceAt(wx,wy); if(f){ selectForce(f.id); return; }
      if(state.selForce||state.selBattle){ state.selForce=null; state.selBattle=null; state.moveMode=null; clearSelection(); }
      return;
    }
    if(state.mapmode==="monster"){
      if(state.moveMode==="monster" && state.selMonster && !VIEWER){ const m=world.monsters.find(x=>x.id===state.selMonster); if(m){ beginEdit(); m.x=Math.round(wx); m.y=Math.round(wy); markDirty(); renderMap(); } return; }
      const m=monsterAt(wx,wy); if(m){ selectMonster(m.id); return; }
      if(state.selMonster){ state.selMonster=null; state.moveMode=null; clearSelection(); }
      return;
    }
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
    if(state.editMode || waterEditActive()){ const ws=waterAt(wx,wy); if(ws){ selectWater(ws.type,ws.id); return; } if(waterEditActive()){ if(state.selWater){state.selWater=null;renderMap();} return; } }
    const p=provinceAt(wx,wy);
    if(p){ onProvinceClick(p); return; }
    const c=continentAt(wx,wy);
    if(c) state.focusedContinent=c.id;   // focus it for drawing, but don't open the continent view
    clearSelection();   // clicking away from a province just closes the right panel
  });
  cv.addEventListener("dblclick",ev=>{
    if(state.rulerOn){ ev.preventDefault();
      // the double-click's two clicks add a duplicate point — drop it, then freeze
      if(state.rulerPts.length>=2){const a=state.rulerPts[state.rulerPts.length-1],b=state.rulerPts[state.rulerPts.length-2]; if(Math.hypot(a[0]-b[0],a[1]-b[1])<6/state.cam.scale)state.rulerPts.pop();}
      state.rulerDone=true; state.rulerCur=null; requestRender();
      flash(state.rulerPts.length>=2?"Measurement finished — click to start a new one, Esc to clear.":"Measurement cleared.");
      return; }
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
    if(ev.key==="Escape"){if(state.regionSel){state.regionSel=null;_regionCb=null;flash("Region export cancelled.");}if(state.split){state.split=null;flash("Split cancelled.");}if(state.rulerOn&&state.rulerPts.length){state.rulerPts=[];state.rulerCur=null;state.rulerDone=false;flash("Measurement cleared.");}if(state.moveMode){state.moveMode=null;flash("Move mode off.");if(state.selForce)renderForceEditor();else if(state.selMonster)renderMonsterEditor();}state.draft=null;state.nodeDrag=null;requestRender();}
    if(inField)return;
    if(/^[0-9]$/.test(ev.key)){const idx=ev.key==="0"?9:(+ev.key-1); const m=MAPMODE_BAR[idx]; if(m){setMapmode(m[0]);return;}}
    if(ev.key==="o"||ev.key==="O"){setMapmode("monster");return;}
    if(ev.key==="p"||ev.key==="P"){setMapmode("military");return;}
    if(ev.key==="r"||ev.key==="R"){setMapmode("region");return;}
    if(ev.key==="t"||ev.key==="T"){setMapmode("tech");return;}
    if(ev.key==="v")setTool("select");
    if(ev.key==="d")setTool("draw");
    if(ev.key==="b")setTool("paint");
    if(ev.key==="e")setTool("nodes");
  });
  window.addEventListener("resize",requestRender);
  window.addEventListener("resize",()=>{ positionWonderPanel(); positionTechPanel(); });
  setupTouch(cv);
}
// ---- touch controls (mobile): one-finger pan, pinch zoom, tap to select ----
function setupTouch(cv){
  let t={};
  const worldAt=(cx,cy)=>{const r=cv.getBoundingClientRect();return [state.cam.x+(cx-r.left)/state.cam.scale, state.cam.y+(cy-r.top)/state.cam.scale];};
  cv.addEventListener("touchstart",ev=>{
    if(ev.touches.length===2){
      const a=ev.touches[0],b=ev.touches[1];
      t={mode:"pinch",dist:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),mx:(a.clientX+b.clientX)/2,my:(a.clientY+b.clientY)/2};
      return;
    }
    if(ev.touches.length!==1)return;
    const tt=ev.touches[0];
    if(state.pingOn && state.pingTool==="brush"){ const w=worldAt(tt.clientX,tt.clientY); _curStroke={color:state.pingColor,width:state.pingWidth/state.cam.scale,pts:[[w[0],w[1]]]}; pingLayer.strokes.push(_curStroke); t={mode:"draw"}; return; }
    if(state.pingOn && state.pingTool==="erase"){ t={mode:"erase"}; const w=worldAt(tt.clientX,tt.clientY); pingEraseAtWorld(w[0],w[1]); return; }
    t={mode:"pan",x:tt.clientX,y:tt.clientY,sx:tt.clientX,sy:tt.clientY,moved:false};
  },{passive:false});
  cv.addEventListener("touchmove",ev=>{
    ev.preventDefault();
    if(t.mode==="pinch" && ev.touches.length===2){
      const a=ev.touches[0],b=ev.touches[1];
      const dist=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY), mx=(a.clientX+b.clientX)/2, my=(a.clientY+b.clientY)/2;
      const r=cv.getBoundingClientRect(), px=mx-r.left, py=my-r.top;
      const wx=state.cam.x+px/state.cam.scale, wy=state.cam.y+py/state.cam.scale;
      state.cam.scale=Math.max(0.02,Math.min(40,state.cam.scale*(dist/(t.dist||dist))));
      state.cam.x=wx-px/state.cam.scale-(mx-t.mx)/state.cam.scale;
      state.cam.y=wy-py/state.cam.scale-(my-t.my)/state.cam.scale;
      t.dist=dist; t.mx=mx; t.my=my; requestRender(); return;
    }
    if(ev.touches.length!==1)return; const tt=ev.touches[0];
    if(t.mode==="draw" && _curStroke){ const w=worldAt(tt.clientX,tt.clientY); _curStroke.pts.push([w[0],w[1]]); requestRender(); return; }
    if(t.mode==="erase"){ const w=worldAt(tt.clientX,tt.clientY); pingEraseAtWorld(w[0],w[1]); return; }
    if(t.mode==="pan"){ const dx=tt.clientX-t.x, dy=tt.clientY-t.y; if(Math.hypot(tt.clientX-t.sx,tt.clientY-t.sy)>7)t.moved=true;
      state.cam.x-=dx/state.cam.scale; state.cam.y-=dy/state.cam.scale; t.x=tt.clientX; t.y=tt.clientY; requestRender(); }
  },{passive:false});
  cv.addEventListener("touchend",ev=>{
    window._lastTouchEnd=Date.now();   // suppress the mouse events the browser synthesizes from this tap
    if(t.mode==="draw"){ _curStroke=null; savePings(); }
    else if(t.mode==="erase"){ savePings(); }
    else if(t.mode==="pan" && !t.moved && ev.changedTouches.length){ const tt=ev.changedTouches[0]; const [wx,wy]=worldAt(tt.clientX,tt.clientY); handleTapWorld(wx,wy); }
    t={};
  });
}
function pingEraseAtWorld(wx,wy){
  const r=(state.pingWidth*2+12)/state.cam.scale, r2=r*r;
  pingLayer.strokes=pingLayer.strokes.filter(st=>!(st.pts||[]).some(pt=>{const dx=pt[0]-wx,dy=pt[1]-wy;return dx*dx+dy*dy<r2;}));
  pingLayer.pins=pingLayer.pins.filter(pn=>{const dx=pn.x-wx,dy=pn.y-wy;return dx*dx+dy*dy>r2;});
  requestRender();
}
function handleTapWorld(wx,wy){
  // tapping the map closes any open mobile panel / sheet
  if(document.body.classList.contains("m-drawer")||document.body.classList.contains("has-sel")){
    document.body.classList.remove("m-drawer"); document.body.classList.remove("has-sel");
    const bp=$("#btnPanels"); if(bp)bp.classList.remove("on"); requestRender(); return;
  }
  if(_mmOpen){ _mmOpen=false; refreshMapmodeBar(); return; }   // a tap closes the map-mode picker
  if(state.rulerOn){ if(state.rulerDone){state.rulerPts=[];state.rulerDone=false;} state.rulerPts.push([wx,wy]); state.rulerCur=null; requestRender(); return; }
  if(state.pingOn && (state.pingTool==="pin"||state.pingTool==="numpin")){ const pn={x:wx,y:wy,color:state.pingColor}; if(state.pingTool==="numpin")pn.n=nextPinNum(); pingLayer.pins.push(pn); savePings(); requestRender(); return; }
  if(state.mapmode==="military"){
    if(state.moveMode==="force" && state.selForce && !VIEWER){ const f=world.forces.find(x=>x.id===state.selForce); if(f){beginEdit();f.x=Math.round(wx);f.y=Math.round(wy);separateForce(f);markDirty();renderMap();} return; }
    const bt=battleAt(wx,wy); if(bt){ selectBattle(bt[0].id,bt[1].id); return; }
    const f=forceAt(wx,wy); if(f){ selectForce(f.id); return; }
    if(state.selForce||state.selBattle){ state.selForce=null;state.selBattle=null;state.moveMode=null; clearSelection(); } return;
  }
  if(state.mapmode==="monster"){
    if(state.moveMode==="monster" && state.selMonster && !VIEWER){ const m=world.monsters.find(x=>x.id===state.selMonster); if(m){beginEdit();m.x=Math.round(wx);m.y=Math.round(wy);markDirty();renderMap();} return; }
    const m=monsterAt(wx,wy); if(m){ selectMonster(m.id); return; }
    if(state.selMonster){ state.selMonster=null;state.moveMode=null; clearSelection(); } return;
  }
  const mobile=document.body.classList.contains("mobile");
  const p=provinceAt(wx,wy);
  if(p && !VIEWER && state.mapmode==="population" && state.popScope==="selected"){
    if(state.popSel.has(p.id))state.popSel.delete(p.id); else state.popSel.add(p.id);
    renderMap(); renderPopPanel(); return;
  }
  if(p && (convertSelectActive()||state.convertPickCenter) && convertAxis()){ convertHandleClick(p); return; }
  if(p && state.mapmode==="region"){ regionProvinceClick(p); return; }
  if(p && state.mapmode==="tech"){ if(p.realmId){ const rr=world.realms.find(x=>x.id===p.realmId); state.legendFilter={mode:"tech",value:Math.round(realmTL(rr).avg)}; selectRealm(p.realmId); renderMap(); } else selectProvince(p.id); return; }
  if(p && state.tool==="paint" && paintReady()){ beginEdit(); beginExpandStroke(); _mixStrokeSet=new Set(); if(paintProvince(p)){_labelsDirty=true;renderMap();renderLeft();markDirty();} return; }
  if(p && state.mapmode==="resource"){ spotlightResource(p); selectProvince(p.id); return; }
  if(p && state.mapmode==="race"){ const d=dominant(p.race); if(d)setRaceGroup(subraceGroup(d)); selectProvince(p.id); return; }
  if(p){ spotlightProvinceItem(p); selectProvince(p.id); return; }   // open the province sheet (desktop panel or mobile bottom-sheet)
  document.body.classList.remove("has-sel");
  const c=continentAt(wx,wy); if(c) state.focusedContinent=c.id;
  requestRender();
}

/* ============================================================
   VIEW: tilt, world view, focus, zoom
   ============================================================ */
function toggleTilt(force){   // tilt feature removed; kept as a no-op-safe stub
  state.tilt=(typeof force==="boolean")?force:!state.tilt;
  const m=$("#map"); if(m)m.classList.toggle("tilt",state.tilt);
  const b=$("#toggleTilt"); if(b)b.classList.toggle("on",state.tilt);
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
/* ---------- province finder ---------- */
function matchProvinces(q){
  q=(q||"").trim().toLowerCase(); if(!q)return [];
  const starts=[],incl=[];
  for(const p of world.provinces){ const n=(p.name||"").toLowerCase(); if(!n)continue;
    if(n.startsWith(q))starts.push(p); else if(n.includes(q))incl.push(p); }
  starts.sort((a,b)=>a.name.localeCompare(b.name));
  return starts.concat(incl).slice(0,10);
}
function zoomToProvince(p){
  const g=_provGeo.find(x=>x.p.id===p.id); if(!g)return;
  const cv=$("#map"); const cw=cv.clientWidth||800, ch=cv.clientHeight||600;
  const w=Math.max(4,g.maxx-g.minx), h=Math.max(4,g.maxy-g.miny), pad=4;
  const sc=Math.max(0.05,Math.min(20,Math.min(cw/(w*pad), ch/(h*pad))));
  state.cam.scale=sc; state.cam.x=g.cx-cw/(2*sc); state.cam.y=g.cy-ch/(2*sc);
  state.selProvince=p.id; state.focusedContinent=p.continentId;
  renderMap();
  if(!document.body.classList.contains("mobile")) renderProvinceEditor();
  flash("→ "+p.name);
}
function hideProvFind(){ const b=$("#provFindResults"); if(b){b.classList.add("hidden");b.innerHTML="";} }
function renderProvFind(q){
  const box=$("#provFindResults"); if(!box)return;
  const list=matchProvinces(q);
  if(!list.length){ hideProvFind(); return; }
  const pf=$("#provFind"); if(pf){const r=pf.getBoundingClientRect(); box.style.top=(r.bottom+4)+"px"; box.style.left=Math.min(r.left,window.innerWidth-260)+"px";}
  box.innerHTML=""; box.classList.remove("hidden");
  list.forEach(p=>{
    const realm=world.realms.find(r=>r.id===p.realmId);
    const d=div("pfrow"); d.innerHTML=`<b>${esc(p.name)}</b>${realm?` <span class="note">— ${esc(realm.name)}</span>`:""}`;
    d.onclick=()=>{ const pf=$("#provFind"); if(pf)pf.value=p.name; zoomToProvince(p); hideProvFind(); };
    box.appendChild(d);
  });
}
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
  if(_coastSegs.length){ ctx.save(); ctx.lineCap="round"; ctx.lineWidth=1.6/s; ctx.strokeStyle="rgba(18,36,60,.9)";
    ctx.beginPath(); for(const sg of _coastSegs){ ctx.moveTo(sg[0],sg[1]); ctx.lineTo(sg[2],sg[3]); } ctx.stroke(); ctx.restore(); }
  drawAxisStripes(ctx, renderMode, s);   // identity maps: melting-pot hatching
  // resource map: gold outline on prestige-good provinces (no icons — outline only, to distinguish them)
  if(mode==="resource"){
    ctx.lineWidth=2.5/s; ctx.strokeStyle="#e8b21f"; ctx.lineJoin="round";
    for(const gp of _provGeo){ if(!isPrestige(gp.p.resource))continue; const pts=gp.pts; if(!pts.length)continue;
      ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]); ctx.closePath(); ctx.stroke(); }
  }
  drawWater(ctx,s);
  if(renderMode!=="political" && (state.realmOverlay || renderMode==="tech")) drawRealmBorders(ctx);
  ctx.setTransform(1,0,0,1,0,0);ctx.textAlign="center";ctx.textBaseline="middle";
  const keySz=Math.max(5,Math.round(mapW/360));   // capital/admin marker size (shared) — small so it doesn't crowd labels
  // markers first, so names/labels render on top of the capital stars & admin diamonds
  drawKeyLocations(ctx, rect.x, rect.y, s, mapW, mapH, keySz);
  if(isProvMap){
    // Label every province, wrapping/rotating/scaling the text to fit its borders.
    const provMaxFs=Math.max(14,Math.round(mapW/120));
    for(const gl of _provGeo){
      if(Math.max((gl.maxx-gl.minx),(gl.maxy-gl.miny))*s<9)continue;
      const X=(gl.lx-rect.x)*s,Y=(gl.ly-rect.y)*s;if(X<-40||Y<-20||X>mapW+40||Y>mapH+20)continue;
      ctx.save(); const pts=gl.pts; ctx.beginPath(); ctx.moveTo((pts[0][0]-rect.x)*s,(pts[0][1]-rect.y)*s);
      for(let i=1;i<pts.length;i++)ctx.lineTo((pts[i][0]-rect.x)*s,(pts[i][1]-rect.y)*s); ctx.closePath(); ctx.clip();
      drawFittedLabel(ctx,gl.p.name,X,Y,gl.ang,gl.llen*s,gl.lthick*s,provMaxFs, _keyLocMap[gl.p.id]?keySz*1.5:0);
      ctx.restore();
    }
  } else if(provNames && s>0.45){const pMax=Math.max(12,Math.round(mapW/160));
    for(const gl of _provGeo){if(Math.max((gl.maxx-gl.minx),(gl.maxy-gl.miny))*s<46)continue;const X=(gl.lx-rect.x)*s,Y=(gl.ly-rect.y)*s;if(X<-40||Y<-20||X>mapW+40||Y>mapH+20)continue;
      ctx.save(); const pts=gl.pts; ctx.beginPath(); ctx.moveTo((pts[0][0]-rect.x)*s,(pts[0][1]-rect.y)*s); for(let i=1;i<pts.length;i++)ctx.lineTo((pts[i][0]-rect.x)*s,(pts[i][1]-rect.y)*s); ctx.closePath(); ctx.clip();
      drawFittedLabel(ctx,gl.p.name,X,Y,gl.ang,gl.llen*s,gl.lthick*s,pMax, _keyLocMap[gl.p.id]?keySz*1.5:0); ctx.restore();}}
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
  for(const lg of _lg){let fontPx=Math.sqrt(lg.a)*0.135*s;if(fontPx<10)continue;fontPx=Math.min(fontPx,300);
    if(lg.minorLen)fontPx=Math.min(fontPx,lg.minorLen*s*0.52);if(fontPx<10)continue;
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
  // only the Province map labels every province; all other maps export without province names
  const cv=exportRender(rect,outW,mode,legend,legendPos,mode==="provincemap");
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
  if(k==="religions"){ax("religion");R.forEach(r=>{if(r.stateReligion===ov)r.stateReligion=nv;});
    (world.wonders||[]).forEach(w=>{ if(Array.isArray(w.religions))w.religions=w.religions.map(x=>x===ov?nv:x); });
    if(world.religionInfo&&world.religionInfo[ov]!==undefined){world.religionInfo[nv]=world.religionInfo[ov];delete world.religionInfo[ov];}}
  else if(k==="cultures"){ax("culture");R.forEach(r=>{if(r.dominantCulture===ov)r.dominantCulture=nv;});}
  else if(k==="races"){R.forEach(r=>{if(r.dominantRace===ov)r.dominantRace=nv;      // races are groups now
    ["adminRaces","militaryRaces"].forEach(kk=>{ if(Array.isArray(r[kk])) r[kk]=r[kk].map(x=>x===ov?nv:x); });});
    if(world.subraceOf)Object.keys(world.subraceOf).forEach(sr=>{ if(world.subraceOf[sr]===ov)world.subraceOf[sr]=nv; });}
  else if(k==="languages"){ax("language");R.forEach(r=>{if(r.dominantLanguage===ov)r.dominantLanguage=nv;});}
  else if(k==="terrains"){P.forEach(p=>{if(p.terrain===ov)p.terrain=nv;});}
  else if(k==="settlements"){P.forEach(p=>{if(p.settlement===ov)p.settlement=nv;});}
  else if(k==="resources"){P.forEach(p=>{if(p.resource===ov)p.resource=nv;});}
  else if(k==="hiddenResources"){P.forEach(p=>{if(p.hidden===ov)p.hidden=nv;});}
  else if(k==="features"){P.forEach(p=>p.features=p.features.map(f=>f===ov?nv:f));if(world.featureCats&&world.featureCats[ov]!==undefined){world.featureCats[nv]=world.featureCats[ov];delete world.featureCats[ov];}if(world.featureInfo&&world.featureInfo[ov]!==undefined){world.featureInfo[nv]=world.featureInfo[ov];delete world.featureInfo[ov];}}
  else if(k==="governments"){R.forEach(r=>{if(r.government===ov)r.government=nv;});}
  else if(k==="economies"){ax("economy");R.forEach(r=>{if(r.economy===ov)r.economy=nv;});}
  // carry the GM-screen modifier over to the new name
  if(world.tune){
    if(k==="terrains"&&world.tune.terrainHab&&world.tune.terrainHab[ov]!==undefined){world.tune.terrainHab[nv]=world.tune.terrainHab[ov];delete world.tune.terrainHab[ov];}
    if(k==="races"&&world.tune.raceGrowth&&world.tune.raceGrowth[ov]!==undefined){world.tune.raceGrowth[nv]=world.tune.raceGrowth[ov];delete world.tune.raceGrowth[ov];}
    if(k==="races"&&world.tune.raceSize&&world.tune.raceSize[ov]!==undefined){world.tune.raceSize[nv]=world.tune.raceSize[ov];delete world.tune.raceSize[ov];}
    const carry=(o)=>{ if(o&&o[ov]!==undefined){o[nv]=o[ov];delete o[ov];} };
    if(world.tune.pop){
      if(k==="terrains"){ carry(world.tune.pop.terrainGrow); carry(world.tune.pop.terrainCeil); }
      if(k==="settlements"){ carry(world.tune.pop.settleGrow); carry(world.tune.pop.settleCeil); }
    }
    if(k==="terrains") carry(world.terrainImages);
  }
}
function listUsageCount(k,v){
  const P=world.provinces,R=world.realms; let n=0;
  const ax=key=>P.forEach(p=>{if((p.pops||[]).some(q=>q[key]===v))n++;});
  if(k==="religions"){ax("religion");} else if(k==="cultures"){ax("culture");}
  else if(k==="races"){ax("race");} else if(k==="languages"){ax("language");}
  else if(k==="terrains")n=P.filter(p=>p.terrain===v).length;
  else if(k==="settlements")n=P.filter(p=>p.settlement===v).length;
  else if(k==="resources")n=P.filter(p=>p.resource===v).length;
  else if(k==="hiddenResources")n=P.filter(p=>p.hidden===v).length;
  else if(k==="features")n=P.filter(p=>p.features.includes(v)).length;
  else if(k==="governments")n=R.filter(r=>r.government===v).length;
  else if(k==="economies")n=R.filter(r=>r.economy===v).length;
  return n;
}
function applyListDelete(k,v){
  const P=world.provinces,R=world.realms;
  const axDel=key=>P.forEach(p=>{let ch=false;(p.pops||[]).forEach(q=>{if(q[key]===v){q[key]="";ch=true;}});if(ch)deriveProvince(p);});
  if(k==="religions"){axDel("religion");R.forEach(r=>{if(r.stateReligion===v)r.stateReligion="";});
    (world.wonders||[]).forEach(w=>{ if(Array.isArray(w.religions)){w.religions=w.religions.filter(x=>x!==v); if(!w.religions.length)w.holySite=false;} });
    if(world.religionInfo)delete world.religionInfo[v];}
  else if(k==="cultures"){axDel("culture");R.forEach(r=>{if(r.dominantCulture===v)r.dominantCulture="";});}
  else if(k==="races"){R.forEach(r=>{if(r.dominantRace===v)r.dominantRace="";              // races are groups now
    ["adminRaces","militaryRaces"].forEach(kk=>{ if(Array.isArray(r[kk])) r[kk]=r[kk].filter(x=>x!==v); }); if(r.adminRaces&&r.adminRaces.length)r.dominantRace=r.adminRaces[0];});
    const fb=(world.lists.races||[]).find(g=>g!==v)||"";                                   // move its subraces to another group
    if(world.subraceOf)Object.keys(world.subraceOf).forEach(sr=>{ if(world.subraceOf[sr]===v)world.subraceOf[sr]=fb; });}
  else if(k==="languages"){axDel("language");R.forEach(r=>{if(r.dominantLanguage===v)r.dominantLanguage="";});}
  else if(k==="features"){P.forEach(p=>p.features=p.features.filter(f=>f!==v));if(world.featureCats)delete world.featureCats[v];if(world.featureInfo)delete world.featureInfo[v];}
  else if(k==="terrains"){const fb=(world.lists.terrains.find(x=>x!==v))||"Plains";P.forEach(p=>{if(p.terrain===v)p.terrain=fb;});}
  else if(k==="settlements"){const fb=(world.lists.settlements.find(x=>x!==v))||"Uninhabited";P.forEach(p=>{if(p.settlement===v)p.settlement=fb;});}
  else if(k==="resources"){const fb=(world.lists.resources.find(x=>x!==v))||"Grains";P.forEach(p=>{if(p.resource===v)p.resource=fb;});}
  else if(k==="hiddenResources"){P.forEach(p=>{if(p.hidden===v)p.hidden="";});}
  else if(k==="governments"){const fb=(world.lists.governments.find(x=>x!==v))||"";R.forEach(r=>{if(r.government===v)r.government=fb;});}
  else if(k==="economies"){const fb=(world.lists.economies.find(x=>x!==v))||"Primitive";R.forEach(r=>{if(r.economy===v)r.economy=fb;});P.forEach(p=>{let ch=false;(p.pops||[]).forEach(q=>{if(q.economy===v){q.economy=fb;ch=true;}});if(ch)deriveProvince(p);});}
  // drop the GM-screen modifier for the removed type
  if(world.tune){
    if(k==="terrains"&&world.tune.terrainHab)delete world.tune.terrainHab[v];
    if(k==="races"&&world.tune.raceGrowth)delete world.tune.raceGrowth[v];
    if(k==="races"&&world.tune.raceSize)delete world.tune.raceSize[v];
    if(world.tune.pop){
      if(k==="terrains"){ delete world.tune.pop.terrainGrow[v]; delete world.tune.pop.terrainCeil[v]; }
      if(k==="terrains"&&world.terrainImages)delete world.terrainImages[v];
      if(k==="settlements"){ delete world.tune.pop.settleGrow[v]; delete world.tune.pop.settleCeil[v]; }
    }
  }
}
// Races & subraces are managed in the 🧭 GM Screen (v2), not here.
const LIST_KEYS=[["religions","Religions"],["cultures","Cultures"],["languages","Languages"],["terrains","Terrains"],["settlements","Settlement tiers"],["resources","Resources"],["hiddenResources","Strategic resources"],["features","Features"],["governments","Government types"],["economies","Modes of Production"]];
const MODE_LIST={religion:"religions",culture:"cultures",race:"races",language:"languages",terrain:"terrains",settlement:"settlements",resource:"resources",economy:"economies"};
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
const COLORABLE=["religions","cultures","languages","terrains","settlements","resources"];   // races carry no colour now (subraces do)
function renderListCard(k){
  const wrap=$("#lc_"+k);if(!wrap)return;wrap.innerHTML="";
  const colorable=COLORABLE.includes(k);
  world.lists[k].forEach((v,i)=>{
    const row=div("li");
    const custom=colorable&&world.colors[k]&&world.colors[k][v]!==undefined;
    const colInput=colorable?`<input class="lcol" type="color" value="${toHex(catColor(k,v))}" title="Map colour" style="width:30px;height:26px;padding:1px;flex:0 0 auto"/><span class="rst" title="Reset to default colour" style="cursor:pointer;font-size:15px;flex:0 0 auto;color:${custom?'var(--accent)':'var(--muted)'}">↺</span>`:"";
    const descBtn = k==="features" ? `<button class="btn tiny lfdesc" title="Edit this feature's blurb" style="flex:0 0 auto">✎</button>` : "";
    row.innerHTML=`<input class="lname" value="${esc(v)}"/>${colInput}${descBtn}<span class="x" title="Delete">✕</span>`;
    const inp=row.querySelector(".lname");
    inp.addEventListener("change",e=>{const ov=world.lists[k][i],nv=e.target.value.trim();if(!nv){e.target.value=ov;return;}world.lists[k][i]=nv;applyListRename(k,ov,nv);renderMap();renderLeft();markDirty();});
    { const db=row.querySelector(".lfdesc"); if(db)db.onclick=()=>showFeatureBubble(world.lists[k][i], db, true); }
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
// Keep the GM-screen modifiers in lock-step with the race & terrain lists:
// seed a tweakable entry for every current type, and drop any whose type is gone.
function syncTuneKeys(){
  if(!world.tune)world.tune={};
  world.tune.terrainHab=world.tune.terrainHab||{};
  world.tune.raceGrowth=world.tune.raceGrowth||{};
  const terrains=world.lists.terrains||[], races=world.lists.races||[];
  terrains.forEach(t=>{ if(world.tune.terrainHab[t]===undefined) world.tune.terrainHab[t]=terrainHab(t); });
  races.forEach(r=>{ if(world.tune.raceGrowth[r]===undefined) world.tune.raceGrowth[r]=raceGrowthMod(r); });
  const T=new Set(terrains), R=new Set(races);
  Object.keys(world.tune.terrainHab).forEach(t=>{ if(!T.has(t)) delete world.tune.terrainHab[t]; });
  Object.keys(world.tune.raceGrowth).forEach(r=>{ if(!R.has(r)) delete world.tune.raceGrowth[r]; });
  seedPopTune(world);   // keep pop growth/ceiling tunables in step with current terrains & settlement tiers
}
function tuneValuesHTML(){
  const SETTLE_LABELS=["Uninhabited","Nomadic","Village","Town","City","Megalopolis"];
  const sf=(world.tune.settleFactors&&world.tune.settleFactors.length)?world.tune.settleFactors:[0,0.4,1,1.8,3,4.5];
  const terrRows=world.lists.terrains.map(t=>`
    <div class="field" style="flex:0 0 132px"><label>${esc(t)}</label>
      <input class="tuneHab" data-t="${esc(t)}" type="number" step="0.05" min="0" value="${terrainHab(t)}"/></div>`).join("");
  const raceRows=world.lists.races.map(r=>`
    <div class="field" style="flex:0 0 132px"><label>${esc(r)}</label>
      <input class="tuneRace" data-r="${esc(r)}" type="number" step="0.05" min="0" value="${raceGrowthMod(r)}"/></div>`).join("");
  const settleRows=SETTLE_LABELS.map((s,i)=>`
    <div class="field" style="flex:0 0 132px"><label>${esc(s)}</label>
      <input class="tuneSettle" data-i="${i}" type="number" step="0.1" min="0" value="${sf[i]!=null?sf[i]:0}" ${i===0?"disabled":""}/></div>`).join("");
  return `
    <div class="sectionH">⚙ Terrain habitability (population &amp; growth multiplier)</div>
    <p class="note">1.0 = a normal fertile land. Higher = more people and faster growth; lower = harsher.</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${terrRows}</div>
    <div class="sectionH">🧬 Growth modifier per race</div>
    <p class="note">Multiplies how fast each race's pop groups grow when you press 🌱 Grow. 1.0 = normal, 1.5 = fast breeders, 0.5 = slow.</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${raceRows||'<div class="note">No races defined yet.</div>'}</div>
    <div class="sectionH">🏙 Settlement-tier capacity</div>
    <p class="note">How much population each settlement tier can hold when seeding (relative multiplier).</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${settleRows}</div>
    <div class="sectionH">⭐ Key-location boosts</div>
    <div class="field2">
      <div class="field"><label>Capital boost ×</label><input id="tuneCap" type="number" min="1" step="0.1" value="${world.capitalBoost??1.8}"/></div>
      <div class="field"><label>Admin center boost ×</label><input id="tuneAdm" type="number" min="1" step="0.1" value="${world.adminBoost??1.3}"/></div>
    </div>
    <div class="btnrow"><button class="btn" id="tuneReset">↺ Reset tunables to defaults</button></div>`;
}
function wireTuneValues(){
  $$(".tuneHab").forEach(el=>el.addEventListener("input",e=>{const t=el.dataset.t,v=e.target.value;if(v==="")delete world.tune.terrainHab[t];else world.tune.terrainHab[t]=+v;markDirty();}));
  $$(".tuneRace").forEach(el=>el.addEventListener("input",e=>{const r=el.dataset.r,v=e.target.value;if(v==="")delete world.tune.raceGrowth[r];else world.tune.raceGrowth[r]=+v;markDirty();}));
  $$(".tuneSettle").forEach(el=>el.addEventListener("input",e=>{ const base=(world.tune.settleFactors&&world.tune.settleFactors.length)?world.tune.settleFactors.slice():[0,0.4,1,1.8,3,4.5]; base[+el.dataset.i]=+e.target.value||0; world.tune.settleFactors=base; markDirty(); }));
  const cap=$("#tuneCap"); if(cap)cap.addEventListener("input",e=>{world.capitalBoost=Math.max(1,+e.target.value||1);markDirty();});
  const adm=$("#tuneAdm"); if(adm)adm.addEventListener("input",e=>{world.adminBoost=Math.max(1,+e.target.value||1);markDirty();});
  const rst=$("#tuneReset"); if(rst)rst.addEventListener("click",()=>{ if(!confirm("Reset terrain habitability, race growth, settlement factors and key-location boosts to their defaults?"))return; world.tune.terrainHab={}; world.tune.raceGrowth={}; world.tune.settleFactors=null; delete world.capitalBoost; delete world.adminBoost; markDirty(); openGMScreen(); });
}
function renderCreatureTypes(){
  const box=$("#creatureTypes"); if(!box)return; box.innerHTML="";
  world.creatureTypes=world.creatureTypes||[];
  world.creatureTypes.forEach((t,i)=>{
    const row=div("ctRow");
    row.innerHTML=`<input type="color" class="ctCol" value="${toHex(t.color||'#7a3b3b')}"/>
      <input class="ctName" value="${esc(t.name||"")}" placeholder="Type name"/>
      <span class="monReorder"><button class="btn tiny ctUp">↑</button><button class="btn tiny ctDown">↓</button><button class="btn tiny ctDel" style="color:var(--bad)">✕</button></span>`;
    row.querySelector(".ctCol").addEventListener("input",e=>{t.color=e.target.value;renderMap();markDirty();});
    row.querySelector(".ctName").addEventListener("input",e=>{t.name=e.target.value;renderLegend();markDirty();});
    row.querySelector(".ctUp").addEventListener("click",()=>{ if(i>0){const a=world.creatureTypes;[a[i-1],a[i]]=[a[i],a[i-1]];renderCreatureTypes();markDirty();} });
    row.querySelector(".ctDown").addEventListener("click",()=>{ const a=world.creatureTypes; if(i<a.length-1){[a[i+1],a[i]]=[a[i],a[i+1]];renderCreatureTypes();markDirty();} });
    row.querySelector(".ctDel").addEventListener("click",()=>{ if(!confirm(`Delete creature type "${t.name}"? Creatures using it lose their colour.`))return; world.creatureTypes.splice(i,1); renderCreatureTypes(); renderMap(); markDirty(); });
    box.appendChild(row);
  });
}
function renderMonsterPresets(){
  const box=$("#monsterPresets"); if(!box)return; box.innerHTML="";
  world.monsterPresets=world.monsterPresets||[];
  const typeOpts=v=>`<option value="">— type —</option>`+world.creatureTypes.map(t=>`<option value="${t.id}" ${v===t.id?"selected":""}>${esc(t.name)}</option>`).join("");
  const imgOpts=v=>MONSTER_IMAGES.map(mi=>`<option value="${esc(mi.src)}" ${v===mi.src?"selected":""}>${esc(mi.name)}</option>`).join("");
  world.monsterPresets.forEach((pr,i)=>{
    const row=div("elRow");
    row.innerHTML=`
      <div class="elRowHead"><span class="monReorder"><button class="btn tiny mpUp">↑</button><button class="btn tiny mpDown">↓</button><button class="btn tiny mpDel" style="color:var(--bad)">✕</button></span></div>
      <div class="field2">
        <div class="field"><label>Name</label><input class="mpName" value="${esc(pr.name||"")}" placeholder="e.g. Dire Animal"/></div>
        <div class="field"><label>Creature type</label><select class="mpType">${typeOpts(pr.creatureType)}</select></div>
      </div>
      <div class="field2">
        <div class="field"><label>Icon (emoji or image)</label><input class="mpIcon" value="${esc(pr.icon||"")}" placeholder="🐺 or img/monsters/…"/></div>
        <div class="field"><label>Pick image</label><select class="mpImg"><option value="">—</option>${imgOpts(pr.icon)}</select></div>
      </div>
      <div class="field"><label>Description</label><textarea class="mpDesc" rows="3">${esc(pr.description||"")}</textarea></div>`;
    row.querySelector(".mpName").addEventListener("input",e=>{pr.name=e.target.value;markDirty();});
    row.querySelector(".mpType").addEventListener("change",e=>{pr.creatureType=e.target.value;markDirty();});
    row.querySelector(".mpIcon").addEventListener("input",e=>{pr.icon=e.target.value;markDirty();});
    row.querySelector(".mpImg").addEventListener("change",e=>{ if(e.target.value){pr.icon=e.target.value; const ic=row.querySelector(".mpIcon"); if(ic)ic.value=pr.icon; markDirty();} });
    row.querySelector(".mpDesc").addEventListener("input",e=>{pr.description=e.target.value;markDirty();});
    row.querySelector(".mpUp").addEventListener("click",()=>{ if(i>0){const a=world.monsterPresets;[a[i-1],a[i]]=[a[i],a[i-1]];renderMonsterPresets();markDirty();} });
    row.querySelector(".mpDown").addEventListener("click",()=>{ const a=world.monsterPresets; if(i<a.length-1){[a[i+1],a[i]]=[a[i],a[i+1]];renderMonsterPresets();markDirty();} });
    row.querySelector(".mpDel").addEventListener("click",()=>{ if(!confirm(`Delete preset "${pr.name}"?`))return; world.monsterPresets.splice(i,1); renderMonsterPresets(); markDirty(); });
    box.appendChild(row);
  });
  if(!world.monsterPresets.length){ const n=div("note"); n.textContent="No presets yet."; box.appendChild(n); }
}
function renderGmPowers(){
  const box=$("#gmPowers"); if(!box)return; box.innerHTML="";
  world.powers=world.powers||[];
  world.powers.forEach((pw,i)=>{
    const det=document.createElement("details"); det.className="elTypeDet";
    const sum=document.createElement("summary");
    sum.innerHTML=`<span class="etSw" style="background:${pw.color||'#7c5cff'}"></span><b style="flex:1;min-width:0">${esc(pw.name||"Power")}</b>
      <span class="note" style="margin:0 6px;white-space:nowrap">${esc(pw.type||"—")}</span>
      <span class="etBtns"><button class="btn tiny gmPwrUp" ${i===0?"disabled":""}>↑</button><button class="btn tiny gmPwrDn" ${i===world.powers.length-1?"disabled":""}>↓</button><button class="btn tiny gmPwrDel" style="color:var(--bad)">✕</button></span>`;
    det.appendChild(sum);
    const body=div(""); body.style.padding="6px 6px 2px";
    body.innerHTML=`
      <div class="field2">
        <div class="field"><label>Name</label><input class="gmPwrName" value="${esc(pw.name||"")}"/></div>
        <div class="field"><label>Type <span class="note">(Druidic, Magic…)</span></label><input class="gmPwrType" value="${esc(pw.type||"")}"/></div>
      </div>
      <div class="field2">
        <div class="field"><label>Colour</label><input class="gmPwrCol" type="color" value="${toHex(pw.color||'#7c5cff')}" style="width:100%;height:30px;padding:2px"/></div>
        <div class="field"></div>
      </div>
      <div class="field"><label>Origin <span class="note">(where & how it began)</span></label><textarea class="gmPwrOrigin" rows="2">${esc(pw.origin||"")}</textarea></div>
      <div class="field"><label>Description</label><textarea class="gmPwrDesc" rows="3">${esc(pw.description||"")}</textarea></div>`;
    det.appendChild(body);
    const stop=(sel,fn)=>{ const b=sum.querySelector(sel); if(b)b.addEventListener("click",ev=>{ ev.preventDefault(); ev.stopPropagation(); fn(); }); };
    stop(".gmPwrUp",()=>{ if(i>0){ const a=world.powers; [a[i-1],a[i]]=[a[i],a[i-1]]; markDirty(); renderGmPowers(); } });
    stop(".gmPwrDn",()=>{ const a=world.powers; if(i<a.length-1){ [a[i+1],a[i]]=[a[i],a[i+1]]; markDirty(); renderGmPowers(); } });
    stop(".gmPwrDel",()=>{ if(!confirm(`Delete power "${pw.name}"? It will be removed from all realms.`))return; world.powers.splice(i,1); (world.realms||[]).forEach(r=>{ if(r.powers)r.powers=r.powers.filter(x=>x!==pw.id); }); markDirty(); renderGmPowers(); });
    body.querySelector(".gmPwrName").addEventListener("input",e=>{ pw.name=e.target.value; markDirty(); });
    body.querySelector(".gmPwrType").addEventListener("input",e=>{ pw.type=e.target.value; markDirty(); });
    body.querySelector(".gmPwrCol").addEventListener("input",e=>{ pw.color=e.target.value; markDirty(); });
    body.querySelector(".gmPwrOrigin").addEventListener("input",e=>{ pw.origin=e.target.value; markDirty(); });
    body.querySelector(".gmPwrDesc").addEventListener("input",e=>{ pw.description=e.target.value; markDirty(); });
    box.appendChild(det);
  });
  if(!world.powers.length){ const n=div("note"); n.textContent="No powers yet."; box.appendChild(n); }
}
function renderGmTech(){
  const box=$("#gmTech"); if(!box)return; box.innerHTML="";
  world.techFields=world.techFields||[]; world.techFieldDefault=world.techFieldDefault||{}; world.techDesc=world.techDesc||{}; world.techColors=world.techColors||{};
  // TL colour swatches
  const ch=document.createElement("div"); ch.className="gmBlockH"; ch.style.fontSize="12px"; ch.textContent="TL map colours";
  box.appendChild(ch);
  const grid=div("techColGrid");
  for(let tl=0;tl<=TL_MAX;tl++){ const cell=div("techColCell");
    cell.innerHTML=`<input type="color" class="gmTLCol" data-tl="${tl}" value="${toHex(tlColor(tl))}"/><span class="note">TL${tl} ${esc(TL_NAMES[tl])}</span>`;
    grid.appendChild(cell); }
  box.appendChild(grid);
  { const rb=document.createElement("button"); rb.className="btn tiny"; rb.style.margin="6px 0 2px"; rb.textContent="↺ Reset TL colours";
    rb.onclick=()=>{ world.techColors={}; markDirty(); renderGmTech(); renderMap(); renderLegend(); }; box.appendChild(rb); }
  // Tech Fields
  const fh=document.createElement("div"); fh.className="gmBlockH"; fh.style.cssText="font-size:12px;margin-top:10px"; fh.textContent="Tech Fields";
  box.appendChild(fh);
  { const n=div("note"); n.textContent="Toggle “new realms” to control whether a field is added to realms created from now on. Existing realms are unaffected. Expand a field to edit its default description at each TL."; box.appendChild(n); }
  world.techFields.forEach((f,i)=>{
    const det=document.createElement("details"); det.className="elTypeDet";
    const sum=document.createElement("summary");
    sum.innerHTML=`<input class="gmTFName" value="${esc(f)}" style="flex:1;min-width:0;background:#fff;border:1px solid var(--line);color:var(--ink);padding:2px 5px;border-radius:5px" onclick="event.stopPropagation()"/>
      <label class="note" style="display:inline-flex;align-items:center;gap:4px;margin:0 6px;white-space:nowrap" onclick="event.stopPropagation()"><input type="checkbox" class="gmTFDef" ${techFieldIsDefault(f)?"checked":""}/> new realms</label>
      <span class="etBtns"><button class="btn tiny gmTFUp" ${i===0?"disabled":""} title="Move up">↑</button><button class="btn tiny gmTFDn" ${i===world.techFields.length-1?"disabled":""} title="Move down">↓</button><button class="btn tiny gmTFDel" style="color:var(--bad)" title="Delete field (from all realms)">✕</button></span>`;
    det.appendChild(sum);
    const body=div(""); body.style.padding="6px 6px 2px";
    let rows="";
    for(let tl=0;tl<=TL_MAX;tl++){ const cur=(world.techDesc[f]&&typeof world.techDesc[f][tl]==="string")?world.techDesc[f][tl]:"";
      rows+=`<div class="field" style="margin:2px 0"><label style="font-size:11px;display:flex;align-items:center;gap:5px"><span style="background:${tlColor(tl)};width:10px;height:10px;border-radius:2px;display:inline-block"></span>TL${tl} · ${esc(TL_NAMES[tl])}</label>
        <textarea class="gmTFDesc" data-tl="${tl}" rows="1" placeholder="${esc(TL_DEFAULT_DESC[tl]||"")}">${esc(cur)}</textarea></div>`; }
    body.innerHTML=rows; det.appendChild(body);
    // wiring
    const stop=(sel,fn)=>{ const b=sum.querySelector(sel); if(b)b.addEventListener("click",ev=>{ ev.preventDefault(); ev.stopPropagation(); fn(); }); };
    stop(".gmTFUp",()=>{ if(i>0){ const a=world.techFields; [a[i-1],a[i]]=[a[i],a[i-1]]; markDirty(); renderGmTech(); } });
    stop(".gmTFDn",()=>{ const a=world.techFields; if(i<a.length-1){ [a[i+1],a[i]]=[a[i],a[i+1]]; markDirty(); renderGmTech(); } });
    stop(".gmTFDel",()=>{ if(world.techFields.length<=1){flash("Keep at least one Tech Field.");return;} if(!confirm(`Delete Tech Field "${f}" from the world and every realm?`))return; deleteTechFieldGlobal(f); markDirty(); renderGmTech(); renderMap(); });
    sum.querySelector(".gmTFName").addEventListener("change",e=>{ const nv=e.target.value.trim(); if(!nv||nv===f){e.target.value=f;return;} if(!renameTechField(f,nv)){flash("A field named “"+nv+"” already exists.");e.target.value=f;return;} markDirty(); renderGmTech(); renderMap(); });
    sum.querySelector(".gmTFDef").addEventListener("change",e=>{ world.techFieldDefault[f]=e.target.checked; markDirty(); });
    det.querySelectorAll(".gmTFDesc").forEach(el=>el.addEventListener("input",e=>{ const tl=+el.dataset.tl; world.techDesc[f]=world.techDesc[f]||{}; if(e.target.value.trim())world.techDesc[f][tl]=e.target.value; else delete world.techDesc[f][tl]; markDirty(); }));
    box.appendChild(det);
  });
  { const ab=document.createElement("button"); ab.className="btn tiny"; ab.style.marginTop="6px"; ab.textContent="＋ Add Tech Field";
    ab.onclick=()=>{ let base="New Field",n=base,k=2; while(world.techFields.includes(n))n=base+" "+(k++); world.techFields.push(n); world.techFieldDefault[n]=true; markDirty(); renderGmTech(); }; box.appendChild(ab); }
  box.querySelectorAll(".gmTLCol").forEach(el=>el.addEventListener("input",e=>{ world.techColors[+el.dataset.tl]=e.target.value; markDirty(); renderMap(); renderLegend(); }));
  // ---- Discoveries ----
  world.discoveries=world.discoveries||[];
  const dh=document.createElement("div"); dh.className="gmBlockH"; dh.style.cssText="font-size:12px;margin-top:12px"; dh.textContent="✦ Discoveries";
  box.appendChild(dh);
  { const n=div("note"); n.textContent="Notable techs, each assigned to a Tech Field and a TL. Assign them to realms from a realm's Tech Level panel; they appear coloured under that field."; box.appendChild(n); }
  world.discoveries.forEach((d,i)=>{
    const det=document.createElement("details"); det.className="elTypeDet";
    const sum=document.createElement("summary");
    sum.innerHTML=`<span class="etSw" style="background:${discoveryColor(d)}"></span><b style="flex:1;min-width:0">${esc(d.name||"Discovery")}</b>
      <span class="note" style="margin:0 6px;white-space:nowrap">${esc(d.field||"—")} · TL${tlClamp(d.tl)}</span>
      <span class="etBtns"><button class="btn tiny gmDiscDel" style="color:var(--bad)" title="Delete">✕</button></span>`;
    det.appendChild(sum);
    const body=div(""); body.style.padding="6px 6px 2px";
    const fieldOpts=(world.techFields||[]).map(f=>`<option ${f===d.field?"selected":""}>${esc(f)}</option>`).join("");
    const realmOpts=(world.realms||[]).map(rm=>`<option value="${rm.id}" ${d.realmId===rm.id?"selected":""}>${esc(rm.name)}</option>`).join("");
    body.innerHTML=`
      <div class="field2">
        <div class="field"><label>Name</label><input class="gmDiscName" value="${esc(d.name||"")}"/></div>
        <div class="field"><label>Colour</label><input class="gmDiscCol" type="color" value="${toHex(discoveryColor(d))}" ${d.realmId?"disabled":""} style="width:100%;height:30px;padding:2px"/></div>
      </div>
      <div class="field"><label>Discovered by <span class="note">(uses that realm's colour + shows its name in the tech panel)</span></label>
        <select class="gmDiscRealm"><option value="">— none / custom colour —</option>${realmOpts}</select></div>
      <div class="field2">
        <div class="field"><label>Tech Field</label><select class="gmDiscField">${fieldOpts}</select></div>
        <div class="field"><label>TL</label><input class="gmDiscTL" type="number" min="0" max="12" value="${tlClamp(d.tl)}"/></div>
      </div>
      <div class="field"><label>Description</label><textarea class="gmDiscDesc" rows="2">${esc(d.description||"")}</textarea></div>`;
    det.appendChild(body);
    sum.querySelector(".gmDiscDel").addEventListener("click",ev=>{ ev.preventDefault(); ev.stopPropagation(); if(!confirm(`Delete discovery "${d.name}"? It will be removed from all realms.`))return; world.discoveries.splice(i,1); (world.realms||[]).forEach(r=>{ if(r.discoveries)r.discoveries=r.discoveries.filter(x=>x!==d.id); }); markDirty(); renderGmTech(); });
    body.querySelector(".gmDiscName").addEventListener("input",e=>{ d.name=e.target.value; markDirty(); });
    body.querySelector(".gmDiscCol").addEventListener("input",e=>{ d.color=e.target.value; markDirty(); });
    body.querySelector(".gmDiscRealm").addEventListener("change",e=>{ d.realmId=e.target.value; const rm=discoveryMaker(d); if(rm)d.color=rm.color; markDirty(); renderGmTech(); });
    body.querySelector(".gmDiscField").addEventListener("change",e=>{ d.field=e.target.value; markDirty(); renderGmTech(); });
    body.querySelector(".gmDiscTL").addEventListener("change",e=>{ d.tl=tlClamp(e.target.value); markDirty(); renderGmTech(); });
    body.querySelector(".gmDiscDesc").addEventListener("input",e=>{ d.description=e.target.value; markDirty(); });
    box.appendChild(det);
  });
  if(!world.discoveries.length){ const n=div("note"); n.textContent="No discoveries yet."; box.appendChild(n); }
  { const ab=document.createElement("button"); ab.className="btn tiny"; ab.style.marginTop="6px"; ab.textContent="＋ Add Discovery";
    ab.onclick=()=>{ world.discoveries.push(newDiscovery()); markDirty(); renderGmTech(); }; box.appendChild(ab); }
}
function renderElementTypes(){
  const box=$("#elemTypes"); if(!box)return; box.innerHTML="";
  world.elementTypes=world.elementTypes||[];
  world.elementTypes.forEach((t,i)=>{
    // compact: one collapsible row per template — summary shows the key stats,
    // expanding reveals the full editable field grid.
    const det=document.createElement("details"); det.className="elTypeDet";
    const sum=document.createElement("summary");
    sum.innerHTML=`<span class="etSw" style="background:${t.color||'#5a6172'}"></span>
      <b>${esc(t.name||"Unnamed")}</b>
      <span class="note">TL${t.tl||0} · ${esc(t.cls)} · TS ${t.ts||0}${(t.pts||0)>0?` (${t.pts})`:""}${elCount(t)>1?` · ×${elCount(t)}`:""}</span>
      <span class="etBtns"><button class="btn tiny etUp" title="Move up">↑</button><button class="btn tiny etDown" title="Move down">↓</button><button class="btn tiny etDel" title="Delete" style="color:var(--bad)">✕</button></span>`;
    det.appendChild(sum);
    const body=div("elRow"); body.style.marginTop="6px"; body.innerHTML=elementFieldGrid(t, false, false);
    det.appendChild(body);
    bindElementFields(body, t, ()=>renderElementTypes());
    applyElStyle(body, t);
    const btn=(sel,fn)=>{ const b=sum.querySelector(sel); if(b)b.addEventListener("click",ev=>{ ev.preventDefault(); ev.stopPropagation(); fn(); }); };
    btn(".etUp",()=>{ if(i>0){ const a=world.elementTypes; [a[i-1],a[i]]=[a[i],a[i-1]]; renderElementTypes(); markDirty(); } });
    btn(".etDown",()=>{ const a=world.elementTypes; if(i<a.length-1){ [a[i+1],a[i]]=[a[i],a[i+1]]; renderElementTypes(); markDirty(); } });
    btn(".etDel",()=>{ if(world.elementTypes.length<=1){flash("Keep at least one element type.");return;} if(!confirm(`Delete element type "${t.name}"?`))return; world.elementTypes.splice(i,1); renderElementTypes(); markDirty(); });
    box.appendChild(det);
  });
  if(!world.elementTypes.length){ const n=div("note"); n.textContent="No element templates yet."; box.appendChild(n); }
}
/* ===== New GM Screen (v2) — pop growth + category tuning. Blank canvas we build up. ===== */
async function openGM2(){
  seedPopTune(world);   // ensure an entry exists for every current terrain & settlement tier
  openModal(`<button class="btn close" onclick="closeModal()">✕ Close</button>
    <h2>🧭 GM Screen</h2>
    <div id="gm2Body"><div class="note">Loading…</div></div>`);
  const m=document.querySelector("#modalHost .modal"); if(m)m.classList.add("gmWide");
  await loadExtraImages();   // refresh terrain/wonder/religion image lists so pickers are current
  if($("#gm2Body")) renderGM2();
}
function renderGM2(){
  const host=$("#gm2Body"); if(!host)return;
  const t=world.tune.pop;
  const num=(id,label,val,step,extra)=>`<div class="field" style="flex:1 1 140px"><label>${label}</label><input id="${id}" type="number" step="${step}" ${extra||""} value="${val}"/></div>`;
  const settleRows=(world.lists.settlements||[]).map((s,i)=>`<tr>
      <td>${esc(s)}</td>
      <td><input class="gmSGrow" data-s="${esc(s)}" type="number" step="0.05" min="0" value="${settleGrow(s)}" ${i<=0?"disabled":""}/></td>
      <td><input class="gmSCeil" data-s="${esc(s)}" type="number" step="1000" min="0" value="${settleCeilBase(s)}" ${i<=0?"disabled":""}/></td>
    </tr>`).join("");
  const raceRows=(world.lists.races||[]).map((rc,ri)=>`<tr>
      <td><input class="gmRName" data-r="${esc(rc)}" value="${esc(rc)}"/></td>
      <td><input class="gmRSize" data-r="${esc(rc)}" type="number" step="0.05" min="0.05" value="${raceSize(rc)}"/></td>
      <td><input class="gmRGrow" data-r="${esc(rc)}" type="number" step="0.05" min="0" value="${raceGrowthMod(rc)}"/></td>
      <td style="white-space:nowrap">
        <button class="btn tiny gmRUp" data-r="${esc(rc)}" ${ri===0?"disabled":""} title="Move up">↑</button>
        <button class="btn tiny gmRDn" data-r="${esc(rc)}" ${ri===(world.lists.races.length-1)?"disabled":""} title="Move down">↓</button>
        <button class="btn tiny gmRDel" data-r="${esc(rc)}" style="color:var(--bad)" title="Delete race group">✕</button>
      </td>
    </tr>`).join("");
  const subRows=(world.lists.subraces||[]).map(sr=>{ const gp=subraceGroup(sr);
    const gOpts=(world.lists.races||[]).map(g=>`<option value="${esc(g)}" ${gp===g?"selected":""}>${esc(g)}</option>`).join("")+((world.lists.races||[]).includes(gp)?"":`<option value="${esc(gp)}" selected>${esc(gp)}</option>`);
    return `<tr>
      <td><input type="color" class="gmSubCol" data-s="${esc(sr)}" value="${toHex(catColor("subraces",sr))}"/></td>
      <td><input class="gmSubName" data-s="${esc(sr)}" value="${esc(sr)}"/></td>
      <td><select class="gmSubGrp" data-s="${esc(sr)}">${gOpts}</select></td>
      <td><button class="btn tiny gmSubDel" data-s="${esc(sr)}" style="color:var(--bad)">✕</button></td>
    </tr>`; }).join("");
  const terrRows=(world.lists.terrains||[]).map(tr=>`<tr>
      <td><input type="color" class="gmTCol" data-t="${esc(tr)}" value="${toHex(catColor("terrains",tr))}"/></td>
      <td><input class="gmTName" data-t="${esc(tr)}" value="${esc(tr)}"/></td>
      <td><input class="gmTGrow" data-t="${esc(tr)}" type="number" step="0.05" min="0" value="${terrainGrow(tr)}"/></td>
      <td><input class="gmTCeil" data-t="${esc(tr)}" type="number" step="0.05" min="0" value="${terrainCeilMod(tr)}"/></td>
      <td><button class="btn tiny gmTDel" data-t="${esc(tr)}" style="color:var(--bad)">✕</button></td>
    </tr>`).join("");
  const terrImgRows=(world.lists.terrains||[]).map(tr=>{
    const cur=(world.terrainImages&&world.terrainImages[tr])||"";
    return `<tr>
      <td>${esc(tr)}</td>
      <td><select class="gmTImg" data-t="${esc(tr)}">${imagePickerOptions(TERRAIN_IMAGES, cur)}</select></td>
      <td>${cur?`<img class="gmTImgPrev" src="${esc(cur)}" alt=""/>`:'<span class="note">—</span>'}</td>
    </tr>`;
  }).join("");
  host.innerHTML=`
    <p class="note" style="margin-top:0">🌱 Grow adds a baseline number of people to each province, then bends it by terrain, settlement tier, capital/admin status, and how close the province sits to its <b>growth ceiling</b> — a soft cap that gently levels off (growth halves at the ceiling and tapers beyond it; it's never a hard wall). 📉 Reduce removes a percentage. Every action is a single undo.</p>
    <div class="gmGrid">
      <section class="gmBlock">
        <div class="gmBlockH">👥 Growth basics</div>
        <div class="gmFields">
          ${num("gmBase","Baseline growth (people)",t.base,"100",'min="0"')}
          ${num("gmJitter","Random variation ± (%)",Math.round((t.jitter||0)*100),"1",'min="0"')}
          ${num("gmDecline","Decline per step (%)",Math.round((t.declinePct||0)*100),"1",'min="0" max="95"')}
          ${num("gmSteep","Ceiling softness",t.ceilSteep,"0.5",'min="0.5" title="Higher = growth chokes off more sharply near the ceiling"')}
        </div>
      </section>
      <section class="gmBlock">
        <div class="gmBlockH">⭐ Capital &amp; admin centres</div>
        <div class="gmFields">
          ${num("gmCapGrow","Capital growth ×",t.capitalGrow,"0.1",'min="0"')}
          ${num("gmAdmGrow","Admin growth ×",t.adminGrow,"0.1",'min="0"')}
          ${num("gmCapCeil","Capital ceiling ×",t.capitalCeil,"0.1",'min="0"')}
          ${num("gmAdmCeil","Admin ceiling ×",t.adminCeil,"0.1",'min="0"')}
        </div>
      </section>
      <section class="gmBlock">
        <div class="gmBlockH">🏙 Settlement tiers</div>
        <p class="note">Each tier's <b>growth ×</b> and <b>base ceiling</b> (soft cap before terrain & capital/admin). Uninhabited never grows.</p>
        <table class="gm2tbl"><thead><tr><th>Tier</th><th>Growth ×</th><th>Base ceiling</th></tr></thead><tbody>${settleRows}</tbody></table>
      </section>
      <section class="gmBlock gmSpanAll">
        <div class="gmBlockH">🧬 Race groups</div>
        <p class="note">The top-level races. Rename, reorder (↑/↓ — also sets the order they appear in the Race map legend), or delete them here. <b>Size</b> = how much each individual counts toward a province's growth ceiling — 0.5 means half-size, so twice as many fit (denser). <b>Growth ×</b> = how fast they breed. Subraces (below) are grouped under these and carry the colours.</p>
        <table class="gm2tbl"><thead><tr><th>Race group</th><th>Size</th><th>Growth ×</th><th></th></tr></thead><tbody>${raceRows||'<tr><td class="note">No race groups.</td></tr>'}</tbody></table>
        <div class="btnrow" style="margin-top:8px"><button class="btn tiny" id="gmAddRace">＋ Add race group</button></div>
      </section>
      <section class="gmBlock gmSpanAll">
        <div class="gmBlockH">🧝 Subraces</div>
        <p class="note">Subraces are what population groups actually are — they show on the Race map and in province pie charts, coloured individually and grouped under a race. Clicking a subrace on the map highlights its whole race group. (With none defined, each race is simply its own subrace.)</p>
        <table class="gm2tbl"><thead><tr><th>Colour</th><th>Subrace</th><th>Race group</th><th></th></tr></thead><tbody>${subRows}</tbody></table>
        <div class="btnrow" style="margin-top:8px"><button class="btn tiny" id="gmAddSub">＋ Add subrace</button></div>
      </section>
      <section class="gmBlock gmSpanAll">
        <div class="gmBlockH">⛰ Terrain types &amp; modifiers</div>
        <p class="note">The terrain map-mode categories: colour, name, pop <b>growth ×</b> and <b>ceiling ×</b> (e.g. Farmlands lift the ceiling a lot, Mountains &amp; Caverns keep it low). Renaming or deleting updates every province; new terrains work everywhere immediately.</p>
        <table class="gm2tbl"><thead><tr><th>Colour</th><th>Name</th><th>Growth ×</th><th>Ceiling ×</th><th></th></tr></thead><tbody>${terrRows}</tbody></table>
        <div class="btnrow" style="margin-top:8px">
          <button class="btn tiny" id="gmAddTerr">＋ Add terrain</button>
          <button class="btn tiny" id="gmEditLists">✎ Edit other categories…</button>
        </div>
      </section>
      <section class="gmBlock gmSpanAll">
        <div class="gmBlockH">🖼 Terrain images (province-view banners)</div>
        <p class="note">The default banner image shown for each terrain type in the province view. Individual provinces can override their own image in the province editor without changing terrain. Drop new files into <b>static/img/terrain/</b> and press Rescan. ${TERRAIN_IMAGES.length?`<b>${TERRAIN_IMAGES.length}</b> images available.`:'<b style="color:var(--bad)">No images loaded — restart the Python server, then reopen this screen.</b>'}</p>
        <table class="gm2tbl"><thead><tr><th>Terrain</th><th>Default image</th><th>Preview</th></tr></thead><tbody>${terrImgRows}</tbody></table>
        <div class="btnrow" style="margin-top:8px"><button class="btn tiny" id="gmTImgRescan">🔄 Rescan image folder</button></div>
      </section>
      <section class="gmBlock gmSpanAll">
        <div class="gmBlockH">⚔ Army element types (GURPS Mass Combat)</div>
        <p class="note">Reusable templates you drop into armies on the Military map — applying one <b>names the element after the template</b> (you can rename it afterwards). TL 0 is the Stone Age Warriors. Click a template to expand and edit its stats; reorder with ↑/↓.</p>
        <div id="elemTypes"></div>
        <div class="btnrow" style="margin-top:8px"><button class="btn tiny" id="elemAdd">＋ Add element type</button></div>
      </section>
      <section class="gmBlock gmSpanAll">
        <div class="gmBlockH">🔬 Technology Levels</div>
        <p class="note">Set the Tech Level map colours, manage the Tech Fields (rename, reorder, whether each appears on <b>new</b> realms, delete), and edit the default description shown for each field at each TL. Realm-specific overrides live on each realm's panel.</p>
        <div id="gmTech"></div>
      </section>
      <section class="gmBlock gmSpanAll">
        <div class="gmBlockH">✨ Powers</div>
        <p class="note">Distinctive traditions realms wield (Druidic, Magic, Demonic…). Each has a Type, an Origin (where/how it began), a description and a colour. Assign them to realms from a realm's editor panel; they show as a Powers bloc and in the Compendium.</p>
        <div id="gmPowers"></div>
        <div class="btnrow" style="margin-top:8px"><button class="btn tiny" id="gmPowerAdd">＋ Add Power</button></div>
      </section>
    </div>
    <div class="btnrow" style="margin-top:12px"><button class="btn" id="gmResetPop">↺ Reset growth tunables</button></div>`;
  // ---- global pop tunables ----
  const bind=(id,fn)=>{ const el=$("#"+id); if(el)el.addEventListener("input",e=>{ fn(e.target.value); markDirty(); }); };
  bind("gmBase",v=>t.base=Math.max(0,+v||0));
  bind("gmJitter",v=>t.jitter=Math.max(0,(+v||0)/100));
  bind("gmDecline",v=>t.declinePct=Math.max(0,Math.min(0.95,(+v||0)/100)));
  bind("gmSteep",v=>t.ceilSteep=Math.max(0.1,+v||0.1));
  bind("gmCapGrow",v=>t.capitalGrow=Math.max(0,+v||0));
  bind("gmAdmGrow",v=>t.adminGrow=Math.max(0,+v||0));
  bind("gmCapCeil",v=>t.capitalCeil=Math.max(0,+v||0));
  bind("gmAdmCeil",v=>t.adminCeil=Math.max(0,+v||0));
  // ---- settlement tiers ----
  host.querySelectorAll(".gmSGrow").forEach(el=>el.addEventListener("input",e=>{ t.settleGrow[el.dataset.s]=Math.max(0,+e.target.value||0); markDirty(); }));
  host.querySelectorAll(".gmSCeil").forEach(el=>el.addEventListener("input",e=>{ t.settleCeil[el.dataset.s]=Math.max(0,Math.round(+e.target.value||0)); markDirty(); }));
  // ---- races (groups): size / growth / rename / reorder / delete / add ----
  world.tune.raceSize=world.tune.raceSize||{}; world.tune.raceGrowth=world.tune.raceGrowth||{};
  host.querySelectorAll(".gmRSize").forEach(el=>el.addEventListener("input",e=>{ world.tune.raceSize[el.dataset.r]=Math.max(0.05,+e.target.value||1); markDirty(); }));
  host.querySelectorAll(".gmRGrow").forEach(el=>el.addEventListener("input",e=>{ world.tune.raceGrowth[el.dataset.r]=Math.max(0,+e.target.value||0); markDirty(); }));
  host.querySelectorAll(".gmRName").forEach(el=>el.addEventListener("change",e=>{
    const ov=el.dataset.r, nv=e.target.value.trim();
    if(!nv||nv===ov){ e.target.value=ov; return; }
    if((world.lists.races||[]).includes(nv)){ flash("A race group “"+nv+"” already exists."); e.target.value=ov; return; }
    const i=world.lists.races.indexOf(ov); if(i<0)return;
    world.lists.races[i]=nv; applyListRename("races",ov,nv);   // also remaps subraceOf, tune keys, realm dominantRace
    Object.keys(world.subraceOf||{}).forEach(sr=>{ if(world.subraceOf[sr]===ov)world.subraceOf[sr]=nv; });
    renderMap(); renderLegend(); markDirty(); renderGM2();
  }));
  host.querySelectorAll(".gmRUp").forEach(el=>el.addEventListener("click",()=>{ const a=world.lists.races, i=a.indexOf(el.dataset.r); if(i>0){ [a[i-1],a[i]]=[a[i],a[i-1]]; markDirty(); renderLegend(); renderGM2(); } }));
  host.querySelectorAll(".gmRDn").forEach(el=>el.addEventListener("click",()=>{ const a=world.lists.races, i=a.indexOf(el.dataset.r); if(i>=0&&i<a.length-1){ [a[i+1],a[i]]=[a[i],a[i+1]]; markDirty(); renderLegend(); renderGM2(); } }));
  host.querySelectorAll(".gmRDel").forEach(el=>el.addEventListener("click",()=>{ const v=el.dataset.r;
    if((world.lists.races||[]).length<=1){ flash("Keep at least one race group."); return; }
    const subs=(world.lists.subraces||[]).filter(sr=>subraceGroup(sr)===v);
    if(subs.length && !confirm(`“${v}” has ${subs.length} subrace${subs.length===1?"":"s"} (${subs.join(", ")}). Delete the group and move them to another race group?`))return;
    const fallback=(world.lists.races||[]).find(x=>x!==v)||"";
    subs.forEach(sr=>{ world.subraceOf[sr]=fallback; });
    applyListDelete("races",v);
    const i=world.lists.races.indexOf(v); if(i>=0)world.lists.races.splice(i,1);
    renderMap(); renderLegend(); markDirty(); renderGM2();
  }));
  { const a=$("#gmAddRace"); if(a)a.onclick=()=>{ let base="New Race",n=base,k=2; while((world.lists.races||[]).includes(n))n=base+" "+(k++); world.lists.races.push(n); markDirty(); renderGM2(); }; }
  // ---- subraces ----
  world.subraceOf=world.subraceOf||{}; world.colors=world.colors||{};
  host.querySelectorAll(".gmSubCol").forEach(el=>el.addEventListener("input",e=>{ world.colors.subraces=world.colors.subraces||{}; world.colors.subraces[el.dataset.s]=e.target.value; renderMap(); renderLegend(); markDirty(); }));
  host.querySelectorAll(".gmSubGrp").forEach(el=>el.addEventListener("change",e=>{ world.subraceOf[el.dataset.s]=e.target.value; renderMap(); renderLegend(); markDirty(); }));
  host.querySelectorAll(".gmSubName").forEach(el=>el.addEventListener("change",e=>{ const ov=el.dataset.s, nv=e.target.value.trim();
    if(!nv||nv===ov){ e.target.value=ov; return; }
    if((world.lists.subraces||[]).includes(nv)){ flash("A subrace “"+nv+"” already exists."); e.target.value=ov; return; }
    const i=world.lists.subraces.indexOf(ov); if(i<0)return; world.lists.subraces[i]=nv; renameSubrace(ov,nv); renderMap(); renderLegend(); markDirty(); renderGM2(); }));
  host.querySelectorAll(".gmSubDel").forEach(el=>el.addEventListener("click",()=>{ const v=el.dataset.s;
    if((world.lists.subraces||[]).length<=1){ flash("Keep at least one subrace."); return; }
    const used=subraceUsage(v); if(used>0 && !confirm(`“${v}” is used by ${used} province${used===1?"":"s"}. Delete it and move those pops to another subrace?`))return;
    deleteSubrace(v); renderMap(); renderLegend(); markDirty(); renderGM2(); }));
  { const a=$("#gmAddSub"); if(a)a.onclick=()=>{ let base="New Subrace",n=base,k=2; while((world.lists.subraces||[]).includes(n))n=base+" "+(k++); world.lists.subraces.push(n); world.subraceOf[n]=(world.lists.races||[])[0]||n; markDirty(); renderGM2(); }; }
  // ---- terrain rows ----
  host.querySelectorAll(".gmTCol").forEach(el=>el.addEventListener("input",e=>{ world.colors.terrains=world.colors.terrains||{}; world.colors.terrains[el.dataset.t]=e.target.value; renderMap(); renderLegend(); markDirty(); }));
  host.querySelectorAll(".gmTGrow").forEach(el=>el.addEventListener("input",e=>{ t.terrainGrow[el.dataset.t]=Math.max(0,+e.target.value||0); markDirty(); }));
  host.querySelectorAll(".gmTCeil").forEach(el=>el.addEventListener("input",e=>{ t.terrainCeil[el.dataset.t]=Math.max(0,+e.target.value||0); markDirty(); }));
  host.querySelectorAll(".gmTName").forEach(el=>el.addEventListener("change",e=>{
    const ov=el.dataset.t, nv=e.target.value.trim();
    if(!nv||nv===ov){ e.target.value=ov; return; }
    if(world.lists.terrains.includes(nv)){ flash("A terrain called “"+nv+"” already exists."); e.target.value=ov; return; }
    const i=world.lists.terrains.indexOf(ov); if(i<0)return;
    world.lists.terrains[i]=nv; applyListRename("terrains",ov,nv);
    renderMap(); renderLegend(); markDirty(); renderGM2();
  }));
  host.querySelectorAll(".gmTDel").forEach(el=>el.addEventListener("click",()=>{
    const tr=el.dataset.t;
    if((world.lists.terrains||[]).length<=1){ flash("Keep at least one terrain type."); return; }
    const used=listUsageCount("terrains",tr);
    if(used>0 && !confirm(`“${tr}” is used by ${used} province${used===1?"":"s"}. Delete it and move them to another terrain?`))return;
    applyListDelete("terrains",tr); if(world.colors.terrains)delete world.colors.terrains[tr];
    const i=world.lists.terrains.indexOf(tr); if(i>=0)world.lists.terrains.splice(i,1);
    renderMap(); renderLegend(); markDirty(); renderGM2();
  }));
  { const a=$("#gmAddTerr"); if(a)a.onclick=()=>{ let base="New Terrain",name=base,k=2; while(world.lists.terrains.includes(name))name=base+" "+(k++); world.lists.terrains.push(name); seedPopTune(world); markDirty(); renderMap(); renderLegend(); renderGM2(); }; }
  { const e=$("#gmEditLists"); if(e)e.onclick=()=>openLists("terrains"); }
  // ---- terrain default images ----
  host.querySelectorAll(".gmTImg").forEach(el=>el.addEventListener("change",e=>{ world.terrainImages=world.terrainImages||{}; const v=e.target.value; if(v)world.terrainImages[el.dataset.t]=v; else delete world.terrainImages[el.dataset.t]; markDirty(); renderGM2(); }));
  { const rb=$("#gmTImgRescan"); if(rb)rb.onclick=async()=>{ await loadExtraImages(); renderGM2(); flash(TERRAIN_IMAGES.length+" image(s) in static/img/terrain/."); }; }
  { const r=$("#gmResetPop"); if(r)r.onclick=()=>{ if(!confirm("Reset all population growth tunables (baseline, ceilings, terrain & settlement modifiers) to defaults?"))return; delete world.tune.pop; seedPopTune(world); markDirty(); renderGM2(); }; }
  // ---- army element types ----
  renderElementTypes();
  { const ea=$("#elemAdd"); if(ea)ea.addEventListener("click",()=>{ world.elementTypes=world.elementTypes||[]; world.elementTypes.push(migrateElement({id:uid(),name:"New Element",cls:"Fire (F)",ts:5,pts:0,wt:0,mob:"Foot",tl:1,features:[],equip:"Basic",troop:"Average"})); renderElementTypes(); markDirty(); }); }
  renderGmTech();
  renderGmPowers();
  { const pa=$("#gmPowerAdd"); if(pa)pa.onclick=()=>{ world.powers=world.powers||[]; world.powers.push(newPower()); markDirty(); renderGmPowers(); }; }
}
function openGMScreen(){
  syncTuneKeys();   // add mods for new terrains/races, prune deleted ones
  const contOpts=world.continents.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  const realmOpts=world.realms.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join("");
  openModal(`<button class="btn close" onclick="closeModal()">✕ Close</button><h2>🎲 GM Screen</h2>
    <p class="note">Behind-the-screen controls: tune the world's simulation values, then seed and grow populations. These settings are saved with the world and never shown in the player viewer.</p>
    ${tuneValuesHTML()}
    <p class="note">⚔ Army element types now live in the 🧭 GM v2 screen.</p>

    <div class="sectionH">🐉 Creature types</div>
    <p class="note">Colour-codes each creature's panel and its ring on the Monsters map. Rename, recolour, reorder or add your own.</p>
    <div id="creatureTypes"></div>
    <button class="btn tiny" id="ctAdd" style="margin-top:6px">＋ Add creature type</button>

    <div class="sectionH">📖 Monster presets</div>
    <p class="note">Reusable creatures (name, icon, type, description). On the Monsters map, "Load from preset" fills a new creature from one of these — then edit it freely for that specific spot.</p>
    <div id="monsterPresets"></div>
    <button class="btn tiny" id="mpAdd" style="margin-top:6px">＋ Add monster preset</button>

    <div class="sectionH">👥 Populate &amp; grow</div>
    <p class="note">Generates realistic populations from a baseline, scaled by <b>terrain hospitability</b>, <b>settlement tier</b>, and <b>capital / admin</b> bonuses (all editable above) — with random variation so no two runs are identical. Newly-populated provinces inherit their realm's identity (or list defaults if unclaimed).</p>
    <div class="field2">
      <div class="field"><label>Baseline (a hospitable village)</label><input id="pbBase" type="number" min="0" value="5000"/></div>
      <div class="field"><label>Randomness ± %</label><input id="pbVar" type="number" min="0" max="90" value="30"/></div>
    </div>
    <div class="field"><label>Influences</label>
      <label style="font-weight:400;font-size:13px"><input type="checkbox" id="pbTerr" checked/> Terrain</label>
      <label style="font-weight:400;font-size:13px;margin-left:12px"><input type="checkbox" id="pbSettle" checked/> Settlement tier</label>
      <label style="font-weight:400;font-size:13px;margin-left:12px"><input type="checkbox" id="pbKey" checked/> Capital / admin</label>
      <div class="note">With "Settlement tier" on, Uninhabited provinces stay empty — set them to Nomadic+ first (or turn this off to populate raw terrain).</div>
    </div>
    <div class="field"><label>Apply to</label>
      <select id="pbScope"><option value="world">Whole world</option><option value="continent">A continent</option><option value="realm">A realm</option></select>
      <select id="pbCont" class="hidden" style="margin-top:6px">${contOpts}</select>
      <select id="pbRealm" class="hidden" style="margin-top:6px">${realmOpts}</select>
    </div>
    <div id="pbRealmOpts" class="hidden" style="margin:2px 0 6px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel2)">
      <div class="note" style="margin:0 0 4px">Realm growth options (used by 🌱 Grow):</div>
      <label style="font-size:13px"><input type="checkbox" id="pbPrio"/> Prioritise the state group's growth (a slight edge — everyone still grows)</label>
      <div style="margin:4px 0 0 20px;font-size:13px">state group matches on:
        <label style="margin-left:6px"><input type="checkbox" id="pbPRel" checked/> religion</label>
        <label style="margin-left:8px"><input type="checkbox" id="pbPCul" checked/> culture</label>
        <label style="margin-left:8px"><input type="checkbox" id="pbPLan"/> language</label>
        <label style="margin-left:8px"><input type="checkbox" id="pbPRac"/> race</label>
      </div>
      <label style="font-size:13px;display:block;margin-top:6px"><input type="checkbox" id="pbSeedState"/> Also seed the state group into every realm province (so it can grow even where absent)</label>
    </div>
    <div class="sectionH">Seed populations</div>
    <div class="btnrow">
      <button class="btn primary" id="pbSeed">⚡ Set populations</button>
      <button class="btn" id="pbSeedArea">▦ Set in a dragged area…</button>
    </div>
    <div class="sectionH">Grow (advance the timeline)</div>
    <p class="note">Increases the <i>current</i> population of already-populated provinces by a random amount; hospitable places grow faster. Empty provinces stay empty.</p>
    <div class="field2"><div class="field"><label>Growth ± %</label><input id="pbGrow" type="number" value="20"/></div><div class="field"></div></div>
    <div class="btnrow">
      <button class="btn primary" id="pbGrowBtn">🌱 Grow by %</button>
      <button class="btn" id="pbGrowArea">▦ Grow a dragged area…</button>
    </div>
    <p class="note" style="margin-top:8px">…or add a <b>set number of people</b> spread across the scope (weighted toward already-populous provinces), with a little randomness:</p>
    <div class="field2"><div class="field"><label>People to add</label><input id="pbGrowNum" type="number" min="0" value="5000"/></div><div class="field"><label>± randomness %</label><input id="pbGrowNumVar" type="number" min="0" max="90" value="20"/></div></div>
    <div class="btnrow"><button class="btn primary" id="pbGrowNumBtn">➕ Add people (world / realm / continent)</button></div>
    <div class="btnrow" style="margin-top:6px"><button class="btn" id="pbUndoGrow">↶ Undo last population change</button></div>
    <div class="note">Reverses the most recent seed / grow / add-people action (pops return exactly to how they were).</div>
    <div class="sectionH">Reset</div>
    <div class="btnrow"><button class="btn danger" id="pbWipe">🗑 Delete ALL pops (whole world)</button></div>
    <div class="note" id="pbStatus"></div>`);
  const scope=$("#pbScope");
  const sync=()=>{$("#pbCont").classList.toggle("hidden",scope.value!=="continent");$("#pbRealm").classList.toggle("hidden",scope.value!=="realm");$("#pbRealmOpts").classList.toggle("hidden",scope.value!=="realm");};
  scope.onchange=sync; sync();
  const opts=()=>({terrain:$("#pbTerr").checked,settle:$("#pbSettle").checked,key:$("#pbKey").checked});
  const variance=()=>Math.max(0,Math.min(0.9,(+$("#pbVar").value||0)/100));
  const scopeProvs=()=>{ if(scope.value==="continent")return world.provinces.filter(p=>p.continentId===$("#pbCont").value); if(scope.value==="realm")return world.provinces.filter(p=>p.realmId===$("#pbRealm").value); return world.provinces.slice(); };
  const status=t=>{const s=$("#pbStatus"); if(s)s.textContent=t; flash(t);};
  const doSeed=ps=>{ const base=+$("#pbBase").value||0, v=variance(), o=opts(); pushGrowUndo(); beginEdit(); ps.forEach(p=>setProvincePopulation(p,genProvincePop(p,base,v,o))); renderMap();renderLeft();markDirty();
    const tot=ps.reduce((a,p)=>a+(p.population||0),0); status("Seeded "+ps.length+" provinces · "+tot.toLocaleString()+" people total."); };
  const doGrow=ps=>{ const g=+$("#pbGrow").value||0, v=variance(), o=opts();
    const r=(scope.value==="realm")?world.realms.find(x=>x.id===$("#pbRealm").value):null;
    const prioOn=r && $("#pbPrio") && $("#pbPrio").checked, seedOn=r && $("#pbSeedState") && $("#pbSeedState").checked;
    const prio=(prioOn||seedOn)?{on:prioOn,seed:seedOn,axes:{religion:$("#pbPRel").checked,culture:$("#pbPCul").checked,language:$("#pbPLan").checked,race:$("#pbPRac").checked}}:null;
    pushGrowUndo(); beginEdit(); let grew=0;
    ps.forEach(p=>{ const before=p.population||0;
      if(prio && r && p.realmId===r.id) growRealmPops(p,g,v,o,r,prio);
      else growGenericPops(p,g,v,o);
      if((p.population||0)!==before)grew++; });
    renderMap();renderLeft();markDirty();
    status("Grew "+grew+" provinces"+(prio?" · state group "+(prio.on?"prioritised":"")+(prio.seed?(prio.on?" & seeded":"seeded"):""):"")+"."); };
  // add an absolute number of people across the scope, weighted by current population, with randomness
  const doGrowNumber=ps=>{
    const total=Math.max(0,+$("#pbGrowNum").value||0);
    const v=Math.max(0,Math.min(0.9,(+$("#pbGrowNumVar").value||0)/100));
    if(total<=0){ status("Enter a number of people to add."); return; }
    const pop=ps.filter(p=>(p.population||0)>0);
    const sum=pop.reduce((a,p)=>a+(p.population||0),0);
    if(sum<=0){ status("No populated provinces in this scope — seed some people first."); return; }
    pushGrowUndo(); beginEdit(); let added=0;
    for(const p of pop){
      const cur=p.population||0;
      let share=total*(cur/sum)*(1+(Math.random()*2-1)*v);
      share=Math.max(0,Math.round(share));
      if(share<=0)continue;
      p.pops.forEach(q=>{ if(q.size>0) q.size+=Math.round(share*(q.size/cur)); });   // spread across the province's groups
      deriveProvince(p); added+=share;
    }
    renderMap();renderLeft();markDirty();
    status("Added ~"+added.toLocaleString()+" people across "+pop.length+" provinces ("+scope.value+").");
  };
  $("#pbSeed").onclick=()=>doSeed(scopeProvs());
  $("#pbGrowBtn").onclick=()=>doGrow(scopeProvs());
  $("#pbGrowNumBtn").onclick=()=>doGrowNumber(scopeProvs());
  $("#pbUndoGrow").onclick=undoLastGrowth;
  $("#pbSeedArea").onclick=()=>{ closeModal(); flash("Drag a box over the provinces to seed."); startRegionSelect(rect=>doSeed(provsInRect(rect))); };
  $("#pbGrowArea").onclick=()=>{ closeModal(); flash("Drag a box over the provinces to grow."); startRegionSelect(rect=>doGrow(provsInRect(rect))); };
  $("#pbWipe").onclick=()=>{
    if(!confirm("Delete ALL population (every pop group) in the ENTIRE world?"))return;
    if(!confirm("Are you absolutely sure? This wipes every province's people. (Undo can still restore it.)"))return;
    beginEdit(); world.provinces.forEach(p=>{p.pops=[];deriveProvince(p);}); renderMap();renderLeft();markDirty(); status("All population deleted.");
  };
  wireTuneValues();
  renderCreatureTypes();
  { const b=$("#ctAdd"); if(b)b.addEventListener("click",()=>{ world.creatureTypes.push({id:uid(),name:"New Type",color:"#7a3b3b"}); renderCreatureTypes(); markDirty(); }); }
  renderMonsterPresets();
  { const b=$("#mpAdd"); if(b)b.addEventListener("click",()=>{ world.monsterPresets.push({id:uid(),name:"New Creature",icon:MONSTER_DEFAULT_ICON,description:"",creatureType:(world.creatureTypes[0]&&world.creatureTypes[0].id)||""}); renderMonsterPresets(); markDirty(); }); }
}
async function openMenu(){
  const worlds=await listWorlds();
  openModal(`<button class="btn close" onclick="closeModal()">✕ Close</button><h2>Worlds & data</h2>
    <div class="field"><label>Saved worlds on disk</label>
      <div id="worldsList">${worlds.length?worlds.map(w=>`<div class="li"><span style="flex:1">${esc(w)}</span><button class="btn tiny" data-open="${esc(w)}">Open</button></div>`).join(""):'<div class="note">None yet — saving creates a file named after your world.</div>'}</div></div>
    <div class="btnrow">
      <button class="btn primary" id="mPopulate">🎲 GM Screen (populate, grow &amp; tune)…</button>
      <button class="btn" id="mNew">＋ New world</button>
      <button class="btn" id="mSaveAs">💾 Save now</button>
      <button class="btn" id="mExport">⬇ Export JSON to herald folder</button>
      <button class="btn" id="mTimelineSave">🕑 Save timeline snapshot (Phase/Turn)…</button>
      <button class="btn" id="mArchiveData">🗄 Archive full data to disk…</button>
      <button class="btn primary" id="mPublish">🌐 Publish &amp; push live…</button>
      <button class="btn" id="mGitStatus">🔎 Check publish/git status…</button>
      <button class="btn" id="mGitCancel">🛠 Repair GitHub Pages deploy…</button>
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
    {_compendium=null;world=normalize(sampleWorld());world.name="New World";world.continents=[];world.provinces=[];world.realms=[];afterLoad();closeModal();}};
  $("#mSaveAs").onclick=()=>saveWorld(false);
  $("#mExport").onclick=async()=>{
    const name=world.name+" "+tstamp()+".json";
    const data=btoa(unescape(encodeURIComponent(JSON.stringify(world,null,2))));   // base64, unicode-safe
    try{
      const res=await fetch("/api/export",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({folder:_exportDir,files:[{name,data}]})});
      const j=await res.json();
      if(j.ok)flash("Exported JSON → "+j.folder+"\\"+name); else flash("Error: "+(j.error||"export failed"));
    }catch(e){flash("Error: "+e.message);}
  };
  $("#mPopulate").onclick=()=>{closeModal();openGMScreen();};
  $("#mArchiveData").onclick=archiveDataToDisk;
  $("#mPublish").onclick=publishViewer;
  $("#mGitStatus").onclick=checkGitStatus;
  $("#mGitCancel").onclick=forceCancelDeploys;
  $("#mExportSvg").onclick=()=>{closeModal();openExport();};
  $("#mExportAll").onclick=()=>{closeModal();openExportAll();};
  $("#mImport").onclick=()=>$("#fileInput").click();
  $("#fileInput").onchange=ev=>{const f=ev.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{_compendium=null;world=normalize(JSON.parse(rd.result));afterLoad();saveWorld(true);closeModal();}catch(e){alert("Invalid JSON: "+e.message);}};rd.readAsText(f);};
  { const ts=$("#mTimelineSave"); if(ts)ts.onclick=()=>{ closeModal(); openTimelineSave(); }; }
}
// ===== Timeline: viewer-only turn snapshots ("Phase X - Turn Y"), organised by Age =====
let _lastPhase=1, _lastTurn=1;
let _presentSnapshot=null;   // JSON of the live world while browsing past turns
let _timelineViewing=null;   // {age,label} currently shown, or null = present
function currentAgeName(){ const e=(world.eras||[]).find(x=>x.id===world.currentEraId); return (e&&e.name)||"Age of Creation"; }
// editor: save the current world as a timeline snapshot
function openTimelineSave(){
  const age=currentAgeName();
  openModal(`<button class="btn close" onclick="closeModal()">✕ Close</button><h2>🕑 Save timeline snapshot</h2>
    <p class="note">Saves the current world as a turn players can revisit in the viewer's Timeline. Filed under the current age: <b>${esc(age)}</b> (set the age in the top bar / Ages editor).</p>
    <div class="field2">
      <div class="field"><label>Phase</label><input id="tlPhase" type="number" min="0" step="1" value="${_lastPhase}"/></div>
      <div class="field"><label>Turn</label><input id="tlTurn" type="number" min="0" step="1" value="${_lastTurn}"/></div>
    </div>
    <div class="btnrow"><button class="btn primary" id="tlSaveGo">💾 Save snapshot</button></div>
    <div id="tlSaveMsg" class="note" style="margin-top:6px"></div>`);
  $("#tlSaveGo").onclick=async()=>{
    const phase=Math.max(0,Math.round(+$("#tlPhase").value||0)), turn=Math.max(0,Math.round(+$("#tlTurn").value||0));
    _lastPhase=phase; _lastTurn=turn;
    const msg=$("#tlSaveMsg"); msg.textContent="Saving…";
    syncCompendiumToWorld();
    try{
      const res=await fetch("/api/timeline_save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({age,phase,turn,world})});
      const j=await res.json();
      msg.innerHTML=j.ok?`✓ Saved <b>${esc(j.age)} / ${esc(j.file)}</b>`:`<span style="color:var(--bad)">Error: ${esc(j.error||"failed")}</span>`;
    }catch(e){ msg.innerHTML=`<span style="color:var(--bad)">Error: ${esc(e.message)}</span>`; }
  };
}
async function fetchTimeline(){
  try{ const r=await fetch("/api/timeline_list"); if(r.ok){ const j=await r.json(); if(j&&j.ages)return {mode:"api",ages:j.ages}; } }catch(e){}
  try{ const r=await fetch("timeline/index.json",{cache:"no-store"}); if(r.ok){ const j=await r.json(); if(j&&j.ages)return {mode:"static",ages:j.ages}; } }catch(e){}
  return {mode:"none",ages:[]};
}
async function loadTimelineWorld(mode,age,file){
  if(mode==="static"){ const r=await fetch("timeline/"+encodeURIComponent(age)+"/"+encodeURIComponent(file),{cache:"no-store"}); return await r.json(); }
  const r=await fetch("/api/timeline_get?age="+encodeURIComponent(age)+"&file="+encodeURIComponent(file));
  const j=await r.json(); if(!j.ok)throw new Error(j.error||"load failed"); return j.world;
}
function orderAges(ages){   // chronological: by the world's era order, then extras alphabetically
  const era=(world.eras||[]).map(e=>e.name);
  return ages.slice().sort((a,b)=>{ const ia=era.indexOf(a.age), ib=era.indexOf(b.age);
    if(ia!==ib) return (ia<0?1e9:ia)-(ib<0?1e9:ib); return a.age.localeCompare(b.age); });
}
async function openTimeline(){
  openModal(`<button class="btn close" onclick="closeModal()">✕ Close</button><h2>🕑 Timeline</h2>
    <p class="note">Load a past turn to explore the map as it was — pan, zoom, switch map modes and click provinces just like the present. Grouped by Age, in chronological order.</p>
    <div id="tlBody"><div class="note">Loading…</div></div>`);
  const {mode,ages}=await fetchTimeline();
  const host=$("#tlBody"); if(!host)return;
  if(mode==="none" || !ages.length){ host.innerHTML='<div class="note">No saved snapshots yet. In the editor: ⋯ menu → “Save timeline snapshot”.</div>'; return; }
  const ordered=orderAges(ages);
  host.innerHTML =
    (_timelineViewing?`<div class="tlNow">Viewing <b>${esc(_timelineViewing.age)} · ${esc(_timelineViewing.label)}</b><button class="btn tiny" id="tlPresent">⟲ Return to present</button></div>`:"")
    + ordered.map(a=>`<div class="tlAge"><div class="tlAgeH">${esc(a.age)}</div><div class="tlSnaps">${
        a.snaps.length?a.snaps.map(s=>`<button class="btn tlSnap${(_timelineViewing&&_timelineViewing.age===a.age&&_timelineViewing.label===s.label)?" primary":""}" data-age="${esc(a.age)}" data-file="${esc(s.file)}" data-mode="${mode}">${esc(s.label)}</button>`).join(""):'<span class="note">No snapshots.</span>'
      }</div></div>`).join("");
  host.querySelectorAll(".tlSnap").forEach(b=>b.onclick=()=>loadSnapshot(b.dataset.mode,b.dataset.age,b.dataset.file));
  { const rp=$("#tlPresent"); if(rp)rp.onclick=returnToPresent; }
}
// Backwards compatibility: a snapshot saved before province geometry was stored
// (or one that omits it) borrows the CURRENT map's layout so it still renders.
// Newer snapshots carry their own province points and are left untouched.
function backfillMapGeometry(snap){
  if(!snap || typeof snap!=="object") return snap;
  let present=null;
  const getPresent=()=>{ if(present)return present; try{ present=_presentSnapshot?JSON.parse(_presentSnapshot):JSON.parse(JSON.stringify(world)); }catch(e){ present={}; } return present; };
  const hasGeo=p=>Array.isArray(p&&p.points)&&p.points.length>=3;
  if(!Array.isArray(snap.provinces)){ snap.provinces = JSON.parse(JSON.stringify(getPresent().provinces||[])); snap._geoBackfilled=true; }   // no provinces at all → use the current map wholesale
  const needFill = snap.provinces.some(p=>!hasGeo(p));
  const needCont = !Array.isArray(snap.continents) || !snap.continents.length;
  if(needFill || needCont){
    const pres=getPresent();
    const provById={}; (pres.provinces||[]).forEach(p=>provById[p.id]=p);
    // fill geometry for any province lacking it, matched by id to the CURRENT map
    snap.provinces.forEach(p=>{ if(!hasGeo(p)){ const src=provById[p.id]; if(src){ p.points=JSON.parse(JSON.stringify(src.points||[])); p.continentId=src.continentId; snap._geoBackfilled=true; } } });
    // provinces that existed then but were since deleted (no current geometry to borrow) can't be drawn → drop them
    const before=snap.provinces.length; snap.provinces = snap.provinces.filter(p=>hasGeo(p)); if(snap.provinces.length!==before) snap._geoBackfilled=true;
    // ensure every continent referenced by a (kept) province exists; pull missing ones from the current map
    if(needCont){ snap.continents = []; snap._geoBackfilled=true; }
    const contById={}; (snap.continents||[]).forEach(c=>contById[c.id]=c);
    const presContById={}; (pres.continents||[]).forEach(c=>presContById[c.id]=c);
    snap.provinces.forEach(p=>{ if(p.continentId && !contById[p.continentId] && presContById[p.continentId]){ const c=JSON.parse(JSON.stringify(presContById[p.continentId])); contById[c.id]=c; snap.continents.push(c); } });
  }
  return snap;
}
async function loadSnapshot(mode,age,file){
  try{
    flash("Loading "+file.replace(/\.json$/,"")+"…");
    const data=await loadTimelineWorld(mode,age,file);
    if(!_presentSnapshot) _presentSnapshot=JSON.stringify(world);   // remember the live world once
    backfillMapGeometry(data);                                      // fill in map layout for older/geometry-less snapshots
    const upgraded=!!data._geoBackfilled; delete data._geoBackfilled;
    // Freeze the fallback: in the editor, save the borrowed layout back into the file so it
    // becomes self-contained and won't drift as the map changes later.
    if(upgraded && mode==="api" && !VIEWER){
      const m=file.match(/phase\s*(\d+)\s*-\s*turn\s*(\d+)/i);
      if(m){ try{ await fetch("/api/timeline_save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({age,phase:+m[1],turn:+m[2],world:data})}); flash("Older snapshot upgraded with the current map layout — it's now self-contained."); }catch(e){} }
    }
    _timelineViewing={age,label:file.replace(/\.json$/,"")};
    const cam={...state.cam}, mm=state.mapmode;                     // keep the player's view & map mode
    world=normalize(data); afterLoad(); state.mapmode=mm; state.cam=cam; renderMap(); renderLegend();
    updateTimelineBanner(); closeModal();
    flash("Now viewing "+age+" · "+_timelineViewing.label+".");
  }catch(e){ flash("Error loading snapshot: "+e.message); }
}
function returnToPresent(){
  if(!_presentSnapshot){ _timelineViewing=null; updateTimelineBanner(); closeModal(); return; }
  const cam={...state.cam}, mm=state.mapmode;
  world=normalize(JSON.parse(_presentSnapshot)); _presentSnapshot=null; _timelineViewing=null;
  afterLoad(); state.mapmode=mm; state.cam=cam; renderMap(); renderLegend();
  updateTimelineBanner(); closeModal(); flash("Back to the present.");
}
function updateTimelineBanner(){
  let b=document.getElementById("tlBanner");
  if(!_timelineViewing){ if(b)b.remove(); return; }
  if(!b){ b=document.createElement("div"); b.id="tlBanner"; ($("#stage")||document.body).appendChild(b); }
  b.innerHTML=`🕑 Viewing <b>${esc(_timelineViewing.age)} · ${esc(_timelineViewing.label)}</b><button class="btn tiny" id="tlBannerBack">⟲ Present</button><button class="btn tiny" id="tlBannerOpen">Timeline…</button>`;
  $("#tlBannerBack").onclick=returnToPresent;
  $("#tlBannerOpen").onclick=openTimeline;
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
let _exportDir="Z:\\herald\\data";
async function publishViewer(){
  const folder=prompt("Publish the player viewer & push it live into this folder:",_viewerPublishDir);
  if(!folder)return; _viewerPublishDir=folder.trim();
  syncCompendiumToWorld();
  try{
    flash("Publishing…");
    const res=await fetch("/api/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({folder:_viewerPublishDir,world})});
    const j=await res.json();
    if(!j.ok){flash("Error: "+(j.error||"publish failed"));return;}
    // one button: publish then upload straight to GitHub via the API (no git push)
    flash("Published — uploading to GitHub…");
    const gr=await fetch("/api/ghupload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({folder:_viewerPublishDir})});
    const gj=await gr.json();
    if(gj.ok) flash("Published & uploaded ✓ — GitHub deploys in ~1 minute.");
    else alert("Published the files, but the GitHub upload didn't complete:\n\n"+(gj.output||gj.error||"unknown"));
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
async function checkGitStatus(){
  const folder=prompt("Check the git/publish status of this folder:",_viewerPublishDir);
  if(!folder)return; _viewerPublishDir=folder.trim();
  flash("Checking git status…");
  try{
    const r=await fetch("/api/gitstatus",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({folder:_viewerPublishDir})});
    const j=await r.json();
    alert(j.output||j.error||"No response.");
  }catch(e){alert("Error: "+e.message);}
}
async function forceCancelDeploys(){
  const folder=prompt("Repair GitHub Pages for the repo in this folder (switch to Actions build, clear stuck deployments, cancel stuck runs):",_viewerPublishDir);
  if(!folder)return; _viewerPublishDir=folder.trim();
  flash("Repairing GitHub Pages deploy…");
  try{
    const r=await fetch("/api/gitcancel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({folder:_viewerPublishDir})});
    const j=await r.json();
    alert(j.output||j.error||"No response.");
  }catch(e){alert("Error: "+e.message);}
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
  ensureCompendium(world); syncCompendiumToWorld();   // global compendium: build once, keep across snapshot loads
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
// EU4-inspired custom map-mode glyphs. Most use currentColor so they invert to
// white on the active button; the Race icon is a fixed Anbennar-blue portrait roundel.
const MM_ICON={
  political:`<svg viewBox="0 0 24 24" class="mmi"><path fill="currentColor" d="M2 9l4 4 6-7 6 7 4-4-2 10.5H4L2 9z"/><rect x="4" y="20.2" width="16" height="2.4" rx="1.1" fill="currentColor"/></svg>`,
  terrain:`<svg viewBox="0 0 24 24" class="mmi"><path fill="currentColor" fill-rule="evenodd" d="M2 20L9 7.5l4.3 7.4 2.4-3.6L22 20H2zm7-8.4l-1.6 2.9h3.2L9 11.6z"/></svg>`,
  resource:`<svg viewBox="0 0 24 24" class="mmi"><path fill="currentColor" fill-rule="evenodd" d="M7 3h10l4 6-9 12L3 9l4-6zm5 3.4L6.3 9.3h11.4L12 6.4z"/></svg>`,
  religion:`<svg viewBox="0 0 24 24" class="mmi"><path fill="currentColor" d="M12 1l2 4.1 4.1-2.1-2.1 4.1L20 9l-4.1 2 2.1 4.1L14 13l-2 4.1L10 13l-4 2.1L8.1 11 4 9l4.1-1.9L6 3l4.1 2.1L12 1z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>`,
  culture:`<svg viewBox="0 0 24 24" class="mmi"><path fill="currentColor" fill-rule="evenodd" d="M5 3h14v7c0 6-4.5 11-7 11S5 16 5 10V3zm4.5 6a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm5 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM8.4 14.6c1.9 2.1 5.3 2.1 7.2 0l-1.1-1.2c-1.3 1.4-3.7 1.4-5 0l-1.1 1.2z"/></svg>`,
  race:`<svg viewBox="0 0 24 24" class="mmi"><circle cx="12" cy="12" r="11" fill="#22468a" stroke="#e2ecff" stroke-width="1.4"/><circle cx="12" cy="9.6" r="3.3" fill="#a8c8f7"/><path fill="#a8c8f7" d="M5.7 19.7c0-3.5 2.9-5.7 6.3-5.7s6.3 2.2 6.3 5.7v.3H5.7v-.3z"/></svg>`,
  language:`<svg viewBox="0 0 24 24" class="mmi"><path fill="currentColor" fill-rule="evenodd" d="M3 4h18v12.5H9L4 20.8V16.5H3V4zm4 3.8v2h10v-2H7zm0 3.9v2h7v-2H7z"/></svg>`,
  population:`<svg viewBox="0 0 24 24" class="mmi"><path fill="currentColor" d="M5.6 8.2A2.3 2.3 0 105.6 13a2.3 2.3 0 000-4.6zm12.8 0A2.3 2.3 0 1018.4 13a2.3 2.3 0 000-4.6zM12 5.6A3 3 0 1012 12a3 3 0 000-6.4zM.9 20c0-2.6 2-4.3 4.5-4.3.7 0 1.4.1 2 .4C6.4 17 6 18.4 6 20H.9zm22.2 0H18c0-1.6-.4-3-1.4-3.9.6-.3 1.3-.4 2-.4 2.5 0 4.5 1.7 4.5 4.3zM6.8 20c0-3 2.3-5.1 5.2-5.1s5.2 2.1 5.2 5.1H6.8z"/></svg>`,
  settlement:`<svg viewBox="0 0 24 24" class="mmi"><path fill="currentColor" fill-rule="evenodd" d="M2.5 21V10l6.5-4.3L15.5 10v11h-13zm11.5-7.5h7.5V21H14v-7.5zM6 13v2h2.2v-2H6zm0 4v2h2.2v-2H6zm10.4-1.5v2h2.1v-2h-2.1z"/></svg>`,
  economy:`<svg viewBox="0 0 24 24" class="mmi"><path fill="currentColor" fill-rule="evenodd" d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2.4a7.6 7.6 0 110 15.2 7.6 7.6 0 010-15.2z"/><path fill="currentColor" d="M11 6.6h2V9c1.5.2 2.6 1.1 2.6 2.4h-2c0-.5-.6-.9-1.5-.9-.8 0-1.4.4-1.4.9 0 .5.6.7 1.8 1 1.7.4 3.2 1 3.2 2.8 0 1.3-1.1 2.3-2.7 2.5v2.3h-2v-2.3c-1.6-.2-2.8-1.2-2.8-2.6h2c0 .6.7 1 1.7 1s1.5-.4 1.5-.9-.7-.8-1.9-1.1c-1.6-.4-3.1-1-3.1-2.7 0-1.3 1.1-2.2 2.6-2.4V6.6z"/></svg>`,
  monster:`<svg viewBox="0 0 24 24" class="mmi"><path fill="currentColor" fill-rule="evenodd" d="M4 3c2 1 3.1 2.5 3.5 4.4C8.8 6.6 10.3 6.1 12 6.1s3.2.5 4.5 1.3C16.9 5.5 18 4 20 3c-.3 2.4-1 3.8-2 4.9 1.2 1.2 2 3 2 4.8 0 4.5-4 8.6-8 8.6s-8-4.1-8-8.6c0-1.8.8-3.6 2-4.8C5 6.8 4.3 5.4 4 3zm5.6 8.2a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm4.8 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/></svg>`,
  military:`<svg viewBox="0 0 24 24" class="mmi"><path fill="currentColor" d="M3 3h2.3l9 9-2.3 2.3-9-9V3zm18 0v2.3l-9 9-2.3-2.3 9-9H21zM3 18.9l4.2-4.2 1.6 1.6-4.2 4.2H3v-1.6zm18 0v1.6h-1.6l-4.2-4.2 1.6-1.6 4.2 4.2z"/></svg>`,
  region:`<svg viewBox="0 0 24 24" class="mmi"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M4 6.5 9 4l6 2.5L20 4v13.5L15 20 9 17.5 4 20z"/><path fill="none" stroke="currentColor" stroke-width="1.3" d="M9 4v13.5M15 6.5V20"/></svg>`,
  tech:`<svg viewBox="0 0 24 24" class="mmi"><path fill="currentColor" d="M9.2 2h5.6l-.5 4.2a6 6 0 0 1 1.6.9L19 5.4l2.6 2.6-1.7 3.1c.4.5.7 1 .9 1.6L25 13v-.02l-.02 5.6h-.02l-4.2-.5a6 6 0 0 1-.9 1.6L20 22l-2.6 2.6" opacity="0"/><path fill="currentColor" d="M12 8.2a3.8 3.8 0 100 7.6 3.8 3.8 0 000-7.6zm0 2a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6z"/><path fill="currentColor" d="M11 1.5h2v3h-2zM11 19.5h2v3h-2zM1.5 11h3v2h-3zM19.5 11h3v2h-3zM4.2 5.6 5.6 4.2 7.8 6.4 6.4 7.8zM16.2 17.6l1.4-1.4 2.2 2.2-1.4 1.4zM17.6 6.4l-1.4-1.4 2.2-2.2 1.4 1.4zM6.4 16.2l-1.4 1.4 2.2 2.2 1.4-1.4z"/></svg>`,
};
// 5th field = EU4 button-art basename in /img (uses mm_<name>.png / mm_<name>_a.png
// for the normal + active/pressed states). null → fall back to the custom SVG glyph.
const MAPMODE_BAR=[
  ["political",MM_ICON.political,"Political","1","political"],
  ["terrain",MM_ICON.terrain,"Terrain","2","terrain"],
  ["resource",MM_ICON.resource,"Resources","3","resource"],
  ["religion",MM_ICON.religion,"Religions","4","religion"],
  ["culture",MM_ICON.culture,"Cultures","5","culture"],
  ["race",MM_ICON.race,"Races","6","race"],
  ["language",MM_ICON.language,"Languages","7","language"],
  ["population",MM_ICON.population,"Population","8","population"],
  ["settlement",MM_ICON.settlement,"Settlements","9","settlement"],
  ["economy",MM_ICON.economy,"Modes of Production","0","economy"],
  ["region",MM_ICON.region,"Regions","R",null],
  ["tech",MM_ICON.tech,"Tech Level","T",null],
  ["monster",MM_ICON.monster,"Monsters","O","monster"],
  ["military",MM_ICON.military,"Military","P","military"],
];
let _mmOpen=false;   // mobile: is the map-mode picker expanded?
function buildMapmodeBar(){
  const bar=$("#mapmodeBar"); if(!bar)return; bar.innerHTML="";
  MAPMODE_BAR.forEach(([m,icon,label,hk,img],i)=>{
    const b=document.createElement("button"); b.className="mmbtn"+(img?" hasimg":""); b.dataset.mode=m;
    b.title=`${label}  (hotkey ${hk})`;
    if(img){ b.style.setProperty("--mm",`url("img/mm_${img}.png")`); b.style.setProperty("--mma",`url("img/mm_${img}_a.png")`); b.innerHTML=`<span class="mmkey">${hk}</span>`; }
    else b.innerHTML=`${icon}<span class="mmkey">${hk}</span>`;
    b.onclick=()=>{
      if(document.body.classList.contains("mobile") && !_mmOpen){ _mmOpen=true; refreshMapmodeBar(); return; }  // tap collapsed → expand
      setMapmode(m); _mmOpen=false; refreshMapmodeBar();                                                        // pick → collapse
    };
    bar.appendChild(b);
  });
  refreshMapmodeBar();
}
function refreshMapmodeBar(){
  const bar=$("#mapmodeBar"); if(!bar)return;
  const collapsed=document.body.classList.contains("mobile") && !_mmOpen;
  bar.classList.toggle("collapsed",collapsed);
  $$("#mapmodeBar .mmbtn").forEach(b=>{
    b.classList.toggle("active",b.dataset.mode===state.mapmode);
    b.style.display = (collapsed && b.dataset.mode!==state.mapmode) ? "none" : "flex";
  });
}
function setMapmode(m){
  state.mapmode=m; state.paintValue=null; state.paintUnclaim=false; state.paintErase=false;
  if(m!=="resource") state.selResource=null;   // clear the resource spotlight when leaving that map
  if(m!=="race") state.selRaceGroup=null;       // clear the race-group spotlight when leaving that map
  if(m!=="terrain" && state.terrainSel) state.terrainSel.clear();   // clear terrain multi-select when leaving
  if(m!=="region") state.selRegion=null;   // clear region highlight when leaving the Regions map
  if(m!=="terrain"){ state.waterEditMode=false; state.selWater=null; state.waterNodeDrag=null; }   // exit water editing when leaving terrain
  state.legendFilter=null;                      // clear any legend spotlight on mode change
  state.convertSelecting=false; state.convertPickCenter=false;   // pause conversion picking when switching maps
  state.paintMixGroups=[];                       // mix-paint groups are axis-specific — reset on map change
  updateResSpot();
  if(m!=="military" && (state.selForce||state.selBattle)){ state.selForce=null; state.selBattle=null; state.moveMode=null; }
  if(m!=="monster" && state.selMonster){ state.selMonster=null; state.moveMode=null; }
  if(m!=="military"&&m!=="monster"&&(state.selForce||state.selBattle||state.selMonster)){ clearSelection(); }
  const ms=$("#mapmode"); if(ms)ms.value=m;
  renderMap(); renderLegend();
  if(state.tool==="paint")flash(paintHint());
}
function mapCenterWorld(){
  const cv=$("#map"); const cw=cv.clientWidth||800, ch=cv.clientHeight||600;
  return [state.cam.x+(cw/state.cam.scale)/2, state.cam.y+(ch/state.cam.scale)/2];
}
function addForceAtCenter(){
  beginEdit();
  const [cx,cy]=mapCenterWorld();
  const rid=state.selRealm || (world.realms[0]&&world.realms[0].id) || null;
  const f=newForce(cx,cy,rid);
  world.forces.push(f); separateForce(f); markDirty(); selectForce(f.id); renderLegend();
}
function addMonsterAtCenter(){
  beginEdit();
  const [cx,cy]=mapCenterWorld();
  const m=newMonster(cx,cy);
  world.monsters.push(m); markDirty(); selectMonster(m.id); renderLegend();
}
function updateWorldPop(){
  const el=$("#worldPop"); if(!el)return;
  const total=world.provinces.reduce((a,p)=>a+(p.population||0),0);
  el.textContent="👥 "+total.toLocaleString();
  if($("#popPanel")) buildWorldPopPanel();   // keep an open breakdown fresh
}
const POP_PANEL_AXES=[["race","subraces","Race"],["religion","religions","Religion"],["culture","cultures","Culture"],["language","languages","Language"],["economy","economies","Mode of Production"]];
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
function updateMobile(){ document.body.classList.toggle("mobile", window.innerWidth<=760); if(!document.body.classList.contains("mobile"))_mmOpen=false; refreshMapmodeBar(); buildMapLegend(); if(state.selRealm)renderTechPanel(); }
function wireTopbar(){
  $("#worldName").addEventListener("input",e=>{world.name=e.target.value;markDirty();});
  $("#eraSelect").addEventListener("change",e=>{world.currentEraId=e.target.value;markDirty();});
  // toggle bar — Continents = continent names (any mode), Realms = realm outlines
  // (any mode but political), Terrain = terrain outlines (any mode but terrain).
  const syncToggleBtns=()=>{
    const set=(t,on)=>{ const b=document.querySelector(`#toggleBar .tgl[data-toggle="${t}"]`); if(b)b.classList.toggle("on",!!on); };
    set("continents",state.showNames); set("realms",state.realmOverlay); set("terrain",state.terrainOverlay);
    set("water",state.showWater); set("regions",state.showRegions);
  };
  $$("#toggleBar .tgl").forEach(b=>b.addEventListener("click",()=>{
    const t=b.dataset.toggle;
    if(t==="continents") state.showNames=!state.showNames;
    else if(t==="realms") state.realmOverlay=!state.realmOverlay;
    else if(t==="terrain") state.terrainOverlay=!state.terrainOverlay;
    else if(t==="water") state.showWater=!state.showWater;
    else if(t==="regions") state.showRegions=!state.showRegions;
    syncToggleBtns(); renderMap(); renderLegend();
  }));
  syncToggleBtns();
  const ms=$("#mapmode"); if(ms)ms.addEventListener("change",e=>setMapmode(e.target.value));
  buildMapmodeBar();
  const wp=$("#worldPop"); if(wp)wp.onclick=toggleWorldPopPanel;
  const bp=$("#btnPing"); if(bp)bp.onclick=togglePing; buildPingBar();
  const br=$("#btnRuler"); if(br)br.onclick=toggleRuler;
  $$(".btn.tool").forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
  const pf=$("#provFind");
  if(pf){
    pf.addEventListener("input",()=>renderProvFind(pf.value));
    pf.addEventListener("focus",()=>{ if(pf.value)renderProvFind(pf.value); });
    pf.addEventListener("blur",()=>setTimeout(hideProvFind,180));
    pf.addEventListener("keydown",e=>{
      if(e.key==="Enter"){ const list=matchProvinces(pf.value); if(list[0]){ pf.value=list[0].name; zoomToProvince(list[0]); hideProvFind(); pf.blur(); } }
      else if(e.key==="Escape"){ hideProvFind(); pf.blur(); }
    });
  }
  const bv=$("#btnView"); if(bv)bv.onclick=togglePreviewViewer;
  { const bt=$("#btnTimeline"); if(bt)bt.onclick=openTimeline; }
  { const bc=$("#btnCompendium"); if(bc)bc.onclick=()=>openCompendium(); }
  $("#worldView").onclick=()=>{worldView();};
  $("#btnPanels").onclick=()=>{
    if(document.body.classList.contains("mobile")){ const open=document.body.classList.toggle("m-drawer"); $("#btnPanels").classList.toggle("on",open); return; }
    const hidden=document.body.classList.toggle("panels-hidden");$("#btnPanels").classList.toggle("on",hidden);renderMap();flash(hidden?"Side panels hidden — click Panels again to bring them back.":"Side panels shown.");};
  const insClose=$("#insClose"); if(insClose)insClose.onclick=()=>{document.body.classList.remove("has-sel");document.body.classList.remove("m-drawer");};
  updateMobile(); window.addEventListener("resize",updateMobile);
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
    initRealmTech(r);   // give new realms the current Tech Fields at TL0 (older realms are unaffected)
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
  { const g=$("#btnGM"); if(g)g.onclick=()=>openGMScreen(); }
  { const g2=$("#btnGM2"); if(g2)g2.onclick=()=>openGM2(); }
  $("#btnEdit").onclick=()=>{
    state.editMode=!state.editMode;
    document.body.classList.toggle("editing",state.editMode);
    state.draft=null;state.drawCursor=null;state.split=null;state.selWater=null;state.nodeDrag=null;state.moveDrag=null;
    setTool("select");
    flash(state.editMode?"Edit Map mode — draw provinces, rivers and lakes; move, reshape, split and merge.":"View mode.");
  };
}

function applyViewerUI(){
  // chrome hiding is handled by CSS on body.viewer (so it can be toggled by the editor's View Mode)
  document.body.classList.add("viewer");
  document.body.classList.add("realviewer");   // real published viewer — hide the View Mode toggle
  document.title="Project Sovereign — Atlas";
  const wn=$("#worldName"); if(wn)wn.readOnly=true;
  flash("Read-only atlas — click provinces and realms to view their details.");
}
// Editor-only: preview exactly what the site viewer sees, and toggle back.
function togglePreviewViewer(){
  if(BOOT_VIEWER)return;   // real published viewer can't leave viewer mode
  VIEWER=!VIEWER;
  document.body.classList.toggle("viewer", VIEWER);
  const wn=$("#worldName"); if(wn)wn.readOnly=VIEWER;
  const vb=$("#btnView"); if(vb)vb.classList.toggle("on",VIEWER);
  if(VIEWER){
    if(document.body.classList.contains("editing")){ state.editMode=false; document.body.classList.remove("editing"); const be=$("#btnEdit"); if(be)be.classList.remove("on"); }
    setTool("select"); state.paintErase=false; state.moveMode=null;
    closeModal();
  }
  // rebuild everything through the effective VIEWER flag
  renderPaintPanel(); renderMap(); renderLeft(); renderLegend();
  // refresh the open inspector for whichever thing is selected
  if(state.selForce) renderForceEditor();
  else if(state.selMonster) renderMonsterEditor();
  else if(state.selBattle) renderBattleView();
  else if(state.selProvince) renderProvinceEditor();
  else if(state.selRealm) renderRealmEditor();
  else if(state.selReligion) renderReligionEditor();
  else { const ins=$("#inspector"); if(ins)ins.innerHTML=`<div class="empty">${VIEWER?"Welcome to the atlas. Switch map mode and click any province, realm, or creature.":"Select a province, realm, or continent to edit."}</div>`; }
  renderWonderPanel();
  flash(VIEWER?"👁 View Mode — seeing exactly what players see. Click again to return to editing.":"Back to the editor.");
}
async function loadMonsterImages(){
  try{ const r=await fetch("/api/monimages"); const j=await r.json();
    if(j&&Array.isArray(j.images)&&j.images.length) MONSTER_IMAGES=j.images;
  }catch(e){}
}
let WONDER_IMAGES=[], RELIGION_IMAGES=[], TERRAIN_IMAGES=[];   // populated from static/img/{wonders,religions,terrain}
async function loadImageList(dir){ try{ const r=await fetch("/api/imglist?dir="+dir); const j=await r.json(); return (j&&Array.isArray(j.images))?j.images:[]; }catch(e){ return []; } }
async function loadExtraImages(){ WONDER_IMAGES=await loadImageList("wonders"); RELIGION_IMAGES=await loadImageList("religions"); TERRAIN_IMAGES=await loadImageList("terrain"); }
// build an <option> list for an image picker, marking the current value selected
function imagePickerOptions(imgs, cur){
  return `<option value="">— pick an image —</option>`+
    imgs.map(mi=>`<option value="${esc(mi.src)}" ${cur===mi.src?"selected":""}>${esc(mi.name)}</option>`).join("")+
    ((cur && !imgs.some(mi=>mi.src===cur))?`<option value="${esc(cur)}" selected>(current) ${esc(cur)}</option>`:"");
}
async function boot(){
  wireTopbar();
  setupMapInteraction();
  await loadMonsterImages();
  await loadExtraImages();
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
