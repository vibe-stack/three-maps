import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { useGeometryStore } from './geometry-store';
import { useSceneStore } from './scene-store';

export type FloorPlanTool =
  | 'select'
  | 'wall'
  | 'door'
  | 'pillar-circle'
  | 'pillar-rect'
  | 'stairs'
  | 'stairs-closed'
  | 'slope'
  | 'arch'
  | 'window'
  | 'text';

export type FloorPlanShape = 'line' | 'rect' | 'circle';

export type FloorPlanElement = {
  id: string;
  type: Exclude<FloorPlanTool, 'select'>;
  shape: FloorPlanShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  x2?: number;
  y2?: number;
  text?: string;
};

export type FloorPlanResource = {
  id: string;
  objectId: string;
  meshId: string;
  name: string;
  planeWidth: number;
  planeHeight: number;
  gridSize: number;
  snapEnabled: boolean;
  elements: FloorPlanElement[];
  textureFileId?: string;
  updatedAt: number;
};

interface FloorPlanState {
  plans: Record<string, FloorPlanResource>;
  open: boolean;
  objectId: string | null;
  draft: FloorPlanResource | null;
}

interface FloorPlanActions {
  createFloorPlanObject: (name?: string) => string;
  openEditor: (objectId: string) => void;
  closeEditor: () => void;
  cancelDraft: () => void;
  updateDraft: (updater: (draft: FloorPlanResource) => void) => void;
  saveDraft: (textureFileId?: string) => void;
  setPlanTexture: (objectId: string, textureFileId: string) => void;
  updatePlan: (objectId: string, updater: (plan: FloorPlanResource) => void) => void;
  removeByObjectId: (objectId: string) => void;
  hydratePlans: (plans: Record<string, FloorPlanResource>) => void;
  reset: () => void;
}

type FloorPlanStore = FloorPlanState & FloorPlanActions;

const clonePlan = (plan: FloorPlanResource): FloorPlanResource => ({
  ...plan,
  elements: plan.elements.map((e) => ({ ...e })),
});

export const useFloorPlanStore = create<FloorPlanStore>()(
  subscribeWithSelector((set, get) => ({
    plans: {},
    open: false,
    objectId: null,
    draft: null,

    createFloorPlanObject: (name = 'Floor Plan') => {
      const geometry = useGeometryStore.getState();
      const scene = useSceneStore.getState();

      const meshId = geometry.createPlane(8, 8, 1, 1);
      const objectId = scene.createMeshObject(`${name} ${meshId.slice(-4)}`, meshId);
      scene.setTransform(objectId, {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      });

      const plan: FloorPlanResource = {
        id: nanoid(),
        objectId,
        meshId,
        name,
        planeWidth: 8,
        planeHeight: 8,
        gridSize: 0.5,
        snapEnabled: true,
        elements: [],
        updatedAt: Date.now(),
      };

      set((state) => ({ plans: { ...state.plans, [objectId]: plan } }));

      return objectId;
    },

    openEditor: (objectId) => {
      const existing = get().plans[objectId];
      if (!existing) return;
      set({ open: true, objectId, draft: clonePlan(existing) });
    },

    closeEditor: () => set({ open: false, objectId: null, draft: null }),

    cancelDraft: () => set({ open: false, objectId: null, draft: null }),

    updateDraft: (updater) => {
      const draft = get().draft;
      if (!draft) return;
      const next = clonePlan(draft);
      updater(next);
      next.updatedAt = Date.now();
      set({ draft: next });
    },

    saveDraft: (textureFileId) => {
      const draft = get().draft;
      if (!draft) return;
      const next = clonePlan(draft);
      if (textureFileId) next.textureFileId = textureFileId;
      next.updatedAt = Date.now();

      try {
        const scene = useSceneStore.getState();
        const obj = scene.objects[next.objectId];
        if (obj) {
          const sx = Math.max(0.01, next.planeWidth / 8);
          const sz = Math.max(0.01, next.planeHeight / 8);
          scene.setTransform(next.objectId, {
            scale: {
              x: sx,
              y: obj.transform.scale.y,
              z: sz,
            },
          });
        }
      } catch {}

      set((state) => ({
        plans: { ...state.plans, [next.objectId]: next },
        open: false,
        objectId: null,
        draft: null,
      }));
    },

    setPlanTexture: (objectId, textureFileId) => {
      set((state) => {
        const plan = state.plans[objectId];
        if (!plan) return {};
        return {
          plans: {
            ...state.plans,
            [objectId]: { ...plan, textureFileId, updatedAt: Date.now() },
          },
        };
      });
    },

    updatePlan: (objectId, updater) => {
      set((state) => {
        const plan = state.plans[objectId];
        if (!plan) return {};
        const next = clonePlan(plan);
        updater(next);
        next.updatedAt = Date.now();
        return {
          plans: {
            ...state.plans,
            [objectId]: next,
          },
        };
      });
    },

    removeByObjectId: (objectId) => {
      set((state) => {
        const nextPlans = { ...state.plans };
        delete nextPlans[objectId];
        if (state.objectId === objectId) {
          return { plans: nextPlans, objectId: null, open: false, draft: null };
        }
        return { plans: nextPlans };
      });
    },

    hydratePlans: (plans) => {
      const safe: Record<string, FloorPlanResource> = {};
      for (const [objectId, plan] of Object.entries(plans || {})) {
        safe[objectId] = {
          ...plan,
          objectId,
          elements: Array.isArray(plan.elements) ? plan.elements.map((e) => ({ ...e })) : [],
          planeWidth: Number.isFinite((plan as any).planeWidth) ? Math.max(0.1, (plan as any).planeWidth) : 8,
          planeHeight: Number.isFinite((plan as any).planeHeight) ? Math.max(0.1, (plan as any).planeHeight) : 8,
          gridSize: Number.isFinite(plan.gridSize) ? Math.max(0.05, plan.gridSize) : 0.5,
          snapEnabled: plan.snapEnabled !== false,
          updatedAt: Number.isFinite(plan.updatedAt) ? plan.updatedAt : Date.now(),
        };
      }
      set({ plans: safe, open: false, objectId: null, draft: null });
    },

    reset: () => set({ plans: {}, open: false, objectId: null, draft: null }),
  }))
);
