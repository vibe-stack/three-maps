'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { ThreeEvent, useThree, useFrame } from '@react-three/fiber';
import {
  Color,
  PerspectiveCamera,
  Vector3,
  Object3D,
  InstancedMesh,
  BoxGeometry,
  MeshBasicMaterial,
  Euler,
} from 'three/webgpu';
import { useMesh } from '../../../stores/geometry-store';
import { Vertex } from '../../../types/geometry';

const CYAN = new Color(0, 0.8, 1.0);

function getScreenScale(
  camera: PerspectiveCamera,
  position: Vector3,
  viewportHeight: number,
  pixelSize = 8
): number {
  const distance = camera.position.distanceTo(position);
  const vFOV = (camera.fov * Math.PI) / 180;
  const worldScreenHeightAtDistance = 2 * Math.tan(vFOV / 2) * distance;
  return (pixelSize / viewportHeight) * worldScreenHeightAtDistance;
}

interface EdgeMidpointRendererProps {
  meshId: string;
  /** Called when the user begins dragging a midpoint. Receives edgeId and local-space midpoint position. */
  onMidpointDragStart: (edgeId: string, localPos: { x: number; y: number; z: number }) => void;
  localVertices?: Vertex[];
  objectScale?: { x: number; y: number; z: number };
  objectRotation?: { x: number; y: number; z: number };
  objectPosition?: { x: number; y: number; z: number };
}

export const EdgeMidpointRenderer: React.FC<EdgeMidpointRendererProps> = ({
  meshId,
  onMidpointDragStart,
  localVertices,
  objectScale,
  objectRotation,
  objectPosition,
}) => {
  const { camera, size } = useThree();
  const mesh = useMesh(meshId);
  const instanceRef = useRef<InstancedMesh | null>(null);
  const prevCountRef = useRef(0);
  const indexToEdgeId = useRef<string[]>([]);
  const boxGeo = useMemo(() => new BoxGeometry(0.5, 0.5, 0.5), []);
  const cyanMat = useMemo(
    () => new MeshBasicMaterial({ color: CYAN, depthTest: false, depthWrite: false }),
    []
  );

  // Merge local vertex overrides
  const vertices = useMemo(() => {
    const base = mesh?.vertices || [];
    if (!localVertices || localVertices.length === 0) return base;
    const overrides = new Map(localVertices.map((v) => [v.id, v] as const));
    return base.map((v) => overrides.get(v.id) || v);
  }, [mesh?.vertices, localVertices]);

  const edges = useMemo(() => mesh?.edges || [], [mesh?.edges]);

  // Compute midpoint positions for each edge
  const midpoints = useMemo(() => {
    const vertexMap = new Map(vertices.map((v) => [v.id, v] as const));
    const result: { edgeId: string; position: Vector3; localPos: { x: number; y: number; z: number } }[] = [];
    for (const edge of edges) {
      const vA = vertexMap.get(edge.vertexIds[0]);
      const vB = vertexMap.get(edge.vertexIds[1]);
      if (!vA || !vB) continue;
      const lx = (vA.position.x + vB.position.x) / 2;
      const ly = (vA.position.y + vB.position.y) / 2;
      const lz = (vA.position.z + vB.position.z) / 2;
      result.push({
        edgeId: edge.id,
        position: new Vector3(lx, ly, lz),
        localPos: { x: lx, y: ly, z: lz },
      });
    }
    return result;
  }, [edges, vertices]);

  // Keep stable edge id mapping for picking
  useEffect(() => {
    indexToEdgeId.current = midpoints.map((m) => m.edgeId);
  }, [midpoints]);

  const instanceCapacity = Math.max(1, midpoints.length);

  useEffect(() => {
    if (instanceRef.current) {
      instanceRef.current.renderOrder = 2500;
    }
  }, []);

  useFrame(() => {
    const ref = instanceRef.current;
    if (!ref) return;
    const count = midpoints.length;
    ref.count = count;

    const tmp = new Object3D();
    for (let i = 0; i < count; i++) {
      const mp = midpoints[i];
      tmp.position.copy(mp.position);

      // Compute world position for distance-based scaling
      const wp = mp.position.clone();
      if (objectScale) {
        wp.set(wp.x * objectScale.x, wp.y * objectScale.y, wp.z * objectScale.z);
      }
      if (objectRotation) {
        wp.applyEuler(new Euler(objectRotation.x, objectRotation.y, objectRotation.z));
      }
      if (objectPosition) {
        wp.add(new Vector3(objectPosition.x, objectPosition.y, objectPosition.z));
      }

      const pxScale = getScreenScale(camera as PerspectiveCamera, wp, size.height, 8);
      const sx = pxScale / Math.max(1e-6, Math.abs(objectScale?.x ?? 1));
      const sy = pxScale / Math.max(1e-6, Math.abs(objectScale?.y ?? 1));
      const sz = pxScale / Math.max(1e-6, Math.abs(objectScale?.z ?? 1));
      tmp.scale.set(sx, sy, sz);
      tmp.updateMatrix();
      ref.setMatrixAt(i, tmp.matrix);
    }

    // Clear stale instances
    const cleanup = new Object3D();
    cleanup.scale.set(0, 0, 0);
    cleanup.updateMatrix();
    for (let i = count; i < prevCountRef.current; i++) {
      ref.setMatrixAt(i, cleanup.matrix);
    }
    ref.instanceMatrix.needsUpdate = true;
    prevCountRef.current = count;
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const idx = e.instanceId ?? -1;
    if (idx < 0) return;
    const edgeId = indexToEdgeId.current[idx];
    if (!edgeId) return;
    const mp = midpoints[idx];
    if (!mp) return;
    onMidpointDragStart(edgeId, mp.localPos);
  };

  return (
    <instancedMesh
      key={`midpoints-${instanceCapacity}`}
      ref={instanceRef}
      args={[boxGeo, cyanMat, instanceCapacity]}
      onPointerDown={handlePointerDown}
      renderOrder={2500}
    />
  );
};
