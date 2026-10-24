export type ServerProof = {
  v: number;
  e: string;
  c: number;
  m: string;
  server_time_ms: number;
  expires_at_ms: number;
};

export type QrState = 'loading' | 'ready' | 'error';

type Timer = ReturnType<typeof setTimeout> | number;

type Options = {
  eventId: string;
  fetchProof: (signal: AbortSignal) => Promise<ServerProof>;
  render: (proof: ServerProof, isCurrent: () => boolean) => Promise<void>;
  clear: () => void;
  onState: (state: QrState) => void;
  now?: () => number;
  setTimer?: (fn: () => void, delay: number) => Timer;
  clearTimer?: (id: Timer) => void;
};

export function createServerQr(options: Options) {
  const now = options.now || (() => performance.now());
  const setTimer = options.setTimer || setTimeout;
  const clearTimer = options.clearTimer || clearTimeout;
  let active = false;
  let stopped = false;
  let generation = 0;
  let deadline = 0;
  let nextFetch = Infinity;
  let polling: Timer | undefined;
  let timeout: Timer | undefined;
  let request: AbortController | undefined;

  function hide(state: QrState) {
    deadline = 0;
    options.clear();
    options.onState(state);
  }

  function cancelRequest() {
    generation++;
    request?.abort();
    request = undefined;
    if (timeout !== undefined) clearTimer(timeout);
    timeout = undefined;
  }

  async function load() {
    cancelRequest();
    const current = generation;
    const controller = new AbortController();
    request = controller;
    const started = now();
    nextFetch = Infinity;
    timeout = setTimer(() => {
      if (current !== generation) return;
      cancelRequest();
      hide('error');
      nextFetch = now() + 3000;
    }, 5000);

    try {
      const proof = await options.fetchProof(controller.signal);
      if (!active || current !== generation) return;
      if (proof.v !== 1 || proof.e !== options.eventId || !Number.isInteger(proof.c) || proof.c < 0 ||
          !/^[a-f0-9]{64}$/.test(proof.m) || !Number.isFinite(proof.server_time_ms) ||
          Math.floor(proof.server_time_ms / 3000) !== proof.c ||
          proof.expires_at_ms !== (proof.c + 5) * 3000) {
        throw new Error('Invalid server QR response');
      }
      // Use monotonic elapsed time, including the full request duration, never the PC clock.
      const freshUntil = started + Math.min(6000, proof.expires_at_ms - proof.server_time_ms);
      const isCurrent = () => active && current === generation && now() < freshUntil;
      if (!isCurrent()) throw new Error('Server QR arrived too late');
      await options.render(proof, isCurrent);
      if (!active || current !== generation) return;
      if (!isCurrent()) throw new Error('Server QR expired while drawing');
      deadline = freshUntil;
      options.onState('ready');
      nextFetch = started + 3000;
    } catch (_) {
      if (!active || current !== generation) return;
      hide('error');
      nextFetch = now() + 3000;
    } finally {
      if (current === generation) {
        if (timeout !== undefined) clearTimer(timeout);
        timeout = undefined;
        request = undefined;
      }
    }
  }

  function watch() {
    if (!active) return;
    if (deadline && now() >= deadline) hide('error');
    if (now() >= nextFetch) void load();
    polling = setTimer(watch, 250);
  }

  function refresh() {
    if (stopped) return;
    active = true;
    if (polling !== undefined) clearTimer(polling);
    cancelRequest();
    hide('loading');
    void load();
    polling = setTimer(watch, 250);
  }

  function suspend() {
    active = false;
    cancelRequest();
    if (polling !== undefined) clearTimer(polling);
    polling = undefined;
    hide('loading');
  }

  return {
    refresh,
    suspend,
    stop() {
      stopped = true;
      suspend();
    },
  };
}
