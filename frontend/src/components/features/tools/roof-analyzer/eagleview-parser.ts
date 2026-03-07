/**
 * EagleView JSON Parser
 * Parses EagleView export JSON into structured roof data.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D extends Point2D {
  z: number;
}

export interface RoofLine {
  id: string;
  type: string;
  ptIds: string[];
  length: number;
}

export interface RoofFace {
  id: string;
  designator: string;
  type: string;
  area: number;
  pitch: string;
  lineIds: string[];
  vertices: Point2D[];
  centroid: Point2D;
  isAccessory: boolean;
}

export interface RoofData {
  points: Record<string, Point3D>;
  lines: Record<string, RoofLine>;
  faces: RoofFace[];
}

export const LINE_COLORS: Record<string, { color: string; label: string }> = {
  RIDGE:     { color: '#ff4d4d', label: 'Ridge' },
  HIP:       { color: '#ff9900', label: 'Hip' },
  VALLEY:    { color: '#4da6ff', label: 'Valley' },
  RAKE:      { color: '#00cc66', label: 'Rake' },
  EAVE:      { color: '#e0e0e0', label: 'Eave' },
  FLASHING:  { color: '#cc66ff', label: 'Flashing' },
  STEPFLASH: { color: '#ffee44', label: 'Step Flash' },
  OTHER:     { color: '#aaaaaa', label: 'Other' },
  HIDDEN:    { color: '#333',    label: 'Hidden' },
};

function computeCentroid(pts: Point2D[]): Point2D {
  if (!pts.length) return { x: 0, y: 0 };
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

function buildPolygon(
  orderedLineIds: string[],
  lines: Record<string, RoofLine>,
  points: Record<string, Point3D>,
): Point2D[] {
  if (!orderedLineIds || !orderedLineIds.length) return [];

  const quota: Record<string, number> = {};
  for (const lid of orderedLineIds) quota[lid] = (quota[lid] || 0) + 1;

  const segData: Record<string, { ptIds: string[]; first: string; last: string }> = {};
  for (const lid of Object.keys(quota)) {
    const l = lines[lid];
    if (!l) continue;
    const ptIds = l.ptIds.filter(pid => points[pid]);
    if (ptIds.length < 2) continue;
    segData[lid] = { ptIds, first: ptIds[0], last: ptIds[ptIds.length - 1] };
  }

  interface Edge {
    to: string;
    lid: string;
    rev: boolean;
    key: string;
  }

  const adj: Record<string, Edge[]> = {};
  for (const [lid, seg] of Object.entries(segData)) {
    const count = quota[lid] || 1;
    for (let k = 0; k < count; k++) {
      (adj[seg.first] = adj[seg.first] || []).push({ to: seg.last, lid, rev: false, key: lid + ':' + k });
      (adj[seg.last] = adj[seg.last] || []).push({ to: seg.first, lid, rev: true, key: lid + ':' + k + 'r' });
    }
  }

  const firstSeg = segData[orderedLineIds[0]];
  const startId = firstSeg ? firstSeg.first : Object.keys(adj)[0];
  if (!startId) return [];

  const usedKeys = new Set<string>();
  const chain: string[] = [startId];
  let cur = startId;
  let pathIdx = 0;
  const totalSteps = orderedLineIds.length;

  for (let step = 0; step < totalSteps * 2; step++) {
    const edges = (adj[cur] || []).filter(e => !usedKeys.has(e.key));
    if (!edges.length) break;

    const preferred = edges.find(e => e.lid === orderedLineIds[pathIdx % orderedLineIds.length]);
    const edge = preferred || edges[0];

    usedKeys.add(edge.key);
    const twin = (adj[edge.to] || []).find(e => e.lid === edge.lid && e.rev !== edge.rev && !usedKeys.has(e.key));
    if (twin) usedKeys.add(twin.key);

    const seg = segData[edge.lid];
    const pts = edge.rev ? [...seg.ptIds].reverse() : seg.ptIds;
    pts.slice(1).forEach(pid => { if (points[pid]) chain.push(pid); });

    cur = edge.to;
    pathIdx++;
  }

  const result: string[] = [];
  for (const pid of chain) {
    if (!result.length || result[result.length - 1] !== pid) result.push(pid);
  }
  if (result.length > 1 && result[0] === result[result.length - 1]) result.pop();

  return result.map(pid => points[pid]).filter(Boolean).map(p => ({ x: p.x, y: p.y }));
}

export function parseEagleView(raw: any): RoofData {
  const roof = raw.EAGLEVIEW_EXPORT.STRUCTURES.ROOF;
  const points: Record<string, Point3D> = {};
  const pointList: any[] = ([] as any[]).concat(roof.POINTS.POINT);
  for (const p of pointList) {
    const [x, y, z] = (p['@data'] as string).split(',').map(Number);
    points[p['@id']] = { x, y, z };
  }

  const lines: Record<string, RoofLine> = {};
  const lineList: any[] = ([] as any[]).concat(roof.LINES.LINE);
  for (const l of lineList) {
    const ptIds: string[] = (l['@path'] as string).split(',');
    let length = 0;
    for (let i = 0; i < ptIds.length - 1; i++) {
      const a = points[ptIds[i]], b = points[ptIds[i + 1]];
      if (a && b) length += Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
    }
    lines[l['@id']] = { id: l['@id'], type: l['@type'], ptIds, length };
  }

  const faces: RoofFace[] = [];
  const faceList: any[] = ([] as any[]).concat(roof.FACES.FACE);
  for (const f of faceList) {
    const poly = f.POLYGON;
    const rawPath: string[] = (poly['@path'] as string).split(',').filter((x: string) => x.startsWith('L'));
    const lineIds = [...new Set(rawPath)];
    const area = parseFloat(poly['@unroundedsize'] || poly['@size'] || 0);
    const pitch = poly['@pitch'] || '?';
    const vertices = buildPolygon(rawPath, lines, points);
    const centroid = computeCentroid(vertices);
    const isAccessory = /^\d+$/.test(f['@designator']);
    faces.push({ id: f['@id'], designator: f['@designator'], type: f['@type'], area, pitch, lineIds, vertices, centroid, isAccessory });
  }

  return { points, lines, faces };
}

// Geometry helpers
export function slopeFactor(pitch: string): number {
  const p = parseFloat(pitch);
  if (isNaN(p)) return 1;
  return Math.sqrt(1 + (p / 12) ** 2);
}

export function polygonArea2D(poly: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function clipPolygonByHalfPlane(poly: Point2D[], ax: number, ay: number, bx: number, by: number): Point2D[] {
  if (!poly.length) return [];
  const inside = (pt: Point2D) => (bx - ax) * (pt.y - ay) - (by - ay) * (pt.x - ax) >= 0;
  const intersect = (p1: Point2D, p2: Point2D): Point2D => {
    const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y, dx2 = bx - ax, dy2 = by - ay;
    const t = ((ax - p1.x) * dy2 - (ay - p1.y) * dx2) / (dx1 * dy2 - dy1 * dx2);
    return { x: p1.x + t * dx1, y: p1.y + t * dy1 };
  };
  const out: Point2D[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i], prev = poly[(i + poly.length - 1) % poly.length];
    const cIn = inside(cur), pIn = inside(prev);
    if (cIn) { if (!pIn) out.push(intersect(prev, cur)); out.push(cur); }
    else if (pIn) out.push(intersect(prev, cur));
  }
  return out;
}

function signedArea2D(poly: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function ensureCCW(poly: Point2D[]): Point2D[] {
  return signedArea2D(poly) >= 0 ? poly : [...poly].reverse();
}

export function clipPolygonByPoly(subject: Point2D[], clip: Point2D[]): Point2D[] {
  if (!subject.length || !clip.length) return [];
  const ccwClip = ensureCCW(clip);
  let output = [...subject];
  for (let i = 0; i < ccwClip.length; i++) {
    if (!output.length) return [];
    const a = ccwClip[i], b = ccwClip[(i + 1) % ccwClip.length];
    output = clipPolygonByHalfPlane(output, a.x, a.y, b.x, b.y);
  }
  return output;
}

// Hit testing
export function ptInRect(rx1: number, ry1: number, rx2: number, ry2: number, px: number, py: number): boolean {
  return px >= Math.min(rx1, rx2) && px <= Math.max(rx1, rx2) && py >= Math.min(ry1, ry2) && py <= Math.max(ry1, ry2);
}

export function segIntersectsRect(ax: number, ay: number, bx: number, by: number, rx1: number, ry1: number, rx2: number, ry2: number): boolean {
  if (ptInRect(rx1, ry1, rx2, ry2, ax, ay) || ptInRect(rx1, ry1, rx2, ry2, bx, by)) return true;
  const x1 = Math.min(rx1, rx2), x2 = Math.max(rx1, rx2), y1 = Math.min(ry1, ry2), y2 = Math.max(ry1, ry2);
  const dx = bx - ax, dy = by - ay;
  let tMin = 0, tMax = 1;
  for (const [d, n] of [[dy, -(ax - x1) * dy + (ay - y1) * dx], [-dy, (ax - x2) * dy - (ay - y2) * dx], [dx, -(ay - y1) * dx + (ax - x1) * dy], [-dx, (ay - y2) * dx - (ax - x2) * dy]]) {
    if (d === 0) { if (n < 0) return false; }
    else { const t = n / d; if (d < 0) tMin = Math.max(tMin, t); else tMax = Math.min(tMax, t); }
  }
  return tMin <= tMax;
}
