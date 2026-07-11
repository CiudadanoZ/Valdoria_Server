// Misiones del juego.
// Cadena de Bienvenida (Maestre Aldric):
//   q1: hablar con Aldric -> q2: recoger 3 Hierbas Lumina -> q3: conocer a 3 ciudadanos.
// Cadena del Exterior (Guardia Toran, se abre al completar la Bienvenida):
//   t1: matar 5 Lobos Grises -> t2: reunir 4 Pieles de Lobo -> t3: abatir al Alfa Sombrío.
// Cadena de la Cripta (Maestre Aldric, se abre al completar el Exterior):
//   a1: abatir 6 Esqueletos Guardianes -> a2: reunir 4 Esencias Espectrales
//   -> a3: abatir al Señor de la Cripta y entregar la Reliquia.
import { countItem } from './inventory.js';
import { sendQuestClaim } from './network.js';
import { toast, showDialog, hideDialog } from './ui.js';

// ---- Reclamación de recompensas (las otorga el servidor, una sola vez) ----
// Se envía quest_claim y, si el servidor confirma, se ejecuta la continuación
// (avance de la cadena, toasts y diálogo siguiente).
let pendingClaim = null; // { questId, fn }

function requestClaim(questId, continuation) {
  pendingClaim = { questId, fn: continuation };
  sendQuestClaim(questId);
}

export function onClaimResult(questId, ok, reason) {
  if (!pendingClaim || pendingClaim.questId !== questId) return;
  const claim = pendingClaim;
  pendingClaim = null;
  if (ok) {
    claim.fn();
  } else {
    toast(`No se pudo cobrar la recompensa: ${reason}`);
  }
}

export const questState = {
  q1: 'active',   // inactive | active | turnin | done
  q2: 'inactive',
  q3: 'inactive',
  herbs: 0,
  met: {},        // npcId -> true (para q3)
  t1: 'inactive',
  t2: 'inactive',
  t3: 'inactive',
  wolfKills: 0,   // para t1
  alfaDead: false, // para t3
  a1: 'inactive',
  a2: 'inactive',
  a3: 'inactive',
  skeletonKills: 0, // para a1
  // Criptas menores: Ermitaño Baldur (bosque) y Cazadora Nyra (colina)
  b1: 'inactive',
  b2: 'inactive',
  c1: 'inactive',
  c2: 'inactive',
  rataKills: 0,          // para b1
  guardianDead: false,   // para b2
  centinelaDead: false,  // para c2
  // Ciénaga de los Ahogados: Vidente Ysra
  s1: 'inactive',
  s2: 'inactive',
  s3: 'inactive',
  ahogadoKills: 0,       // para s1
  reyFangoDead: false,   // para s3
};

let onChanged = null;
export function initQuests({ changed }) {
  onChanged = changed;
  renderTracker();
}

const HERBS_NEEDED = 3;
const WOLVES_NEEDED = 5;
const PELTS_NEEDED = 4;
const SKELETONS_NEEDED = 6;
const ESSENCES_NEEDED = 4;
const RATS_NEEDED = 4;
const FANGS_NEEDED = 5;
const DROWNED_NEEDED = 6;
const FLOWERS_NEEDED = 5;
const CITIZENS = ['bramm', 'lyra', 'toran'];
const CITIZEN_NAMES = { bramm: 'Bramm el Herrero', lyra: 'Lyra la Mercader', toran: 'Guardia Toran' };

// ---- Marcadores sobre los NPC: '!' misión disponible, '?' lista para entregar ----
export function aldricMarker() {
  if (questState.q1 === 'active') return '!';
  if (questState.q2 === 'turnin' || questState.q3 === 'turnin') return '?';
  if (questState.q2 === 'inactive' && questState.q1 === 'done') return '!';
  if (questState.q3 === 'inactive' && questState.q2 === 'done') return '!';
  if (questState.q2 === 'active' && countItem('hierba_lumina') >= HERBS_NEEDED) return '?';
  // Cadena de la Cripta (requiere haber limpiado el exterior)
  if (questState.t3 === 'done') {
    if (questState.a1 === 'inactive') return '!';
    if (questState.a1 === 'active' && questState.skeletonKills >= SKELETONS_NEEDED) return '?';
    if (questState.a2 === 'active' && countItem('esencia_espectral') >= ESSENCES_NEEDED) return '?';
    if (questState.a3 === 'active' && countItem('reliquia_cripta') >= 1) return '?';
  }
  return null;
}

export function baldurMarker() {
  if (questState.b1 === 'inactive') return '!';
  if (questState.b1 === 'active' && questState.rataKills >= RATS_NEEDED) return '?';
  if (questState.b1 === 'done' && questState.b2 === 'inactive') return '!';
  if (questState.b2 === 'active' && questState.guardianDead) return '?';
  return null;
}

export function nyraMarker() {
  if (questState.c1 === 'inactive') return '!';
  if (questState.c1 === 'active' && countItem('colmillo_lobo') >= FANGS_NEEDED) return '?';
  if (questState.c1 === 'done' && questState.c2 === 'inactive') return '!';
  if (questState.c2 === 'active' && questState.centinelaDead) return '?';
  return null;
}

export function ysraMarker() {
  if (questState.s1 === 'inactive') return '!';
  if (questState.s1 === 'active' && questState.ahogadoKills >= DROWNED_NEEDED) return '?';
  if (questState.s1 === 'done' && questState.s2 === 'inactive') return '!';
  if (questState.s2 === 'active' && countItem('flor_cienaga') >= FLOWERS_NEEDED) return '?';
  if (questState.s2 === 'done' && questState.s3 === 'inactive') return '!';
  if (questState.s3 === 'active' && questState.reyFangoDead) return '?';
  return null;
}

export function toranMarker() {
  if (questState.q3 !== 'done') return null; // la cadena se abre al ser ciudadano
  if (questState.t1 === 'inactive') return '!';
  if (questState.t1 === 'active' && questState.wolfKills >= WOLVES_NEEDED) return '?';
  if (questState.t2 === 'active' && countItem('piel_lobo') >= PELTS_NEEDED) return '?';
  if (questState.t3 === 'active' && questState.alfaDead) return '?';
  return null;
}

// ---- Eventos del mundo ----
// La hierba ya entró en la bolsa (la otorgó el servidor tras validar la recolección)
export function onHerbCollected() {
  if (questState.q2 === 'active') {
    questState.herbs = Math.min(HERBS_NEEDED, countItem('hierba_lumina'));
    if (questState.herbs >= HERBS_NEEDED) {
      questState.q2 = 'turnin';
      toast('Hierbas Lumina reunidas — vuelve con el Maestre Aldric', 'quest');
    }
    save();
  }
  renderTracker();
}

export function onEnemyKilled(type) {
  if (type === 'esqueleto' && questState.a1 === 'active' && questState.skeletonKills < SKELETONS_NEEDED) {
    questState.skeletonKills++;
    toast(`Esqueleto Guardián abatido (${questState.skeletonKills}/${SKELETONS_NEEDED})`);
    if (questState.skeletonKills >= SKELETONS_NEEDED) {
      toast('Guardianes abatidos — vuelve con el Maestre Aldric', 'quest');
    }
    save();
  }
  if (type === 'senor_cripta') {
    toast('✦ ¡El Señor de la Cripta ha caído! ✦', 'quest');
    if (questState.a3 === 'active') {
      toast('Lleva la Reliquia al Maestre Aldric', 'quest');
    }
  }
  if (type === 'rata' && questState.b1 === 'active' && questState.rataKills < RATS_NEEDED) {
    questState.rataKills++;
    toast(`Rata de Cripta abatida (${questState.rataKills}/${RATS_NEEDED})`);
    if (questState.rataKills >= RATS_NEEDED) {
      toast('Ratas exterminadas — vuelve con el Ermitaño Baldur', 'quest');
    }
    save();
  }
  if (type === 'guardian_oseo' && questState.b2 === 'active' && !questState.guardianDead) {
    questState.guardianDead = true;
    toast('¡El Guardián Óseo ha caído! Vuelve con el Ermitaño Baldur', 'quest');
    save();
  }
  if (type === 'centinela_oseo' && questState.c2 === 'active' && !questState.centinelaDead) {
    questState.centinelaDead = true;
    toast('¡El Centinela Óseo ha caído! Vuelve con la Cazadora Nyra', 'quest');
    save();
  }
  if (type === 'ahogado' && questState.s1 === 'active' && questState.ahogadoKills < DROWNED_NEEDED) {
    questState.ahogadoKills++;
    toast(`Ahogado abatido (${questState.ahogadoKills}/${DROWNED_NEEDED})`);
    if (questState.ahogadoKills >= DROWNED_NEEDED) {
      toast('Ahogados abatidos — vuelve con la Vidente Ysra', 'quest');
    }
    save();
  }
  if (type === 'rey_fango' && questState.s3 === 'active' && !questState.reyFangoDead) {
    questState.reyFangoDead = true;
    toast('¡El Rey del Fango ha caído! Vuelve con la Vidente Ysra', 'quest');
    save();
  }
  if (type === 'lobo' && questState.t1 === 'active' && questState.wolfKills < WOLVES_NEEDED) {
    questState.wolfKills++;
    toast(`Lobo Gris abatido (${questState.wolfKills}/${WOLVES_NEEDED})`);
    if (questState.wolfKills >= WOLVES_NEEDED) {
      toast('Lobos abatidos — vuelve con el Guardia Toran', 'quest');
    }
    save();
  }
  if (type === 'alfa') {
    if (questState.t3 === 'active' && !questState.alfaDead) {
      questState.alfaDead = true;
      toast('¡El Alfa Sombrío ha caído! Vuelve con el Guardia Toran', 'quest');
      save();
    } else {
      toast('¡El Alfa Sombrío ha caído!', 'quest');
    }
  }
  renderTracker();
}

// Aviso al recoger pieles con t2 activa (la piel ya entró al inventario como botín)
export function onLootChanged() {
  if (questState.t2 === 'active') {
    if (countItem('piel_lobo') === PELTS_NEEDED) {
      toast('Pieles reunidas — vuelve con el Guardia Toran', 'quest');
    }
  }
  if (questState.a2 === 'active') {
    if (countItem('esencia_espectral') === ESSENCES_NEEDED) {
      toast('Esencias reunidas — vuelve con el Maestre Aldric', 'quest');
    }
  }
  if (questState.c1 === 'active') {
    if (countItem('colmillo_lobo') === FANGS_NEEDED) {
      toast('Colmillos reunidos — vuelve con la Cazadora Nyra', 'quest');
    }
  }
  if (questState.s2 === 'active') {
    if (countItem('flor_cienaga') === FLOWERS_NEEDED) {
      toast('Flores reunidas — vuelve con la Vidente Ysra', 'quest');
    }
  }
  renderTracker();
}

function meetCitizen(npcId) {
  if (questState.q3 === 'active' && CITIZENS.includes(npcId) && !questState.met[npcId]) {
    questState.met[npcId] = true;
    const total = CITIZENS.filter((c) => questState.met[c]).length;
    toast(`Has conocido a ${CITIZEN_NAMES[npcId]} (${total}/${CITIZENS.length})`);
    if (total >= CITIZENS.length) {
      questState.q3 = 'turnin';
      toast('Has conocido a todos — vuelve con el Maestre Aldric', 'quest');
    }
    save();
    renderTracker();
  }
}

// ---- Diálogos ----
// Servicios inyectados por main.js (tienda de Lyra, forja de Bramm, curación de Mira)
let openShopFn = null;
let openForgeFn = null;
let miraServices = null; // { getHp, getMaxHp, requestHeal, requestBless, blessings }
export function setShopOpener(fn) { openShopFn = fn; }
export function setForgeOpener(fn) { openForgeFn = fn; }
export function setMiraServices(services) { miraServices = services; }

// Devuelve { text, actions } según el NPC y el estado de las misiones.
export function getDialog(npc) {
  if (npc.id === 'aldric') return aldricDialog();
  if (npc.id === 'toran' && questState.q3 === 'done') return toranDialog();
  if (npc.id === 'baldur') return baldurDialog();
  if (npc.id === 'nyra') return nyraDialog();
  if (npc.id === 'ysra') return ysraDialog();
  meetCitizen(npc.id);
  if (npc.id === 'mira' && miraServices) return miraDialog(npc);
  const actions = [];
  if (npc.id === 'lyra' && openShopFn) {
    actions.push({ label: '🪙 Ver mercancías', fn: () => { hideDialog(); openShopFn(); } });
  }
  if (npc.id === 'bramm' && openForgeFn) {
    actions.push({ label: '🔨 Forjar objetos', fn: () => { hideDialog(); openForgeFn(); } });
  }
  actions.push({ label: 'Hasta pronto', fn: hideDialog });
  return { text: npc.dialog, actions };
}

const HEAL_PRICE = 15;

function miraDialog(npc) {
  const s = miraServices;
  const hurt = s.getHp() < s.getMaxHp();
  const text = hurt
    ? 'La Luz te acompañe, viajero. Veo sangre en tus ropas... acércate al altar, puedo cerrar esas heridas. Y si vas a volver a la espesura o a las criptas, deja que te bendiga antes.'
    : 'La Luz te acompañe, viajero. Estás entero, me alegra verlo. Si buscas fuerzas para lo que acecha ahí fuera, mis bendiciones te acompañarán durante un tiempo.';

  const actions = [
    {
      label: `✙ Sanar heridas por completo (${HEAL_PRICE} oro)`,
      fn: () => {
        if (!hurt) { hideDialog(); return; }
        s.requestHeal(); // el servidor cobra y confirma
        hideDialog();
      },
    },
  ];
  for (const b of Object.values(s.blessings)) {
    actions.push({
      label: `${b.icon} ${b.name} — ${b.desc}, 10 min (${b.price} oro)`,
      fn: () => { s.requestBless(b.id); },
    });
  }
  actions.push({ label: 'Hasta pronto, Sacerdotisa', fn: hideDialog });
  return { text, actions };
}

function aldricDialog() {
  const close = { label: 'Hasta pronto, Maestre', fn: hideDialog };

  if (questState.q1 === 'active') {
    return {
      text: 'Bienvenido a la Ciudadela de Valdoria, joven héroe. Soy el Maestre Aldric, consejero de estas tierras. Pocos llegan hasta aquí, y menos aún con esa chispa en la mirada. Permíteme darte la bienvenida como es debido.',
      actions: [
        {
          label: '✦ Aceptar la bienvenida (10 oro, 2 Pociones de Vida)',
          fn: () => requestClaim('q1', () => {
            questState.q1 = 'done';
            questState.q2 = 'active';
            toast('Misión completada: Bienvenido a Valdoria', 'quest');
            toast('Nueva misión: Hierbas para el Maestre', 'quest');
            save(); renderTracker();
            showDialog('Maestre Aldric',
              'Toma estas pociones, las necesitarás. Ahora, un favor: la luz de la Ciudadela se alimenta de Hierbas Lumina. Crecen brillando entre las piedras de la plaza. Tráeme 3 y te recompensaré.',
              [close]);
          }),
        },
        close,
      ],
    };
  }

  if (questState.q2 === 'active' || questState.q2 === 'turnin') {
    if (countItem('hierba_lumina') >= HERBS_NEEDED) {
      return {
        text: '¡Las Hierbas Lumina! Su resplandor mantendrá encendidos los faros de la muralla durante semanas. Has demostrado ser de fiar.',
        actions: [
          {
            label: '✦ Entregar 3 Hierbas Lumina (25 oro, Espada de Recluta)',
            fn: () => requestClaim('q2', () => {
              questState.q2 = 'done';
              questState.q3 = 'active';
              toast('Misión completada: Hierbas para el Maestre', 'quest');
              toast('Nueva misión: Conoce a los ciudadanos', 'quest');
              save(); renderTracker();
              showDialog('Maestre Aldric',
                'Esta espada la forjó Bramm para los nuevos defensores. Y hablando de él... deberías presentarte ante los ciudadanos: Bramm el Herrero, Lyra la Mercader y el Guardia Toran. Ellos cuidarán de ti.',
                [close]);
            }),
          },
          close,
        ],
      };
    }
    return {
      text: `Aún te faltan Hierbas Lumina (${countItem('hierba_lumina')}/${HERBS_NEEDED}). Búscalas por la plaza: reconocerás su brillo verde entre las piedras.`,
      actions: [close],
    };
  }

  if (questState.q3 === 'active') {
    const total = CITIZENS.filter((c) => questState.met[c]).length;
    return {
      text: `¿Ya conoces a los ciudadanos? (${total}/${CITIZENS.length}) Busca a Bramm en la forja, a Lyra en el mercado y a Toran junto a la puerta sur.`,
      actions: [close],
    };
  }

  if (questState.q3 === 'turnin') {
    return {
      text: 'Bramm, Lyra y Toran hablan bien de ti. Eso, en Valdoria, vale más que el oro. Has completado las pruebas de bienvenida: desde hoy eres ciudadano de la Ciudadela.',
      actions: [
        {
          label: '✦ Recibir recompensa final (50 oro, Casco de Cuero, Anillo de Valdoria)',
          fn: () => requestClaim('q3', () => {
            questState.q3 = 'done';
            toast('Misión completada: Conoce a los ciudadanos', 'quest');
            toast('✦ ¡Bienvenida completada! Eres ciudadano de Valdoria ✦', 'quest');
            save(); renderTracker();
            showDialog('Maestre Aldric',
              'Una cosa más: el Guardia Toran anda buscando brazos fuertes para los problemas de ahí fuera. Habla con él en la puerta sur cuando estés listo para ver mundo.',
              [{ label: 'Lo haré', fn: hideDialog }]);
          }),
        },
        close,
      ],
    };
  }

  // ---- Cadena de la Cripta (tras limpiar el exterior con Toran) ----
  if (questState.t3 === 'done') {
    if (questState.a1 === 'inactive') {
      return {
        text: 'Temía este momento, ciudadano. Los rumores eran ciertos: las criptas bajo la muralla se han abierto. Los huesos de los antiguos guardianes de Valdoria caminan de nuevo, y algo los ha despertado. He hecho abrir la escalinata junto a la muralla oeste. Nadie más que tú puede bajar ahí.',
        actions: [
          {
            label: '✦ Aceptar: Ecos bajo la muralla (abatir 6 Esqueletos Guardianes)',
            fn: () => {
              questState.a1 = 'active';
              questState.skeletonKills = 0;
              toast('Nueva misión: Ecos bajo la muralla', 'quest');
              save(); renderTracker();
              showDialog('Maestre Aldric',
                'La entrada está junto a la muralla oeste, pasada la posada: un arco de piedra con un resplandor verde. Baja, abate a 6 Esqueletos Guardianes y vuelve con vida. Lleva pociones... y no te alejes de las antorchas.',
                [close]);
            },
          },
          close,
        ],
      };
    }

    if (questState.a1 === 'active') {
      if (questState.skeletonKills >= SKELETONS_NEEDED) {
        return {
          text: 'Hueles a polvo de tumba y vuelves entero: eso ya es más de lo que lograron los últimos que bajaron. Con seis guardianes menos, los pasillos vuelven a ser transitables.',
          actions: [
            {
              label: '✦ Cobrar recompensa (80 oro, 2 Pociones Mayores)',
              fn: () => requestClaim('a1', () => {
                questState.a1 = 'done';
                questState.a2 = 'active';
                toast('Misión completada: Ecos bajo la muralla', 'quest');
                toast('Nueva misión: Esencias espectrales', 'quest');
                save(); renderTracker();
                showDialog('Maestre Aldric',
                  'Ahora necesito entender qué los despertó. Los guardianes dejan al caer una luz fría: Esencia Espectral. Tráeme 4 y podré leer en ellas. Por cierto: Bramm sabe forjar con los huesos antiguos de ahí abajo. Llévale lo que encuentres.',
                  [close]);
              }),
            },
            close,
          ],
        };
      }
      return {
        text: `¿Cómo va la limpieza? (${questState.skeletonKills}/${SKELETONS_NEEDED}) Los guardianes rondan la cámara principal de la cripta y el osario lateral. La entrada sigue junto a la muralla oeste.`,
        actions: [close],
      };
    }

    if (questState.a2 === 'active') {
      if (countItem('esencia_espectral') >= ESSENCES_NEEDED) {
        return {
          text: 'Sí... aquí está. Las esencias hablan de una voluntad que las encadena: el Señor de la Cripta, el primer guardián, corrompido por lo que juró custodiar. Mientras él exista, los muertos seguirán alzándose.',
          actions: [
            {
              label: '✦ Entregar 4 Esencias Espectrales (120 oro)',
              fn: () => requestClaim('a2', () => {
                questState.a2 = 'done';
                questState.a3 = 'active';
                toast('Misión completada: Esencias espectrales', 'quest');
                toast('Nueva misión: El Señor de la Cripta', 'quest');
                save(); renderTracker();
                showDialog('Maestre Aldric',
                  'Está en la sala del trono, al fondo de la cripta, custodiando una Reliquia sellada. Abátelo y tráeme esa urna. No vayas solo si puedes evitarlo: forma un grupo de caza con otros héroes. Y pásate antes por la forja de Bramm.',
                  [close]);
              }),
            },
            close,
          ],
        };
      }
      return {
        text: `Necesito 4 Esencias Espectrales y llevas ${countItem('esencia_espectral')}. Los Esqueletos Guardianes las sueltan al caer.`,
        actions: [close],
      };
    }

    if (questState.a3 === 'active') {
      if (countItem('reliquia_cripta') >= 1) {
        return {
          text: 'La Reliquia... sellada desde hace tres siglos, y aún canta. Has hecho algo que Valdoria recordará, héroe: la cripta descansa, la muralla está a salvo y los antiguos guardianes duermen de nuevo. Deja que bendiga esto para ti.',
          actions: [
            {
              label: '✦ Entregar la Reliquia (200 oro, Amuleto del Guardián)',
              fn: () => requestClaim('a3', () => {
                questState.a3 = 'done';
                toast('Misión completada: El Señor de la Cripta', 'quest');
                toast('✦ ¡Las criptas de Valdoria descansan! ✦', 'quest');
                save(); renderTracker();
                hideDialog();
              }),
            },
            close,
          ],
        };
      }
      return {
        text: 'El Señor de la Cripta aguarda en la sala del trono, al fondo de todo. Abátelo y tráeme la Reliquia que custodia. Ve con el mejor acero de Bramm y, si puedes, acompañado.',
        actions: [close],
      };
    }

    if (questState.a3 === 'done') {
      return {
        text: 'Valdoria duerme tranquila gracias a ti: la llanura, el bosque y ahora también sus muertos. Descansa, comercia, forja... y mantén el acero cerca. Los reinos como este nunca están en paz mucho tiempo.',
        actions: [close],
      };
    }
  }

  return {
    text: 'La Ciudadela es tuya, ciudadano. Si buscas acción, el Guardia Toran tiene trabajo del exterior. Y se sigue rumoreando que algo se agita en las criptas bajo la muralla...',
    actions: [close],
  };
}

function toranDialog() {
  const close = { label: 'Hasta pronto, Toran', fn: hideDialog };

  if (questState.t1 === 'inactive') {
    return {
      text: 'Vaya, el nuevo ciudadano. Escucha: los Lobos Grises se han multiplicado en la llanura del sur y ya atacan a los mercaderes que vienen por el camino. La guardia no da abasto. ¿Te atreves a salir de la muralla?',
      actions: [
        {
          label: '⚔ Aceptar: Lobos en la llanura (matar 5 Lobos Grises)',
          fn: () => {
            questState.t1 = 'active';
            questState.wolfKills = 0;
            toast('Nueva misión: Lobos en la llanura', 'quest');
            save(); renderTracker();
            showDialog('Guardia Toran',
              'Cruza la puerta y sigue el camino de tierra hacia el sur: los verás merodear entre la hierba alta. Haz clic sobre ellos para atacar y no dejes que te rodeen. Si la cosa se pone fea, vuelve corriendo: no cruzan la puerta.',
              [close]);
          },
        },
        close,
      ],
    };
  }

  if (questState.t1 === 'active') {
    if (questState.wolfKills >= WOLVES_NEEDED) {
      return {
        text: `${WOLVES_NEEDED} lobos menos. El camino del sur respira tranquilo por primera vez en semanas. La guardia te debe una, ciudadano.`,
        actions: [
          {
            label: '⚔ Cobrar recompensa (40 oro, 3 Pociones de Vida)',
            fn: () => requestClaim('t1', () => {
              questState.t1 = 'done';
              questState.t2 = 'active';
              toast('Misión completada: Lobos en la llanura', 'quest');
              toast('Nueva misión: Pieles para el cuartel', 'quest');
              save(); renderTracker();
              showDialog('Guardia Toran',
                'Ahora que les has tomado la medida... el cuartel necesita pieles para los catres del turno de noche. Tráeme 4 Pieles de Lobo. Los lobos las sueltan al caer; también puedes comprarlas si Lyra tuviera, pero dudo que le queden.',
                [close]);
            }),
          },
          close,
        ],
      };
    }
    return {
      text: `¿Cómo va la cacería? (${questState.wolfKills}/${WOLVES_NEEDED}) Sigue el camino del sur y busca entre la hierba alta. Y cuidado con adentrarte en el bosque del oeste: los jabalíes tienen mal despertar.`,
      actions: [close],
    };
  }

  if (questState.t2 === 'active') {
    if (countItem('piel_lobo') >= PELTS_NEEDED) {
      return {
        text: 'Buenas pieles, gruesas y sin desgarrar. Los muchachos del turno de noche dormirán calientes. Toma, esto es de parte del cuartel.',
        actions: [
          {
            label: '⚔ Entregar 4 Pieles de Lobo (60 oro, Escudo de Roble)',
            fn: () => requestClaim('t2', () => {
              questState.t2 = 'done';
              questState.t3 = 'active';
              toast('Misión completada: Pieles para el cuartel', 'quest');
              toast('Nueva misión: El Alfa Sombrío', 'quest');
              save(); renderTracker();
              showDialog('Guardia Toran',
                'Y ahora lo serio. Los lobos no bajan de las colinas porque sí: los guía una bestia enorme de ojos rojos. El Alfa Sombrío. Lo vieron en el círculo de piedras, al final del camino del sur. Llévate ese escudo... y no vayas sin pociones.',
                [close]);
            }),
          },
          close,
        ],
      };
    }
    return {
      text: `Necesito 4 Pieles de Lobo y llevas ${countItem('piel_lobo')}. Los lobos de la llanura las sueltan al caer.`,
      actions: [close],
    };
  }

  if (questState.t3 === 'active') {
    if (questState.alfaDead) {
      return {
        text: '¡Por los muros de Valdoria, lo has hecho! El Alfa Sombrío abatido... Los vigías ya no verán ojos rojos desde las almenas. Eres de lo mejor que ha cruzado esa puerta, y he visto pasar a muchos.',
        actions: [
          {
            label: '⚔ Recompensa del cuartel (100 oro, Capa del Explorador, 2 Pociones Mayores)',
            fn: () => requestClaim('t3', () => {
              questState.t3 = 'done';
              toast('Misión completada: El Alfa Sombrío', 'quest');
              toast('✦ ¡Has limpiado el exterior de Valdoria! ✦', 'quest');
              save(); renderTracker();
              hideDialog();
            }),
          },
          close,
        ],
      };
    }
    return {
      text: 'El Alfa Sombrío aguarda en el círculo de piedras, al final del camino del sur. Ve con la vida llena y el acero afilado: esa bestia ha matado a exploradores veteranos.',
      actions: [close],
    };
  }

  return {
    text: 'El exterior está tranquilo gracias a ti, ciudadano. Los lobos que quedan reaparecen de vez en cuando, si quieres oro o pieles para vender a Lyra. Cuando las criptas se abran, serás el primero a quien llame.',
    actions: [close],
  };
}

function baldurDialog() {
  const close = { label: 'Hasta pronto, Baldur', fn: hideDialog };

  if (questState.b1 === 'inactive') {
    return {
      text: 'Chssst... baja la voz, viajero. Llevo semanas vigilando esa cripta de llama violeta. Primero fueron los susurros; ahora las ratas salen de noche y me roen las provisiones. Algo las cría ahí abajo.',
      actions: [
        {
          label: '⚔ Aceptar: Ratas en la oscuridad (matar 4 Ratas de Cripta)',
          fn: () => {
            questState.b1 = 'active';
            questState.rataKills = 0;
            toast('Nueva misión: Ratas en la oscuridad', 'quest');
            save(); renderTracker();
            showDialog('Ermitaño Baldur',
              'Baja por el portal violeta y limpia el nido: con 4 menos podré dormir de un tirón. Sirven las de cualquier cripta, todas vienen de la misma camada maldita.',
              [close]);
          },
        },
        close,
      ],
    };
  }

  if (questState.b1 === 'active') {
    if (questState.rataKills >= RATS_NEEDED) {
      return {
        text: 'Anoche no oí ni un chillido. No sabes lo que es eso después de semanas... Toma, lo poco que un ermitaño puede darte.',
        actions: [
          {
            label: '⚔ Cobrar recompensa (30 oro, 2 Pociones de Vida)',
            fn: () => requestClaim('b1', () => {
              questState.b1 = 'done';
              questState.b2 = 'active';
              toast('Misión completada: Ratas en la oscuridad', 'quest');
              toast('Nueva misión: El Guardián del Bosque', 'quest');
              save(); renderTracker();
              showDialog('Ermitaño Baldur',
                'Pero las ratas eran solo el principio. Al fondo de esa cripta camina un montón de huesos con nombre propio: el Guardián Óseo. Mientras siga en pie, esto no habrá terminado. Abátelo... y no vayas justo de vida.',
                [close]);
            }),
          },
          close,
        ],
      };
    }
    return {
      text: `¿Cómo va el nido? (${questState.rataKills}/${RATS_NEEDED}) El portal violeta, ahí mismo. Yo vigilo el campamento.`,
      actions: [close],
    };
  }

  if (questState.b2 === 'active') {
    if (questState.guardianDead) {
      return {
        text: 'Lo he sentido desde aquí: un estruendo de huesos y luego... silencio del bueno. El bosque vuelve a respirar. Eres de otra madera, viajero.',
        actions: [
          {
            label: '⚔ Cobrar recompensa (90 oro, 2 Esencias, Poción Mayor)',
            fn: () => requestClaim('b2', () => {
              questState.b2 = 'done';
              toast('Misión completada: El Guardián del Bosque', 'quest');
              toast('✦ La Cripta del Bosque descansa ✦', 'quest');
              save(); renderTracker();
              hideDialog();
            }),
          },
          close,
        ],
      };
    }
    return {
      text: 'El Guardián Óseo aguarda en la cámara del fondo de la cripta. Si vuelve a alzarse — reaparecen, ¿sabes? — siempre habrá caza aquí para ti.',
      actions: [close],
    };
  }

  return {
    text: 'El bosque calla y las provisiones siguen enteras: la vida del ermitaño vuelve a ser aburrida, gracias a ti. Si ves a Nyra en la colina del este, dile que me debe una partida de dados.',
    actions: [close],
  };
}

function nyraDialog() {
  const close = { label: 'Hasta pronto, Nyra', fn: hideDialog };

  if (questState.c1 === 'inactive') {
    return {
      text: '¿Un cazador nuevo por la colina? Perfecto. Me quedan pocas flechas y muchos huesos que perforar: esa cripta de llama de brasa no se limpia sola. Necesito colmillos de lobo para las puntas: nada muerde el hueso como el colmillo.',
      actions: [
        {
          label: '⚔ Aceptar: Puntas de colmillo (reunir 5 Colmillos de Lobo)',
          fn: () => {
            questState.c1 = 'active';
            toast('Nueva misión: Puntas de colmillo', 'quest');
            save(); renderTracker();
            showDialog('Cazadora Nyra',
              'Los lobos de la llanura del sur los sueltan al caer. Tráeme 5 y tendré flechas para una semana... y tú, mi gratitud y mi oro.',
              [close]);
          },
        },
        close,
      ],
    };
  }

  if (questState.c1 === 'active') {
    if (countItem('colmillo_lobo') >= FANGS_NEEDED) {
      return {
        text: 'Buenos colmillos, afilados y sin mellar. Esta noche empenacho flechas nuevas. Trato es trato, cazador.',
        actions: [
          {
            label: '⚔ Entregar 5 Colmillos de Lobo (40 oro, 2 Pociones de Vida)',
            fn: () => requestClaim('c1', () => {
              questState.c1 = 'done';
              questState.c2 = 'active';
              toast('Misión completada: Puntas de colmillo', 'quest');
              toast('Nueva misión: El Centinela de la Colina', 'quest');
              save(); renderTracker();
              showDialog('Cazadora Nyra',
                'Ahora lo importante: dentro de esa cripta manda el Centinela Óseo. Le he clavado seis flechas y ni se inmutó — esto es trabajo de acero, no de pluma. Abátelo y la colina será segura para las caravanas.',
                [close]);
            }),
          },
          close,
        ],
      };
    }
    return {
      text: `Llevas ${countItem('colmillo_lobo')} de ${FANGS_NEEDED} colmillos. Los lobos de la llanura del sur, ya sabes.`,
      actions: [close],
    };
  }

  if (questState.c2 === 'active') {
    if (questState.centinelaDead) {
      return {
        text: '¡Lo vi derrumbarse desde la boca de la cripta! Huesos por el suelo como leña vieja. Las caravanas del este volverán a subir la colina gracias a ti.',
        actions: [
          {
            label: '⚔ Cobrar recompensa (90 oro, Poción Mayor, 2 Pieles de Oso)',
            fn: () => requestClaim('c2', () => {
              questState.c2 = 'done';
              toast('Misión completada: El Centinela de la Colina', 'quest');
              toast('✦ La Cripta de la Colina descansa ✦', 'quest');
              save(); renderTracker();
              hideDialog();
            }),
          },
          close,
        ],
      };
    }
    return {
      text: 'El Centinela Óseo, cámara del fondo, llama de brasa. Y ojo al volver por el norte: los osos de las ruinas no distinguen entre héroes y meriendas.',
      actions: [close],
    };
  }

  return {
    text: 'La colina está tranquila y mis flechas afiladas. Si cazas osos en las ruinas del norte, tráele las pieles a Bramm: cose capas que quitan el frío hasta a un espectro. Y si ves a Baldur... dile que las deudas de dados prescriben.',
    actions: [close],
  };
}

function ysraDialog() {
  const close = { label: 'Que las aguas te guarden', fn: hideDialog };

  if (questState.s1 === 'inactive') {
    return {
      text: 'Te esperaba, forastero... las aguas me mostraron tu rostro. Soy Ysra, y esta ciénaga fue mi hogar antes de que los muertos despertaran bajo el fango. Los llaman Ahogados: hombres que el pantano se tragó y devolvió sin alma. Ayúdame a mermarlos y te enseñaré lo que las aguas susurran.',
      actions: [
        {
          label: '⚔ Aceptar: Aguas turbias (abatir 6 Ahogados)',
          fn: () => {
            questState.s1 = 'active';
            questState.ahogadoKills = 0;
            toast('Nueva misión: Aguas turbias', 'quest');
            save(); renderTracker();
            showDialog('Vidente Ysra',
              'Los verás vagar entre las charcas del noroeste, arrastrando los pies. Seis bastarán para que el pantano recuerde el miedo. Ve con cuidado: no vienen solos.',
              [close]);
          },
        },
        close,
      ],
    };
  }

  if (questState.s1 === 'active') {
    if (questState.ahogadoKills >= DROWNED_NEEDED) {
      return {
        text: 'Seis menos, y las aguas respiran más tranquilas. Toma esto: un lodo que cura, secreto de las brujas de ciénaga. Lo necesitarás para lo que viene.',
        actions: [
          {
            label: '⚔ Cobrar recompensa (60 oro, 3 Limos Curativos)',
            fn: () => requestClaim('s1', () => {
              questState.s1 = 'done';
              questState.s2 = 'active';
              toast('Misión completada: Aguas turbias', 'quest');
              toast('Nueva misión: El fango que susurra', 'quest');
              save(); renderTracker();
              showDialog('Vidente Ysra',
                'Ahora necesito Flores de Ciénaga: pálidas, crecen sobre el agua muerta y las sueltan las criaturas al caer. Con cinco podré ver el corazón de este mal. Búscalas entre sanguijuelas y chamanes.',
                [close]);
            }),
          },
          close,
        ],
      };
    }
    return {
      text: `¿Cuántos Ahogados quedan en pie? (${questState.ahogadoKills}/${DROWNED_NEEDED}) Búscalos entre las charcas del noroeste.`,
      actions: [close],
    };
  }

  if (questState.s2 === 'active') {
    if (countItem('flor_cienaga') >= FLOWERS_NEEDED) {
      return {
        text: 'Las flores... sí. Las aguas me hablan a través de ellas. Y lo que dicen hiela la sangre: un Rey del Fango se alza en el fondo del pantano, una montaña de limo y huesos que devora todo lo que se ahoga. Él es la raíz de la podredumbre.',
        actions: [
          {
            label: '⚔ Entregar 5 Flores de Ciénaga (80 oro, Poción Mayor)',
            fn: () => requestClaim('s2', () => {
              questState.s2 = 'done';
              questState.s3 = 'active';
              toast('Misión completada: El fango que susurra', 'quest');
              toast('Nueva misión: El Rey del Fango', 'quest');
              save(); renderTracker();
              showDialog('Vidente Ysra',
                'El Rey del Fango aguarda en el corazón de la ciénaga, al sur de aquí. Es enorme y no conoce la piedad. Ve con la vida llena y el mejor acero... y no dejes que sus fauces te arrastren al fondo.',
                [close]);
            }),
          },
          close,
        ],
      };
    }
    return {
      text: `Necesito 5 Flores de Ciénaga y llevas ${countItem('flor_cienaga')}. Las criaturas del pantano las sueltan al morir.`,
      actions: [close],
    };
  }

  if (questState.s3 === 'active') {
    if (questState.reyFangoDead) {
      return {
        text: '¡Lo has hecho! Siento cómo el fango se aquieta, cómo los ahogados por fin descansan. La ciénaga tardará años en volver a susurrar maldad. Has devuelto la paz a mi hogar, forastero, y eso una bruja no lo olvida.',
        actions: [
          {
            label: '✦ Recompensa final (150 oro, Anillo de la Ciénaga, 2 Pociones Mayores)',
            fn: () => requestClaim('s3', () => {
              questState.s3 = 'done';
              toast('Misión completada: El Rey del Fango', 'quest');
              toast('✦ ¡Has purgado la Ciénaga de los Ahogados! ✦', 'quest');
              save(); renderTracker();
              hideDialog();
            }),
          },
          close,
        ],
      };
    }
    return {
      text: 'El Rey del Fango sigue en pie, al sur de la ciénaga. Mientras respire limo, los Ahogados volverán una y otra vez.',
      actions: [close],
    };
  }

  return {
    text: 'La ciénaga descansa gracias a ti. Vuelve cuando quieras: las aguas siempre tienen algo que susurrar a quien sabe escuchar. Y si necesitas Limo Curativo, las sanguijuelas aún lo llevan dentro.',
    actions: [close],
  };
}

// ---- Rastreador en pantalla ----
export function renderTracker() {
  const list = document.getElementById('quest-list');
  const entries = [];

  if (questState.q1 === 'active') {
    entries.push({ title: 'Bienvenido a Valdoria', objs: [{ text: 'Habla con el Maestre Aldric (marcado con !)', done: false }] });
  }
  if (questState.q2 === 'active' || questState.q2 === 'turnin') {
    const n = Math.min(HERBS_NEEDED, countItem('hierba_lumina'));
    entries.push({
      title: 'Hierbas para el Maestre',
      objs: [
        { text: `Recoge Hierbas Lumina (${n}/${HERBS_NEEDED})`, done: n >= HERBS_NEEDED },
        ...(n >= HERBS_NEEDED ? [{ text: 'Vuelve con el Maestre Aldric', done: false }] : []),
      ],
    });
  }
  if (questState.q3 === 'active' || questState.q3 === 'turnin') {
    const objs = CITIZENS.map((c) => ({ text: `Habla con ${CITIZEN_NAMES[c]}`, done: !!questState.met[c] }));
    if (questState.q3 === 'turnin') objs.push({ text: 'Vuelve con el Maestre Aldric', done: false });
    entries.push({ title: 'Conoce a los ciudadanos', objs });
  }
  if (questState.q3 === 'done' && questState.t1 === 'inactive') {
    entries.push({ title: 'El exterior llama', objs: [{ text: 'Habla con el Guardia Toran en la puerta sur', done: false }] });
  }

  if (questState.t1 === 'active') {
    const done = questState.wolfKills >= WOLVES_NEEDED;
    const objs = [{ text: `Mata Lobos Grises (${questState.wolfKills}/${WOLVES_NEEDED})`, done }];
    if (done) objs.push({ text: 'Vuelve con el Guardia Toran', done: false });
    entries.push({ title: 'Lobos en la llanura', objs });
  }
  if (questState.t2 === 'active') {
    const n = Math.min(PELTS_NEEDED, countItem('piel_lobo'));
    const objs = [{ text: `Reúne Pieles de Lobo (${n}/${PELTS_NEEDED})`, done: n >= PELTS_NEEDED }];
    if (n >= PELTS_NEEDED) objs.push({ text: 'Vuelve con el Guardia Toran', done: false });
    entries.push({ title: 'Pieles para el cuartel', objs });
  }
  if (questState.t3 === 'active') {
    const objs = [{ text: 'Abate al Alfa Sombrío (círculo de piedras del sur)', done: questState.alfaDead }];
    if (questState.alfaDead) objs.push({ text: 'Vuelve con el Guardia Toran', done: false });
    entries.push({ title: 'El Alfa Sombrío', objs });
  }
  if (questState.t3 === 'done' && questState.a1 === 'inactive') {
    entries.push({ title: 'Las criptas se han abierto', objs: [{ text: 'Habla con el Maestre Aldric', done: false }] });
  }

  if (questState.a1 === 'active') {
    const done = questState.skeletonKills >= SKELETONS_NEEDED;
    const objs = [{ text: `Abate Esqueletos Guardianes (${questState.skeletonKills}/${SKELETONS_NEEDED})`, done }];
    if (done) objs.push({ text: 'Vuelve con el Maestre Aldric', done: false });
    entries.push({ title: 'Ecos bajo la muralla', objs });
  }
  if (questState.a2 === 'active') {
    const n = Math.min(ESSENCES_NEEDED, countItem('esencia_espectral'));
    const objs = [{ text: `Reúne Esencias Espectrales (${n}/${ESSENCES_NEEDED})`, done: n >= ESSENCES_NEEDED }];
    if (n >= ESSENCES_NEEDED) objs.push({ text: 'Vuelve con el Maestre Aldric', done: false });
    entries.push({ title: 'Esencias espectrales', objs });
  }
  if (questState.a3 === 'active') {
    const hasRelic = countItem('reliquia_cripta') >= 1;
    const objs = [{ text: 'Abate al Señor de la Cripta (sala del trono)', done: hasRelic }];
    if (hasRelic) objs.push({ text: 'Entrega la Reliquia al Maestre Aldric', done: false });
    entries.push({ title: 'El Señor de la Cripta', objs });
  }
  if (questState.a3 === 'done') {
    entries.push({ title: 'Valdoria descansa ✦', objs: [{ text: 'Caza, forja y comercia a tu antojo', done: false }] });
  }

  if (questState.b1 === 'active') {
    const done = questState.rataKills >= RATS_NEEDED;
    const objs = [{ text: `Mata Ratas de Cripta (${questState.rataKills}/${RATS_NEEDED})`, done }];
    if (done) objs.push({ text: 'Vuelve con el Ermitaño Baldur', done: false });
    entries.push({ title: 'Ratas en la oscuridad', objs });
  }
  if (questState.b2 === 'active') {
    const objs = [{ text: 'Abate al Guardián Óseo (Cripta del Bosque)', done: questState.guardianDead }];
    if (questState.guardianDead) objs.push({ text: 'Vuelve con el Ermitaño Baldur', done: false });
    entries.push({ title: 'El Guardián del Bosque', objs });
  }
  if (questState.c1 === 'active') {
    const n = Math.min(FANGS_NEEDED, countItem('colmillo_lobo'));
    const objs = [{ text: `Reúne Colmillos de Lobo (${n}/${FANGS_NEEDED})`, done: n >= FANGS_NEEDED }];
    if (n >= FANGS_NEEDED) objs.push({ text: 'Vuelve con la Cazadora Nyra', done: false });
    entries.push({ title: 'Puntas de colmillo', objs });
  }
  if (questState.c2 === 'active') {
    const objs = [{ text: 'Abate al Centinela Óseo (Cripta de la Colina)', done: questState.centinelaDead }];
    if (questState.centinelaDead) objs.push({ text: 'Vuelve con la Cazadora Nyra', done: false });
    entries.push({ title: 'El Centinela de la Colina', objs });
  }
  if (questState.s1 === 'active') {
    const done = questState.ahogadoKills >= DROWNED_NEEDED;
    const objs = [{ text: `Abate Ahogados (${questState.ahogadoKills}/${DROWNED_NEEDED})`, done }];
    if (done) objs.push({ text: 'Vuelve con la Vidente Ysra', done: false });
    entries.push({ title: 'Aguas turbias', objs });
  }
  if (questState.s2 === 'active') {
    const n = Math.min(FLOWERS_NEEDED, countItem('flor_cienaga'));
    const objs = [{ text: `Reúne Flores de Ciénaga (${n}/${FLOWERS_NEEDED})`, done: n >= FLOWERS_NEEDED }];
    if (n >= FLOWERS_NEEDED) objs.push({ text: 'Vuelve con la Vidente Ysra', done: false });
    entries.push({ title: 'El fango que susurra', objs });
  }
  if (questState.s3 === 'active') {
    const objs = [{ text: 'Abate al Rey del Fango (sur de la ciénaga)', done: questState.reyFangoDead }];
    if (questState.reyFangoDead) objs.push({ text: 'Vuelve con la Vidente Ysra', done: false });
    entries.push({ title: 'El Rey del Fango', objs });
  }

  list.innerHTML = entries.map((e) =>
    `<div class="quest-entry"><div class="q-title">✦ ${e.title}</div>` +
    e.objs.map((o) => `<div class="q-obj ${o.done ? 'done' : ''}">· ${o.text}</div>`).join('') +
    '</div>'
  ).join('');
}

function save() { onChanged?.(); }

// ---- Guardado / carga ----
export function serializeQuests() {
  const { q1, q2, q3, herbs, met, t1, t2, t3, wolfKills, alfaDead, a1, a2, a3, skeletonKills,
    b1, b2, c1, c2, rataKills, guardianDead, centinelaDead,
    s1, s2, s3, ahogadoKills, reyFangoDead } = questState;
  return { q1, q2, q3, herbs, met, t1, t2, t3, wolfKills, alfaDead, a1, a2, a3, skeletonKills,
    b1, b2, c1, c2, rataKills, guardianDead, centinelaDead,
    s1, s2, s3, ahogadoKills, reyFangoDead };
}

export function loadQuests(data) {
  if (!data) return;
  Object.assign(questState, data);
  renderTracker();
}
