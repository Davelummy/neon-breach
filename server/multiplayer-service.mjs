import {WebSocketServer,WebSocket} from 'ws';
import {Match,RULES} from './multiplayer-match.mjs';
import {ARENAS} from '../public/data.js';
export function multiplayerOrigin(request,publicOrigin){
  if(publicOrigin){const url=new URL(publicOrigin);if(url.protocol!=='https:'||url.origin!==publicOrigin||url.username||url.password)throw Error('Public multiplayer origin must be an exact HTTPS origin.');return url.origin;}
  return `http://${request.headers.host}`;
}
export function attachMultiplayer(server,accounts,{publicOrigin}={}){
  if(publicOrigin)multiplayerOrigin({headers:{}},publicOrigin);
  const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false}),rooms=new Map(),identities=new Set();let pending=0,ticks=0;
  const send=(ws,data)=>{if(ws.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>64000){ws.close(1013,'Slow connection');return;}ws.send(JSON.stringify(data));};
  const deny=(socket,status)=>{if(!socket.destroyed)socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);};
  server.on('upgrade',async(request,socket,head)=>{
    socket.on('error',()=>{});
    if(request.url!=='/api/multiplayer/socket')return deny(socket,'404 Not Found');
    // The public origin is operator-configured, never inferred from spoofable
    // forwarded headers. A TLS reverse proxy must forward authenticated cookies.
    const origin=multiplayerOrigin(request,publicOrigin);
    if(request.headers.origin!==origin||pending>=16||wss.clients.size>=64)return deny(socket,'403 Forbidden');
    pending++;socket.setTimeout(10000,()=>socket.destroy());let reserved=false,uid;
    try{
      const auth=await accounts.identify(new Request(new URL(request.url,origin),{headers:request.headers}));
      if(!auth)return deny(socket,'401 Unauthorized');if(identities.has(auth.user.id))return deny(socket,'409 Conflict');
      if(socket.destroyed)return;uid=auth.user.id;identities.add(uid);reserved=true;socket.setTimeout(0);socket.once('close',()=>{if(reserved){identities.delete(uid);reserved=false;}});
      wss.handleUpgrade(request,socket,head,ws=>{ws.identity=auth.user;ws.authRequest=new Request(new URL(request.url,origin),{headers:request.headers});wss.emit('connection',ws);reserved=false;});
    }catch{if(reserved){identities.delete(uid);reserved=false;}deny(socket,'503 Service Unavailable');}finally{pending--;}
  });
  wss.on('connection',ws=>{
    ws.alive=true;ws.window=Date.now();ws.messages=0;ws.authAt=Date.now();ws.on('error',()=>{});
    const joinTimeout=setTimeout(()=>ws.close(1008,'Join a room first'),10000);joinTimeout.unref();
    ws.on('pong',()=>ws.alive=true);
    send(ws,{type:'connected',name:ws.identity.username});
    ws.on('message',(raw,binary)=>{
      if(binary)return ws.close(1008,'JSON required');const now=Date.now();if(now-ws.window>=1000){ws.window=now;ws.messages=0;}if(++ws.messages>60)return ws.close(1008,'Input rate exceeded');
      let value;try{value=JSON.parse(raw.toString());}catch{return ws.close(1008,'Invalid JSON');}
      if(!value||typeof value!=='object'||Array.isArray(value))return ws.close(1008,'Invalid message');
      if(ws.room){if(value.type==='input'){ws.room.input(ws.player,value);}else if(value.type==='leave'){ws.close(1000,'Left room');}return;}
      try{
        let room;
        if(value.type==='create'){
          if(rooms.size>=RULES.rooms)throw Error('Local room limit reached.');if(!ARENAS.some(a=>a.id===value.arena))throw Error('Choose a supported arena.');
          room=new Match(value.arena,undefined,value.timeOfDay??'day');rooms.set(room.code,room);
        }else if(value.type==='join'){
          if(typeof value.code!=='string'||! /^[A-F0-9]{10}$/.test(value.code))throw Error('Enter a valid room code.');room=rooms.get(value.code);if(!room)throw Error('Room not found or closed.');
        }else throw Error('Create or join a room first.');
        ws.player=room.join(ws.identity.id,ws.identity.username);ws.room=room;ws.round=room.round;clearTimeout(joinTimeout);send(ws,{type:'joined',code:room.code,id:ws.player.id,world:room.world});
      }catch(error){send(ws,{type:'error',message:error.message});}
    });
    ws.on('close',()=>{clearTimeout(joinTimeout);identities.delete(ws.identity.id);if(ws.room){ws.room.leave(ws.identity.id);if(!ws.room.players.size)rooms.delete(ws.room.code);}});
  });
  const tick=setInterval(()=>{
    ticks++;for(const room of rooms.values()){const round=room.round;room.tick();if(ticks%2===0){for(const ws of wss.clients)if(ws.room===room){if(round!==room.round||ws.round!==room.round){send(ws,{type:'world',world:room.world});ws.round=room.round;}send(ws,room.snapshot());}room.events=[];}}
  },50);tick.unref();
  const heartbeat=setInterval(async()=>{
    for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();
      if(Date.now()-ws.authAt>60000){ws.authAt=Date.now();try{if(!await accounts.identify(ws.authRequest))ws.close(1008,'Sign in again');}catch{ws.close(1013,'Account service unavailable');}}
    }
  },15000);heartbeat.unref();
  server.on('close',()=>{clearInterval(tick);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();wss.close();});
  return {available:true,mode:'private-ffa',maxPlayers:RULES.players,localOnly:!publicOrigin,transport:'same-origin-websocket'};
}
