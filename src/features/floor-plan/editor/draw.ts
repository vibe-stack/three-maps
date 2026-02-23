import type { FloorPlanElement } from '@/stores/floor-plan-store';
import { dist, pointInPolygon } from './math';
import { strokeForType } from './tools';
import type { Vec2 } from './types';

export const drawMeasure = (
  ctx: CanvasRenderingContext2D,
  a: Vec2,
  b: Vec2,
  label: string,
  color = 'rgba(226,232,240,0.92)'
) => {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const mid = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
  ctx.save();
  ctx.translate(mid.x, mid.y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(15,20,27,0.92)';
  const w = Math.max(40, ctx.measureText(label).width + 10);
  ctx.fillRect(-w * 0.5, -16, w, 14);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, -9);
  ctx.restore();
};

export const computePlanBounds = (elements: FloorPlanElement[]) => {
  if (!elements.length) {
    return { minX: -4, maxX: 4, minY: -4, maxY: 4, width: 8, height: 8, centerX: 0, centerY: 0 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const el of elements) {
    if (el.type === 'text') continue;

    if (el.shape === 'polygon' && el.points?.length) {
      for (const p of el.points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      continue;
    }

    if (el.shape === 'line' && typeof el.x2 === 'number' && typeof el.y2 === 'number') {
      minX = Math.min(minX, el.x, el.x2);
      maxX = Math.max(maxX, el.x, el.x2);
      minY = Math.min(minY, el.y, el.y2);
      maxY = Math.max(maxY, el.y, el.y2);
      continue;
    }
    minX = Math.min(minX, el.x - el.width * 0.5);
    maxX = Math.max(maxX, el.x + el.width * 0.5);
    minY = Math.min(minY, el.y - el.height * 0.5);
    maxY = Math.max(maxY, el.y + el.height * 0.5);
  }

  const width = Math.max(0.1, maxX - minX);
  const height = Math.max(0.1, maxY - minY);
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  return { minX, maxX, minY, maxY, width, height, centerX, centerY };
};

export const drawPlanElement = (
  ctx: CanvasRenderingContext2D,
  el: FloorPlanElement,
  worldToScreen: (p: Vec2) => Vec2,
  zoom: number,
  selected = false,
  withMeasures = false,
) => {
  const color = strokeForType(el);
  ctx.save();
  ctx.strokeStyle = selected ? '#f59e0b' : color;
  ctx.fillStyle = selected ? '#f59e0b' : color;
  ctx.lineWidth = selected ? 2 : 1.5;

  if (el.type === 'text') {
    const p = worldToScreen({ x: el.x, y: el.y });
    ctx.font = `${Math.max(12, el.height * zoom * 0.75)}px ui-sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(el.text || '', p.x, p.y);
    ctx.restore();
    return;
  }

  if (el.shape === 'polygon' && el.points && el.points.length >= 3) {
    const pts = el.points.map(worldToScreen);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (el.nonStructural) {
      ctx.globalAlpha = selected ? 0.3 : 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (el.shape === 'line' && typeof el.x2 === 'number' && typeof el.y2 === 'number') {
    const a = worldToScreen({ x: el.x, y: el.y });
    const b = worldToScreen({ x: el.x2, y: el.y2 });
    ctx.lineWidth = Math.max(1.5, el.height * zoom * 0.6);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    if (withMeasures && !el.nonStructural) drawMeasure(ctx, a, b, `${Math.hypot(el.x2 - el.x, el.y2 - el.y).toFixed(2)}m`);
    ctx.restore();
    return;
  }

  const c = worldToScreen({ x: el.x, y: el.y });
  ctx.translate(c.x, c.y);
  ctx.rotate(el.rotation);
  const w = el.width * zoom;
  const h = el.height * zoom;
  if (el.shape === 'circle') {
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.abs(w * 0.5), Math.abs(h * 0.5), 0, 0, Math.PI * 2);
    if (el.nonStructural) {
      ctx.globalAlpha = selected ? 0.32 : 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (el.nonStructural) {
    ctx.globalAlpha = selected ? 0.3 : 0.18;
    ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
    ctx.globalAlpha = 1;
  }

  ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
  if (el.type === 'stairs' || el.type === 'stairs-closed') {
    const steps = 6;
    for (let i = 1; i < steps; i++) {
      const y = -h * 0.5 + (i / steps) * h;
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, y);
      ctx.lineTo(w * 0.5, y);
      ctx.stroke();
    }
    if (el.type === 'stairs-closed') {
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.5);
      ctx.lineTo(0, h * 0.5);
      ctx.stroke();
    }
  }
  if (el.type === 'slope') {
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, h * 0.5);
    ctx.lineTo(w * 0.5, -h * 0.5);
    ctx.stroke();
  }

  const dir = el.type === 'slope' ? -1 : 1;
  if (el.type === 'stairs' || el.type === 'stairs-closed' || el.type === 'slope') {
    const y0 = -dir * h * 0.22;
    const y1 = dir * h * 0.22;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(0, y1);
    ctx.lineTo(-w * 0.08, y1 - dir * h * 0.08);
    ctx.moveTo(0, y1);
    ctx.lineTo(w * 0.08, y1 - dir * h * 0.08);
    ctx.stroke();
  }

  if (el.type === 'spawn') {
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, 0);
    ctx.lineTo(w * 0.3, 0);
    ctx.moveTo(0, -h * 0.3);
    ctx.lineTo(0, h * 0.3);
    ctx.stroke();
  }

  if (el.type === 'poi') {
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(w, h) * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  if (withMeasures && !el.nonStructural) {
    drawMeasure(
      ctx,
      { x: -w * 0.5, y: h * 0.6 },
      { x: w * 0.5, y: h * 0.6 },
      `${el.width.toFixed(2)}m`
    );
  }
  ctx.restore();
};

export const elementHitTest = (el: FloorPlanElement, world: Vec2, threshold: number): number | null => {
  if (el.type === 'text') {
    const halfW = Math.max(0.4, el.width * 0.5 + threshold);
    const halfH = Math.max(0.2, el.height * 0.6 + threshold);
    const inside = world.x >= el.x && world.x <= el.x + halfW * 2 && world.y <= el.y && world.y >= el.y - halfH * 2;
    return inside ? Math.hypot(world.x - el.x, world.y - el.y) : null;
  }

  if (el.shape === 'polygon' && el.points && el.points.length >= 3) {
    if (pointInPolygon(world, el.points)) return 0;
    let minD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < el.points.length; i++) {
      const a = el.points[i];
      const b = el.points[(i + 1) % el.points.length];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const apx = world.x - a.x;
      const apy = world.y - a.y;
      const denom = Math.max(1e-6, abx * abx + aby * aby);
      const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom));
      const px = a.x + abx * t;
      const py = a.y + aby * t;
      minD = Math.min(minD, Math.hypot(world.x - px, world.y - py));
    }
    return minD <= threshold ? minD : null;
  }

  if (el.shape === 'line' && typeof el.x2 === 'number' && typeof el.y2 === 'number') {
    const ax = el.x;
    const ay = el.y;
    const bx = el.x2;
    const by = el.y2;
    const abx = bx - ax;
    const aby = by - ay;
    const apx = world.x - ax;
    const apy = world.y - ay;
    const denom = Math.max(1e-6, abx * abx + aby * aby);
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom));
    const px = ax + abx * t;
    const py = ay + aby * t;
    const d = Math.hypot(world.x - px, world.y - py);
    return d <= threshold ? d : null;
  }

  const localX = world.x - el.x;
  const localY = world.y - el.y;
  const c = Math.cos(-el.rotation);
  const s = Math.sin(-el.rotation);
  const rx = localX * c - localY * s;
  const ry = localX * s + localY * c;

  if (el.shape === 'circle') {
    const nx = rx / Math.max(1e-6, el.width * 0.5 + threshold);
    const ny = ry / Math.max(1e-6, el.height * 0.5 + threshold);
    return nx * nx + ny * ny <= 1 ? Math.hypot(rx, ry) : null;
  }

  const inside = Math.abs(rx) <= el.width * 0.5 + threshold && Math.abs(ry) <= el.height * 0.5 + threshold;
  return inside ? Math.hypot(rx, ry) : null;
};

export const renderTexture = async (elements: FloorPlanElement[]): Promise<Blob | null> => {
  const bounds = computePlanBounds(elements);
  const spanX = Math.max(0.1, bounds.width);
  const spanY = Math.max(0.1, bounds.height);
  const maxDim = 2048;

  const canvas = document.createElement('canvas');
  if (spanX >= spanY) {
    canvas.width = maxDim;
    canvas.height = Math.max(1, Math.round(maxDim * (spanY / spanX)));
  } else {
    canvas.height = maxDim;
    canvas.width = Math.max(1, Math.round(maxDim * (spanX / spanY)));
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0b0e13';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scaleX = canvas.width / spanX;
  const scaleY = canvas.height / spanY;
  const toPx = (p: Vec2): Vec2 => ({
    x: (p.x - bounds.minX) * scaleX,
    y: (p.y - bounds.minY) * scaleY,
  });

  ctx.strokeStyle = 'rgba(148,163,184,0.18)';
  ctx.lineWidth = 1;
  for (let i = -100; i <= 100; i++) {
    const a = toPx({ x: i, y: -100 });
    const b = toPx({ x: i, y: 100 });
    const c = toPx({ x: -100, y: i });
    const d = toPx({ x: 100, y: i });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
  }

  for (const el of elements) {
    drawPlanElement(ctx, el, toPx, Math.min(scaleX, scaleY), false, false);
  }

  return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
};
