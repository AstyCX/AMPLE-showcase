import { COPY } from '../../copy.js';

export const BODY = { w: 62, h: 27, d: 25 };
export const BODY_BASE = { halfW: 28.8, halfH: 11.3 };
export const FLOOR_Y = -14.7;

export const FACEPLATE = { w: 58.6, h: 8.6, r: 0.6, depth: 0.35, bevel: 0.1, x: 0, y: 7.6, z: 12.0 };
export const FACE_FRONT_Z = FACEPLATE.z + FACEPLATE.depth + FACEPLATE.bevel;
export const GRILLE = { w: 58.6, h: 14.6, x: 0, y: -4.5, z: 12.15 };

export const KNOB_X = [-20, -13.2, -6.4, 0.4, 7.2, 14.0];
export const KNOB_Y = 7.2;
export const KNOB_SWEEP_DEG = 150;
export const SCALE = { tickR: 2.3, numeralR: 2.85, markerR: 2.55, markerSpread: 0.25 };

export const JEWEL_X = [20.2, 22.6, 25.0];
export const JEWEL_Y = 7.0;
export const JEWEL_IDS = ['moderate', 'high_gain', 'extreme'];
export const JEWEL_LABELS = COPY.amp.jewels;
export const JACK = { x: -26, y: 7.2 };
export const POWER = { x: 27.6, y: 6.6, pilotY: 9.6 };

export const BADGE = { w: 13, h: 3.2, x: -18, y: -4.5, z: 12.25 };
export const SPRIG = { from: [-10, -8, 12.7], to: [-1, -1.5, 12.7] };

export function knobAngle(value) {
  return ((KNOB_SWEEP_DEG - 2 * KNOB_SWEEP_DEG * value) * Math.PI) / 180;
}

export function scalePoint(index, value, r) {
  const a = ((-KNOB_SWEEP_DEG + 2 * KNOB_SWEEP_DEG * value) * Math.PI) / 180;
  return [KNOB_X[index] + r * Math.sin(a), KNOB_Y + r * Math.cos(a)];
}
