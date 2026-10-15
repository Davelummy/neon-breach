import {getStore} from '@netlify/blobs';
import {createMultiplayerGateway} from '../../server/multiplayer-gateway.mjs';
let handle;
export default async request=>{
 try{
  const env=key=>globalThis.Netlify?.env?.get(key)||process.env[key];
  handle||=createMultiplayerGateway(getStore({name:'neon-breach-community',consistency:'strong'}),{serverUrl:env('NEON_MATCH_SERVER_URL'),secret:env('NEON_MATCH_SECRET')});
  const url=new URL(request.url);if(url.pathname.startsWith('/.netlify/functions/multiplayer'))url.pathname=url.pathname.replace('/.netlify/functions/multiplayer','/api/multiplayer');
  return await handle(new Request(url,request));
 }catch{return Response.json({available:false,error:'Online multiplayer is temporarily unavailable.'},{status:503,headers:{'cache-control':'no-store'}});}
};
export const config={path:['/api/multiplayer','/api/multiplayer/*','/.netlify/functions/multiplayer','/.netlify/functions/multiplayer/*']};
