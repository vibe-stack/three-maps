import * as THREE from 'three';
import { createMeshFromGeometry } from '@/utils/geometry';
import { buildDuctGeometry } from '../utils/brush-geometry';
import { useGeometryStore } from '@/stores/geometry-store';
import { useSceneStore } from '@/stores/scene-store';
import { useSelectionStore } from '@/stores/selection-store';
import type { BrushDefinition, BrushParams, CommitStores, PreviewTransform } from './types';
import { computeRectFootprint, quaternionToEuler } from './brush-utils';
import React from 'react';

const DuctIcon = React.createElement(
  'svg',
  { viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', width: 16, height: 16 },
  React.createElement('rect', { x: '2.5', y: '2.5', width: '13', height: '13', rx: '1' }),
  React.createElement('rect', { x: '5.2', y: '5.2', width: '7.6', height: '7.6', rx: '0.8' }),
);

function buildDuctPreview(width: number, height: number, depth: number): THREE.BufferGeometry {
  const w = Math.max(0.05, width);
  const h = Math.max(0.05, height);
  const d = Math.max(0.05, depth);
  const hw = w / 2;
  const hd = d / 2;
  const t = Math.max(0.02, Math.min(Math.min(hw * 0.85, h * 0.45, hd * 0.85), 0.12));
  const ihw = Math.max(0.01, hw - t);
  const ih = Math.max(0.01, h - t * 1.2);
  const ihd = Math.max(0.01, hd - t);

  const positions = new Float32Array([
    -hw, 0, -hd,   hw, 0, -hd,  -hw, h, -hd,   hw, h, -hd,
    -hw, 0,  hd,   hw, 0,  hd,  -hw, h,  hd,   hw, h,  hd,
    -ihw, t, -ihd,  ihw, t, -ihd, -ihw, ih, -ihd,  ihw, ih, -ihd,
    -ihw, t,  ihd,  ihw, t,  ihd, -ihw, ih,  ihd,  ihw, ih,  ihd,
  ]);

  const I = {
    ofbl: 0, ofbr: 1, oftl: 2, oftr: 3, obbl: 4, obbr: 5, obtl: 6, obtr: 7,
    ifbl: 8, ifbr: 9, iftl: 10, iftr: 11, ibbl: 12, ibbr: 13, ibtl: 14, ibtr: 15,
  };

  const indices = new Uint16Array([
    I.ofbl, I.obbl, I.obtl,  I.ofbl, I.obtl, I.oftl,
    I.ofbr, I.oftr, I.obtr,  I.ofbr, I.obtr, I.obbr,
    I.ofbl, I.ofbr, I.obbr,  I.ofbl, I.obbr, I.obbl,
    I.oftl, I.obtl, I.obtr,  I.oftl, I.obtr, I.oftr,

    I.ifbl, I.iftl, I.ibtl,  I.ifbl, I.ibtl, I.ibbl,
    I.ifbr, I.ibbr, I.ibtr,  I.ifbr, I.ibtr, I.iftr,
    I.ifbl, I.ibbl, I.ibbr,  I.ifbl, I.ibbr, I.ifbr,
    I.iftl, I.iftr, I.ibtr,  I.iftl, I.ibtr, I.ibtl,

    I.ofbl, I.oftl, I.iftl,  I.ofbl, I.iftl, I.ifbl,
    I.ofbr, I.ifbr, I.iftr,  I.ofbr, I.iftr, I.oftr,
    I.ofbl, I.ifbl, I.ifbr,  I.ofbl, I.ifbr, I.ofbr,
    I.oftl, I.oftr, I.iftr,  I.oftl, I.iftr, I.iftl,

    I.obbl, I.ibbl, I.ibtl,  I.obbl, I.ibtl, I.obtl,
    I.obbr, I.obtr, I.ibtr,  I.obbr, I.ibtr, I.ibbr,
    I.obbl, I.obbr, I.ibbr,  I.obbl, I.ibbr, I.ibbl,
    I.obtl, I.ibtl, I.ibtr,  I.obtl, I.ibtr, I.obtr,
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

export const DuctBrush: BrushDefinition = {
  id: 'duct',
  label: 'Duct',
  shortcut: 'w',
  icon: DuctIcon,
  footprintType: 'rect',

  buildPreviewGeometry(params: BrushParams): THREE.BufferGeometry {
    const { width, depth } = computeRectFootprint(params);
    const h = Math.max(0.01, Math.abs(params.height));
    return buildDuctPreview(width, h, depth);
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

    const { vertices, faces } = buildDuctGeometry(Math.max(0.01, width), h, Math.max(0.01, depth), 0.12);
    const mesh = createMeshFromGeometry('Duct', vertices, faces);
    useGeometryStore.getState().addMesh(mesh);
    const scene = useSceneStore.getState();
    const objId = scene.createMeshObject('Duct', mesh.id);
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
