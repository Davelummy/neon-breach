import { getStore } from '@netlify/blobs';
import { createCommunityService } from '../../server/community-service.mjs';
import {createAccountService} from '../../server/account-service.mjs';

let handler;
export async function handlePublicCommunity(request, path) {
  try {
    if(!handler){const store=getStore({name:'neon-breach-community',consistency:'strong'});handler=createCommunityService(store,Date.now,{scoreIdentity:createAccountService(store).scoreIdentity});}
    const url = new URL(request.url); url.pathname = path;
    return await handler(new Request(url, request));
  } catch {
    return Response.json({ available: false, error: 'Community storage unavailable.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
export default request => handlePublicCommunity(request, '/api/community');
export const config = { path: '/api/community' };
