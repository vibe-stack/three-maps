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
  ghostObjectId: string | null;
  ghostOpacity: number;
  planeWidth: number;
  planeHeight: number;
  planeCenterX: number;
  planeCenterY: number;
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
        ghostObjectId: null,
        ghostOpacity: 0.35,
        planeWidth: 8,
        planeHeight: 8,
        planeCenterX: 0,
        planeCenterY: 0,
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
        const geometry = useGeometryStore.getState();
        const obj = scene.objects[next.objectId];
        if (obj) {
          let baseX = 8;
          let baseZ = 8;
          const meshId = obj.meshId;
          const mesh = meshId ? geometry.meshes.get(meshId) : undefined;
          if (mesh && mesh.vertices.length > 0) {
            let minX = Number.POSITIVE_INFINITY;
            let maxX = Number.NEGATIVE_INFINITY;
            let minY = Number.POSITIVE_INFINITY;
            let maxY = Number.NEGATIVE_INFINITY;
            let minZ = Number.POSITIVE_INFINITY;
            let maxZ = Number.NEGATIVE_INFINITY;
            for (const vertex of mesh.vertices) {
              minX = Math.min(minX, vertex.position.x);
              maxX = Math.max(maxX, vertex.position.x);
              minY = Math.min(minY, vertex.position.y);
              maxY = Math.max(maxY, vertex.position.y);
              minZ = Math.min(minZ, vertex.position.z);
              maxZ = Math.max(maxZ, vertex.position.z);
            }
            const extentY = Math.max(0.001, maxY - minY);
            const extentZ = Math.max(0.001, maxZ - minZ);
            baseX = Math.max(0.001, maxX - minX);
            baseZ = extentZ > 0.0015 ? extentZ : extentY;
          }

          const sx = Math.max(0.01, next.planeWidth / baseX);
          const sz = Math.max(0.01, next.planeHeight / baseZ);
          scene.setTransform(next.objectId, {
            position: {
              x: next.planeCenterX,
              y: obj.transform.position.y,
              z: next.planeCenterY,
            },
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
          ghostObjectId: typeof (plan as any).ghostObjectId === 'string' ? (plan as any).ghostObjectId : null,
          ghostOpacity: Number.isFinite((plan as any).ghostOpacity) ? Math.min(1, Math.max(0, (plan as any).ghostOpacity)) : 0.35,
          planeWidth: Number.isFinite((plan as any).planeWidth) ? Math.max(0.1, (plan as any).planeWidth) : 8,
          planeHeight: Number.isFinite((plan as any).planeHeight) ? Math.max(0.1, (plan as any).planeHeight) : 8,
          planeCenterX: Number.isFinite((plan as any).planeCenterX) ? (plan as any).planeCenterX : 0,
          planeCenterY: Number.isFinite((plan as any).planeCenterY) ? (plan as any).planeCenterY : 0,
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
