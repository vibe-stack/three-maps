"use client";

import React from 'react';
import {
  Circle,
  Square,
  Type,
  Move,
  Map as MapIcon,
  MapPinned,
  Route,
  LocateFixed,
  Grid3X3,
  Magnet,
  ScanLine,
  DoorOpen,
  Blinds,
  PanelTop,
  Shapes,
  Save,
  X,
} from 'lucide-react';
import { ensureFileIdForBlob } from '@/stores/files-store';
import { FloorPlanElement, FloorPlanTool, useFloorPlanStore } from '@/stores/floor-plan-store';
import { BRUSH_REGISTRY } from '@/features/quick-brush/brushes/registry';
import { DragInput } from '@/components/drag-input';
import { drawPlanElement, drawMeasure, computePlanBounds, elementHitTest, renderTexture } from '@/features/floor-plan/editor/draw';
import { centerOfSelection, dist, polygonCentroid, rotatePoint } from '@/features/floor-plan/editor/math';
import { DRAFTING_TOOLS, STRUCTURAL_TOOLS, elementDefaults } from '@/features/floor-plan/editor/tools';
import { placeOpeningOnWall } from '@/features/floor-plan/editor/openings';
import type { ActiveTransform, DragCreate, DraftPolygon, PendingText, Vec2 } from '@/features/floor-plan/editor/types';

const brushIconById = new Map(BRUSH_REGISTRY.map((b) => [b.id, b.icon]));

const TOOL_LIST: Array<{ id: FloorPlanTool; label: string; icon: React.ReactNode }> = [
  { id: 'select', label: 'Select', icon: brushIconById.get('select') ?? <Move className="w-4 h-4" /> },
  { id: 'wall', label: 'Walls', icon: brushIconById.get('polygon') ?? <ScanLine className="w-4 h-4" /> },
  { id: 'polygon', label: 'Polygon', icon: <Shapes className="w-4 h-4" /> },
  { id: 'door', label: 'Doors', icon: brushIconById.get('door') ?? <DoorOpen className="w-4 h-4" /> },
  { id: 'pillar-circle', label: 'Pillar C', icon: brushIconById.get('cylinder') ?? <Circle className="w-4 h-4" /> },
  { id: 'pillar-rect', label: 'Pillar R', icon: brushIconById.get('cube') ?? <Square className="w-4 h-4" /> },
  { id: 'stairs', label: 'Stairs', icon: brushIconById.get('stairs') ?? <PanelTop className="w-4 h-4" /> },
  { id: 'stairs-closed', label: 'Stairs C', icon: brushIconById.get('closed-stairs') ?? <PanelTop className="w-4 h-4" /> },
  { id: 'slope', label: 'Slope', icon: brushIconById.get('slope') ?? <Route className="w-4 h-4" /> },
  { id: 'arch', label: 'Arch', icon: brushIconById.get('arch') ?? <Route className="w-4 h-4" /> },
  { id: 'window', label: 'Window', icon: <Blinds className="w-4 h-4" /> },
  { id: 'text', label: 'Text', icon: <Type className="w-4 h-4" /> },
  { id: 'zone', label: 'Zone', icon: <MapIcon className="w-4 h-4" /> },
  { id: 'path', label: 'Path', icon: <Route className="w-4 h-4" /> },
  { id: 'poi', label: 'POI', icon: <MapPinned className="w-4 h-4" /> },
  { id: 'spawn', label: 'Spawn', icon: <LocateFixed className="w-4 h-4" /> },
];

const TOOL_META = new Map(TOOL_LIST.map((t) => [t.id, t]));

const serializeDraft = (draft: NonNullable<ReturnType<typeof useFloorPlanStore.getState>['draft']>) => JSON.stringify({
  gridSize: draft.gridSize,
  snapEnabled: draft.snapEnabled,
  planeWidth: draft.planeWidth,
  planeHeight: draft.planeHeight,
  planeCenterX: draft.planeCenterX,
  planeCenterY: draft.planeCenterY,
  elements: draft.elements,
});

const FloorPlanEditor: React.FC = () => {
  const open = useFloorPlanStore((s) => s.open);
  const draft = useFloorPlanStore((s) => s.draft);
  const updateDraft = useFloorPlanStore((s) => s.updateDraft);
  const cancelDraft = useFloorPlanStore((s) => s.cancelDraft);
  const saveDraft = useFloorPlanStore((s) => s.saveDraft);
  const plans = useFloorPlanStore((s) => s.plans);

  const [tool, setTool] = React.useState<FloorPlanTool>('select');
  const [pan, setPan] = React.useState<Vec2>({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(54);
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [dragCreate, setDragCreate] = React.useState<DragCreate | null>(null);
  const [wallChain, setWallChain] = React.useState<{ first: Vec2; last: Vec2; count: number } | null>(null);
  const [wallPreview, setWallPreview] = React.useState<Vec2 | null>(null);
  const [polygonDraft, setPolygonDraft] = React.useState<DraftPolygon | null>(null);
  const [transform, setTransform] = React.useState<ActiveTransform | null>(null);
  const [spacePanning, setSpacePanning] = React.useState(false);
  const [pendingText, setPendingText] = React.useState<PendingText | null>(null);
  const [viewSize, setViewSize] = React.useState({ w: 1, h: 1 });
  const [draftColor, setDraftColor] = React.useState('#38bdf8');

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
    if (tool !== 'wall') {
      setWallChain(null);
      setWallPreview(null);
    }
    if (tool !== 'polygon') {
      setPolygonDraft(null);
    }
  }, [tool]);

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
  const ghostPlan = draft?.ghostObjectId ? plans[draft.ghostObjectId] : null;

  React.useEffect(() => {
    if (!draft?.ghostObjectId) return;
    if (!plans[draft.ghostObjectId]) {
      updateDraft((d) => {
        d.ghostObjectId = null;
      });
    }
  }, [draft?.ghostObjectId, plans, updateDraft]);

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
      const d = elementHitTest(el, world, threshold);
      if (d != null && (!hit || d < hit.d)) hit = { id: el.id, d };
    }
    return hit?.id ?? null;
  }, [elements, zoom]);

  const startTransform = React.useCallback((mode: ActiveTransform['mode']) => {
    if (!draft || selection.size === 0) return;
    const selectedEls = draft.elements.filter((e) => selection.has(e.id));
    if (!selectedEls.length) return;
    const origin = centerOfSelection(selectedEls);
    const originals = new Map<string, FloorPlanElement>();
    for (const el of selectedEls) originals.set(el.id, { ...el, points: el.points?.map((p) => ({ ...p })) });
    setTransform({ mode, axis: 'xy', startMouse: { x: Number.NaN, y: Number.NaN }, origin, originals });
  }, [draft, selection]);

  React.useEffect(() => {
    if (!pendingText) return;
    textInputRef.current?.focus();
    textInputRef.current?.select();
  }, [pendingText?.id]);

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
        } else if (polygonDraft) {
          setPolygonDraft(null);
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
      } else if (e.key === 'Enter') {
        if (wallChain) {
          e.preventDefault();
          setWallChain(null);
          setWallPreview(null);
        } else if (polygonDraft && polygonDraft.points.length >= 3) {
          e.preventDefault();
          const points = polygonDraft.points;
          const c = polygonCentroid(points);
          const poly: FloorPlanElement = {
            id: crypto.randomUUID(),
            type: 'polygon',
            shape: 'polygon',
            x: c.x,
            y: c.y,
            width: 1,
            height: 1,
            rotation: 0,
            points: points.map((p) => ({ ...p })),
            nonStructural: false,
          };
          updateDraft((d) => {
            d.elements.push(poly);
          });
          setSelection(new Set([poly.id]));
          setPolygonDraft(null);
        }
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
  }, [open, draft, selection.size, transform, wallChain, polygonDraft, updateDraft, cancelDraft, startTransform, pendingText, hasUnsavedChanges]);

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

    if (ghostPlan && draft.ghostOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, draft.ghostOpacity));
      for (const el of ghostPlan.elements) {
        drawPlanElement(ctx, el, worldToScreen, zoom, false, false);
      }
      ctx.restore();
    }

    for (const el of elements) {
      drawPlanElement(ctx, el, worldToScreen, zoom, selection.has(el.id), true);
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

    if (polygonDraft && polygonDraft.points.length > 0) {
      const pts = polygonDraft.points.map(worldToScreen);
      const preview = polygonDraft.preview ? worldToScreen(polygonDraft.preview) : null;
      ctx.save();
      ctx.strokeStyle = '#a3e635';
      ctx.fillStyle = '#a3e635';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (preview) ctx.lineTo(preview.x, preview.y);
      ctx.stroke();
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (pts.length >= 3) {
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        if (preview) ctx.lineTo(preview.x, preview.y);
        ctx.closePath();
        ctx.fill();
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
  }, [open, draft, elements, ghostPlan, pan.x, pan.y, zoom, selection, worldToScreen, dragCreate, wallChain, wallPreview, polygonDraft, viewSize.w, viewSize.h]);

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
      setPendingText({ id: crypto.randomUUID(), position: world, value: '' });
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
          const selectedEls = draft.elements.filter((e) => e.id === hit);
          if (selectedEls.length > 0) {
            const origin = centerOfSelection(selectedEls);
            const originals = new Map<string, FloorPlanElement>();
            for (const el of selectedEls) originals.set(el.id, { ...el, points: el.points?.map((p) => ({ ...p })) });
            setTransform({ mode: 'move', axis: 'xy', startMouse: world, origin, originals });
          }
        }
      } else if (!event.shiftKey) {
        setSelection(new Set());
      }
      return;
    }

    if (tool === 'polygon') {
      const closeRadius = 14 / zoom;
      if (!polygonDraft) {
        setPolygonDraft({ points: [world], preview: world });
      } else {
        const first = polygonDraft.points[0];
        const closeToStart = polygonDraft.points.length >= 3 && dist(world, first) <= closeRadius;
        if (closeToStart) {
          const points = polygonDraft.points;
          const c = polygonCentroid(points);
          const poly: FloorPlanElement = {
            id: crypto.randomUUID(),
            type: 'polygon',
            shape: 'polygon',
            x: c.x,
            y: c.y,
            width: 1,
            height: 1,
            rotation: 0,
            points: points.map((p) => ({ ...p })),
            nonStructural: false,
          };
          updateDraft((d) => {
            d.elements.push(poly);
          });
          setSelection(new Set([poly.id]));
          setPolygonDraft(null);
        } else {
          setPolygonDraft({ points: [...polygonDraft.points, world], preview: world });
        }
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

    const brushTool = tool as Exclude<FloorPlanTool, 'select' | 'wall' | 'text' | 'polygon'>;
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
    if (polygonDraft) setPolygonDraft((prev) => prev ? { ...prev, preview: world } : prev);

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
            if (next.shape === 'polygon' && next.points?.length) {
              next.points = next.points.map((p) => ({ x: p.x + mx, y: p.y + my }));
            }
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
            } else if (next.shape === 'polygon' && original.points?.length) {
              const rotated = original.points.map((p) => rotatePoint(p, transform.origin, da));
              const c = polygonCentroid(rotated);
              next.points = rotated;
              next.x = c.x;
              next.y = c.y;
              next.rotation = original.rotation + da;
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
            } else if (next.shape === 'polygon' && original.points?.length) {
              const scaled = original.points.map((p) => ({
                x: transform.origin.x + (p.x - transform.origin.x) * sx,
                y: transform.origin.y + (p.y - transform.origin.y) * sy,
              }));
              const c = polygonCentroid(scaled);
              next.points = scaled;
              next.x = c.x;
              next.y = c.y;
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
          color: d.nonStructural ? draftColor : undefined,
          nonStructural: d.nonStructural,
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
          color: d.nonStructural ? draftColor : undefined,
          nonStructural: d.nonStructural,
        };

      updateDraft((plan) => {
        if (element.type === 'door' || element.type === 'window') {
          plan.elements = placeOpeningOnWall(plan.elements, element, zoom);
        } else {
          plan.elements.push(element);
        }
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
      d.planeCenterX = bounds.centerX;
      d.planeCenterY = bounds.centerY;
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

        <div className="pointer-events-auto rounded-lg border border-white/10 bg-[#0f141b]/95 shadow-xl px-2 py-2 flex items-center gap-3 flex-wrap">
          <div className="text-xs text-gray-300">Ghost Layer</div>
          <select
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200"
            value={draft.ghostObjectId ?? ''}
            onChange={(e) => {
              const value = e.target.value || null;
              updateDraft((d) => {
                d.ghostObjectId = value;
              });
            }}
          >
            <option value="">None</option>
            {Object.values(plans)
              .filter((plan) => plan.objectId !== draft.objectId)
              .map((plan) => (
                <option key={plan.objectId} value={plan.objectId}>{plan.name || `Plan ${plan.objectId.slice(-4)}`}</option>
              ))}
          </select>

          <div className="flex items-center gap-1 text-xs text-gray-300">
            Opacity
            <DragInput
              compact
              value={draft.ghostOpacity}
              precision={2}
              step={0.05}
              min={0}
              max={1}
              onChange={(v) => updateDraft((d) => { d.ghostOpacity = Math.max(0, Math.min(1, v)); })}
            />
          </div>
        </div>

        <div className="pointer-events-auto rounded-lg border border-white/10 bg-[#0f141b]/95 shadow-xl px-2 py-2 flex items-center gap-1.5 flex-wrap">
          {STRUCTURAL_TOOLS.map((entryBase) => {
            const entry = TOOL_META.get(entryBase.id);
            if (!entry) return null;
            return (
            <button
              key={entry.id}
              className={`px-2 py-1 rounded text-[11px] border flex items-center gap-1 ${tool === entry.id ? 'border-amber-400/60 bg-amber-400/15 text-amber-200' : 'border-white/10 hover:bg-white/10 text-gray-200'}`}
              onClick={() => setTool(entry.id)}
              title={entry.label}
            >
              {entry.icon}
              <span>{entry.label}</span>
            </button>
            );
          })}
        </div>
      </div>

      <div className="pointer-events-auto absolute left-3 top-26 z-10061 w-48 rounded-lg border border-white/10 bg-[#0f141b]/95 shadow-xl p-2 space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-gray-400">Drafting (2D only)</div>
        <label className="flex items-center justify-between gap-2 text-xs text-gray-300">
          Color
          <input
            type="color"
            value={draftColor}
            onChange={(e) => setDraftColor(e.target.value)}
            className="h-7 w-12 rounded border border-white/15 bg-transparent"
          />
        </label>
        <div className="space-y-1">
          {DRAFTING_TOOLS.map((entryBase) => {
            const entry = TOOL_META.get(entryBase.id);
            if (!entry) return null;
            return (
              <button
                key={entry.id}
                className={`w-full px-2 py-1 rounded text-[11px] border flex items-center gap-1.5 ${tool === entry.id ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200' : 'border-white/10 hover:bg-white/10 text-gray-200'}`}
                onClick={() => setTool(entry.id)}
                title={entry.label}
              >
                {entry.icon}
                <span>{entry.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-10061 text-xs text-gray-300 bg-[#0f141b]/90 border border-white/10 rounded px-2 py-1">
        Tool: {tool} · Zoom: {zoom.toFixed(0)} · G/R/S transforms · X/Y lock · Space/MMB pan · Wheel zoom · Polygon: click-click-close
      </div>
    </div>
  );
};

export default FloorPlanEditor;
