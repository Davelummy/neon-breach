export const LOW_WORLD_CULL_RADIUS = 20;
export const LOW_PIXEL_BUDGET = 1280 * 720 * .6 * .6;

export function renderPixelRatio(width, height, dpr, quality) {
  const scale = [.6, .92, 1.15, 1.4][quality] ?? .6;
  const cap = quality === 0 ? Math.sqrt(LOW_PIXEL_BUDGET / Math.max(1, width * height)) : scale;
  return Math.min(Math.max(.1, dpr || 1), scale, cap);
}

// Chunk by material and geometry: identical collision cells, fewer submissions.
// Glass stays separate so destruction never hides unrelated windows.
export function planWallBatches(map, heights, chunkSize = 12) {
  const groups = new Map(), glass = [];
  for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) {
    const type = map[y][x];if (!type) continue;
    const boundary = x === 0 || y === 0 || x === map[y].length-1 || y === map.length-1;
    const cell = {x,y,type,boundary,height:boundary?2.55:(heights[type]||1.4)};
    if (type === 4) { glass.push(cell);continue; }
    const key = `${Math.floor(x/chunkSize)},${Math.floor(y/chunkSize)}:${type}:${boundary?'boundary':'interior'}`;
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(cell);
  }
  return {groups,glass};
}

// Only for models whose geometry is private to the model. Never call for
// instanced walls, shared projectiles, particles or supply boxes.
export function releasePrivateModel(root, protectedMaterials) {
  const geometries=new Set(),materials=new Set();
  root.traverse(object=>{
    if(!object.isMesh)return;
    if(object.geometry)geometries.add(object.geometry);
    for(const material of [object.material,object.userData.originalMaterial].flat())if(material&&!protectedMaterials.has(material))materials.add(material);
    object.userData.stopTexturePolling?.();
  });
  for(const geometry of geometries)geometry.dispose();
  for(const material of materials){material.userData.stopTexturePolling?.();material.dispose();}
  // Maps/textures are globally cached and intentionally not disposed here.
}

export function cacheWorldCullRecord(object, worldPosition) {
  object.getWorldPosition(worldPosition);
  return {
    object,
    x: worldPosition.x,
    z: worldPosition.z,
    extent: object.userData?.lowCullExtent || 0,
    alwaysVisible: object.userData?.lowCullAlwaysVisible === true,
    glassKey: object.userData?.glass ? object.userData.cellKey : null
  };
}

export function shouldRenderCullRecord(record, cameraX, cameraZ, brokenGlass, radius = LOW_WORLD_CULL_RADIUS) {
  if(record.object.userData?.layoutHidden)return false;
  if (record.glassKey && brokenGlass?.has(record.glassKey)) return false;
  if (record.alwaysVisible) return true;
  const dx = record.x - cameraX;
  const dz = record.z - cameraZ;
  const reach = radius + (record.extent || 0);
  return dx * dx + dz * dz < reach * reach;
}
