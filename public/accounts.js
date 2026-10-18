let current=null;
export const accountUser=()=>current;
// Guests play the campaign on this device; online features need a real account.
export const isGuest=()=>!!current?.guest;
const GUEST_KEY='neon-breach-guest';
function storedGuest(){try{const value=JSON.parse(localStorage.getItem(GUEST_KEY)||'null');return value&&/^guest-[a-z0-9]{8,32}$/.test(value.id)?value:null;}catch{return null;}}
function guestUser(){
  const existing=storedGuest();if(existing)return {id:existing.id,username:'Guest',guest:true};
  const id=`guest-${crypto.getRandomValues(new Uint32Array(2)).reduce((text,n)=>text+n.toString(36).padStart(7,'0'),'')}`;
  try{localStorage.setItem(GUEST_KEY,JSON.stringify({id,active:true}));}catch{}
  return {id,username:'Guest',guest:true};
}
function setGuestActive(active){const guest=storedGuest();if(!guest)return;try{localStorage.setItem(GUEST_KEY,JSON.stringify({...guest,active}));}catch{}}
async function request(path,body){
  const response=await fetch(`/api/auth/${path}`,{credentials:'same-origin',signal:AbortSignal.timeout(path==='signup'||path==='login'?60000:10000),...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Account service unavailable.');
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Account service unavailable.');return data;
}
let gateReason=()=>{};
export function showAccountGate(reason=''){gateReason(reason);document.getElementById('accountGate').classList.remove('hidden');}
export async function initializeAccounts(onChange){
  if(location.protocol!=='https:')document.getElementById('accountTransport').textContent='Local testing: HTTP is not encrypted. Use a throwaway password, not one you use elsewhere.';
  const gate=document.getElementById('accountGate'),status=document.getElementById('accountStatus'),form=document.getElementById('accountForm'),title=document.getElementById('accountTitle');
  const guestButton=document.getElementById('accountGuest'),reasonText=document.getElementById('accountReason');
  let mode='signup',busy=false,logoutBusy=false;
  const logoutButtons=[document.getElementById('accountLogout'),document.getElementById('mainLogout')];
  gateReason=reason=>{reasonText.textContent=reason;reasonText.hidden=!reason;guestButton.textContent=isGuest()?'Keep playing as guest':'Play as guest';};
  function update(user){
    const guest=!!user?.guest;current=user;
    document.getElementById('welcomeCallsign').value=user?.username||'';
    document.getElementById('accountName').textContent=guest?'Playing as guest':user?`${user.username} · ${user.email_verified?'VERIFIED OWNER':'USERNAME RESERVED'}`:'Not signed in';
    document.getElementById('mainAccount').hidden=!user;
    document.getElementById('mainAccountName').textContent=guest?'Guest · progress saved on this device':user?`Signed in as ${user.username}`:'';
    for(const button of logoutButtons){button.disabled=!user||logoutBusy;button.textContent=guest?'Create account':'Log out';}
    onChange(user);dispatchEvent(new Event('neon-account-changed'));
  }
  function setMode(value){mode=value;title.textContent=mode==='signup'?'Create your operative':'Welcome back';document.getElementById('accountSubmit').textContent=mode==='signup'?'Create account':'Sign in';document.getElementById('accountSwitch').textContent=mode==='signup'?'Already registered? Sign in':'New player? Create account';document.getElementById('accountPassword').autocomplete=mode==='signup'?'new-password':'current-password';status.textContent='';}
  document.getElementById('accountSwitch').addEventListener('click',()=>setMode(mode==='signup'?'login':'signup'));
  if(new URLSearchParams(location.search).has('signin'))setMode('login');
  guestButton.addEventListener('click',()=>{if(!isGuest()){update(guestUser());setGuestActive(true);}gate.classList.add('hidden');status.textContent='';});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;busy=true;const button=document.getElementById('accountSubmit');button.disabled=true;status.textContent='Connecting…';
    try{
      const data=await request(mode,{username:form.elements.username.value,password:form.elements.password.value});form.elements.password.value='';
      const previous=isGuest()?current.id:null;if(previous){setGuestActive(false);dispatchEvent(new CustomEvent('neon-guest-upgraded',{detail:{from:previous,to:data.user.id}}));}
      update(data.user);gate.classList.add('hidden');status.textContent='';
    }catch(error){status.textContent=error.message;}finally{busy=false;button.disabled=false;}
  });
  async function logout(){
    if(isGuest()){setMode('signup');showAccountGate('Create an account to post scores to the world leaderboard and play multiplayer. Your guest progress on this device comes with you.');form.elements.username.focus();return;}
    if(logoutBusy||!current)return;logoutBusy=true;for(const button of logoutButtons)button.disabled=true;const actionStatus=document.getElementById('accountActionStatus');actionStatus.textContent='Signing out…';try{await request('logout',{});update(null);setMode('login');form.elements.password.value='';showAccountGate();status.textContent='Signed out. Sign in to play again.';actionStatus.textContent='';form.elements.username.focus();}catch(error){actionStatus.textContent=`Could not sign out: ${error.message}`;document.getElementById('emailStatus').textContent=error.message;}finally{logoutBusy=false;for(const button of logoutButtons)button.disabled=!current;}
  }
  for(const button of logoutButtons)button.addEventListener('click',logout);
  document.getElementById('emailForm').addEventListener('submit',async event=>{event.preventDefault();const status=document.getElementById('emailStatus');try{await request('email',{email:event.target.elements.email.value});status.textContent='Check your email for a verification code. Your username is not verified until you confirm it.';}catch(error){status.textContent=error.message;}});
  document.getElementById('verifyEmailForm').addEventListener('submit',async event=>{event.preventDefault();try{const data=await request('verify-email',{token:event.target.elements.token.value.trim()});update(data.user);event.target.reset();document.getElementById('emailStatus').textContent='Verified: your username is permanently locked to your account.';}catch(error){document.getElementById('emailStatus').textContent=error.message;}});
  // A returning guest resumes as a guest; a signed-out account never silently becomes one.
  const resumeGuest=()=>{if(storedGuest()?.active){update(guestUser());return true;}return false;};
  try{const data=await request('session');if(data.user)update(data.user);else if(!resumeGuest()){update(null);showAccountGate();}}catch{if(!resumeGuest()){showAccountGate();status.textContent='Account service unavailable. Play as a guest, or retry when the server is reachable.';}}
}
