import type { FloorPlanElement, FloorPlanTool } from '@/stores/floor-plan-store';
import type { ToolEntry } from './types';

export const STRUCTURAL_TOOLS: ToolEntry[] = [
  { id: 'select', label: 'Select' },
  { id: 'wall', label: 'Walls' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'door', label: 'Door' },
  { id: 'window', label: 'Window' },
  { id: 'arch', label: 'Arch' },
  { id: 'pillar-circle', label: 'Pillar C' },
  { id: 'pillar-rect', label: 'Pillar R' },
  { id: 'stairs', label: 'Stairs' },
  { id: 'stairs-closed', label: 'Stairs C' },
  { id: 'slope', label: 'Slope' },
  { id: 'text', label: 'Text' },
];

export const DRAFTING_TOOLS: ToolEntry[] = [
  { id: 'zone', label: 'Zone' },
  { id: 'path', label: 'Path' },
  { id: 'poi', label: 'POI' },
  { id: 'spawn', label: 'Spawn' },
];

export const strokeForType = (el: FloorPlanElement): string => {
  if (el.color) return el.color;
  switch (el.type) {
    case 'wall': return '#e5e7eb';
    case 'door': return '#f59e0b';
    case 'window': return '#60a5fa';
    case 'arch': return '#c084fc';
    case 'stairs': return '#34d399';
    case 'stairs-closed': return '#10b981';
    case 'slope': return '#f472b6';
    case 'zone': return '#38bdf8';
    case 'path': return '#22c55e';
    case 'poi': return '#f97316';
    case 'spawn': return '#e879f9';
    case 'text': return '#e2e8f0';
    case 'pillar-circle':
    case 'pillar-rect':
      return '#fb7185';
    case 'polygon':
      return '#a3e635';
    default:
      return '#e5e7eb';
  }
};

export const elementDefaults = (tool: Exclude<FloorPlanTool, 'select' | 'wall' | 'text' | 'polygon'>) => {
  switch (tool) {
    case 'door': return { w: 1, h: 0.2, shape: 'line' as const, nonStructural: false };
    case 'window': return { w: 1, h: 0.2, shape: 'line' as const, nonStructural: false };
    case 'arch': return { w: 1.4, h: 0.25, shape: 'line' as const, nonStructural: false };
    case 'path': return { w: 1.2, h: 0.12, shape: 'line' as const, nonStructural: true };
    case 'pillar-circle': return { w: 0.8, h: 0.8, shape: 'circle' as const, nonStructural: false };
    case 'pillar-rect': return { w: 0.8, h: 0.8, shape: 'rect' as const, nonStructural: false };
    case 'stairs': return { w: 2, h: 1.2, shape: 'rect' as const, nonStructural: false };
    case 'stairs-closed': return { w: 2, h: 1.2, shape: 'rect' as const, nonStructural: false };
    case 'slope': return { w: 2.2, h: 1.4, shape: 'rect' as const, nonStructural: false };
    case 'zone': return { w: 2.4, h: 1.6, shape: 'rect' as const, nonStructural: true };
    case 'poi': return { w: 0.6, h: 0.6, shape: 'circle' as const, nonStructural: true };
    case 'spawn': return { w: 0.8, h: 0.8, shape: 'circle' as const, nonStructural: true };
    default: return { w: 1, h: 1, shape: 'rect' as const, nonStructural: false };
  }
};
