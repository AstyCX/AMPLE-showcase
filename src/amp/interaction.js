import * as THREE from 'three';
import { FACE_FRONT_Z, JEWEL_IDS, JEWEL_X, JEWEL_Y, KNOB_X, KNOB_Y, POWER } from './layout.js';

const DRAG_PX = 220;
const WHEEL_STEP = 0.02;
const WHEEL_RELEASE_MS = 260;
const PAGE_SCROLL_GRACE_MS = 450;

export function attachInteraction(o) {
  const { canvas, camera } = o;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();
  let drag = null;
  let press = null;
  let wheel = null;
  let lastPageWheel = -1e9;

  function planePoint(clientX, clientY, z) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const { origin: p, direction: d } = ray.ray;
    if (Math.abs(d.z) < 1e-6) return null;
    const t = (z - p.z) / d.z;
    return t > 0 ? hitPoint.copy(d).multiplyScalar(t).add(p) : null;
  }

  function hitTest(clientX, clientY, coarse) {
    const grow = coarse ? 1.35 : 1;
    let best = null;
    for (const [z, radius] of [[FACE_FRONT_Z + 2.65, 1.25], [FACE_FRONT_Z + 1.4, 1.85]]) {
      const p = planePoint(clientX, clientY, z);
      if (!p) continue;
      KNOB_X.forEach((x, index) => {
        const d = Math.hypot(p.x - x, p.y - KNOB_Y);
        if (d < radius * grow && (!best || d < best.d)) best = { type: 'knob', index, d };
      });
      if (best) return best;
    }
    const p = planePoint(clientX, clientY, FACE_FRONT_Z + 0.3);
    if (!p) return null;
    for (let i = 0; i < JEWEL_X.length; i++) {
      if (Math.hypot(p.x - JEWEL_X[i], p.y - JEWEL_Y) < 0.75 * grow) return { type: 'jewel', id: JEWEL_IDS[i] };
    }
    if (Math.abs(p.x - POWER.x) < 0.95 * grow && p.y > POWER.y - 1.5 * grow && p.y < POWER.pilotY + 0.7 * grow) {
      return { type: 'power' };
    }
    return null;
  }

  const coarse = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';

  function onPointerDown(e) {
    o.onInteract();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (drag) return;
    const hit = hitTest(e.clientX, e.clientY, coarse(e));
    if (!hit) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (hit.type === 'knob') {
      endWheel();
      drag = { id: e.pointerId, index: hit.index, value: o.getKnobs()[hit.index], x: e.clientX, y: e.clientY };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
      }
      canvas.style.cursor = 'grabbing';
      o.onDragStart(hit.index);
    } else {
      press = { id: e.pointerId, hit, x: e.clientX, y: e.clientY };
    }
  }

  function onTouchStart(e) {
    if (drag || press) e.preventDefault();
  }

  function onPointerMove(e) {
    if (drag && e.pointerId === drag.id) {
      const fine = e.shiftKey ? 0.25 : 1;
      const dv = ((drag.y - e.clientY + (e.clientX - drag.x)) / DRAG_PX) * fine;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (dv) {
        drag.value = Math.min(1, Math.max(0, drag.value + dv));
        o.onKnobInput(drag.index, drag.value);
      }
      return;
    }
    if (e.pointerType === 'mouse' && !e.buttons) {
      const hit = hitTest(e.clientX, e.clientY, false);
      canvas.style.cursor = hit ? (hit.type === 'knob' ? 'grab' : 'pointer') : '';
      o.onHover(hit);
    }
  }

  function endDrag() {
    if (!drag) return;
    const { index, value, id } = drag;
    drag = null;
    try {
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    } catch {
    }
    canvas.style.cursor = '';
    o.onKnobRelease(index, value);
  }

  function onPointerUp(e) {
    if (drag && e.pointerId === drag.id) {
      endDrag();
      return;
    }
    if (press && e.pointerId === press.id) {
      const { hit, x, y } = press;
      press = null;
      if (e.type !== 'pointerup' || Math.hypot(e.clientX - x, e.clientY - y) > 12) return;
      const again = hitTest(e.clientX, e.clientY, coarse(e));
      if (!again || again.type !== hit.type || again.id !== hit.id) return;
      if (hit.type === 'jewel') o.onChannel(hit.id);
      else if (hit.type === 'power') o.onPower();
    }
  }

  function endWheel() {
    if (!wheel) return;
    clearTimeout(wheel.timer);
    const { index, value } = wheel;
    wheel = null;
    o.onKnobRelease(index, value);
  }

  function onWheel(e) {
    if (e.ctrlKey) return;
    const now = performance.now();
    if (!wheel) {
      const hit = drag ? null : hitTest(e.clientX, e.clientY, false);
      if (!hit || hit.type !== 'knob' || now - lastPageWheel < PAGE_SCROLL_GRACE_MS) {
        lastPageWheel = now;
        e.stopImmediatePropagation();
        return;
      }
      wheel = { index: hit.index, value: o.getKnobs()[hit.index], timer: 0 };
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    o.onInteract();
    const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    let dv = Math.max(-3 * WHEEL_STEP, Math.min(3 * WHEEL_STEP, (-px / 100) * WHEEL_STEP));
    if (e.shiftKey) dv /= 4;
    wheel.value = Math.min(1, Math.max(0, wheel.value + dv));
    o.onKnobInput(wheel.index, wheel.value);
    clearTimeout(wheel.timer);
    wheel.timer = setTimeout(endWheel, WHEEL_RELEASE_MS);
  }

  function onLostCapture(e) {
    if (drag && e.pointerId === drag.id) endDrag();
  }

  function onLeave() {
    if (!drag) {
      canvas.style.cursor = '';
      o.onHover(null);
    }
  }

  const opts = { passive: false };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('lostpointercapture', onLostCapture);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('touchstart', onTouchStart, opts);
  canvas.addEventListener('wheel', onWheel, opts);

  return {
    dragging: () => (drag ? drag.index : wheel ? wheel.index : -1),
    hitTest,
    dispose() {
      clearTimeout(wheel?.timer);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('lostpointercapture', onLostCapture);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('touchstart', onTouchStart, opts);
      canvas.removeEventListener('wheel', onWheel, opts);
    },
  };
}
