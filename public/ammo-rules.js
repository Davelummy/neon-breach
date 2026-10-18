// Shared finite-ammunition rules. Reloading transfers rounds; it never creates them.
export const shouldAutoReload=(ammo,reserve,reloading)=>ammo===0&&reserve>0&&!reloading;
export function reloadRounds(ammo,reserve,capacity){
  const take=Math.max(0,Math.min(capacity-ammo,reserve));
  return {ammo:ammo+take,reserve:reserve-take};
}
