import type { SectorStatus } from '../gameState';
import type { TyreCompound } from '../constants';

export type SimEvent =
  | { type: 'lightsOn'; count: number }
  | { type: 'lightsOut' }
  | { type: 'lap'; carId: number; lap: number; time: number; personalBest: boolean; overallBest: boolean; valid?: boolean }
  | { type: 'lapInvalid'; carId: number; lap: number; reason: string }
  | { type: 'chicaneCut'; carId: number; gainedSec: number }
  | { type: 'sector'; carId: number; sector: number; time: number; status: SectorStatus }
  | { type: 'positionChange'; carId: number; from: number; to: number }
  | { type: 'drs'; carId: number; open: boolean; reason?: string }
  | { type: 'ers'; carId: number; active: boolean }
  | { type: 'bias'; carId: number; bias: number }
  | { type: 'chequered' }
  | { type: 'finish'; carId: number; position: number }
  | { type: 'penalty'; carId: number; seconds: number; reason: string }
  | { type: 'engineer'; message: string; sub?: string }
  | { type: 'trackLimits'; carId: number; warnings: number }
  | { type: 'qualifyingComplete'; grid: string[] }
  | { type: 'flag'; flag: 'green' | 'yellow' | 'blue'; sector?: number; carId?: number }
  | { type: 'safetyCar'; mode: 'none' | 'vsc' | 'sc'; ending?: boolean }
  | { type: 'pitEnter'; carId: number }
  /** The driver changed the box request or the tyre planned for the next stop. */
  | { type: 'pitPlan'; carId: number; box: boolean; compound: TyreCompound }
  | { type: 'pitExit'; carId: number; compound: TyreCompound; stationaryTime: number }
  | { type: 'pitQTE'; carId: number; result: 'perfect' | 'good' | 'early' | 'late'; delta: number }
  | { type: 'collision'; carId: number; otherId: number | null; intensity: number }
  | { type: 'reset'; carId: number };

export type SimEventType = SimEvent['type'];
type Listener = (e: SimEvent) => void;

/**
 * Events are queued during fixed simulation steps and dispatched once per
 * rendered frame by GameLoop (`flush`), so listeners never run mid-step.
 */
export class EventBus {
  private queue: SimEvent[] = [];
  private listeners = new Set<Listener>();

  emit(e: SimEvent) {
    this.queue.push(e);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  flush() {
    if (this.queue.length === 0) return;
    const q = this.queue;
    this.queue = [];
    for (const e of q) for (const fn of this.listeners) fn(e);
  }

  clear() {
    this.queue = [];
  }
}
