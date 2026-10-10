import {getStore} from '@netlify/blobs';
import {createAccountService} from '../../server/account-service.mjs';
let accounts;
export default async(request,context)=>{
  try{
    accounts||=createAccountService(getStore({name:'neon-breach-community',consistency:'strong'}));
    const url=new URL(request.url);
    if(url.pathname.startsWith('/.netlify/functions/accounts/'))url.pathname=url.pathname.replace('/.netlify/functions/accounts/','/api/auth/');
    return await accounts.handle(new Request(url,request),context.ip||'unknown');
  }catch{return Response.json({error:'Account storage unavailable.'},{status:503,headers:{'cache-control':'no-store'}});}
};
export const config={path:['/api/auth/*','/.netlify/functions/accounts/*']};
