/**
 * Audio Context Bootstrap Utility.
 * Handles cross-browser AudioContext initialization with webkitAudioContext fallback
 * in a strictly-typed, SSR-safe manner.
 */

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

/**
 * Resolves the available AudioContext constructor across standard and vendor-prefixed browser environments.
 */
export function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  if (typeof window !== 'undefined') {
    const win = window as WebkitWindow;
    return win.webkitAudioContext;
  }
  return undefined;
}

/**
 * Creates and initializes an AudioContext with the given options, or returns null if unsupported.
 */
export function createAudioContext(options?: AudioContextOptions): AudioContext | null {
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;
  try {
    return new Ctor(options);
  } catch (err) {
    console.debug('Failed to instantiate AudioContext:', err);
    return null;
  }
}

/**
 * Safely resumes a suspended AudioContext after user interaction.
 * Swallows unhandled rejection warnings if resume is deferred by browser autoplay policies.
 */
export async function resumeAudioContext(ctx: AudioContext): Promise<boolean> {
  const currentState: AudioContextState = ctx.state;
  if (currentState !== 'suspended') return true;
  try {
    await ctx.resume();
    const updatedState: AudioContextState = ctx.state;
    return updatedState === 'running';
  } catch (err) {
    console.debug('AudioContext resume deferred:', err);
    return false;
  }
}
