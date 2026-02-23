import * as THREE from 'three';
import { createMeshFromGeometry } from '@/utils/geometry';
import { buildWindowGeometry } from '../utils/brush-geometry';
import { useGeometryStore } from '@/stores/geometry-store';
import { useSceneStore } from '@/stores/scene-store';
import { useSelectionStore } from '@/stores/selection-store';
import type { BrushDefinition, BrushParams, CommitStores, PreviewTransform } from './types';
import { computeRectFootprint, quaternionToEuler } from './brush-utils';
import React from 'react';

const WindowIcon = React.createElement(
  'svg',
  { viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', width: 16, height: 16 },
  React.createElement('rect', { x: '2.5', y: '2.5', width: '13', height: '13', rx: '1' }),
  React.createElement('rect', { x: '5', y: '5', width: '8', height: '8' }),
  React.createElement('line', { x1: '9', y1: '5', x2: '9', y2: '13' }),
  React.createElement('line', { x1: '5', y1: '9', x2: '13', y2: '9' })
);

export const WindowBrush: BrushDefinition = {
  id: 'window',
  label: 'Window',
  shortcut: '9',
  icon: WindowIcon,
  footprintType: 'rect',

  buildPreviewGeometry(params: BrushParams): THREE.BufferGeometry {
    const { width, depth } = computeRectFootprint(params);
    const h = Math.max(0.01, Math.abs(params.height));
    const w = Math.max(0.01, width);
    const d = Math.max(0.01, depth);
    const openingRatio = Math.min(0.9, Math.max(0.15, params.doorOpeningRatio));
    const t = Math.min(w * 0.15, 0.25);
    const topBarH = Math.max(h * 0.1, 0.08);
    const bottomBarH = Math.max(h * 0.2, 0.08);
    const hw = w / 2;
    const maxOpeningHalf = Math.max(0.01, hw - t);
    const openingHW = Math.max(0.01, Math.min(maxOpeningHalf, (w * openingRatio) / 2));
    const hd = d / 2;

    const positions: number[] = [];
    const indices: number[] = [];
    let vi = 0;

    function addBox(x0:number,x1:number,y0:number,y1:number,z0:number,z1:number) {
      const b = vi;
      positions.push(
        x0,y0,z0, x1,y0,z0, x0,y0,z1, x1,y0,z1,
        x0,y1,z0, x1,y1,z0, x0,y1,z1, x1,y1,z1,
      );
      vi += 8;
      const [bfl,bfr,bbl,bbr,tfl,tfr,tbl,tbr] = Array.from({length:8},(_,j)=>b+j);
      indices.push(
        bfl,bbl,bbr, bfl,bbr,bfr,
        tfl,tfr,tbr, tfl,tbr,tbl,
        bfl,bfr,tfr, bfl,tfr,tfl,
        bbl,tbl,tbr, bbl,tbr,bbr,
        bfl,tfl,tbl, bfl,tbl,bbl,
        bfr,bbr,tbr, bfr,tbr,tfr,
      );
    }

    addBox(-hw, -openingHW, 0, h, -hd, hd);
    addBox(openingHW, hw, 0, h, -hd, hd);
    addBox(-openingHW, openingHW, Math.max(bottomBarH, h - topBarH), h, -hd, hd);
    addBox(-openingHW, openingHW, 0, bottomBarH, -hd, hd);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  },

  computePreviewTransform(params: BrushParams): PreviewTransform {
    const { center, quaternion } = computeRectFootprint(params);
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
    const { center, width, depth, quaternion } = computeRectFootprint(params);
    const h = Math.max(0.05, Math.abs(params.height));
    const q = quaternion.clone();
    if (params.height < 0) {
      const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
      q.multiply(flip);
    }
    const { vertices, faces } = buildWindowGeometry(
      Math.max(0.01, width),
      h,
      Math.max(0.01, depth),
      0.15,
      params.doorOpeningRatio,
      0.2,
    );
    const mesh = createMeshFromGeometry('Window', vertices, faces);
    useGeometryStore.getState().addMesh(mesh);
    const scene = useSceneStore.getState();
    const objId = scene.createMeshObject('Window', mesh.id);
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
