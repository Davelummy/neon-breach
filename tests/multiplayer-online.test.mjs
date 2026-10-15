import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {WebSocket} from 'ws';
import {createMultiplayerGateway} from '../server/multiplayer-gateway.mjs';
import {createRemoteMatchAuth} from '../server/multiplayer-remote-auth.mjs';
import {attachMultiplayer} from '../server/multiplayer-service.mjs';
import {issueMatchTicket,verifyMatchTicket,matchSocketUrl} from '../server/multiplayer-tickets.mjs';
const origin='https://neon.example',secret=randomBytes(32).toString('hex');
function fixture(){
 const data=new Map(),clock=()=>1700000000000,store={get:async k=>data.get(k)||null,setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&data.has(k))return {modified:false};data.set(k,v);return {modified:true};}};
 const add=name=>{const token=randomBytes(32).toString('hex'),user={id:randomUUID(),username:name},sessionKey=`session:${createHash('sha256').update(token).digest('hex')}`;data.set(`account:${name}`,user);data.set(sessionKey,{username:name,expires:clock()+86400000});return {user,sessionKey,cookie:`__Host-neon_session=${token}`,token};};
 const gateway=createMultiplayerGateway(store,{serverUrl:'wss://match.example/api/multiplayer/socket',secret,clock});
 const request=(route,{cookie='',method='POST',body={},requestOrigin=origin,authorization}={})=>new Request(origin+route,{method,headers:{'content-type':'application/json',origin:requestOrigin,cookie,...(authorization?{authorization}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})});
 const ticket=async auth=>{const response=await gateway(request('/api/multiplayer/ticket',{cookie:auth.cookie}));assert.equal(response.status,200);return (await response.json()).ticket;};
 return {data,store,clock,add,gateway,request,ticket};
}
test('match tickets validate signature, audience/origin, expiry and bounded configuration',()=>{
 const f=fixture(),auth=f.add('ticket_user'),ticket=issueMatchTicket(auth,secret,origin,f.clock);
 assert.equal(verifyMatchTicket(ticket,secret,origin,{clock:f.clock}).sub,auth.user.id);
 assert.equal(verifyMatchTicket(ticket,randomBytes(32).toString('hex'),origin,{clock:f.clock}),null);
 assert.equal(verifyMatchTicket(ticket,secret,'https://other.example',{clock:f.clock}),null);
 assert.equal(verifyMatchTicket(ticket,secret,origin,{clock:()=>f.clock()+91000}),null);
 assert.equal(verifyMatchTicket(ticket+'x',secret,origin,{clock:f.clock}),null);
 assert.equal(verifyMatchTicket('x'.repeat(1100),secret,origin),null);
 for(const url of ['ws://host/api/multiplayer/socket','wss://a:b@host/api/multiplayer/socket','wss://host/api/multiplayer/socket?token=x','wss://host/other'])assert.throws(()=>matchSocketUrl(url));
 assert.equal(ticket.includes(auth.token),false);
});
test('online gateway fails closed, requires same-origin session and bounds ticket issuance',async()=>{
 const f=fixture(),auth=f.add('gateway_user');
 const unavailable=createMultiplayerGateway(f.store,{});assert.equal((await unavailable(f.request('/api/multiplayer',{method:'GET'}))).status,503);
 assert.equal((await f.gateway(f.request('/api/multiplayer/ticket'))).status,401);
 assert.equal((await f.gateway(f.request('/api/multiplayer/ticket',{cookie:auth.cookie,requestOrigin:'https://evil.example'}))).status,403);
 assert.equal((await f.gateway(f.request('/api/multiplayer/ticket',{cookie:auth.cookie,body:[]}))).status,400);
 for(let i=0;i<8;i++)await f.ticket(auth);
 assert.equal((await f.gateway(f.request('/api/multiplayer/ticket',{cookie:auth.cookie}))).status,429);
 const meta=await (await f.gateway(f.request('/api/multiplayer',{method:'GET'}))).json();assert.equal(meta.localOnly,false);assert.equal(meta.transport,'ticket-websocket');assert.equal(meta.maxPlayers,8);
});
test('service validation requires private authorization and rejects revoked sessions',async()=>{
 const f=fixture(),auth=f.add('session_user'),ticket=await f.ticket(auth);
 assert.equal((await f.gateway(f.request('/api/multiplayer/session',{body:{ticket}}))).status,401);
 const request=()=>f.request('/api/multiplayer/session',{body:{ticket},authorization:`Bearer ${secret}`});
 assert.equal((await (await f.gateway(request())).json()).valid,true);
 f.data.delete(auth.sessionKey);assert.equal((await f.gateway(request())).status,401);
});
test('remote authentication reserves single-use tickets before async validation and fails closed',async()=>{
 const f=fixture(),auth=f.add('replay_user'),ticket=await f.ticket(auth);
 const remote=createRemoteMatchAuth({origin,secret,clock:f.clock,fetchImpl:(url,options)=>f.gateway(new Request(url,options))});
 const request={headers:{'sec-websocket-protocol':`neon-v1, ticket.${ticket}`}};
 const results=await Promise.all([remote.authenticate(request),remote.authenticate(request)]);assert.equal(results.filter(Boolean).length,1);
 assert.equal(await remote.authenticate(request),null);
 const accepted=results.find(Boolean);assert.equal(await remote.revalidate({authContext:accepted,identity:accepted.user}),true);
 f.data.delete(auth.sessionKey);assert.equal(await remote.revalidate({authContext:accepted,identity:accepted.user}),false);
 const offline=createRemoteMatchAuth({origin,secret,clock:f.clock,fetchImpl:async()=>{throw Error('offline');}});
 assert.equal(await offline.authenticate({headers:{'sec-websocket-protocol':`neon-v1, ticket.${await f.ticket(f.add('offline_user'))}`}}),null);
});
test('two ticket-authenticated players share a real server-owned internet-mode room without cookies',async()=>{
 const f=fixture(),alice=f.add('online_alice'),bob=f.add('online_bob');
 const remote=createRemoteMatchAuth({origin,secret,clock:f.clock,fetchImpl:(url,options)=>f.gateway(new Request(url,options))});
 const server=createServer((q,s)=>{s.writeHead(404);s.end();});const metadata=attachMultiplayer(server,null,{publicOrigin:origin,...remote});
 assert.equal(metadata.localOnly,false);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const clients=[];
 async function connect(auth){const ticket=await f.ticket(auth),ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/api/multiplayer/socket`,['neon-v1',`ticket.${ticket}`],{headers:{Origin:origin}}),messages=[];clients.push(ws);ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return {ws,messages};}
 async function wait(client,predicate){for(let i=0;i<80;i++){const found=client.messages.find(predicate);if(found)return found;await new Promise(r=>setTimeout(r,25));}throw Error('Match response timed out');}
 try{
  const a=await connect(alice);a.ws.send(JSON.stringify({type:'create',arena:'city-gate',timeOfDay:'night'}));const room=await wait(a,m=>m.type==='joined');
  const b=await connect(bob);b.ws.send(JSON.stringify({type:'join',code:room.code}));await wait(b,m=>m.type==='joined');
  const snapshot=await wait(b,m=>m.type==='state'&&m.players.length===2);assert.equal(snapshot.timeOfDay,'night');assert.equal(snapshot.players.find(p=>p.id===room.id).hp,100);
  a.ws.send(JSON.stringify({type:'input',seq:1,forward:1,strafe:0,angle:0,pitch:0,fire:false,reload:false,jump:false,hp:999}));
  const moved=await wait(b,m=>m.type==='state'&&m.players.some(p=>p.id===room.id&&p.ack===1));assert.equal(moved.players.find(p=>p.id===room.id).hp,100);
 }finally{for(const ws of clients)ws.terminate();await new Promise(r=>server.close(r));}
});
