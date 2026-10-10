import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {WebSocket} from 'ws';import {setTimeout as delay} from 'node:timers/promises';import {attachMultiplayer,multiplayerOrigin} from '../server/multiplayer-service.mjs';
test('public socket origin is explicit HTTPS and ignores forwarded header claims',()=>{
  const request={headers:{host:'localhost:4176','x-forwarded-proto':'https','x-forwarded-host':'attacker.invalid'}};
  assert.equal(multiplayerOrigin(request),'http://localhost:4176');
  assert.equal(multiplayerOrigin(request,'https://game.example'),'https://game.example');
  for(const origin of ['http://game.example','https://game.example/','https://game.example/path','https://user:password@game.example','https://game.example?x=1'])assert.throws(()=>multiplayerOrigin(request,origin));
});
test('TLS-proxy mode accepts only its configured public origin and authenticates against HTTPS',async()=>{
  const server=createServer(),clients=[];let authenticatedUrl;
  const capability=attachMultiplayer(server,{identify:async request=>{authenticatedUrl=request.url;return {user:{id:'proxy-player',username:'proxy_player'}};}},{publicOrigin:'https://game.example'});
  assert.equal(capability.localOnly,false);await new Promise(r=>server.listen(0,'127.0.0.1',r));const address=`ws://127.0.0.1:${server.address().port}/api/multiplayer/socket`;
  try{
    const denied=new WebSocket(address,{headers:{Origin:'https://attacker.invalid','x-forwarded-host':'game.example','x-forwarded-proto':'https'}});clients.push(denied);denied.on('error',()=>{});
    await new Promise((resolve,reject)=>{denied.on('unexpected-response',(req,res)=>{assert.equal(res.statusCode,403);res.resume();req.destroy();resolve();});denied.on('open',()=>reject(Error('Forged origin accepted')));});
    const accepted=new WebSocket(address,{headers:{Origin:'https://game.example'}});clients.push(accepted);await new Promise((resolve,reject)=>{accepted.once('open',resolve);accepted.once('error',reject);});assert.equal(authenticatedUrl,'https://game.example/api/multiplayer/socket');
  }finally{for(const ws of clients)ws.terminate();await new Promise(r=>server.close(r));}
});
test('real authenticated sockets share one bounded room and reject cross-origin/anonymous connections',async()=>{
  const server=createServer(),clients=[];attachMultiplayer(server,{identify:async request=>{const id=request.headers.get('cookie');return ['a','b'].includes(id)?{user:{id,username:`player_${id}`}}:null;}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  async function rejected(cookie,source,status){const ws=new WebSocket(origin.replace('http:','ws:')+'/api/multiplayer/socket',{headers:{cookie,Origin:source}});clients.push(ws);await new Promise((resolve,reject)=>{ws.on('unexpected-response',(req,res)=>{assert.equal(res.statusCode,status);res.resume();req.destroy();resolve();});ws.on('error',()=>{});ws.on('open',()=>reject(Error('Unauthorized connection opened')));});}
  async function connect(id){const ws=new WebSocket(origin.replace('http:','ws:')+'/api/multiplayer/socket',{headers:{cookie:id,Origin:origin}});clients.push(ws);const messages=[];ws.on('message',v=>messages.push(JSON.parse(v)));ws.on('error',()=>{});await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return {ws,messages};}
  async function wait(client,predicate){for(let i=0;i<60;i++){const result=client.messages.find(predicate);if(result)return result;await delay(50);}throw Error('Socket state timed out');}
  try{
    await rejected('none',origin,401);await rejected('a','http://untrusted.invalid',403);
    const a=await connect('a');a.ws.send(JSON.stringify({type:'create',arena:'city-gate'}));const joined=await wait(a,v=>v.type==='joined');assert.match(joined.code,/^[A-F0-9]{10}$/);
    await rejected('a',origin,409);
    const b=await connect('b');b.ws.send(JSON.stringify({type:'join',code:joined.code}));await wait(b,v=>v.type==='joined');
    const before=await wait(a,v=>v.type==='state'&&v.players.length===2),player=before.players.find(p=>p.id===joined.id);
    a.ws.send(JSON.stringify({type:'input',seq:1,forward:1,strafe:0,angle:0,pitch:0,fire:false,reload:false,jump:false,hp:9999}));
    const moved=await wait(b,v=>v.type==='state'&&v.players.some(p=>p.id===joined.id&&p.ack===1));const remote=moved.players.find(p=>p.id===joined.id);assert.ok(remote.x>player.x);assert.equal(remote.hp,100);
    for(let i=0;i<70;i++)a.ws.send(JSON.stringify({type:'input',seq:i+2,forward:0,strafe:0,angle:0,pitch:0,fire:false,reload:false,jump:false}));
    const code=await new Promise(r=>a.ws.once('close',r));assert.equal(code,1008);
  }finally{for(const ws of clients)if(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING)ws.terminate();await new Promise(r=>server.close(r));}
});
