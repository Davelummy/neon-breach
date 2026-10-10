// A user gesture is required by browsers. Unsupported/denied APIs never block play.
export async function requestLandscape(document,orientation){
  let fullscreen=!!document.fullscreenElement;
  if(!fullscreen&&document.fullscreenEnabled&&document.documentElement.requestFullscreen){
    try{await document.documentElement.requestFullscreen();fullscreen=!!document.fullscreenElement;}catch{}
  }
  if(fullscreen&&orientation?.lock){
    try{await orientation.lock('landscape');return {fullscreen,locked:true,message:'Landscape fullscreen enabled. Use Screen again to exit and rotate freely.'};}catch{}
  }
  return {fullscreen,locked:false,message:'Rotate your phone sideways for landscape. If it stays upright, turn off your device’s rotation lock. Portrait play remains available.'};
}

export function interfacePreferences(value={}){
  return {hud:value.hud==='full'?'full':'tactical',touchOpacity:Number.isFinite(Number(value.touchOpacity))?Math.max(60,Math.min(100,Number(value.touchOpacity))):85};
}

// Preferences never block play when browser storage is unavailable.
export function initializeInterface(document,storage){
  let preferences=interfacePreferences();
  try{preferences=interfacePreferences(JSON.parse(storage?.getItem('neon-breach-interface')||'{}')||{});}catch{}
  const hud=document.getElementById('settingHud'),opacity=document.getElementById('settingTouchOpacity'),label=document.getElementById('touchOpacityValue');
  function apply(save=false){
    document.body.dataset.hud=preferences.hud;
    document.documentElement.style.setProperty('--touch-opacity',String(preferences.touchOpacity/100));
    if(hud)hud.value=preferences.hud;
    if(opacity)opacity.value=String(preferences.touchOpacity);
    if(label)label.textContent=`${preferences.touchOpacity}%`;
    if(save)try{storage?.setItem('neon-breach-interface',JSON.stringify(preferences));}catch{}
  }
  hud?.addEventListener('change',()=>{preferences=interfacePreferences({...preferences,hud:hud.value});apply(true);});
  opacity?.addEventListener('input',()=>{preferences=interfacePreferences({...preferences,touchOpacity:opacity.value});apply(true);});
  apply();
}
