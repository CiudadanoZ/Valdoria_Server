// Estado extra del personaje que llega en state_sync (monturas, ganancias de
// subasta, piedras descubiertas). Los paneles lo leen desde aquí.
export const pstate = {
  mounts: [],       // ids de monturas en propiedad
  mount: null,      // montura seleccionada
  auctionGold: 0,   // ganancias pendientes de la casa de subastas
  waystones: [],    // piedras rúnicas descubiertas
  riding: null,     // montura activa en esta sesión
};

export function applyPstate(msg) {
  if (Array.isArray(msg.mounts)) pstate.mounts = msg.mounts;
  if (msg.mount !== undefined) pstate.mount = msg.mount;
  if (typeof msg.auctionGold === 'number') pstate.auctionGold = msg.auctionGold;
  if (Array.isArray(msg.waystones)) pstate.waystones = msg.waystones;
}
