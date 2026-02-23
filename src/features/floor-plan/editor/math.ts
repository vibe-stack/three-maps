import type { FloorPlanElement } from '@/stores/floor-plan-store';
import type { Vec2 } from './types';

export const rotatePoint = (point: Vec2, center: Vec2, angle: number): Vec2 => {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return { x: center.x + (x * c - y * s), y: center.y + (x * s + y * c) };
};

export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export const centerOfSelection = (elements: FloorPlanElement[]): Vec2 => {
  if (elements.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const el of elements) {
    if (el.shape === 'line' && typeof el.x2 === 'number' && typeof el.y2 === 'number') {
      sx += (el.x + el.x2) * 0.5;
      sy += (el.y + el.y2) * 0.5;
    } else {
      sx += el.x;
      sy += el.y;
    }
  }
  return { x: sx / elements.length, y: sy / elements.length };
};

export const polygonCentroid = (points: Vec2[]): Vec2 => {
  if (points.length === 0) return { x: 0, y: 0 };
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    area += cross;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
  }
  if (Math.abs(area) < 1e-6) {
    let sx = 0;
    let sy = 0;
    for (const p of points) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / points.length, y: sy / points.length };
  }
  const f = 1 / (3 * area);
  return { x: cx * f, y: cy * f };
};

export const pointInPolygon = (point: Vec2, points: Vec2[]): boolean => {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-8) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};
