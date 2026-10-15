import {exactHttpsOrigin,ticketSecretReady,verifyMatchTicket} from './multiplayer-tickets.mjs';
export function createRemoteMatchAuth({origin,secret,fetchImpl=fetch,clock=Date.now}){
 exactHttpsOrigin(origin);if(!ticketSecretReady(secret))throw Error('Match signing secret is not configured');
 const used=new Map();
 async function session(ticket){
  try{
   const response=await fetchImpl(`${origin}/api/multiplayer/session`,{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify({ticket}),signal:AbortSignal.timeout(5000),redirect:'error'});
   if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return null;
   const body=await response.json();return body.valid&&body.user?body.user:null;
  }catch{return null;}
 }
 return {
  async authenticate(request){
   const protocols=(request.headers['sec-websocket-protocol']||'').split(',').map(v=>v.trim());
   if(protocols.length!==2||protocols[0]!=='neon-v1'||!protocols[1].startsWith('ticket.'))return null;
   const ticket=protocols[1].slice(7),claims=verifyMatchTicket(ticket,secret,origin,{clock});if(!claims)return null;
   for(const [key,expiry] of used)if(expiry<=clock())used.delete(key);
   if(used.has(claims.jti)||used.size>=4096)return null;
   // Reserve before awaiting account validation: concurrent replay must also fail.
   used.set(claims.jti,claims.exp*1000);
   const user=await session(ticket);if(!user||user.id!==claims.sub||user.username!==claims.username)return null;
   return {user,ticket};
  },
  async revalidate(ws){const user=await session(ws.authContext.ticket);return !!user&&user.id===ws.identity.id&&user.username===ws.identity.username;}
 };
}
