import type { FloorPlanElement } from '@/stores/floor-plan-store';

type Vec2 = { x: number; y: number };

const len2 = (v: Vec2) => v.x * v.x + v.y * v.y;
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

const projectParam = (a: Vec2, b: Vec2, p: Vec2): number => {
  const ab = sub(b, a);
  const denom = Math.max(1e-8, len2(ab));
  return dot(sub(p, a), ab) / denom;
};

const pointAt = (a: Vec2, b: Vec2, t: number): Vec2 => add(a, mul(sub(b, a), t));

const pointToSegmentDistance = (a: Vec2, b: Vec2, p: Vec2): number => {
  const t = Math.max(0, Math.min(1, projectParam(a, b, p)));
  return dist(pointAt(a, b, t), p);
};

export function placeOpeningOnWall(
  elements: FloorPlanElement[],
  opening: FloorPlanElement,
  zoom: number,
): FloorPlanElement[] {
  if (opening.shape !== 'line' || typeof opening.x2 !== 'number' || typeof opening.y2 !== 'number') {
    return elements;
  }

  const oa = { x: opening.x, y: opening.y };
  const ob = { x: opening.x2, y: opening.y2 };
  const openingLength = dist(oa, ob);
  if (openingLength < 1e-4) return elements;

  const openingCenter = { x: (oa.x + ob.x) * 0.5, y: (oa.y + ob.y) * 0.5 };

  let bestWall: FloorPlanElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const el of elements) {
    if (el.type !== 'wall' || el.shape !== 'line' || typeof el.x2 !== 'number' || typeof el.y2 !== 'number') continue;
    const wa = { x: el.x, y: el.y };
    const wb = { x: el.x2, y: el.y2 };
    const wallLength = dist(wa, wb);
    if (wallLength < 1e-4 || openingLength > wallLength + 1e-3) continue;

    const centerDist = pointToSegmentDistance(wa, wb, openingCenter);
    const threshold = Math.max(0.08, 16 / Math.max(1, zoom));
    if (centerDist > threshold) continue;

    const t1 = projectParam(wa, wb, oa);
    const t2 = projectParam(wa, wb, ob);
    const tMin = Math.min(t1, t2);
    const tMax = Math.max(t1, t2);

    if (tMax < 0.02 || tMin > 0.98) continue;

    const clampedMin = Math.max(0, Math.min(1, tMin));
    const clampedMax = Math.max(0, Math.min(1, tMax));
    const score = centerDist + Math.abs((clampedMax - clampedMin) * wallLength - openingLength) * 0.15;

    if (score < bestScore) {
      bestScore = score;
      bestWall = el;
    }
  }

  if (!bestWall || typeof bestWall.x2 !== 'number' || typeof bestWall.y2 !== 'number') {
    return [...elements, opening];
  }

  const wa = { x: bestWall.x, y: bestWall.y };
  const wb = { x: bestWall.x2, y: bestWall.y2 };

  const t1 = Math.max(0, Math.min(1, projectParam(wa, wb, oa)));
  const t2 = Math.max(0, Math.min(1, projectParam(wa, wb, ob)));
  const tMin = Math.min(t1, t2);
  const tMax = Math.max(t1, t2);

  const splitPad = Math.min(0.01, (tMax - tMin) * 0.1);
  const openA = pointAt(wa, wb, Math.max(0, tMin + splitPad));
  const openB = pointAt(wa, wb, Math.min(1, tMax - splitPad));

  const out: FloorPlanElement[] = [];
  for (const el of elements) {
    if (el.id !== bestWall.id) out.push(el);
  }

  if (tMin > 0.01) {
    out.push({
      ...bestWall,
      id: crypto.randomUUID(),
      x: wa.x,
      y: wa.y,
      x2: openA.x,
      y2: openA.y,
    });
  }

  if (tMax < 0.99) {
    out.push({
      ...bestWall,
      id: crypto.randomUUID(),
      x: openB.x,
      y: openB.y,
      x2: wb.x,
      y2: wb.y,
    });
  }

  out.push({
    ...opening,
    x: openA.x,
    y: openA.y,
    x2: openB.x,
    y2: openB.y,
  });

  return out;
}
