// Directory metadata identifies streams, not broadcast or music permissions.
export const LIVE_STATIONS=Object.freeze([]);
const CACHE_KEY='neon-breach-radio-directory-v1',DAY=86400000;
// One silent PCM sample: primes the reusable element on a real start gesture,
// with no remote request and no synthesized soundtrack masquerading as radio.
const SILENCE='data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';
const MIRRORS=['de1','nl1','fi1'].map(host=>`https://${host}.api.radio-browser.info`);
function publicHttps(value){
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)||u.hostname.includes(':'))return '';return u.href;}catch{return '';}
}
export function directoryStations(rows){
  if(!Array.isArray(rows))return [];
  const seen=new Set();
  return rows.filter(row=>row?.countrycode==='NG'&&row.lastcheckok===1&&!row.hls&&/^(MP3|AAC|AAC\+)$/i.test(row.codec)&&typeof row.stationuuid==='string'&&typeof row.name==='string')
    .map(row=>({id:`rb-${row.stationuuid}`,name:row.name.trim().slice(0,80),url:publicHttps(row.url_resolved),homepage:publicHttps(row.homepage),source:'Radio Browser',region:String(row.state||'').slice(0,60)}))
    .filter(station=>station.url&&station.homepage&&station.name&&!seen.has(station.url)&&seen.add(station.url))
    .sort((a,b)=>Number(/abuja|fct/i.test(b.region+' '+b.name))-Number(/abuja|fct/i.test(a.region+' '+a.name))).slice(0,16);
}
export function cachedStations(storage,now=Date.now()){
  try{const cached=JSON.parse(storage?.getItem(CACHE_KEY)||'null');if(cached&&now>=cached.time&&now-cached.time<DAY&&Array.isArray(cached.stations))return approvedStations(cached.stations);}catch{}
  return [];
}
export async function discoverStations({fetcher=globalThis.fetch,storage,now=Date.now()}={}){
  const cached=cachedStations(storage,now);if(cached.length)return cached;
  // At most three timed metadata requests: on the first drive (unless radio is Off) or on Tune / Retry.
  const offset=Math.floor(Math.random()*MIRRORS.length);
  for(let i=0;i<MIRRORS.length;i++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetcher(`${MIRRORS[(offset+i)%MIRRORS.length]}/json/stations/search?countrycode=NG&hidebroken=true&limit=100&order=clickcount&reverse=true`,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json'}});
      if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))continue;
      const stations=directoryStations(await response.json());if(!stations.length)continue;
      try{storage?.setItem(CACHE_KEY,JSON.stringify({time:now,stations}));}catch{}
      return stations;
    }catch{}finally{clearTimeout(timer);}
  }
  return [];
}

export function approvedStations(stations){
  const ids=new Set();
  return stations.filter(station=>{
    if(!station?.id||station.id==='off'||ids.has(station.id)||!station.name||(!station.permission&&station.source!=='Radio Browser'))return false;
    if(!publicHttps(station.url))return false;
    ids.add(station.id);return true;
  });
}

export class VehicleRadio {
  constructor({stations=LIVE_STATIONS,createMedia=()=>new Audio(),onChange=()=>{}}={}){
    this.stations=approvedStations(stations);this.createMedia=createMedia;this.onChange=onChange;this.generation=0;this.state='stopped';this.media=null;
  }
  status(){return {state:this.state,station:this.station?.id||'off',name:this.station?.name||'',configured:this.stations.length>0,kind:'live-stream',primed:!!this.primed};}
  prime(){
    if(this.primed||this.priming||!['stopped','off','unconfigured'].includes(this.state))return;
    const media=this.media||(this.media=this.createMedia()),generation=this.generation;
    media.volume=0;media.muted=false;media.src=SILENCE;this.priming=true;
    const finish=ok=>{this.priming=false;if(generation!==this.generation)return;this.primed=ok;media.pause();media.removeAttribute('src');media.load();};
    try{Promise.resolve(media.play()).then(()=>finish(true),()=>finish(false));}catch{finish(false);}
  }
  setState(state){this.state=state;this.onChange(this.status());}
  setVolume(volume,muted=false){this.volume=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):.5;this.muted=!!muted;if(this.media){this.media.volume=this.volume;this.media.muted=this.muted;}}
  stop(){
    ++this.generation;clearTimeout(this.deadline);this.deadline=null;
    this.listeners?.abort();this.listeners=null;
    if(this.media){this.media.pause();this.media.removeAttribute('src');this.media.load();}
    this.setState('stopped');
  }
  async start({inVehicle=false,playing=false,station='off',volume=.5,muted=false}={}){
    this.stop();this.station=this.stations.find(item=>item.id===station);this.setVolume(volume,muted);
    if(!inVehicle||!playing)return;
    if(!this.stations.length){this.setState('unconfigured');return;}
    if(!this.station){this.setState('off');return;}
    const generation=this.generation,media=this.media||(this.media=this.createMedia());media.preload='none';media.volume=this.volume;media.muted=this.muted;
    this.listeners=new AbortController();const listenerOptions={signal:this.listeners.signal};
    const current=()=>generation===this.generation&&media===this.media;
    const fail=state=>{if(!current())return;this.stop();this.setState(state);};
    media.addEventListener('playing',()=>{if(current()){clearTimeout(this.deadline);this.deadline=null;this.setState('playing');}},listenerOptions);
    const buffering=()=>{if(!current())return;this.setState('buffering');if(this.deadline==null)this.deadline=setTimeout(()=>fail('unavailable'),12000);};
    media.addEventListener('waiting',buffering,listenerOptions);media.addEventListener('stalled',buffering,listenerOptions);
    media.addEventListener('error',()=>fail('unavailable'),listenerOptions);media.addEventListener('ended',()=>fail('unavailable'),listenerOptions);
    this.setState('connecting');media.src=this.station.url;this.deadline=setTimeout(()=>fail('unavailable'),12000);
    // Never await a potentially stalled browser play promise. Media events and
    // the deadline own state; late completion cannot restart audio after exit.
    try{Promise.resolve(media.play()).then(()=>{if(current())this.primed=true;else if(!media.src)media.pause();},error=>fail(error?.name==='NotAllowedError'?'blocked':'unavailable'));}catch(error){fail(error?.name==='NotAllowedError'?'blocked':'unavailable');}
  }
}
