import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAudioContextConstructor, createAudioContext, resumeAudioContext } from './audioBootstrap';

describe('audioBootstrap', () => {
  const originalAudioContext = globalThis.AudioContext;

  afterEach(() => {
    globalThis.AudioContext = originalAudioContext;
    vi.restoreAllMocks();
  });

  it('returns standard AudioContext when available', () => {
    class MockAudioContext {}
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;
    const ctor = getAudioContextConstructor();
    expect(ctor).toBe(MockAudioContext);
  });

  it('instantiates AudioContext via createAudioContext', () => {
    class MockAudioContext {
      public options?: AudioContextOptions;
      constructor(options?: AudioContextOptions) {
        this.options = options;
      }
    }
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;

    const ctx = createAudioContext({ latencyHint: 'interactive' });
    expect(ctx).toBeInstanceOf(MockAudioContext);
    expect((ctx as unknown as MockAudioContext).options).toEqual({ latencyHint: 'interactive' });
  });

  it('safely resumes suspended audio context', async () => {
    const resumeFn = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      state: 'suspended',
      resume: resumeFn,
    } as unknown as AudioContext;

    // After resume, update state
    resumeFn.mockImplementation(async () => {
      Object.defineProperty(mockCtx, 'state', { value: 'running', configurable: true });
    });

    const success = await resumeAudioContext(mockCtx);
    expect(success).toBe(true);
    expect(resumeFn).toHaveBeenCalledTimes(1);
  });
});
