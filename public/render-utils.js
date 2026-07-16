export const LOW_WORLD_CULL_RADIUS = 20;

export function cacheWorldCullRecord(object, worldPosition) {
  object.getWorldPosition(worldPosition);
  return {
    object,
    x: worldPosition.x,
    z: worldPosition.z,
    alwaysVisible: object.userData?.lowCullAlwaysVisible === true,
    glassKey: object.userData?.glass ? object.userData.cellKey : null
  };
}

export function shouldRenderCullRecord(record, cameraX, cameraZ, brokenGlass, radius = LOW_WORLD_CULL_RADIUS) {
  if (record.glassKey && brokenGlass?.has(record.glassKey)) return false;
  if (record.alwaysVisible) return true;
  const dx = record.x - cameraX;
  const dz = record.z - cameraZ;
  return dx * dx + dz * dz < radius * radius;
}
