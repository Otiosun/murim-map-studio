import type { KnowledgeState, PolylineGeometry, WorldPoint } from '@murim/domain';
import type { MapProjection, ProjectionNode, ProjectionRoute } from './projection';

export interface PlayerProjectionNodeInput {
  projectionId: string;
  kind: string;
  label: string;
  knowledgeState: KnowledgeState;
  confidence: number;
  role: 'known' | 'ghost';
  position: WorldPoint;
  approximateRadius?: number;
}

export interface PlayerProjectionRouteInput {
  projectionId: string;
  fromProjectionId: string;
  toProjectionId: string;
  label?: string;
  knowledgeState: KnowledgeState;
  path: PolylineGeometry;
}

export interface BuildPlayerMapProjectionInput {
  mapKey: string;
  generatedAt: string;
  nodes: readonly PlayerProjectionNodeInput[];
  routes: readonly PlayerProjectionRouteInput[];
}

function buildNode(input: PlayerProjectionNodeInput): ProjectionNode {
  const base: ProjectionNode = {
    id: input.projectionId,
    kind: 'node',
    metadata: {},
    position: input.position,
    role: input.role,
    symbolKey: `location:${input.kind}`,
    label: input.label,
    knowledgeState: input.knowledgeState,
    confidence: input.confidence,
  };

  if (input.role === 'known') {
    return base;
  }

  if (
    input.approximateRadius === undefined ||
    !Number.isFinite(input.approximateRadius) ||
    input.approximateRadius <= 0
  ) {
    throw new Error('Ghost projection nodes require a positive approximateRadius');
  }

  return {
    ...base,
    approximateLocation: {
      center: input.position,
      radius: input.approximateRadius,
    },
  };
}

function buildRoute(input: PlayerProjectionRouteInput): ProjectionRoute {
  return {
    id: input.projectionId,
    kind: 'route',
    metadata: {},
    fromItemId: input.fromProjectionId,
    toItemId: input.toProjectionId,
    path: input.path,
    styleKey: `route:${input.knowledgeState}`,
    ...(input.label === undefined ? {} : { label: input.label }),
    knowledgeState: input.knowledgeState,
  };
}

export function buildPlayerMapProjection(input: BuildPlayerMapProjectionInput): MapProjection {
  const nodeIds = new Set(input.nodes.map((node) => node.projectionId));
  const nodes = input.nodes.map(buildNode);
  const routes = input.routes
    .filter((route) => nodeIds.has(route.fromProjectionId) && nodeIds.has(route.toProjectionId))
    .map(buildRoute);

  return {
    projectionVersion: 1,
    mapKey: input.mapKey,
    generatedAt: input.generatedAt,
    items: [...nodes, ...routes],
  };
}
