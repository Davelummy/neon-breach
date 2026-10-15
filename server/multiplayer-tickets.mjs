import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const ticketSecretReady=secret=>typeof secret==='string'&&Buffer.byteLength(secret)>=32&&Buffer.byteLength(secret)<=256;
export function exactHttpsOrigin(value){const url=new URL(value);if(url.protocol!=='https:'||url.origin!==value||url.username||url.password)throw Error('Exact HTTPS game origin required');return url.origin;}
export function matchSocketUrl(value){const url=new URL(value);if(url.protocol!=='wss:'||url.username||url.password||url.search||url.hash||url.pathname!=='/api/multiplayer/socket')throw Error('Secure match WebSocket URL required');return url.href;}
const signature=(payload,secret)=>createHmac('sha256',secret).update(payload).digest('base64url');
export function issueMatchTicket(auth,secret,origin,clock=Date.now){
 if(!ticketSecretReady(secret)||!UUID.test(auth?.user?.id||'')||!/^[a-z0-9_]{3,16}$/.test(auth?.user?.username||'')||!/^session:[a-f0-9]{64}$/.test(auth?.sessionKey||''))throw Error('Valid session and signing configuration required');
 const iat=Math.floor(clock()/1000),claims={v:1,aud:'neon-breach-match',iss:exactHttpsOrigin(origin),sub:auth.user.id,username:auth.user.username,session:auth.sessionKey,iat,exp:iat+90,jti:randomBytes(16).toString('hex')};
 const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');return `${payload}.${signature(payload,secret)}`;
}
export function verifyMatchTicket(ticket,secret,origin,{clock=Date.now,allowExpired=false}={}){
 try{
  if(!ticketSecretReady(secret)||typeof ticket!=='string'||ticket.length>1024||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(ticket))return null;
  const [payload,provided]=ticket.split('.'),expected=signature(payload,secret);
  if(!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return null;
  const c=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')),now=Math.floor(clock()/1000);
  if(c?.v!==1||c.aud!=='neon-breach-match'||c.iss!==exactHttpsOrigin(origin)||!UUID.test(c.sub||'')||!/^[a-z0-9_]{3,16}$/.test(c.username||'')||!/^session:[a-f0-9]{64}$/.test(c.session||'')||! /^[a-f0-9]{32}$/.test(c.jti||''))return null;
  if(!Number.isSafeInteger(c.iat)||!Number.isSafeInteger(c.exp)||c.iat>now+5||c.exp!==c.iat+90||(!allowExpired&&c.exp<=now)||c.iat<now-30*86400)return null;
  return c;
 }catch{return null;}
}
export function serviceAuthorized(value,secret){if(!ticketSecretReady(secret)||typeof value!=='string')return false;const supplied=Buffer.from(value),expected=Buffer.from(`Bearer ${secret}`);return supplied.length===expected.length&&timingSafeEqual(supplied,expected);}
