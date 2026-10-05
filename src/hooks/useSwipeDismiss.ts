'use client';

import { useCallback, useEffect, useRef } from 'react';
import { animate, useMotionValue, type MotionValue } from 'framer-motion';

// Swipe-to-dismiss for full-screen panels (swipe right) and bottom sheets
// (swipe down), shared so both feel identical.
//
// Why native listeners instead of framer's `drag`: framer drives drag from
// POINTER events, and a touch browser fires `pointercancel` the instant it
// decides a vertical move is a scroll — on a real phone the comment list (and
// anything else that scrolls) could never hand the gesture to the sheet. Touch
// events keep arriving after the browser starts a pan, and a non-passive
// `touchmove` can claim the gesture with preventDefault once we know it's ours.
//
// Every threshold is relative to the element's own size, so a 320px-wide phone,
// a 430px Pro Max, a tablet and the 460px desktop frame all need the same
// fraction of a swipe rather than a fixed pixel count that is a long drag on one
// screen and a twitch on another.

type Axis = 'x' | 'y';

interface Options {
  /** 'x' = swipe right to dismiss, 'y' = swipe down to dismiss. */
  axis: Axis;
  onDismiss: () => void;
  enabled?: boolean;
}

interface SwipeDismiss {
  /** Callback ref — attach to the element that moves. */
  attach: (el: HTMLElement | null) => void;
  /** Current offset along the axis in px — bind it to the element's x / y. */
  offset: MotionValue<number>;
}

const SLOP = 8;                 // px before we decide whose gesture it is
const FLICK_VELOCITY = 450;     // px/s — a quick flick dismisses from anywhere
const FLICK_MIN_TRAVEL = 16;    // …but not a tremor
const DISTANCE_FRACTION = 0.3;  // of the element's size
const DISTANCE_MIN = 72;
const DISTANCE_MAX = 220;

/** Distance (px) a slow drag has to cover to dismiss an element of `size`. */
export function dismissDistance(size: number): number {
  return Math.min(DISTANCE_MAX, Math.max(DISTANCE_MIN, size * DISTANCE_FRACTION));
}

/** Whether a release at `offset` moving at `velocity` should dismiss. */
export function shouldDismiss(offset: number, velocity: number, size: number): boolean {
  if (offset >= dismissDistance(size)) return true;
  return velocity >= FLICK_VELOCITY && offset >= FLICK_MIN_TRAVEL;
}

// Something between the touch point and the swipe element that would itself
// scroll back towards the start (a list scrolled down, a chip row scrolled
// right) owns the gesture — the swipe only takes over once it is at its edge.
function innerScrollerOwns(target: HTMLElement, root: HTMLElement, axis: Axis): boolean {
  for (let n: HTMLElement | null = target; n && n !== root; n = n.parentElement) {
    if (axis === 'y' ? n.scrollTop > 0 : n.scrollLeft > 0) {
      const style = getComputedStyle(n);
      const overflow = axis === 'y' ? style.overflowY : style.overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
  }
  return false;
}

export function useSwipeDismiss({ axis, onDismiss, enabled = true }: Options): SwipeDismiss {
  const offset = useMotionValue(0);
  const elRef = useRef<HTMLElement | null>(null);
  const onDismissRef = useRef(onDismiss);
  const enabledRef = useRef(enabled);
  useEffect(() => { onDismissRef.current = onDismiss; enabledRef.current = enabled; });

  const listenersRef = useRef<(() => void) | null>(null);

  const attach = useCallback((el: HTMLElement) => {
    // Nested swipe layers (a sheet opened inside a panel) are DOM children of
    // the outer one, so their touches bubble here too — each layer only handles
    // touches that start inside itself and not inside a layer nested in it.
    el.setAttribute('data-swipe-layer', '');

    let state: 'idle' | 'pending' | 'dragging' | 'ignored' = 'idle';
    let startX = 0, startY = 0, lockAt = 0;
    let samples: { t: number; v: number }[] = [];
    let anim: { stop: () => void } | null = null;
    let closing = false;   // committed to a dismiss — no grabbing it back mid-exit

    const along = (x: number, y: number) => (axis === 'x' ? x - startX : y - startY);
    const across = (x: number, y: number) => (axis === 'x' ? y - startY : x - startX);

    function begin(x: number, y: number, target: EventTarget | null): boolean {
      state = 'idle';
      if (closing || !enabledRef.current || !(target instanceof HTMLElement)) return false;
      if (target.closest('[data-swipe-layer]') !== el) return false;
      // Text entry keeps its own selection gestures; maps and sliders their own drags.
      if (target.closest('input, textarea, select, [contenteditable="true"], .maplibregl-map, [data-no-swipe]')) return false;
      if (innerScrollerOwns(target, el, axis)) return false;
      anim?.stop();
      anim = null;
      startX = x; startY = y;
      samples = [];
      state = 'pending';
      return true;
    }

    // Returns true when the gesture is (now) ours, so the caller can claim it.
    function move(x: number, y: number): boolean {
      if (state === 'pending') {
        const a = along(x, y), c = across(x, y);
        if (Math.max(Math.abs(a), Math.abs(c)) < SLOP) {
          // Still undecided. Report "ours" for a move already heading the
          // dismiss way so the browser can't claim it for an overscroll bounce.
          return a > 0 && Math.abs(a) >= Math.abs(c);
        }
        if (a > 0 && Math.abs(a) > Math.abs(c) * 1.2) {
          state = 'dragging';
          lockAt = a;
          el.style.userSelect = 'none';
        } else {
          state = 'ignored';
          return false;
        }
      }
      if (state !== 'dragging') return false;
      const raw = along(x, y) - lockAt;
      // Past the start the element resists instead of stopping dead.
      const v = raw >= 0 ? raw : raw / 4;
      offset.set(v);
      const t = performance.now();
      samples.push({ t, v });
      while (samples.length > 2 && t - samples[0].t > 100) samples.shift();
      return true;
    }

    function end(cancelled: boolean) {
      const wasDragging = state === 'dragging';
      state = 'idle';
      if (!wasDragging) return;
      el.style.userSelect = '';
      const rect = el.getBoundingClientRect();
      const size = axis === 'x' ? rect.width : rect.height;
      const current = offset.get();
      let velocity = 0;
      if (samples.length >= 2) {
        const first = samples[0], last = samples[samples.length - 1];
        const dt = last.t - first.t;
        if (dt > 0) velocity = ((last.v - first.v) / dt) * 1000;
      }
      if (!cancelled && shouldDismiss(current, velocity, size)) {
        // Finish the throw at the speed it was thrown, so a flick doesn't
        // suddenly slow down and a slow drag doesn't suddenly snap.
        const remaining = Math.max(0, size - current);
        const duration = Math.min(0.28, Math.max(0.12, velocity > 0 ? remaining / velocity : 0.24));
        closing = true;
        anim = animate(offset, size, { type: 'tween', ease: 'easeOut', duration });
        void Promise.resolve(anim).then(() => onDismissRef.current());
      } else {
        anim = animate(offset, 0, { type: 'spring', stiffness: 520, damping: 42, velocity });
      }
      // A mouse drag still ends in a click on whatever is under the cursor —
      // swallow that one so releasing a cancelled swipe doesn't open a row.
      const swallow = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    }

    // ── Touch ───────────────────────────────────────────────────────────────
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { if (state === 'dragging') end(true); state = 'idle'; return; }
      const t = e.touches[0];
      begin(t.clientX, t.clientY, e.target);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (state !== 'pending' && state !== 'dragging') return;
      const t = e.touches[0];
      if (!t) return;
      if (move(t.clientX, t.clientY) && e.cancelable) e.preventDefault();
    };
    const onTouchEnd = () => end(false);
    const onTouchCancel = () => end(true);

    // ── Mouse (desktop / devtools) — touch is handled above ──────────────────
    const onMouseMove = (e: PointerEvent) => { if (move(e.clientX, e.clientY)) e.preventDefault(); };
    const onMouseUp = () => {
      window.removeEventListener('pointermove', onMouseMove);
      window.removeEventListener('pointerup', onMouseUp);
      window.removeEventListener('pointercancel', onMouseUp);
      end(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (!begin(e.clientX, e.clientY, e.target)) return;
      window.addEventListener('pointermove', onMouseMove);
      window.addEventListener('pointerup', onMouseUp);
      window.addEventListener('pointercancel', onMouseUp);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchCancel);
    el.addEventListener('pointerdown', onPointerDown);

    return () => {
      anim?.stop();
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
      el.removeEventListener('pointerdown', onPointerDown);
      onMouseUp();
    };
  }, [axis, offset]);

  const attachEl = useCallback((el: HTMLElement | null) => {
    if (elRef.current === el) return;
    listenersRef.current?.();
    listenersRef.current = null;
    elRef.current = el;
    if (el) listenersRef.current = attach(el);
  }, [attach]);

  // Unmount safety for the callback-ref teardown above.
  useEffect(() => () => { listenersRef.current?.(); listenersRef.current = null; }, []);

  return { attach: attachEl, offset };
}
