import type { FloorPlanElement, FloorPlanTool } from '@/stores/floor-plan-store';

export type Vec2 = { x: number; y: number };

export type ActiveTransform = {
  mode: 'move' | 'rotate' | 'scale';
  axis: 'xy' | 'x' | 'y';
  startMouse: Vec2;
  origin: Vec2;
  originals: Map<string, FloorPlanElement>;
};

export type DragCreate = {
  tool: Exclude<FloorPlanTool, 'select' | 'wall' | 'text' | 'polygon'>;
  start: Vec2;
  current: Vec2;
};

export type PendingText = {
  id: string;
  position: Vec2;
  value: string;
};

export type DraftPolygon = {
  points: Vec2[];
  preview: Vec2 | null;
};

export type ToolEntry = {
  id: FloorPlanTool;
  label: string;
};
