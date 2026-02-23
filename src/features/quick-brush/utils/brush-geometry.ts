/**
 * Geometry builders for Quick Brush shapes that don't exist in src/utils/geometry.ts.
 * Returns { vertices, faces } matching the BuiltGeometry interface.
 */
import { createVertex, createFace, vec3, vec2 } from '@/utils/geometry';
import type { BuiltGeometry } from '@/utils/geometry';

function applyArcCurvePoint(
  x: number,
  z: number,
  depth: number,
  curve: number,
  frontZ: number,
): { x: number; z: number } {
  const totalAngle = curve;
  if (Math.abs(totalAngle) < 1e-5 || depth < 1e-6) {
    return { x, z };
  }

  const zRel = z - frontZ;
  const radius = depth / totalAngle;
  const theta = (zRel / depth) * totalAngle;

  const pathX = radius * (1 - Math.cos(theta));
  const pathZ = radius * Math.sin(theta);

  // Tangent of centerline at theta is (sin(theta), cos(theta)) in XZ.
  // Perpendicular local-right vector for stair width offset:
  const nx = Math.cos(theta);
  const nz = -Math.sin(theta);

  return {
    x: pathX + nx * x,
    z: frontZ + pathZ + nz * x,
  };
}

export function curveStairsPositionBuffer(positions: number[], depth: number, curve: number): void {
  if (Math.abs(curve) < 1e-6 || depth < 1e-6) return;

  const vertCount = Math.floor(positions.length / 3);
  let frontZ = Infinity;
  for (let i = 0; i < vertCount; i++) {
    const zi = i * 3 + 2;
    frontZ = Math.min(frontZ, positions[zi]);
  }

  for (let i = 0; i < vertCount; i++) {
    const xi = i * 3;
    const zi = xi + 2;
    const curved = applyArcCurvePoint(positions[xi], positions[zi], depth, curve, frontZ);
    positions[xi] = curved.x;
    positions[zi] = curved.z;
  }
}

export function curveStairsVertices(
  vertices: Array<{ position: { x: number; y: number; z: number } }>,
  depth: number,
  curve: number,
): void {
  if (Math.abs(curve) < 1e-6 || depth < 1e-6) return;

  let frontZ = Infinity;
  for (const vertex of vertices) {
    frontZ = Math.min(frontZ, vertex.position.z);
  }

  for (const vertex of vertices) {
    const curved = applyArcCurvePoint(vertex.position.x, vertex.position.z, depth, curve, frontZ);
    vertex.position.x = curved.x;
    vertex.position.z = curved.z;
  }
}

// ---------- Wedge / Slope (triangular prism) ----------
// Origin at bottom-center. Sloped from back-bottom to front-top.
//
//   top-front edge
//   /|
//  / |  height
// /  |
// ----  depth
// width
export function buildWedgeGeometry(width: number, height: number, depth: number): BuiltGeometry {
  const hw = width / 2;
  const hd = depth / 2;

  // 6 vertices: bottom quad (4) + top front edge (2)
  // Bottom face
  const bfl = createVertex(vec3(-hw, 0, -hd), vec3(0, -1, 0), vec2(0, 0));
  const bfr = createVertex(vec3(hw, 0, -hd), vec3(0, -1, 0), vec2(1, 0));
  const bbl = createVertex(vec3(-hw, 0, hd), vec3(0, -1, 0), vec2(0, 1));
  const bbr = createVertex(vec3(hw, 0, hd), vec3(0, -1, 0), vec2(1, 1));
  // Top front edge (same X as bottom-front, elevated)
  const tfl = createVertex(vec3(-hw, height, -hd), vec3(0, 0, -1), vec2(0, 1));
  const tfr = createVertex(vec3(hw, height, -hd), vec3(0, 0, -1), vec2(1, 1));

  const vertices = [bfl, bfr, bbl, bbr, tfl, tfr];

  const faces = [
    // Bottom face (ccw from below)
    createFace([bfl.id, bbl.id, bbr.id, bfr.id]),
    // Front face (vertical wall)
    createFace([bfl.id, bfr.id, tfr.id, tfl.id]),
    // Slope (top face — the ramp surface)
    createFace([tfl.id, tfr.id, bbr.id, bbl.id]),
    // Left triangle
    createFace([bfl.id, tfl.id, bbl.id]),
    // Right triangle
    createFace([bfr.id, bbr.id, tfr.id]),
  ];

  return { vertices, faces };
}

// ---------- Stairs ----------
// Generates `steps` equal-height steps stacked along the depth axis.
// Origin at bottom-front-center.
export function buildStairsGeometry(width: number, height: number, depth: number, steps: number): BuiltGeometry {
  return buildStairsGeometryWithOptions(width, height, depth, steps, false, 0);
}

export function buildStairsGeometryWithOptions(
  width: number,
  height: number,
  depth: number,
  steps: number,
  closedBase: boolean,
  curve: number,
): BuiltGeometry {
  const clampedSteps = Math.max(2, Math.min(64, steps));
  const hw = width / 2;
  const stepH = height / clampedSteps;
  const stepD = depth / clampedSteps;
  const zStart = -depth / 2;

  const vertices: ReturnType<typeof createVertex>[] = [];
  const faces: ReturnType<typeof createFace>[] = [];

  for (let i = 0; i < clampedSteps; i++) {
    const x0 = -hw;
    const x1 = hw;
    const y0 = closedBase ? 0 : i * stepH;
    const y1 = (i + 1) * stepH;
    const z0 = zStart + i * stepD;
    const z1 = zStart + (i + 1) * stepD;

    // Each step is a box: front face (riser) + top face (tread)
    // We need 4 corners per step for riser, 4 for tread
    // To keep it simple, emit a box for each step
    const v = [
      // Bottom-front-left, bottom-front-right, bottom-back-left, bottom-back-right
      createVertex(vec3(x0, y0, z0)),
      createVertex(vec3(x1, y0, z0)),
      createVertex(vec3(x0, y0, z1)),
      createVertex(vec3(x1, y0, z1)),
      // Top-front-left, top-front-right, top-back-left, top-back-right
      createVertex(vec3(x0, y1, z0)),
      createVertex(vec3(x1, y1, z0)),
      createVertex(vec3(x0, y1, z1)),
      createVertex(vec3(x1, y1, z1)),
    ];
    vertices.push(...v);

    const [bfl, bfr, bbl, bbr, tfl, tfr, tbl, tbr] = v;
    // Bottom
    faces.push(createFace([bfl.id, bbl.id, bbr.id, bfr.id]));
    // Top (tread)
    faces.push(createFace([tfl.id, tfr.id, tbr.id, tbl.id]));
    // Front (riser)
    faces.push(createFace([bfl.id, bfr.id, tfr.id, tfl.id]));
    // Back
    faces.push(createFace([bbl.id, tbl.id, tbr.id, bbr.id]));
    // Left
    faces.push(createFace([bfl.id, tfl.id, tbl.id, bbl.id]));
    // Right
    faces.push(createFace([bfr.id, bbr.id, tbr.id, tfr.id]));
  }

  curveStairsVertices(vertices, depth, curve);

  return { vertices, faces };
}

// ---------- Door Frame ----------
// Two pillars + lintel. The opening is left open.
// Origin at bottom-center.
export function buildDoorGeometry(
  width: number,
  height: number,
  depth: number,
  wallThickness: number = 0.15,
  openingRatio: number = 0.6,
): BuiltGeometry {
  const hw = width / 2;
  const t = Math.min(wallThickness, width * 0.3);
  const lintelH = Math.max(height * 0.08, 0.1);
  const openingH = height - lintelH;
  const maxOpeningHalf = Math.max(0.01, hw - t);
  const openingHW = Math.max(0.01, Math.min(maxOpeningHalf, (width * Math.min(0.9, Math.max(0.15, openingRatio))) / 2));

  const vertices: ReturnType<typeof createVertex>[] = [];
  const faces: ReturnType<typeof createFace>[] = [];

  function addBox(
    x0: number, x1: number,
    y0: number, y1: number,
    z0: number, z1: number
  ) {
    const v = [
      createVertex(vec3(x0, y0, z0)), // bfl 0
      createVertex(vec3(x1, y0, z0)), // bfr 1
      createVertex(vec3(x0, y0, z1)), // bbl 2
      createVertex(vec3(x1, y0, z1)), // bbr 3
      createVertex(vec3(x0, y1, z0)), // tfl 4
      createVertex(vec3(x1, y1, z0)), // tfr 5
      createVertex(vec3(x0, y1, z1)), // tbl 6
      createVertex(vec3(x1, y1, z1)), // tbr 7
    ];
    vertices.push(...v);
    const [bfl, bfr, bbl, bbr, tfl, tfr, tbl, tbr] = v;
    faces.push(createFace([bfl.id, bbl.id, bbr.id, bfr.id])); // bottom
    faces.push(createFace([tfl.id, tfr.id, tbr.id, tbl.id])); // top
    faces.push(createFace([bfl.id, bfr.id, tfr.id, tfl.id])); // front
    faces.push(createFace([bbl.id, tbl.id, tbr.id, bbr.id])); // back
    faces.push(createFace([bfl.id, tfl.id, tbl.id, bbl.id])); // left
    faces.push(createFace([bfr.id, bbr.id, tbr.id, tfr.id])); // right
  }

  const hd = depth / 2;

  // Left pillar
  addBox(-hw, -openingHW, 0, height, -hd, hd);
  // Right pillar
  addBox(openingHW, hw, 0, height, -hd, hd);
  // Lintel (horizontal top bar)
  addBox(-openingHW, openingHW, openingH, height, -hd, hd);

  return { vertices, faces };
}

// ---------- Window Frame ----------
// Similar to door frame but includes a bottom frame bar (sill) so opening is enclosed.
// Origin at bottom-center.
export function buildWindowGeometry(
  width: number,
  height: number,
  depth: number,
  wallThickness: number = 0.15,
  openingRatio: number = 0.6,
  sillRatio: number = 0.2,
): BuiltGeometry {
  const hw = width / 2;
  const t = Math.min(wallThickness, width * 0.3);
  const topBarH = Math.max(height * 0.1, 0.08);
  const bottomBarH = Math.max(height * Math.max(0.08, Math.min(0.45, sillRatio)), 0.08);
  const maxOpeningHalf = Math.max(0.01, hw - t);
  const openingHW = Math.max(0.01, Math.min(maxOpeningHalf, (width * Math.min(0.9, Math.max(0.15, openingRatio))) / 2));

  const vertices: ReturnType<typeof createVertex>[] = [];
  const faces: ReturnType<typeof createFace>[] = [];

  function addBox(
    x0: number, x1: number,
    y0: number, y1: number,
    z0: number, z1: number
  ) {
    const v = [
      createVertex(vec3(x0, y0, z0)),
      createVertex(vec3(x1, y0, z0)),
      createVertex(vec3(x0, y0, z1)),
      createVertex(vec3(x1, y0, z1)),
      createVertex(vec3(x0, y1, z0)),
      createVertex(vec3(x1, y1, z0)),
      createVertex(vec3(x0, y1, z1)),
      createVertex(vec3(x1, y1, z1)),
    ];
    vertices.push(...v);
    const [bfl, bfr, bbl, bbr, tfl, tfr, tbl, tbr] = v;
    faces.push(createFace([bfl.id, bbl.id, bbr.id, bfr.id]));
    faces.push(createFace([tfl.id, tfr.id, tbr.id, tbl.id]));
    faces.push(createFace([bfl.id, bfr.id, tfr.id, tfl.id]));
    faces.push(createFace([bbl.id, tbl.id, tbr.id, bbr.id]));
    faces.push(createFace([bfl.id, tfl.id, tbl.id, bbl.id]));
    faces.push(createFace([bfr.id, bbr.id, tbr.id, tfr.id]));
  }

  const hd = depth / 2;

  // Left and right frame sides
  addBox(-hw, -openingHW, 0, height, -hd, hd);
  addBox(openingHW, hw, 0, height, -hd, hd);
  // Top bar
  addBox(-openingHW, openingHW, Math.max(bottomBarH, height - topBarH), height, -hd, hd);
  // Bottom bar (sill)
  addBox(-openingHW, openingHW, 0, bottomBarH, -hd, hd);

  return { vertices, faces };
}

// ---------- Arch ----------
// Two pillars + semicircular arch top.
// Origin at bottom-center.
export function buildArchGeometry(
  width: number,
  height: number,
  depth: number,
  segments: number = 8
): BuiltGeometry {
  const hw = width / 2;
  const t = Math.min(width * 0.15, 0.25);
  const pillarH = height * 0.5;
  const archRadius = (width / 2) - t;
  const archCenterY = pillarH;
  const hd = depth / 2;

  const vertices: ReturnType<typeof createVertex>[] = [];
  const faces: ReturnType<typeof createFace>[] = [];

  function addBox(
    x0: number, x1: number,
    y0: number, y1: number,
    z0: number, z1: number
  ) {
    const v = [
      createVertex(vec3(x0, y0, z0)),
      createVertex(vec3(x1, y0, z0)),
      createVertex(vec3(x0, y0, z1)),
      createVertex(vec3(x1, y0, z1)),
      createVertex(vec3(x0, y1, z0)),
      createVertex(vec3(x1, y1, z0)),
      createVertex(vec3(x0, y1, z1)),
      createVertex(vec3(x1, y1, z1)),
    ];
    vertices.push(...v);
    const [bfl, bfr, bbl, bbr, tfl, tfr, tbl, tbr] = v;
    faces.push(createFace([bfl.id, bbl.id, bbr.id, bfr.id]));
    faces.push(createFace([tfl.id, tfr.id, tbr.id, tbl.id]));
    faces.push(createFace([bfl.id, bfr.id, tfr.id, tfl.id]));
    faces.push(createFace([bbl.id, tbl.id, tbr.id, bbr.id]));
    faces.push(createFace([bfl.id, tfl.id, tbl.id, bbl.id]));
    faces.push(createFace([bfr.id, bbr.id, tbr.id, tfr.id]));
  }

  // Left pillar
  addBox(-hw, -archRadius, 0, pillarH, -hd, hd);
  // Right pillar
  addBox(archRadius, hw, 0, pillarH, -hd, hd);

  // Arch segments: wedge-shaped pieces forming the semicircle
  const clampedSeg = Math.max(4, Math.min(64, segments));

  for (let i = 0; i < clampedSeg; i++) {
    const a0 = Math.PI * (i / clampedSeg);
    const a1 = Math.PI * ((i + 1) / clampedSeg);

    // Inner radius points
    const ix0 = -Math.cos(a0) * archRadius;
    const iy0 = Math.sin(a0) * archRadius + archCenterY;
    const ix1 = -Math.cos(a1) * archRadius;
    const iy1 = Math.sin(a1) * archRadius + archCenterY;

    // Outer radius points
    const ox0 = -Math.cos(a0) * (archRadius + t);
    const oy0 = Math.sin(a0) * (archRadius + t) + archCenterY;
    const ox1 = -Math.cos(a1) * (archRadius + t);
    const oy1 = Math.sin(a1) * (archRadius + t) + archCenterY;

    // Front face (z = -hd)
    const fi0 = createVertex(vec3(ix0, iy0, -hd));
    const fi1 = createVertex(vec3(ix1, iy1, -hd));
    const fo0 = createVertex(vec3(ox0, oy0, -hd));
    const fo1 = createVertex(vec3(ox1, oy1, -hd));
    // Back face (z = hd)
    const bi0 = createVertex(vec3(ix0, iy0, hd));
    const bi1 = createVertex(vec3(ix1, iy1, hd));
    const bo0 = createVertex(vec3(ox0, oy0, hd));
    const bo1 = createVertex(vec3(ox1, oy1, hd));

    vertices.push(fi0, fi1, fo0, fo1, bi0, bi1, bo0, bo1);

    // Front face
    faces.push(createFace([fo0.id, fo1.id, fi1.id, fi0.id]));
    // Back face
    faces.push(createFace([bi0.id, bi1.id, bo1.id, bo0.id]));
    // Outer surface
    faces.push(createFace([fo0.id, bo0.id, bo1.id, fo1.id]));
    // Inner surface (opening)
    faces.push(createFace([fi0.id, fi1.id, bi1.id, bi0.id]));
    // Side caps
    faces.push(createFace([fo0.id, fi0.id, bi0.id, bo0.id]));
    faces.push(createFace([fi1.id, fo1.id, bo1.id, bi1.id]));
  }

  return { vertices, faces };
}

// ---------- Pipe (hollow cylinder) ----------
// Origin at bottom-center, aligned to local +Y.
export function buildPipeGeometry(
  outerRadius: number,
  height: number,
  wallThickness: number = 0.12,
  radialSegments: number = 24,
): BuiltGeometry {
  const seg = Math.max(6, Math.min(96, Math.floor(radialSegments)));
  const ro = Math.max(0.02, outerRadius);
  const ri = Math.max(0.005, ro - Math.max(0.005, Math.min(ro * 0.9, wallThickness)));
  const h = Math.max(0.02, height);

  const vertices: ReturnType<typeof createVertex>[] = [];
  const faces: ReturnType<typeof createFace>[] = [];

  const outerBottom: ReturnType<typeof createVertex>[] = [];
  const outerTop: ReturnType<typeof createVertex>[] = [];
  const innerBottom: ReturnType<typeof createVertex>[] = [];
  const innerTop: ReturnType<typeof createVertex>[] = [];

  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);

    const ob = createVertex(vec3(c * ro, 0, s * ro));
    const ot = createVertex(vec3(c * ro, h, s * ro));
    const ib = createVertex(vec3(c * ri, 0, s * ri));
    const it = createVertex(vec3(c * ri, h, s * ri));

    outerBottom.push(ob);
    outerTop.push(ot);
    innerBottom.push(ib);
    innerTop.push(it);
    vertices.push(ob, ot, ib, it);
  }

  for (let i = 0; i < seg; i++) {
    const n = (i + 1) % seg;

    faces.push(createFace([
      outerBottom[i].id,
      outerBottom[n].id,
      outerTop[n].id,
      outerTop[i].id,
    ]));

    faces.push(createFace([
      innerBottom[i].id,
      innerTop[i].id,
      innerTop[n].id,
      innerBottom[n].id,
    ]));

    faces.push(createFace([
      outerTop[i].id,
      outerTop[n].id,
      innerTop[n].id,
      innerTop[i].id,
    ]));

    faces.push(createFace([
      outerBottom[i].id,
      innerBottom[i].id,
      innerBottom[n].id,
      outerBottom[n].id,
    ]));
  }

  return { vertices, faces };
}

// ---------- Duct (hollow rectangular prism) ----------
// Origin at bottom-center, aligned to local +Y.
export function buildDuctGeometry(
  width: number,
  height: number,
  depth: number,
  wallThickness: number = 0.12,
): BuiltGeometry {
  const w = Math.max(0.05, width);
  const h = Math.max(0.05, height);
  const d = Math.max(0.05, depth);
  const hw = w / 2;
  const hd = d / 2;

  const maxT = Math.min(hw * 0.85, h * 0.45, hd * 0.85);
  const t = Math.max(0.01, Math.min(maxT, wallThickness));

  const ihw = Math.max(0.01, hw - t);
  const ih = Math.max(0.01, h - t * 1.2);
  const ihd = Math.max(0.01, hd - t);

  const vertices: ReturnType<typeof createVertex>[] = [];
  const faces: ReturnType<typeof createFace>[] = [];

  const ofbl = createVertex(vec3(-hw, 0, -hd));
  const ofbr = createVertex(vec3(hw, 0, -hd));
  const oftl = createVertex(vec3(-hw, h, -hd));
  const oftr = createVertex(vec3(hw, h, -hd));
  const obbl = createVertex(vec3(-hw, 0, hd));
  const obbr = createVertex(vec3(hw, 0, hd));
  const obtl = createVertex(vec3(-hw, h, hd));
  const obtr = createVertex(vec3(hw, h, hd));

  const ifbl = createVertex(vec3(-ihw, t, -ihd));
  const ifbr = createVertex(vec3(ihw, t, -ihd));
  const iftl = createVertex(vec3(-ihw, ih, -ihd));
  const iftr = createVertex(vec3(ihw, ih, -ihd));
  const ibbl = createVertex(vec3(-ihw, t, ihd));
  const ibbr = createVertex(vec3(ihw, t, ihd));
  const ibtl = createVertex(vec3(-ihw, ih, ihd));
  const ibtr = createVertex(vec3(ihw, ih, ihd));

  vertices.push(ofbl, ofbr, oftl, oftr, obbl, obbr, obtl, obtr, ifbl, ifbr, iftl, iftr, ibbl, ibbr, ibtl, ibtr);

  faces.push(createFace([ofbl.id, obbl.id, obtl.id, oftl.id]));
  faces.push(createFace([ofbr.id, oftr.id, obtr.id, obbr.id]));
  faces.push(createFace([ofbl.id, ofbr.id, obbr.id, obbl.id]));
  faces.push(createFace([oftl.id, obtl.id, obtr.id, oftr.id]));

  faces.push(createFace([ifbl.id, iftl.id, ibtl.id, ibbl.id]));
  faces.push(createFace([ifbr.id, ibbr.id, ibtr.id, iftr.id]));
  faces.push(createFace([ifbl.id, ibbl.id, ibbr.id, ifbr.id]));
  faces.push(createFace([iftl.id, iftr.id, ibtr.id, ibtl.id]));

  faces.push(createFace([ofbl.id, oftl.id, iftl.id, ifbl.id]));
  faces.push(createFace([ofbr.id, ifbr.id, iftr.id, oftr.id]));
  faces.push(createFace([ofbl.id, ifbl.id, ifbr.id, ofbr.id]));
  faces.push(createFace([oftl.id, oftr.id, iftr.id, iftl.id]));

  faces.push(createFace([obbl.id, ibbl.id, ibtl.id, obtl.id]));
  faces.push(createFace([obbr.id, obtr.id, ibtr.id, ibbr.id]));
  faces.push(createFace([obbl.id, obbr.id, ibbr.id, ibbl.id]));
  faces.push(createFace([obtl.id, ibtl.id, ibtr.id, obtr.id]));

  return { vertices, faces };
}

// ---------- Spiral Stairs ----------
// Origin at bottom-center, aligned to local +Y.
export function buildSpiralStairsGeometry(
  outerRadius: number,
  height: number,
  steps: number,
  innerRadiusRatio: number = 0.35,
  turns: number = 1,
): BuiltGeometry {
  const clampedSteps = Math.max(3, Math.min(128, Math.floor(steps)));
  const ro = Math.max(0.08, outerRadius);
  const ri = Math.max(0.02, ro * Math.max(0.05, Math.min(0.85, innerRadiusRatio)));
  const h = Math.max(0.05, height);
  const stepH = h / clampedSteps;
  const sweep = Math.PI * 2 * Math.max(0.25, Math.min(4, turns));
  const aStart = -Math.PI / 2;

  const vertices: ReturnType<typeof createVertex>[] = [];
  const faces: ReturnType<typeof createFace>[] = [];

  const point = (r: number, a: number, y: number) => vec3(Math.cos(a) * r, y, Math.sin(a) * r);

  for (let i = 0; i < clampedSteps; i++) {
    const t0 = i / clampedSteps;
    const t1 = (i + 1) / clampedSteps;
    const a0 = aStart + sweep * t0;
    const a1 = aStart + sweep * t1;
    const y0 = i * stepH;
    const y1 = (i + 1) * stepH;

    const ib0 = createVertex(point(ri, a0, y0));
    const ib1 = createVertex(point(ri, a1, y0));
    const ob0 = createVertex(point(ro, a0, y0));
    const ob1 = createVertex(point(ro, a1, y0));
    const it0 = createVertex(point(ri, a0, y1));
    const it1 = createVertex(point(ri, a1, y1));
    const ot0 = createVertex(point(ro, a0, y1));
    const ot1 = createVertex(point(ro, a1, y1));

    vertices.push(ib0, ib1, ob0, ob1, it0, it1, ot0, ot1);

    faces.push(createFace([ib0.id, ob0.id, ob1.id, ib1.id]));
    faces.push(createFace([it0.id, it1.id, ot1.id, ot0.id]));
    faces.push(createFace([ib0.id, ib1.id, it1.id, it0.id]));
    faces.push(createFace([ob0.id, ot0.id, ot1.id, ob1.id]));
    faces.push(createFace([ib0.id, it0.id, ot0.id, ob0.id]));
    faces.push(createFace([ib1.id, ob1.id, ot1.id, it1.id]));
  }

  return { vertices, faces };
}
