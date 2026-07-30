// NPCs de la Ciudadela. El Maestre Aldric entrega las misiones de Bienvenida;
// el resto son ciudadanos con los que hay que hablar en la misión 3.
import { makeCharacter, makeNameSprite, makeQuestMarker } from './entities.js';
import { aldricMarker, toranMarker, baldurMarker, nyraMarker, ysraMarker, skadiMarker } from './quests.js';

export const NPC_DATA = [
  {
    id: 'aldric',
    name: 'Maestre Aldric',
    title: 'Consejero de Valdoria',
    pos: [3.5, -7],
    rot: Math.PI * 0.85,
    bodyColor: 0x4a3a7a,
    dialog: '', // sus diálogos los gestiona quests.js
  },
  {
    id: 'bramm',
    name: 'Bramm el Herrero',
    title: 'Maestro de la Forja',
    pos: [16.5, -14.5],
    rot: -Math.PI * 0.3,
    bodyColor: 0x5c3a26,
    dialog: '¡Cuidado con las chispas, forastero! Soy Bramm. Si el Maestre te envió, bienvenido seas. Cuando consigas mejor acero, tráemelo: te forjaré algo digno de un campeón.',
  },
  {
    id: 'lyra',
    name: 'Lyra la Mercader',
    title: 'Comerciante',
    pos: [-16, 9.5],
    rot: Math.PI * 0.9,
    bodyColor: 0x8a6a2a,
    dialog: 'Sedas de oriente, especias del sur... y algún que otro secreto. Soy Lyra. Vuelve cuando tu bolsa pese más, aventurero: tengo mercancías que te harán brillar los ojos.',
  },
  {
    id: 'toran',
    name: 'Guardia Toran',
    title: 'Guardia de la Puerta Sur',
    pos: [4, 36],
    rot: Math.PI,
    bodyColor: 0x3a4a5c,
    dialog: 'Alto ahí... ah, eres el nuevo. El Maestre avisó de tu llegada. Más allá de esta puerta acechan lobos y cosas peores; no salgas sin acero al cinto. Dentro de la muralla estás a salvo.',
  },
  {
    id: 'mira',
    name: 'Sacerdotisa Mira',
    title: 'Guardiana de la Capilla',
    pos: [-3, -22],
    rot: Math.PI * 0.1,
    bodyColor: 0xd8d0e8,
    dialog: 'La Luz te acompañe, viajero. Si tus heridas sangran, ven a la capilla: aquí siempre hallarás descanso. Reza conmigo cuando la oscuridad pese demasiado.',
  },
  {
    id: 'baldur',
    name: 'Ermitaño Baldur',
    title: 'Vigía de la Cripta del Bosque',
    pos: [-64, 54],
    rot: Math.PI * 0.6,
    bodyColor: 0x4a5a3a,
    dialog: '', // sus diálogos los gestiona quests.js
  },
  {
    id: 'nyra',
    name: 'Cazadora Nyra',
    title: 'Vigía de la Cripta de la Colina',
    pos: [67, 23],
    rot: -Math.PI * 0.5,
    bodyColor: 0x7a5a3a,
    dialog: '', // sus diálogos los gestiona quests.js
  },
  {
    id: 'ysra',
    name: 'Vidente Ysra',
    title: 'Bruja de la Ciénaga',
    pos: [-75, -41],
    rot: Math.PI * 1.3,
    bodyColor: 0x4a5a6a,
    dialog: '', // sus diálogos los gestiona quests.js
  },
  {
    id: 'skadi',
    name: 'Cazadora Skadi',
    title: 'Cazadora de las Cumbres',
    pos: [64, 96],
    rot: Math.PI * 0.1,
    bodyColor: 0x8a9aa8,
    dialog: '', // sus diálogos los gestiona quests.js
  },
  {
    id: 'establo',
    name: 'Establero Cort',
    title: 'Maestro de Cuadras',
    pos: [24, 8],
    rot: Math.PI * 1.1,
    bodyColor: 0x6a5238,
    dialog: '', // abre el establo (monturas) desde main.js
  },
  {
    id: 'subastas',
    name: 'Subastador Vell',
    title: 'Casa de Subastas',
    pos: [-24, 10],
    rot: Math.PI * 0.9,
    bodyColor: 0x4a4a6a,
    dialog: '', // abre la casa de subastas desde main.js
  },
];

// Crea las mallas y devuelve la lista de NPCs con referencia a su mesh.
export function spawnNPCs(scene) {
  const npcs = [];
  for (const data of NPC_DATA) {
    const mesh = makeCharacter({ bodyColor: data.bodyColor });
    mesh.position.set(data.pos[0], 0, data.pos[1]);
    mesh.rotation.y = data.rot;
    mesh.add(makeNameSprite(data.name));
    mesh.traverse((o) => { o.userData.npcId = data.id; });
    scene.add(mesh);
    npcs.push({ ...data, mesh, marker: null });
  }
  return npcs;
}

// Actualiza los marcadores (!/?) sobre los NPC de misiones y los hace flotar.
const MARKER_SOURCES = { aldric: aldricMarker, toran: toranMarker, baldur: baldurMarker, nyra: nyraMarker, ysra: ysraMarker, skadi: skadiMarker };

export function updateQuestMarkers(npcs, time) {
  for (const [npcId, markerFn] of Object.entries(MARKER_SOURCES)) {
    const npc = npcs.find((n) => n.id === npcId);
    if (!npc) continue;
    const symbol = markerFn();

    if (symbol !== npc.markerSymbol) {
      if (npc.marker) {
        npc.mesh.remove(npc.marker);
        npc.marker = null;
      }
      if (symbol) {
        npc.marker = makeQuestMarker(symbol);
        npc.mesh.add(npc.marker);
      }
      npc.markerSymbol = symbol;
    }
    if (npc.marker) {
      npc.marker.position.y = 4.0 + Math.sin(time * 3) * 0.18;
    }
  }
}
