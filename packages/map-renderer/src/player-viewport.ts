import type { MapProjection } from './projection';

export interface PlayerSvgViewport {
  minX: number;
  minY: number;
  width: number;
  height: number;
  viewBox: string;
}

const DEFAULT_PADDING = 24;
const MIN_NON_EMPTY_AXIS = 1;

const FALLBACK_VIEWPORT: PlayerSvgViewport = {
  minX: -50,
  minY: -50,
  width: 100,
  height: 100,
  viewBox: '-50 -50 100 100',
};

interface ViewportPoint {
  x: number;
  y: number;
}

function collectRenderablePoints(projection: MapProjection): ViewportPoint[] {
  const points: ViewportPoint[] = [];

  for (const item of projection.items) {
    if (item.kind === 'node') {
      if (item.role === 'ghost' && item.approximateLocation) {
        const { center, radius } = item.approximateLocation;
        points.push(
          { x: center.x - radius, y: center.y },
          { x: center.x + radius, y: center.y },
          { x: center.x, y: center.y - radius },
          { x: center.x, y: center.y + radius },
        );
      } else {
        points.push({ x: item.position.x, y: item.position.y });
      }
      continue;
    }

    if (item.kind === 'route') {
      for (const point of item.path.points) {
        points.push({ x: point.x, y: point.y });
      }
    }
  }

  return points;
}

function expandDegenerateAxis(min: number, max: number): [number, number] {
  if (max - min !== 0) {
    return [min, max];
  }

  const halfMinimum = MIN_NON_EMPTY_AXIS / 2;
  return [min - halfMinimum, max + halfMinimum];
}

export function hasRenderablePlayerMapGeometry(projection: MapProjection): boolean {
  return collectRenderablePoints(projection).length > 0;
}

export function calculatePlayerSvgViewport(
  projection: MapProjection,
  padding = DEFAULT_PADDING,
): PlayerSvgViewport {
  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError('Invalid viewport padding');
  }

  const points = collectRenderablePoints(projection);
  const [firstPoint] = points;
  if (!firstPoint) {
    return { ...FALLBACK_VIEWPORT };
  }

  let minX = firstPoint.x;
  let maxX = firstPoint.x;
  let minY = firstPoint.y;
  let maxY = firstPoint.y;

  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  [minX, maxX] = expandDegenerateAxis(minX, maxX);
  [minY, maxY] = expandDegenerateAxis(minY, maxY);

  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const width = maxX - minX;
  const height = maxY - minY;

  return {
    minX,
    minY,
    width,
    height,
    viewBox: `${minX} ${minY} ${width} ${height}`,
  };
}
