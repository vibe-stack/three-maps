'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { usePerformanceStore } from '@/stores/performance-store';

const SAMPLE_INTERVAL_MS = 250;

const toMb = (bytes: number) => bytes / (1024 * 1024);

const PerformanceSampler: React.FC = () => {
  const enabled = useWorkspaceStore((s) => s.showPerformanceOverlay ?? false);
  const setMetrics = usePerformanceStore((s) => s.setMetrics);
  const reset = usePerformanceStore((s) => s.reset);
  const { gl } = useThree();

  const frameCountRef = useRef(0);
  const deltaSumRef = useRef(0);
  const lastSampleAtRef = useRef(0);

  useFrame((state, delta) => {
    if (!enabled) {
      if (frameCountRef.current !== 0 || deltaSumRef.current !== 0) {
        frameCountRef.current = 0;
        deltaSumRef.current = 0;
        lastSampleAtRef.current = 0;
        reset();
      }
      return;
    }

    frameCountRef.current += 1;
    deltaSumRef.current += delta;

    const nowMs = state.clock.elapsedTime * 1000;
    if (nowMs - lastSampleAtRef.current < SAMPLE_INTERVAL_MS) return;

    const frames = Math.max(1, frameCountRef.current);
    const avgDelta = deltaSumRef.current / frames;
    const fps = 1 / Math.max(1e-6, avgDelta);
    const frameMs = avgDelta * 1000;

    const info: any = (gl as any).info ?? {};
    const renderInfo = info.render ?? {};
    const memoryInfo = info.memory ?? {};

    const perfAny = performance as any;
    const heap = perfAny?.memory;

    setMetrics({
      fps,
      frameMs,
      drawCalls: renderInfo.calls ?? 0,
      triangles: renderInfo.triangles ?? 0,
      lines: renderInfo.lines ?? 0,
      points: renderInfo.points ?? 0,
      geometries: memoryInfo.geometries ?? 0,
      textures: memoryInfo.textures ?? 0,
      jsHeapMB: heap?.usedJSHeapSize ? toMb(heap.usedJSHeapSize) : 0,
      jsHeapTotalMB: heap?.totalJSHeapSize ? toMb(heap.totalJSHeapSize) : 0,
      updatedAt: Date.now(),
    });

    frameCountRef.current = 0;
    deltaSumRef.current = 0;
    lastSampleAtRef.current = nowMs;
  });

  return null;
};

export default PerformanceSampler;
