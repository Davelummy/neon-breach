import {createAccountService} from './account-service.mjs';
import {ticketSecretReady,matchSocketUrl,issueMatchTicket,verifyMatchTicket,serviceAuthorized} from './multiplayer-tickets.mjs';
export function createMultiplayerGateway(store,{serverUrl,secret,clock=Date.now}={}){
 const accounts=createAccountService(store,{clock}),json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
 let socketUrl=null;try{if(ticketSecretReady(secret))socketUrl=matchSocketUrl(serverUrl);}catch{/* Unconfigured deployments fail closed. */}
 return async request=>{
  try{
   const url=new URL(request.url),route=url.pathname;
   if(!socketUrl)return json({available:false,error:'Online multiplayer is not configured yet.'},503);
   if(route==='/api/multiplayer'&&request.method==='GET')return json({available:true,mode:'private-ffa',maxPlayers:8,localOnly:false,transport:'ticket-websocket',socketUrl,healthUrl:new URL('/health',socketUrl.replace('wss:','https:')).href});
   if(!['/api/multiplayer/ticket','/api/multiplayer/session'].includes(route))return json({error:'Not found.'},404);
   if(request.method!=='POST')return json({error:'POST required.'},405);
   if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required.'},415);
   if(route.endsWith('/session')&&!serviceAuthorized(request.headers.get('authorization'),secret))return json({error:'Unauthorized.'},401);
   if(route.endsWith('/ticket')&&request.headers.get('origin')!==url.origin)return json({error:'Same-origin request required.'},403);
   const raw=await request.text();if(raw.length>2048)return json({error:'Request too large.'},413);
   let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid JSON.'},400);}
   if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request.'},400);
   if(route.endsWith('/ticket')){
    const auth=await accounts.identify(request);if(!auth)return json({error:'Sign in first.'},401);
    const key=`match-ticket-limit:${auth.user.id}:${Math.floor(clock()/60000)}`;let allowed=false;
    for(let i=0;i<8;i++){if((await store.setJSON(`${key}:${i}`,{expires:clock()+60000},{onlyIfNew:true}))?.modified!==false){allowed=true;break;}}
    if(!allowed)return json({error:'Too many connection attempts. Try again shortly.'},429);
    return json({ticket:issueMatchTicket(auth,secret,url.origin,clock),expiresIn:90});
   }
   const claims=verifyMatchTicket(body.ticket,secret,url.origin,{clock,allowExpired:true});if(!claims)return json({valid:false},401);
   const session=await store.get(claims.session,{type:'json'});
   if(!session||session.expires<=clock()||session.username!==claims.username)return json({valid:false},401);
   const user=await store.get(`account:${session.username}`,{type:'json'});
   return user?.id===claims.sub?json({valid:true,user:{id:user.id,username:user.username}}):json({valid:false},401);
  }catch{return json({error:'Multiplayer authentication is temporarily unavailable.'},503);}
 };
}
