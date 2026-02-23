'use client';

import React from 'react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { usePerformanceStore } from '@/stores/performance-store';

const PerformanceOverlay: React.FC = () => {
  const enabled = useWorkspaceStore((s) => s.showPerformanceOverlay ?? false);
  const m = usePerformanceStore((s) => s.metrics);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none absolute left-4 top-3 z-30 rounded border border-white/10 bg-[#0b0e13]/80 px-2.5 py-2 text-[11px] leading-4 text-gray-200">
      <div className="font-medium text-gray-100">Performance</div>
      <div>FPS: {m.fps.toFixed(1)} ({m.frameMs.toFixed(1)} ms)</div>
      <div>Draws: {m.drawCalls} · Tris: {m.triangles}</div>
      <div>Geo: {m.geometries} · Tex: {m.textures}</div>
      <div>Heap: {m.jsHeapMB.toFixed(1)} / {m.jsHeapTotalMB.toFixed(1)} MB</div>
    </div>
  );
};

export default PerformanceOverlay;
