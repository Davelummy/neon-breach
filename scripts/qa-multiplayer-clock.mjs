// Preloaded only by the short browser QA child. No HTTP/WebSocket option,
// production import or environment switch in either production server exists.
import {Match} from '../server/multiplayer-match.mjs';
if(process.env.NODE_ENV!=='test'||process.env.HOST!=='127.0.0.1'||typeof process.send!=='function')throw Error('QA clock requires an isolated loopback test child with IPC');
const matches=new Set(),tick=Match.prototype.tick;
Match.prototype.tick=function(elapsed){matches.add(this);return tick.call(this,elapsed);};
process.on('message',message=>{
  if(message?.type!=='qa:short-round')return;
  const active=[...matches].filter(m=>m.players.size>=2&&m.phase==='playing'&&m.round===1);
  if(active.length!==1)return process.send({type:'qa:short-round',error:'Expected one active two-player QA match'});
  const match=active[0];match.remaining=Math.min(match.remaining,8);
  process.send({type:'qa:short-round',seconds:match.remaining});
});
