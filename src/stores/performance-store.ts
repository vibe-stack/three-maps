import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';

export interface PerformanceMetrics {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  jsHeapMB: number;
  jsHeapTotalMB: number;
  updatedAt: number;
}

interface PerformanceState {
  metrics: PerformanceMetrics;
}

interface PerformanceActions {
  setMetrics: (partial: Partial<PerformanceMetrics>) => void;
  reset: () => void;
}

type PerformanceStore = PerformanceState & PerformanceActions;

const initialMetrics: PerformanceMetrics = {
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  lines: 0,
  points: 0,
  geometries: 0,
  textures: 0,
  jsHeapMB: 0,
  jsHeapTotalMB: 0,
  updatedAt: 0,
};

export const usePerformanceStore = create<PerformanceStore>()(
  subscribeWithSelector(
    immer((set) => ({
      metrics: initialMetrics,
      setMetrics: (partial) => set((s) => { Object.assign(s.metrics, partial); }),
      reset: () => set((s) => { s.metrics = { ...initialMetrics }; }),
    }))
  )
);
