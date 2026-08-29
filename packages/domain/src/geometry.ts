export interface WorldPoint {
  x: number;
  y: number;
}

export interface PointGeometry {
  kind: 'point';
  point: WorldPoint;
}

export interface PolylineGeometry {
  kind: 'polyline';
  points: WorldPoint[];
}

export interface PolygonGeometry {
  kind: 'polygon';
  vertices: WorldPoint[];
}

export interface MultiPolygonGeometry {
  kind: 'multi-polygon';
  polygons: PolygonGeometry[];
}

export interface ApproximateLocation {
  center: WorldPoint;
  radius: number;
}

export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;
export type WorldGeometry = PointGeometry | PolylineGeometry | AreaGeometry;
