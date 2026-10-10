import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountService,normalizeUsername} from '../server/account-service.mjs';
const password='QA-test8'; // Exactly eight characters; disposable test data only.
function store(){const rows=new Map();return {rows,async get(key){return structuredClone(rows.get(key)||null);},async setJSON(key,value,{onlyIfNew=false}={}){if(onlyIfNew&&rows.has(key))return {modified:false};rows.set(key,structuredClone(value));return {modified:true};},async delete(key){rows.delete(key);},async *list({prefix}){yield {blobs:[...rows.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}};}
function req(path,body,cookie,origin='https://game.test'){return new Request(`https://game.test/api/auth/${path}`,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})}});}
test('usernames are case-insensitive and tightly constrained',()=>{assert.equal(normalizeUsername(' Capital_7 '),'capital_7');for(const value of ['aa','<script>','with spaces','a'.repeat(17),null])assert.equal(normalizeUsername(value),null);});
test('public counts coalesce concurrent scans and refuse unbounded pilot-store work',async()=>{
  const db=store();for(let n=0;n<100000;n++)db.rows.set(`account:user${n}`,{id:String(n)});
  let scans=0,reads=0;const originalGet=db.get,originalList=db.list;
  db.get=async(...args)=>{reads++;return originalGet(...args);};db.list=async function*(...args){scans++;yield* originalList(...args);};
  const {handle}=createAccountService(db);const results=await Promise.all(Array.from({length:20},()=>handle(req('stats'))));
  assert.ok((await results[0].json()).available===false);assert.equal(scans,1);assert.ok(reads<=500);
  await handle(req('stats'));assert.equal(scans,1);
});
test('signup persists salted hashes, safe sessions and unique names; login, expiry and logout work',async()=>{
  const db=store();let now=1000000000000;const {handle,scoreIdentity}=createAccountService(db,{clock:()=>now});
  const response=await handle(req('signup',{username:'Capital_7',password}),'one');assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/__Host-neon_session=/);
  const user=(await response.json()).user;assert.equal(user.username,'capital_7');assert.equal(user.email_verified,false);assert.ok(!('email' in user));assert.ok(!('password_hash' in user));
  assert.equal((await scoreIdentity(req('session'),'CAPITAL_7')).allowed,false);
  assert.equal((await scoreIdentity(req('session',null,cookie),'another_name')).callsign,'CAPITAL_7');
  const account=db.rows.get('account:capital_7');assert.notEqual(account.password_hash,password);assert.equal(account.password_hash.length,128);assert.ok(account.salt);
  assert.ok([...db.rows.keys()].filter(k=>k.startsWith('session:')).every(k=>!cookie.includes(k.slice(8))));
  assert.equal((await handle(req('signup',{username:'CAPITAL_7',password}),'two')).status,409);
  assert.equal((await handle(req('login',{username:'capital_7',password:'Not the correct passphrase'}),'three')).status,401);
  assert.equal((await (await handle(req('session',null,cookie))).json()).user.username,'capital_7');
  await handle(req('heartbeat',{},cookie));const counts=await (await handle(req('stats'))).json();assert.equal(counts.total_players,1);assert.equal(counts.online_players,1);
  now+=90001;assert.equal((await (await handle(req('stats'))).json()).online_players,0);
  now+=31*86400000;assert.equal((await (await handle(req('session',null,cookie))).json()).user,null);
  const login=await handle(req('login',{username:'capital_7',password}),'four');assert.equal(login.status,200);
  const newCookie=login.headers.get('set-cookie');assert.notEqual(newCookie,cookie);
  await handle(req('logout',{},newCookie));assert.equal((await (await handle(req('session',null,newCookie))).json()).user,null);
});
test('email lock requires authenticated, delivered, unexpired proof, is permanent and never exposes the address',async()=>{
  const db=store();let code;const {handle}=createAccountService(db,{sendVerification:async(_,token)=>{code=token;}});
  const signup=await handle(req('signup',{username:'lake_pilot',password}),'one'),cookie=signup.headers.get('set-cookie');
  assert.equal((await handle(req('email',{email:'pilot@example.test'}))).status,401);
  assert.equal((await handle(req('email',{email:'pilot@example.test'},cookie))).status,200);
  assert.equal((await handle(req('verify-email',{token:'0'.repeat(64)},cookie))).status,400);
  const verified=await handle(req('verify-email',{token:code},cookie));assert.equal(verified.status,200);assert.equal((await verified.json()).user.username_locked,true);
  assert.equal((await (await handle(req('session',null,cookie))).json()).user.email_verified,true);
  assert.equal((await handle(req('verify-email',{token:code},cookie))).status,400);
  assert.equal((await handle(req('email',{email:'other@example.test'},cookie))).status,409);
  const publicStats=await (await handle(req('stats'))).text();assert.ok(!publicStats.includes('@'));
});
test('same-origin rules, bounded input, rate limits and missing email provider fail closed',async()=>{
  const db=store(),{handle}=createAccountService(db);
  assert.equal((await handle(req('signup',{username:'abc',password},null,'https://evil.test'))).status,403);assert.equal(db.rows.size,0);
  assert.equal((await handle(req('signup',{username:'abc',password:'short'}))).status,400);
  const signed=await handle(req('signup',{username:'abc',password}),'signup');const cookie=signed.headers.get('set-cookie');
  assert.equal((await handle(req('email',{email:'a@example.test'},cookie))).status,503);assert.equal(db.rows.get('account:abc').email_verified,false);
  for(let n=0;n<8;n++)await handle(req('signup',{username:'x',password:'short'}),'blocked');
  assert.equal((await handle(req('login',{username:'abc',password}),'blocked')).status,429);
});
