import * as THREE from 'three';
import { createMeshFromGeometry } from '@/utils/geometry';
import { buildSpiralStairsGeometry } from '../utils/brush-geometry';
import { useGeometryStore } from '@/stores/geometry-store';
import { useSceneStore } from '@/stores/scene-store';
import { useSelectionStore } from '@/stores/selection-store';
import type { BrushDefinition, BrushParams, CommitStores, PreviewTransform } from './types';
import { computeRadialFootprint, quaternionToEuler } from './brush-utils';
import React from 'react';

const SpiralStairsIcon = React.createElement(
  'svg',
  { viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', width: 16, height: 16 },
  React.createElement('path', { d: 'M14 4c-2.8 0-5 2.2-5 5 0 2-1.6 3.5-3.5 3.5-1.1 0-2.1-.4-2.9-1.1' }),
  React.createElement('path', { d: 'M6.5 15L2.8 11.2' }),
  React.createElement('path', { d: 'M14 4v3.2h-3.2' }),
);

function buildSpiralPreview(radius: number, height: number, steps: number): THREE.BufferGeometry {
  const ro = Math.max(0.08, radius);
  const ri = Math.max(0.02, ro * 0.35);
  const clampedSteps = Math.max(3, Math.min(128, Math.floor(steps)));
  const h = Math.max(0.05, height);
  const stepH = h / clampedSteps;
  const sweep = Math.PI * 2;
  const start = -Math.PI / 2;

  const positions: number[] = [];
  const indices: number[] = [];
  let vi = 0;

  const push = (x: number, y: number, z: number): number => {
    positions.push(x, y, z);
    return vi++;
  };

  const p = (r: number, a: number, y: number) => ({ x: Math.cos(a) * r, y, z: Math.sin(a) * r });

  for (let i = 0; i < clampedSteps; i++) {
    const t0 = i / clampedSteps;
    const t1 = (i + 1) / clampedSteps;
    const a0 = start + sweep * t0;
    const a1 = start + sweep * t1;
    const y0 = i * stepH;
    const y1 = (i + 1) * stepH;

    const ib0p = p(ri, a0, y0); const ib1p = p(ri, a1, y0);
    const ob0p = p(ro, a0, y0); const ob1p = p(ro, a1, y0);
    const it0p = p(ri, a0, y1); const it1p = p(ri, a1, y1);
    const ot0p = p(ro, a0, y1); const ot1p = p(ro, a1, y1);

    const ib0 = push(ib0p.x, ib0p.y, ib0p.z);
    const ib1 = push(ib1p.x, ib1p.y, ib1p.z);
    const ob0 = push(ob0p.x, ob0p.y, ob0p.z);
    const ob1 = push(ob1p.x, ob1p.y, ob1p.z);
    const it0 = push(it0p.x, it0p.y, it0p.z);
    const it1 = push(it1p.x, it1p.y, it1p.z);
    const ot0 = push(ot0p.x, ot0p.y, ot0p.z);
    const ot1 = push(ot1p.x, ot1p.y, ot1p.z);

    const q = (a: number, b: number, c: number, d: number) => {
      indices.push(a, b, c, a, c, d);
    };

    q(ib0, ob0, ob1, ib1);
    q(it0, it1, ot1, ot0);
    q(ib0, ib1, it1, it0);
    q(ob0, ot0, ot1, ob1);
    q(ib0, it0, ot0, ob0);
    q(ib1, ob1, ot1, it1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export const SpiralStairsBrush: BrushDefinition = {
  id: 'spiral-stairs',
  label: 'Spiral Stairs',
  shortcut: 'e',
  icon: SpiralStairsIcon,
  footprintType: 'radial',

  buildPreviewGeometry(params: BrushParams): THREE.BufferGeometry {
    const { radius } = computeRadialFootprint(params);
    const h = Math.max(0.01, Math.abs(params.height));
    const steps = Math.max(3, Math.round(params.stairsCount));
    return buildSpiralPreview(radius, h, steps);
  },

  computePreviewTransform(params: BrushParams): PreviewTransform {
    const { center, quaternion } = computeRadialFootprint(params);
    const q = quaternion.clone();
    if (params.height < 0) {
      const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
      q.multiply(flip);
    }
    return {
      position: [center.x, center.y, center.z],
      quaternion: [q.x, q.y, q.z, q.w],
      scale: [1, 1, 1],
    };
  },

  commit(params: BrushParams, _stores: CommitStores): string {
    const { center, radius, quaternion } = computeRadialFootprint(params);
    const h = Math.max(0.05, Math.abs(params.height));
    const q = quaternion.clone();
    if (params.height < 0) {
      const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
      q.multiply(flip);
    }

    const steps = Math.max(3, Math.round(params.stairsCount));
    const { vertices, faces } = buildSpiralStairsGeometry(radius, h, steps, 0.35, 1);
    const mesh = createMeshFromGeometry('Spiral Stairs', vertices, faces);
    useGeometryStore.getState().addMesh(mesh);
    const scene = useSceneStore.getState();
    const objId = scene.createMeshObject('Spiral Stairs', mesh.id);
    scene.setTransform(objId, {
      position: { x: center.x, y: center.y, z: center.z },
      rotation: quaternionToEuler(q),
      scale: { x: 1, y: 1, z: 1 },
    });
    scene.selectObject(objId);
    useSelectionStore.getState().selectObjects([objId], false);
    return objId;
  },
};
