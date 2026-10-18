import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt=promisify(scryptCallback),DAY=86400000,SESSION_AGE=30*DAY;
const digest=value=>createHash('sha256').update(value).digest('hex');
const publicUser=user=>({id:user.id,username:user.username,email_verified:!!user.email_verified,username_reserved:true,username_locked:!!user.email_verified});
const cookieName=request=>new URL(request.url).protocol==='https:'?'__Host-neon_session':'neon_session';
const cookie=(request,token,age)=>`${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
export const normalizeUsername=value=>typeof value==='string'&&/^[a-zA-Z0-9_]{3,16}$/.test(value.trim())?value.trim().toLowerCase():null;
const validPassword=value=>typeof value==='string'&&value.length>=8&&value.length<=128;
// OWASP's lower-memory alternative keeps authentication practical under RAM pressure.
const hashPassword=(password,salt,version='scrypt-v2')=>scrypt(password,salt,64,version==='scrypt-v1'?{N:131072,r:8,p:1,maxmem:256*1024*1024}:{N:32768,r:8,p:3,maxmem:64*1024*1024});
export function createAccountService(store,{clock=Date.now,sendVerification=null}={}){
  let hashing=false,statsCache=null,statsPending=null;
  const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
  async function identify(request){
    const cookies=request.headers.get('cookie')||'',token=cookies.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName(request)}=`))?.split('=')[1];
    if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
    const key=`session:${digest(token)}`,session=await store.get(key,{type:'json'});
    if(!session||session.expires<=clock()){if(session)await store.delete(key);return null;}
    const user=await store.get(`account:${session.username}`,{type:'json'});
    if(!user)return null;
    const lock=await store.get(`email-lock:${user.id}`,{type:'json'});
    return {user:{...user,email_verified:!!lock},sessionKey:key};
  }
  async function rateLimit(subject,max,window=60000){
    const prefix=`limit:${digest(subject)}:${Math.floor(clock()/window)}:`;
    for(let n=0;n<max;n++)if((await store.setJSON(prefix+n,{expires:clock()+window},{onlyIfNew:true}))?.modified!==false)return true;
    return false;
  }
  async function session(request,user){
    const token=randomBytes(32).toString('hex');
    await store.setJSON(`session:${digest(token)}`,{username:user.username,expires:clock()+SESSION_AGE});
    const lock=await store.get(`email-lock:${user.id}`,{type:'json'});
    return json({available:true,user:publicUser({...user,email_verified:!!lock})},200,{'set-cookie':cookie(request,token,SESSION_AGE/1000)});
  }
  async function stats(){
    if(statsCache&&clock()-statsCache.at>=0&&clock()-statsCache.at<15000)return statsCache.value;
    if(statsPending)return statsPending;
    statsPending=(async()=>{
      let total=0,online=0;const started=Date.now();
      for await(const page of store.list({prefix:'account:',paginate:true}))for(const {key}of page.blobs){
        // Pilot store only: never allow a public count request to scan 100k users.
        if(total>=250||Date.now()-started>4000)return {available:false,error:'Player counts require an indexed production store.'};
        total++;const user=await store.get(key,{type:'json'});if(!user?.id)continue;const presence=await store.get(`account-online:${user.id}`,{type:'json'});if(presence&&clock()>=presence.at&&clock()-presence.at<90000)online++;
      }
      return {available:true,total_players:total,online_players:online,identity:'registered-account',as_of:clock()};
    })();
    try{const value=await statsPending;statsCache={at:clock(),value};return value;}finally{statsPending=null;}
  }
  const handle=async(request,clientKey='unknown')=>{
    const path=new URL(request.url).pathname;
    try{
      if(request.method==='GET'){
        if(path==='/api/auth/stats')return json(await stats());
        if(path!=='/api/auth/session')return json({error:'Not found.'},404);
        const auth=await identify(request);return json({available:true,user:auth?publicUser(auth.user):null});
      }
      if(request.method!=='POST')return json({error:'Method not allowed.'},405);
      if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Same-origin JSON request required.'},403);
      const raw=await request.text();if(raw.length>8192)return json({error:'Request too large.'},413);
      let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid JSON.'},400);}
      if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request.'},400);
      if(path==='/api/auth/signup'||path==='/api/auth/login'){
        if(!await rateLimit(`ip:${clientKey}`,8)||hashing)return json({error:'Too many attempts. Try again shortly.'},429);
        const username=normalizeUsername(body.username);
        if(!username||!validPassword(body.password))return json({error:'Use 3–16 letters, numbers or underscores and a password of 8–128 characters.'},400);
        if(!await rateLimit(`username:${username}`,8,300000))return json({error:'Too many attempts. Try again later.'},429);
        hashing=true;
        try{
          let user=await store.get(`account:${username}`,{type:'json'});
          if(path.endsWith('/signup')){
            if(user)return json({error:'Username is unavailable.'},409);
            const salt=randomBytes(16).toString('hex'),hash=(await hashPassword(body.password,salt)).toString('hex');
            user={id:randomUUID(),username,salt,password_hash:hash,password_version:'scrypt-v2',created_at:clock(),email_verified:false,last_seen:clock()};
            const write=await store.setJSON(`account:${username}`,user,{onlyIfNew:true});
            if(write?.modified===false)return json({error:'Username is unavailable.'},409);
          }else{
            const actual=await hashPassword(body.password,user?.salt||'00000000000000000000000000000000',user?(user.password_version||'scrypt-v1'):'scrypt-v2');
            if(!user||!timingSafeEqual(actual,Buffer.from(user.password_hash,'hex')))return json({error:'Username or password is incorrect.'},401);
          }
          return await session(request,user);
        }finally{hashing=false;}
      }
      const auth=await identify(request);
      if(!auth)return json({error:'Sign in first.'},401);
      if(path==='/api/auth/logout'){await store.delete(auth.sessionKey);return json({available:true,user:null},200,{'set-cookie':cookie(request,'',0)});}
      if(path==='/api/auth/heartbeat'){
        // Presence is separate from immutable account credentials.
        await store.setJSON(`account-online:${auth.user.id}`,{at:clock()});
        return json({available:true,ok:true});
      }
      if(path==='/api/auth/email'){
        if(!sendVerification)return json({error:'Email verification is not configured yet. Your username remains reserved.'},503);
        if(!await rateLimit(`email:${auth.user.id}`,3,3600000))return json({error:'Too many verification requests.'},429);
        if(auth.user.email_verified)return json({error:'This username is already permanently verified.'},409);
        const email=typeof body.email==='string'?body.email.trim():'';
        if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:'Enter a valid email address.'},400);
        const token=randomBytes(32).toString('hex');
        await store.setJSON(`email-proof:${auth.user.id}:${digest(token)}`,{email,expires:clock()+30*60000});
        try{await sendVerification(email,token);}catch{await store.delete(`email-proof:${auth.user.id}:${digest(token)}`);return json({error:'Verification could not be sent. Try again later.'},503);}
        return json({available:true,sent:true});
      }
      if(path==='/api/auth/verify-email'){
        if(!/^[a-f0-9]{64}$/.test(body.token||''))return json({error:'Invalid or expired verification.'},400);
        const key=`email-proof:${auth.user.id}:${digest(body.token)}`,proof=await store.get(key,{type:'json'});
        if(!proof||proof.expires<=clock()||auth.user.email_verified)return json({error:'Invalid or expired verification.'},400);
        // Immutable reservation is the authority, avoiding concurrent email overwrites.
        const lock=await store.setJSON(`email-lock:${auth.user.id}`,{email:proof.email,verified_at:clock()},{onlyIfNew:true});
        if(lock?.modified===false)return json({error:'Username already verified.'},409);
        await store.delete(key);return json({available:true,user:{...publicUser(auth.user),email_verified:true,username_locked:true}});
      }
      return json({error:'Not found.'},404);
    }catch{return json({error:'Account service unavailable.'},503);}
  };
  // Public scores are account-only: guests keep runs on their device, and the
  // posted callsign is always the signed-in username, never the request body's.
  async function scoreIdentity(request){
    const auth=await identify(request);
    return auth?{allowed:true,callsign:auth.user.username.toUpperCase()}:{allowed:false};
  }
  return {handle,identify,scoreIdentity};
}
