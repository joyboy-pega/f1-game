import type { AudioManager } from '../audio';
import type { SimEvent } from '../sim/events';
import { clamp01, crowdProximity } from './helpers';

/**
 * Sim event -> sound mapping. Called by AudioBridge for every flushed SimEvent.
 * `playerId` is the current player's car id (changes between sessions).
 */
export function playSimEvent(a: AudioManager, e: SimEvent, playerId: number) {
  const sfx = a.sfx;
  if (!sfx || !a.ready) return;
  const isMe = (id: number) => id === playerId;
  const prox = crowdProximity(a.lastFrame.player.idx);

  switch (e.type) {
    case 'lightsOn':
      sfx.startLight(e.count);
      break;
    case 'lightsOut':
      sfx.lightsOut();
      break;
    case 'drs':
      if (isMe(e.carId)) sfx.drs(e.open);
      break;
    case 'bias':
      if (isMe(e.carId)) sfx.biasTick();
      break;
    case 'lap':
      if (isMe(e.carId)) {
        sfx.lapBeep();
        // The player is on the line when a lap completes: full grandstand reaction.
        a.ambience?.cheer(0.45 + 0.55 * prox);
        if (e.overallBest) setTimeout(() => a.ready && sfx.fastestLap(), 260);
      } else if (e.overallBest) {
        sfx.radioBlip();
      }
      break;
    case 'sector':
      if (isMe(e.carId)) sfx.sectorBeep(e.status);
      break;
    case 'positionChange':
      if (isMe(e.carId) && e.to < e.from) a.ambience?.cheer(0.25 + 0.6 * prox);
      break;
    case 'penalty':
      if (isMe(e.carId)) {
        sfx.radioBlip();
        setTimeout(() => a.ready && sfx.penalty(), 220);
      }
      break;
    case 'trackLimits':
      if (isMe(e.carId)) sfx.radioBlip();
      break;
    case 'pitEnter':
      if (isMe(e.carId)) sfx.radioBlip();
      break;
    case 'pitExit':
      if (isMe(e.carId)) sfx.pitStop();
      break;
    case 'collision': {
      const involvesPlayer = isMe(e.carId) || (e.otherId !== null && isMe(e.otherId));
      let atten = 1;
      if (!involvesPlayer) {
        // AI-AI contact: heard only when close (sim units; 1 unit = 0.1 m).
        const d = a.distanceToPlayer(e.carId);
        atten = 0.7 * Math.pow(clamp01(1 - d / 2000), 2);
      }
      if (atten > 0.02) sfx.collision(e.intensity, atten);
      break;
    }
    case 'chequered':
      a.ambience?.cheer(0.4 + 0.4 * prox);
      break;
    case 'finish':
      if (isMe(e.carId)) a.ambience?.cheer(1);
      break;
    default:
      break;
  }
}
