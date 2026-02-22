"use client";

import React from 'react';
import {
  Circle,
  Square,
  Type,
  Move,
  Grid3X3,
  Magnet,
  ScanLine,
  DoorOpen,
  Blinds,
  Route,
  PanelTop,
  Save,
  X,
} from 'lucide-react';
import { ensureFileIdForBlob } from '@/stores/files-store';
import { FloorPlanElement, FloorPlanTool, useFloorPlanStore } from '@/stores/floor-plan-store';
import { BRUSH_REGISTRY } from '@/features/quick-brush/brushes/registry';
import { DragInput } from '@/components/drag-input';

type Vec2 = { x: number; y: number };

type ActiveTransform = {
  mode: 'move' | 'rotate' | 'scale';
  axis: 'xy' | 'x' | 'y';
  startMouse: Vec2;
  origin: Vec2;
  originals: Map<string, FloorPlanElement>;
};

type DragCreate = {
  tool: Exclude<FloorPlanTool, 'select' | 'wall' | 'text'>;
  start: Vec2;
  current: Vec2;
};

type PendingText = {
  position: Vec2;
  value: string;
};

const brushIconById = new Map(BRUSH_REGISTRY.map((b) => [b.id, b.icon]));

const TOOL_LIST: Array<{ id: FloorPlanTool; label: string; icon: React.ReactNode }> = [
  { id: 'select', label: 'Select', icon: brushIconById.get('select') ?? <Move className="w-4 h-4" /> },
  { id: 'wall', label: 'Walls', icon: brushIconById.get('polygon') ?? <ScanLine className="w-4 h-4" /> },
  { id: 'door', label: 'Doors', icon: brushIconById.get('door') ?? <DoorOpen className="w-4 h-4" /> },
  { id: 'pillar-circle', label: 'Pillar C', icon: brushIconById.get('cylinder') ?? <Circle className="w-4 h-4" /> },
  { id: 'pillar-rect', label: 'Pillar R', icon: brushIconById.get('cube') ?? <Square className="w-4 h-4" /> },
  { id: 'stairs', label: 'Stairs', icon: brushIconById.get('stairs') ?? <PanelTop className="w-4 h-4" /> },
  { id: 'stairs-closed', label: 'Stairs C', icon: brushIconById.get('closed-stairs') ?? <PanelTop className="w-4 h-4" /> },
  { id: 'slope', label: 'Slope', icon: brushIconById.get('slope') ?? <Route className="w-4 h-4" /> },
  { id: 'arch', label: 'Arch', icon: brushIconById.get('arch') ?? <Route className="w-4 h-4" /> },
  { id: 'window', label: 'Window', icon: <Blinds className="w-4 h-4" /> },
  { id: 'text', label: 'Text', icon: <Type className="w-4 h-4" /> },
];

const strokeForType = (type: FloorPlanElement['type']) => {
  switch (type) {
    case 'wall': return '#e5e7eb';
    case 'door': return '#f59e0b';
    case 'window': return '#60a5fa';
    case 'arch': return '#c084fc';
    case 'stairs': return '#34d399';
    case 'stairs-closed': return '#10b981';
    case 'slope': return '#f472b6';
    case 'text': return '#e2e8f0';
    case 'pillar-circle':
    case 'pillar-rect':
      return '#fb7185';
    default:
      return '#e5e7eb';
  }
};

const elementDefaults = (tool: Exclude<FloorPlanTool, 'select' | 'wall' | 'text'>) => {
  switch (tool) {
    case 'door': return { w: 1, h: 0.2, shape: 'line' as const };
    case 'window': return { w: 1, h: 0.2, shape: 'line' as const };
    case 'arch': return { w: 1.4, h: 0.25, shape: 'line' as const };
    case 'pillar-circle': return { w: 0.8, h: 0.8, shape: 'circle' as const };
    case 'pillar-rect': return { w: 0.8, h: 0.8, shape: 'rect' as const };
    case 'stairs': return { w: 2, h: 1.2, shape: 'rect' as const };
    case 'stairs-closed': return { w: 2, h: 1.2, shape: 'rect' as const };
    case 'slope': return { w: 2.2, h: 1.4, shape: 'rect' as const };
    default: return { w: 1, h: 1, shape: 'rect' as const };
  }
};

const rotatePoint = (point: Vec2, center: Vec2, angle: number): Vec2 => {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return { x: center.x + (x * c - y * s), y: center.y + (x * s + y * c) };
};

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

const centerOfSelection = (elements: FloorPlanElement[]): Vec2 => {
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

const drawMeasure = (
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

const computePlanBounds = (elements: FloorPlanElement[]) => {
  if (!elements.length) {
    return { minX: -4, maxX: 4, minY: -4, maxY: 4, width: 8, height: 8 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const el of elements) {
    if (el.type === 'text') {
      minX = Math.min(minX, el.x - 0.5);
      maxX = Math.max(maxX, el.x + 0.5);
      minY = Math.min(minY, el.y - 0.2);
      maxY = Math.max(maxY, el.y + 0.2);
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
  return { minX, maxX, minY, maxY, width, height };
};

const serializeDraft = (draft: NonNullable<ReturnType<typeof useFloorPlanStore.getState>['draft']>) => JSON.stringify({
  gridSize: draft.gridSize,
  snapEnabled: draft.snapEnabled,
  planeWidth: draft.planeWidth,
  planeHeight: draft.planeHeight,
  elements: draft.elements,
});

const renderTexture = async (elements: FloorPlanElement[]): Promise<Blob | null> => {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0b0e13';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let minX = -10;
  let maxX = 10;
  let minY = -10;
  let maxY = 10;

  if (elements.length > 0) {
    minX = Number.POSITIVE_INFINITY;
    maxX = Number.NEGATIVE_INFINITY;
    minY = Number.POSITIVE_INFINITY;
    maxY = Number.NEGATIVE_INFINITY;
    for (const el of elements) {
      if (el.shape === 'line' && typeof el.x2 === 'number' && typeof el.y2 === 'number') {
        minX = Math.min(minX, el.x, el.x2);
        maxX = Math.max(maxX, el.x, el.x2);
        minY = Math.min(minY, el.y, el.y2);
        maxY = Math.max(maxY, el.y, el.y2);
      } else {
        minX = Math.min(minX, el.x - el.width * 0.5);
        maxX = Math.max(maxX, el.x + el.width * 0.5);
        minY = Math.min(minY, el.y - el.height * 0.5);
        maxY = Math.max(maxY, el.y + el.height * 0.5);
      }
    }
    const pad = 2;
    minX -= pad;
    maxX += pad;
    minY -= pad;
    maxY += pad;
  }

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min(canvas.width / spanX, canvas.height / spanY) * 0.92;
  const ox = canvas.width * 0.5 - ((minX + maxX) * 0.5) * scale;
  const oy = canvas.height * 0.5 - ((minY + maxY) * 0.5) * scale;

  const toPx = (p: Vec2): Vec2 => ({ x: ox + p.x * scale, y: oy + p.y * scale });

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
    ctx.strokeStyle = strokeForType(el.type);
    ctx.fillStyle = strokeForType(el.type);
    if (el.type === 'text') {
      const p = toPx({ x: el.x, y: el.y });
      ctx.font = `${Math.max(16, el.height * scale * 0.8)}px ui-sans-serif`;
      ctx.fillText(el.text || '', p.x, p.y);
      continue;
    }
    if (el.shape === 'line' && typeof el.x2 === 'number' && typeof el.y2 === 'number') {
      const a = toPx({ x: el.x, y: el.y });
      const b = toPx({ x: el.x2, y: el.y2 });
      ctx.lineWidth = Math.max(1.5, el.height * scale);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      continue;
    }

    const center = toPx({ x: el.x, y: el.y });
    const w = Math.max(2, el.width * scale);
    const h = Math.max(2, el.height * scale);
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(el.rotation);
    if (el.shape === 'circle') {
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
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
    }
    ctx.restore();
  }

  return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
};

const FloorPlanEditor: React.FC = () => {
  const open = useFloorPlanStore((s) => s.open);
  const draft = useFloorPlanStore((s) => s.draft);
  const updateDraft = useFloorPlanStore((s) => s.updateDraft);
  const cancelDraft = useFloorPlanStore((s) => s.cancelDraft);
  const saveDraft = useFloorPlanStore((s) => s.saveDraft);

  const [tool, setTool] = React.useState<FloorPlanTool>('select');
  const [pan, setPan] = React.useState<Vec2>({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(54);
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [dragCreate, setDragCreate] = React.useState<DragCreate | null>(null);
  const [wallChain, setWallChain] = React.useState<{ first: Vec2; last: Vec2; count: number } | null>(null);
  const [wallPreview, setWallPreview] = React.useState<Vec2 | null>(null);
  const [transform, setTransform] = React.useState<ActiveTransform | null>(null);
  const [spacePanning, setSpacePanning] = React.useState(false);
  const [pendingText, setPendingText] = React.useState<PendingText | null>(null);
  const [viewSize, setViewSize] = React.useState({ w: 1, h: 1 });

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const textInputRef = React.useRef<HTMLInputElement | null>(null);
  const dprRef = React.useRef(1);
  const lastSizeRef = React.useRef({ w: 0, h: 0, dpr: 0 });
  const isPanningRef = React.useRef(false);
  const panStartRef = React.useRef<Vec2>({ x: 0, y: 0 });
  const panOriginRef = React.useRef<Vec2>({ x: 0, y: 0 });
  const initialDraftSnapshotRef = React.useRef<string | null>(null);
  const panRef = React.useRef(pan);
  const zoomRef = React.useRef(zoom);
  const viewSizeRef = React.useRef(viewSize);

  React.useEffect(() => { panRef.current = pan; }, [pan]);
  React.useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  React.useEffect(() => { viewSizeRef.current = viewSize; }, [viewSize]);

  React.useEffect(() => {
    if (!open || !draft) {
      initialDraftSnapshotRef.current = null;
      return;
    }
    if (!initialDraftSnapshotRef.current) {
      initialDraftSnapshotRef.current = serializeDraft(draft);
    }
  }, [open, draft]);

  const hasUnsavedChanges = !!(draft && initialDraftSnapshotRef.current && serializeDraft(draft) !== initialDraftSnapshotRef.current);

  const elements = draft?.elements ?? [];

  const worldToScreen = React.useCallback((p: Vec2): Vec2 => ({
    x: viewSize.w * 0.5 + pan.x + p.x * zoom,
    y: viewSize.h * 0.5 + pan.y + p.y * zoom,
  }), [viewSize.w, viewSize.h, pan.x, pan.y, zoom]);

  const screenToWorld = React.useCallback((p: Vec2): Vec2 => ({
    x: (p.x - viewSize.w * 0.5 - pan.x) / zoom,
    y: (p.y - viewSize.h * 0.5 - pan.y) / zoom,
  }), [viewSize.w, viewSize.h, pan.x, pan.y, zoom]);

  const snapPoints = React.useMemo<Vec2[]>(() => {
    const points: Vec2[] = [];
    for (const el of elements) {
      if (el.shape === 'line' && typeof el.x2 === 'number' && typeof el.y2 === 'number') {
        points.push({ x: el.x, y: el.y }, { x: el.x2, y: el.y2 });
      } else {
        points.push({ x: el.x, y: el.y });
      }
    }
    if (wallChain) points.push(wallChain.first, wallChain.last);
    return points;
  }, [elements, wallChain]);

  const applySnap = React.useCallback((point: Vec2): Vec2 => {
    if (!draft) return point;
    let out = { ...point };
    if (draft.snapEnabled) {
      const g = Math.max(0.05, draft.gridSize || 0.5);
      out.x = Math.round(out.x / g) * g;
      out.y = Math.round(out.y / g) * g;
    }
    const radius = 14 / zoom;
    for (const p of snapPoints) {
      if (dist(p, out) <= radius) return { ...p };
    }
    return out;
  }, [draft, snapPoints, zoom]);

  const findHit = React.useCallback((world: Vec2): string | null => {
    let hit: { id: string; d: number } | null = null;
    const threshold = 10 / zoom;
    for (const el of elements) {
      if (el.type === 'text') {
        const d = Math.hypot(world.x - el.x, world.y - el.y);
        if (d <= threshold && (!hit || d < hit.d)) hit = { id: el.id, d };
        continue;
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
        if (d <= threshold && (!hit || d < hit.d)) hit = { id: el.id, d };
      } else {
        const local = rotatePoint(world, { x: el.x, y: el.y }, -el.rotation);
        const inside = Math.abs(local.x - el.x) <= el.width * 0.5 + threshold
          && Math.abs(local.y - el.y) <= el.height * 0.5 + threshold;
        if (inside) {
          const d = Math.hypot(local.x - el.x, local.y - el.y);
          if (!hit || d < hit.d) hit = { id: el.id, d };
        }
      }
    }
    return hit?.id ?? null;
  }, [elements, zoom]);

  const startTransform = React.useCallback((mode: ActiveTransform['mode']) => {
    if (!draft || selection.size === 0) return;
    const selectedEls = draft.elements.filter((e) => selection.has(e.id));
    if (!selectedEls.length) return;
    const origin = centerOfSelection(selectedEls);
    const originals = new Map<string, FloorPlanElement>();
    for (const el of selectedEls) originals.set(el.id, { ...el });
    setTransform({ mode, axis: 'xy', startMouse: { x: Number.NaN, y: Number.NaN }, origin, originals });
  }, [draft, selection]);

  React.useEffect(() => {
    if (!pendingText) return;
    textInputRef.current?.focus();
    textInputRef.current?.select();
  }, [pendingText]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!open || !draft) return;
      if (e.key === ' ') setSpacePanning(true);

      const keyLower = e.key.toLowerCase();

      if (pendingText) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setPendingText(null);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          commitPendingText();
        }
        return;
      }

      if (keyLower === 'v') {
        e.preventDefault();
        setTool('select');
        return;
      }

      if (/^[1-9]$/.test(keyLower)) {
        const idx = Number(keyLower);
        const target = TOOL_LIST[idx]?.id;
        if (target) {
          e.preventDefault();
          setTool(target);
          return;
        }
      }

      if (keyLower === 'delete' || keyLower === 'backspace') {
        if (selection.size > 0) {
          e.preventDefault();
          clearSelected();
          return;
        }
      }

      if ((e.key === 'g' || e.key === 'G') && selection.size > 0 && !transform) {
        e.preventDefault();
        startTransform('move');
      } else if ((e.key === 'r' || e.key === 'R') && selection.size > 0 && !transform) {
        e.preventDefault();
        startTransform('rotate');
      } else if ((e.key === 's' || e.key === 'S') && selection.size > 0 && !transform) {
        e.preventDefault();
        startTransform('scale');
      } else if ((e.key === 'x' || e.key === 'X') && transform) {
        e.preventDefault();
        setTransform((prev) => prev ? { ...prev, axis: 'x' } : prev);
      } else if ((e.key === 'y' || e.key === 'Y') && transform) {
        e.preventDefault();
        setTransform((prev) => prev ? { ...prev, axis: 'y' } : prev);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (transform) {
          updateDraft((d) => {
            d.elements = d.elements.map((el) => transform.originals.get(el.id) ?? el);
          });
          setTransform(null);
        } else if (wallChain) {
          setWallChain(null);
          setWallPreview(null);
        } else {
          if (hasUnsavedChanges) {
            const ok = window.confirm('Discard unsaved floor plan changes?');
            if (!ok) return;
          }
          cancelDraft();
        }
      } else if (e.key === 'Enter' && wallChain) {
        e.preventDefault();
        setWallChain(null);
        setWallPreview(null);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpacePanning(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [open, draft, selection.size, transform, wallChain, updateDraft, cancelDraft, startTransform, pendingText, hasUnsavedChanges]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!open || !canvas || !container || !draft) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      if (w < 2 || h < 2) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const prev = lastSizeRef.current;
      if (prev.w === w && prev.h === h && prev.dpr === dpr) return;

      lastSizeRef.current = { w, h, dpr };
      dprRef.current = dpr;
      setViewSize((curr) => (curr.w === w && curr.h === h ? curr : { w, h }));

      const pixelW = Math.max(1, Math.floor(w * dpr));
      const pixelH = Math.max(1, Math.floor(h * dpr));
      if (canvas.width !== pixelW) canvas.width = pixelW;
      if (canvas.height !== pixelH) canvas.height = pixelH;
      const sw = `${w}px`;
      const sh = `${h}px`;
      if (canvas.style.width !== sw) canvas.style.width = sw;
      if (canvas.style.height !== sh) canvas.style.height = sh;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [open, draft]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!open || !canvas) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const pos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const currentPan = panRef.current;
      const currentZoom = zoomRef.current;
      const currentView = viewSizeRef.current;
      const before = {
        x: (pos.x - currentView.w * 0.5 - currentPan.x) / currentZoom,
        y: (pos.y - currentView.h * 0.5 - currentPan.y) / currentZoom,
      };
      const nextZoom = Math.max(10, Math.min(260, currentZoom * (event.deltaY > 0 ? 0.92 : 1.08)));
      const targetX = pos.x - currentView.w * 0.5;
      const targetY = pos.y - currentView.h * 0.5;

      setZoom(nextZoom);
      setPan({ x: targetX - before.x * nextZoom, y: targetY - before.y * nextZoom });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel as EventListener);
    };
  }, [open]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!open || !canvas || !draft) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewSize.w, viewSize.h);
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, viewSize.w, viewSize.h);

    const grid = Math.max(0.05, draft.gridSize || 0.5);
    const px = grid * zoom;

    ctx.strokeStyle = 'rgba(148,163,184,0.2)';
    ctx.lineWidth = 1;

    const originX = viewSize.w * 0.5 + pan.x;
    const originY = viewSize.h * 0.5 + pan.y;

    if (px >= 6) {
      for (let x = originX % px; x < viewSize.w; x += px) {
        ctx.beginPath();
        ctx.moveTo(x, 24);
        ctx.lineTo(x, viewSize.h);
        ctx.stroke();
      }
      for (let y = originY % px; y < viewSize.h; y += px) {
        ctx.beginPath();
        ctx.moveTo(24, y);
        ctx.lineTo(viewSize.w, y);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(226,232,240,0.55)';
    ctx.beginPath();
    ctx.moveTo(24, originY);
    ctx.lineTo(viewSize.w, originY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(originX, 24);
    ctx.lineTo(originX, viewSize.h);
    ctx.stroke();

    for (const el of elements) {
      const selected = selection.has(el.id);
      ctx.save();
      ctx.strokeStyle = selected ? '#f59e0b' : strokeForType(el.type);
      ctx.fillStyle = selected ? '#f59e0b' : strokeForType(el.type);
      ctx.lineWidth = selected ? 2 : 1.5;

      if (el.type === 'text') {
        const p = worldToScreen({ x: el.x, y: el.y });
        ctx.font = `${Math.max(12, el.height * zoom * 0.75)}px ui-sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(el.text || '', p.x, p.y);
        ctx.restore();
        continue;
      }

      if (el.shape === 'line' && typeof el.x2 === 'number' && typeof el.y2 === 'number') {
        const a = worldToScreen({ x: el.x, y: el.y });
        const b = worldToScreen({ x: el.x2, y: el.y2 });
        ctx.lineWidth = Math.max(1.5, el.height * zoom * 0.6);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        drawMeasure(ctx, a, b, `${Math.hypot(el.x2 - el.x, el.y2 - el.y).toFixed(2)}m`);
      } else {
        const c = worldToScreen({ x: el.x, y: el.y });
        ctx.translate(c.x, c.y);
        ctx.rotate(el.rotation);
        const w = el.width * zoom;
        const h = el.height * zoom;
        if (el.shape === 'circle') {
          ctx.beginPath();
          ctx.ellipse(0, 0, Math.abs(w * 0.5), Math.abs(h * 0.5), 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
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
          drawMeasure(
            ctx,
            { x: -w * 0.5, y: h * 0.6 },
            { x: w * 0.5, y: h * 0.6 },
            `${el.width.toFixed(2)}m`
          );
        }
      }
      ctx.restore();
    }

    if (dragCreate) {
      const d = elementDefaults(dragCreate.tool);
      const sx = dragCreate.start.x;
      const sy = dragCreate.start.y;
      const ex = dragCreate.current.x;
      const ey = dragCreate.current.y;
      const signX = ex >= sx ? 1 : -1;
      const signY = ey >= sy ? 1 : -1;
      const wWorld = Math.max(d.w, Math.abs(ex - sx));
      const hWorld = Math.max(d.h, Math.abs(ey - sy));
      const cx = sx + signX * (wWorld * 0.5);
      const cy = sy + signY * (hWorld * 0.5);
      const center = worldToScreen({ x: cx, y: cy });
      const w = wWorld * zoom;
      const h = hWorld * zoom;
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      if (d.shape === 'line') {
        const a = worldToScreen({ x: sx, y: sy });
        const b = worldToScreen({ x: ex, y: ey });
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        drawMeasure(ctx, a, b, `${Math.hypot(ex - sx, ey - sy).toFixed(2)}m`, '#fbbf24');
      } else if (d.shape === 'circle') {
        ctx.beginPath();
        ctx.ellipse(center.x, center.y, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        drawMeasure(
          ctx,
          { x: center.x - w * 0.5, y: center.y + h * 0.55 },
          { x: center.x + w * 0.5, y: center.y + h * 0.55 },
          `${wWorld.toFixed(2)}m`,
          '#fbbf24'
        );
      } else {
        ctx.strokeRect(center.x - w * 0.5, center.y - h * 0.5, w, h);
        drawMeasure(
          ctx,
          { x: center.x - w * 0.5, y: center.y + h * 0.55 },
          { x: center.x + w * 0.5, y: center.y + h * 0.55 },
          `${wWorld.toFixed(2)}m`,
          '#fbbf24'
        );
      }
      ctx.restore();
    }

    if (wallChain) {
      const start = worldToScreen(wallChain.last);
      const chainStart = worldToScreen(wallChain.first);
      const previewWorld = wallPreview ?? wallChain.last;
      const end = worldToScreen(previewWorld);
      ctx.save();
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(start.x, start.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(chainStart.x, chainStart.y, 4, 0, Math.PI * 2);
      ctx.fill();
      if (wallPreview) {
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        drawMeasure(
          ctx,
          start,
          end,
          `${Math.hypot(previewWorld.x - wallChain.last.x, previewWorld.y - wallChain.last.y).toFixed(2)}m`,
          '#22d3ee'
        );
      }
      ctx.restore();
    }

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, viewSize.w, 24);
    ctx.fillRect(0, 0, 24, viewSize.h);
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.beginPath();
    ctx.moveTo(24, 24);
    ctx.lineTo(viewSize.w, 24);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(24, 24);
    ctx.lineTo(24, viewSize.h);
    ctx.stroke();

    if (px >= 20) {
      ctx.fillStyle = 'rgba(148,163,184,0.9)';
      ctx.font = '10px ui-sans-serif';
      for (let x = originX % px; x < viewSize.w; x += px) {
        const world = ((x - originX) / zoom).toFixed(0);
        ctx.fillText(world, x + 2, 12);
      }
      for (let y = originY % px; y < viewSize.h; y += px) {
        const world = ((y - originY) / zoom).toFixed(0);
        ctx.fillText(world, 2, y - 2);
      }
    }
  }, [open, draft, elements, pan.x, pan.y, zoom, selection, worldToScreen, dragCreate, wallChain, wallPreview, viewSize.w, viewSize.h]);

  const pointerPos = (event: React.PointerEvent<HTMLCanvasElement>): Vec2 => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.stopPropagation();
    if (!draft) return;
    const pos = pointerPos(event);

    if (event.button === 1 || (event.button === 0 && spacePanning)) {
      isPanningRef.current = true;
      panStartRef.current = pos;
      panOriginRef.current = pan;
      return;
    }

    if (event.button !== 0) return;

    const world = applySnap(screenToWorld(pos));

    if (transform) {
      setTransform((prev) => prev ? { ...prev, startMouse: world } : prev);
      return;
    }

    if (tool === 'text') {
      setPendingText({ position: world, value: '' });
      return;
    }

    if (tool === 'select') {
      const hit = findHit(world);
      if (hit) {
        if (event.shiftKey) {
          setSelection((prev) => {
            const n = new Set(prev);
            if (n.has(hit)) n.delete(hit); else n.add(hit);
            return n;
          });
        } else {
          setSelection(new Set([hit]));
        }
      } else if (!event.shiftKey) {
        setSelection(new Set());
      }
      return;
    }

    if (tool === 'wall') {
      if (!wallChain) {
        setWallChain({ first: world, last: world, count: 0 });
        setWallPreview(world);
      } else if (dist(wallChain.last, world) > 1e-4) {
        const segment: FloorPlanElement = {
          id: crypto.randomUUID(),
          type: 'wall',
          shape: 'line',
          x: wallChain.last.x,
          y: wallChain.last.y,
          x2: world.x,
          y2: world.y,
          width: 1,
          height: 0.2,
          rotation: 0,
        };
        updateDraft((d) => {
          d.elements.push(segment);
        });
        const closeToStart = dist(wallChain.first, world) <= (14 / zoom);
        if (closeToStart && wallChain.count > 0) {
          setWallChain(null);
          setWallPreview(null);
        } else {
          setWallChain({ first: wallChain.first, last: world, count: wallChain.count + 1 });
          setWallPreview(world);
        }
      }
      return;
    }

    const brushTool = tool as Exclude<FloorPlanTool, 'select' | 'wall' | 'text'>;
    setDragCreate({ tool: brushTool, start: world, current: world });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.stopPropagation();
    if (!draft) return;
    const pos = pointerPos(event);

    if (isPanningRef.current) {
      const dx = pos.x - panStartRef.current.x;
      const dy = pos.y - panStartRef.current.y;
      setPan({ x: panOriginRef.current.x + dx, y: panOriginRef.current.y + dy });
      return;
    }

    const world = applySnap(screenToWorld(pos));
    if (wallChain) setWallPreview(world);

    if (transform) {
      const start = transform.startMouse;
      if (!Number.isFinite(start.x) || !Number.isFinite(start.y)) {
        setTransform((prev) => prev ? { ...prev, startMouse: world } : prev);
        return;
      }

      const dx = world.x - start.x;
      const dy = world.y - start.y;

      updateDraft((d) => {
        d.elements = d.elements.map((el) => {
          if (!selection.has(el.id)) return el;
          const original = transform.originals.get(el.id);
          if (!original) return el;
          const next = { ...original };

          if (transform.mode === 'move') {
            const mx = transform.axis === 'y' ? 0 : dx;
            const my = transform.axis === 'x' ? 0 : dy;
            next.x += mx;
            next.y += my;
            if (typeof next.x2 === 'number' && typeof next.y2 === 'number') {
              next.x2 += mx;
              next.y2 += my;
            }
          } else if (transform.mode === 'rotate') {
            const a0 = Math.atan2(start.y - transform.origin.y, start.x - transform.origin.x);
            const a1 = Math.atan2(world.y - transform.origin.y, world.x - transform.origin.x);
            let da = a1 - a0;
            if (draft.snapEnabled) {
              const step = (5 * Math.PI) / 180;
              da = Math.round(da / step) * step;
            }
            if (next.shape === 'line' && typeof next.x2 === 'number' && typeof next.y2 === 'number') {
              const originalX2 = original.x2 as number;
              const originalY2 = original.y2 as number;
              const p1 = rotatePoint({ x: original.x, y: original.y }, transform.origin, da);
              const p2 = rotatePoint({ x: originalX2, y: originalY2 }, transform.origin, da);
              next.x = p1.x;
              next.y = p1.y;
              next.x2 = p2.x;
              next.y2 = p2.y;
            } else {
              const p = rotatePoint({ x: original.x, y: original.y }, transform.origin, da);
              next.x = p.x;
              next.y = p.y;
              next.rotation = original.rotation + da;
            }
          } else {
            const d0 = Math.max(1e-6, Math.hypot(start.x - transform.origin.x, start.y - transform.origin.y));
            const d1 = Math.max(1e-6, Math.hypot(world.x - transform.origin.x, world.y - transform.origin.y));
            const s = d1 / d0;
            const sx = transform.axis === 'y' ? 1 : s;
            const sy = transform.axis === 'x' ? 1 : s;

            if (next.shape === 'line' && typeof next.x2 === 'number' && typeof next.y2 === 'number') {
              const originalX2 = original.x2 as number;
              const originalY2 = original.y2 as number;
              const c = { x: (original.x + originalX2) * 0.5, y: (original.y + originalY2) * 0.5 };
              const a = { x: original.x - c.x, y: original.y - c.y };
              const b = { x: originalX2 - c.x, y: originalY2 - c.y };
              next.x = c.x + a.x * sx;
              next.y = c.y + a.y * sy;
              next.x2 = c.x + b.x * sx;
              next.y2 = c.y + b.y * sy;
            } else {
              next.width = Math.max(0.05, original.width * sx);
              next.height = Math.max(0.05, original.height * sy);
            }
          }

          return next;
        });
      });
      return;
    }

    if (dragCreate) {
      setDragCreate((prev) => prev ? { ...prev, current: world } : prev);
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.stopPropagation();
    if (!draft) return;
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    if (dragCreate) {
      const d = elementDefaults(dragCreate.tool);
      const sx = dragCreate.start.x;
      const sy = dragCreate.start.y;
      const ex = dragCreate.current.x;
      const ey = dragCreate.current.y;
      const signX = ex >= sx ? 1 : -1;
      const signY = ey >= sy ? 1 : -1;
      const w = Math.max(d.w, Math.abs(ex - sx));
      const h = Math.max(d.h, Math.abs(ey - sy));
      const cx = sx + signX * (w * 0.5);
      const cy = sy + signY * (h * 0.5);

      const element: FloorPlanElement = d.shape === 'line'
        ? {
          id: crypto.randomUUID(),
          type: dragCreate.tool,
          shape: 'line',
          x: sx,
          y: sy,
          x2: ex,
          y2: ey,
          width: 1,
          height: d.h,
          rotation: 0,
        }
        : {
          id: crypto.randomUUID(),
          type: dragCreate.tool,
          shape: d.shape,
          x: cx,
          y: cy,
          width: w,
          height: h,
          rotation: 0,
        };

      updateDraft((plan) => {
        plan.elements.push(element);
      });
      setSelection(new Set([element.id]));
      setDragCreate(null);
    }

    if (transform) setTransform(null);
  };

  const commitPendingText = React.useCallback(() => {
    if (!pendingText || !pendingText.value.trim()) {
      setPendingText(null);
      return;
    }
    const text = pendingText.value.trim();
    const created: FloorPlanElement = {
      id: crypto.randomUUID(),
      type: 'text',
      shape: 'rect',
      x: pendingText.position.x,
      y: pendingText.position.y,
      width: Math.max(1.2, text.length * 0.18),
      height: 0.45,
      rotation: 0,
      text,
    };
    updateDraft((d) => {
      d.elements.push(created);
    });
    setSelection(new Set([created.id]));
    setPendingText(null);
  }, [pendingText, updateDraft]);

  const handleSave = async () => {
    if (!draft) return;
    if (pendingText) {
      commitPendingText();
      return;
    }

    const bounds = computePlanBounds(draft.elements);
    updateDraft((d) => {
      d.planeWidth = bounds.width;
      d.planeHeight = bounds.height;
    });

    const blob = await renderTexture(draft.elements);
    if (!blob) {
      saveDraft();
      return;
    }
    const fileId = await ensureFileIdForBlob(blob, `floor-plan-${draft.objectId}.png`);
    saveDraft(fileId);
  };

  const clearSelected = () => {
    if (!draft || selection.size === 0) return;
    updateDraft((d) => {
      d.elements = d.elements.filter((el) => !selection.has(el.id));
    });
    setSelection(new Set());
  };

  if (!open || !draft) return null;

  return (
    <div className="fixed inset-0 z-10060 bg-[#0b0e13]/95">
      <div className="absolute inset-0" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>

      {pendingText && (
        <div
          className="absolute z-10061"
          style={{ left: worldToScreen(pendingText.position).x, top: worldToScreen(pendingText.position).y }}
        >
          <input
            ref={textInputRef}
            className="-translate-y-1/2 px-2 py-1 text-xs rounded border border-white/20 bg-[#0f141b] text-gray-100 min-w-48"
            value={pendingText.value}
            placeholder="Room label..."
            onChange={(e) => setPendingText((prev) => prev ? { ...prev, value: e.target.value } : prev)}
            onBlur={() => {}}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitPendingText();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setPendingText(null);
              }
            }}
          />
        </div>
      )}

      <div className="pointer-events-none absolute top-7 left-1/2 -translate-x-1/2 z-10061 flex flex-col gap-2 max-w-[95vw] w-[min(95vw,1100px)]">
        <div className="pointer-events-auto rounded-lg border border-white/10 bg-[#0f141b]/95 shadow-xl px-2 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              className={`px-2 py-1 rounded text-xs border flex items-center gap-1 ${draft.snapEnabled ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-200' : 'border-white/10 text-gray-300 hover:bg-white/10'}`}
              onClick={() => updateDraft((d) => { d.snapEnabled = !d.snapEnabled; })}
            >
              <Magnet className="w-3.5 h-3.5" /> Snap
            </button>
            <div className="flex items-center gap-1 text-xs text-gray-300">
              <Grid3X3 className="w-3.5 h-3.5" />
              <DragInput
                compact
                value={draft.gridSize}
                precision={2}
                step={0.05}
                min={0.05}
                onChange={(v) => updateDraft((d) => { d.gridSize = Math.max(0.05, v); })}
              />
            </div>
            <button className="px-2 py-1 rounded text-xs border border-white/10 text-gray-200 hover:bg-white/10" onClick={() => { setWallChain(null); setWallPreview(null); }}>
              End Wall Chain
            </button>
            <button className="px-2 py-1 rounded text-xs border border-rose-400/40 text-rose-200 hover:bg-rose-500/10" onClick={clearSelected}>
              Delete Selected
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded text-xs border border-white/10 text-gray-200 hover:bg-white/10 flex items-center gap-1"
              onClick={() => {
                if (hasUnsavedChanges) {
                  const ok = window.confirm('Discard unsaved floor plan changes?');
                  if (!ok) return;
                }
                cancelDraft();
              }}
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
            <button className="px-2 py-1 rounded text-xs border border-emerald-400/60 bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30 flex items-center gap-1" onClick={handleSave}>
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>

        <div className="pointer-events-auto rounded-lg border border-white/10 bg-[#0f141b]/95 shadow-xl px-2 py-2 flex items-center gap-1.5 flex-wrap">
          {TOOL_LIST.map((entry) => (
            <button
              key={entry.id}
              className={`px-2 py-1 rounded text-[11px] border flex items-center gap-1 ${tool === entry.id ? 'border-amber-400/60 bg-amber-400/15 text-amber-200' : 'border-white/10 hover:bg-white/10 text-gray-200'}`}
              onClick={() => setTool(entry.id)}
              title={entry.label}
            >
              {entry.icon}
              <span>{entry.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-10061 text-xs text-gray-300 bg-[#0f141b]/90 border border-white/10 rounded px-2 py-1">
        Tool: {tool} · Zoom: {zoom.toFixed(0)} · G/R/S transforms · X/Y lock · Space/MMB pan · Wheel zoom
      </div>
    </div>
  );
};

export default FloorPlanEditor;
