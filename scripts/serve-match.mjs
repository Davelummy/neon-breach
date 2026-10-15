import {createServer} from 'node:http';
import {attachMultiplayer} from '../server/multiplayer-service.mjs';
import {createRemoteMatchAuth} from '../server/multiplayer-remote-auth.mjs';
import {exactHttpsOrigin} from '../server/multiplayer-tickets.mjs';
const origin=exactHttpsOrigin(process.env.NEON_APP_ORIGIN||''),secret=process.env.NEON_MATCH_SECRET;
const auth=createRemoteMatchAuth({origin,secret}),port=Number(process.env.PORT||10000);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid service port');
let closing=false;
const server=createServer((request,response)=>{
 const allowed=request.headers.origin===origin;
 if(allowed){response.setHeader('access-control-allow-origin',origin);response.setHeader('vary','Origin');}
 response.setHeader('cache-control','no-store');response.setHeader('content-type','application/json');response.setHeader('x-content-type-options','nosniff');
 if(request.method==='GET'&&request.url==='/health'){response.statusCode=closing?503:200;response.end(JSON.stringify({service:'neon-breach-match',ready:!closing}));return;}
 response.statusCode=404;response.end(JSON.stringify({error:'Not found.'}));
});
attachMultiplayer(server,null,{publicOrigin:origin,...auth});
server.listen(port,'0.0.0.0',()=>console.log('NEON BREACH match service ready'));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{closing=true;server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();});
