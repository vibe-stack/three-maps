import * as THREE from 'three';
import { createMeshFromGeometry } from '@/utils/geometry';
import { buildPipeGeometry } from '../utils/brush-geometry';
import { useGeometryStore } from '@/stores/geometry-store';
import { useSceneStore } from '@/stores/scene-store';
import { useSelectionStore } from '@/stores/selection-store';
import type { BrushDefinition, BrushParams, CommitStores, PreviewTransform } from './types';
import { computeRadialFootprint, quaternionToEuler } from './brush-utils';
import React from 'react';

const PipeIcon = React.createElement(
  'svg',
  { viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', width: 16, height: 16 },
  React.createElement('circle', { cx: '9', cy: '9', r: '6' }),
  React.createElement('circle', { cx: '9', cy: '9', r: '3' }),
);

export const PipeBrush: BrushDefinition = {
  id: 'pipe',
  label: 'Pipe',
  shortcut: 'q',
  icon: PipeIcon,
  footprintType: 'radial',

  buildPreviewGeometry(params: BrushParams): THREE.BufferGeometry {
    const { radius } = computeRadialFootprint(params);
    const h = Math.max(0.01, Math.abs(params.height));
    const outer = Math.max(0.02, radius);
    return new THREE.CylinderGeometry(outer, outer, h, 24, 1, true);
  },

  computePreviewTransform(params: BrushParams): PreviewTransform {
    const { center, quaternion } = computeRadialFootprint(params);
    const normal = new THREE.Vector3(params.normal.x, params.normal.y, params.normal.z).normalize();
    const hSigned = params.height;
    const worldCenter = center.clone().addScaledVector(normal, hSigned / 2);
    return {
      position: [worldCenter.x, worldCenter.y, worldCenter.z],
      quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
      scale: [1, 1, 1],
    };
  },

  commit(params: BrushParams, _stores: CommitStores): string {
    const { center, radius, quaternion } = computeRadialFootprint(params);
    const normal = new THREE.Vector3(params.normal.x, params.normal.y, params.normal.z).normalize();
    const hSigned = params.height;
    const h = Math.max(0.05, Math.abs(hSigned));
    const worldCenter = center.clone().addScaledVector(normal, hSigned / 2);
    const { vertices, faces } = buildPipeGeometry(radius, h, Math.max(0.04, radius * 0.2), 24);
    const mesh = createMeshFromGeometry('Pipe', vertices, faces);
    useGeometryStore.getState().addMesh(mesh);
    const scene = useSceneStore.getState();
    const objId = scene.createMeshObject('Pipe', mesh.id);
    scene.setTransform(objId, {
      position: { x: worldCenter.x, y: worldCenter.y, z: worldCenter.z },
      rotation: quaternionToEuler(quaternion),
      scale: { x: 1, y: 1, z: 1 },
    });
    scene.selectObject(objId);
    useSelectionStore.getState().selectObjects([objId], false);
    return objId;
  },
};
