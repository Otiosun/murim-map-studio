import {
  assertPlayerProjectionSafe,
  buildPlayerMapProjection,
  PLAYER_NODE_DETAIL_CATEGORY_MAX_LENGTH,
  PLAYER_NODE_DETAIL_SUMMARY_MAX_LENGTH,
  type MapProjection,
  type PlayerProjectionNodeInput,
  type PlayerProjectionRouteInput,
  type ProjectionNodeDetail,
} from '@murim/map-renderer';
import { parseMapProjection } from '@murim/world-schema';

const PLAYER_MAP_KEY = 'player-map';
const KNOWLEDGE_STATES = [
  'rumor',
  'indication',
  'localized',
  'confirmed',
  'investigated',
  'understood',
] as const;

type KnowledgeState = (typeof KNOWLEDGE_STATES)[number];
type TableName = 'map_nodes' | 'map_routes';

interface QueryError {
  message?: string;
}

interface QueryResult {
  data: unknown;
  error: QueryError | null;
}

interface PlayerApiClient {
  schema(schema: string): unknown;
}

interface PlayerApiSchemaClient {
  from(table: TableName): {
    select(columns: string): {
      eq(column: string, value: string): PromiseLike<QueryResult>;
    };
  };
}

export interface PlayerProjectionSource {
  load(playerId: string): Promise<MapProjection>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isKnowledgeState(value: unknown): value is KnowledgeState {
  return typeof value === 'string' && (KNOWLEDGE_STATES as readonly string[]).includes(value);
}

function readNodeDetail(value: unknown): ProjectionNodeDetail | undefined {
  if (!isRecord(value)) {
    throw new Error('Invalid player map node detail');
  }

  const keys = Object.keys(value);
  if (keys.some((key) => key !== 'category' && key !== 'summary')) {
    throw new Error('Invalid player map node detail');
  }

  let category: string | undefined;
  let summary: string | undefined;

  if ('category' in value) {
    if (typeof value.category !== 'string') {
      throw new Error('Invalid player map node detail');
    }
    category = value.category.trim();
    if (category.length < 1 || category.length > PLAYER_NODE_DETAIL_CATEGORY_MAX_LENGTH) {
      throw new Error('Invalid player map node detail');
    }
  }

  if ('summary' in value) {
    if (typeof value.summary !== 'string') {
      throw new Error('Invalid player map node detail');
    }
    summary = value.summary.trim();
    if (summary.length < 1 || summary.length > PLAYER_NODE_DETAIL_SUMMARY_MAX_LENGTH) {
      throw new Error('Invalid player map node detail');
    }
  }

  if (category === undefined && summary === undefined) {
    return undefined;
  }

  return {
    ...(category === undefined ? {} : { category }),
    ...(summary === undefined ? {} : { summary }),
  };
}

function readPointGeometry(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value) || value.type !== 'Point' || !Array.isArray(value.coordinates)) {
    return null;
  }

  const coordinates = value.coordinates;
  if (
    coordinates.length !== 2 ||
    typeof coordinates[0] !== 'number' ||
    typeof coordinates[1] !== 'number' ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    return null;
  }

  return { x: coordinates[0], y: coordinates[1] };
}

function readLineStringGeometry(
  value: unknown,
): { kind: 'polyline'; points: Array<{ x: number; y: number }> } | null {
  if (!isRecord(value) || value.type !== 'LineString' || !Array.isArray(value.coordinates)) {
    return null;
  }

  if (value.coordinates.length < 2) {
    return null;
  }

  const points: Array<{ x: number; y: number }> = [];
  for (const coordinate of value.coordinates) {
    if (
      !Array.isArray(coordinate) ||
      coordinate.length !== 2 ||
      typeof coordinate[0] !== 'number' ||
      typeof coordinate[1] !== 'number' ||
      !Number.isFinite(coordinate[0]) ||
      !Number.isFinite(coordinate[1])
    ) {
      return null;
    }
    points.push({ x: coordinate[0], y: coordinate[1] });
  }

  return { kind: 'polyline', points };
}

function parseNode(row: unknown, playerId: string): PlayerProjectionNodeInput {
  if (!isRecord(row)) {
    throw new Error('Invalid player map node');
  }

  const position = readPointGeometry(row.geom);
  const role = row.role;
  const confidence = row.confidence;
  const detail = readNodeDetail(row.details);

  if (
    row.owner_user_id !== playerId ||
    !isNonEmptyString(row.projection_id) ||
    !isNonEmptyString(row.kind) ||
    !isNonEmptyString(row.label) ||
    !isKnowledgeState(row.knowledge_state) ||
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    (role !== 'known' && role !== 'ghost') ||
    position === null
  ) {
    throw new Error('Invalid player map node');
  }

  if (role === 'known') {
    if (row.approximate_radius !== null) {
      throw new Error('Invalid player map node');
    }

    return {
      projectionId: row.projection_id,
      kind: row.kind,
      label: row.label,
      knowledgeState: row.knowledge_state,
      confidence,
      role,
      position,
      ...(detail === undefined ? {} : { detail }),
    };
  }

  if (
    typeof row.approximate_radius !== 'number' ||
    !Number.isFinite(row.approximate_radius) ||
    row.approximate_radius <= 0
  ) {
    throw new Error('Invalid player map node');
  }

  return {
    projectionId: row.projection_id,
    kind: row.kind,
    label: row.label,
    knowledgeState: row.knowledge_state,
    confidence,
    role,
    position,
    approximateRadius: row.approximate_radius,
    ...(detail === undefined ? {} : { detail }),
  };
}

function parseRoute(row: unknown, playerId: string): PlayerProjectionRouteInput {
  if (!isRecord(row)) {
    throw new Error('Invalid player map route');
  }

  const path = readLineStringGeometry(row.geom);
  const label = row.label;

  if (
    row.owner_user_id !== playerId ||
    !isNonEmptyString(row.projection_id) ||
    !isNonEmptyString(row.from_projection_id) ||
    !isNonEmptyString(row.to_projection_id) ||
    !isKnowledgeState(row.knowledge_state) ||
    (label !== null && typeof label !== 'string') ||
    path === null
  ) {
    throw new Error('Invalid player map route');
  }

  return {
    projectionId: row.projection_id,
    fromProjectionId: row.from_projection_id,
    toProjectionId: row.to_projection_id,
    ...(label === null ? {} : { label }),
    knowledgeState: row.knowledge_state,
    path,
  };
}

async function loadRows(
  client: PlayerApiClient,
  table: TableName,
  columns: string,
  playerId: string,
): Promise<unknown[]> {
  const schema = client.schema('player_api');
  if (!isRecord(schema) || typeof schema.from !== 'function') {
    throw new Error('Invalid player_api client');
  }

  const result = await (schema as unknown as PlayerApiSchemaClient)
    .from(table)
    .select(columns)
    .eq('owner_user_id', playerId);

  if (result.error !== null || !Array.isArray(result.data)) {
    throw new Error(`Failed to load player map ${table}`);
  }

  return result.data;
}

export function createSupabasePlayerProjectionSource(
  client: PlayerApiClient,
  now: () => string = () => new Date().toISOString(),
): PlayerProjectionSource {
  return {
    async load(playerId: string) {
      if (!isNonEmptyString(playerId)) {
        throw new Error('Invalid player id');
      }

      const nodeRows = await loadRows(
        client,
        'map_nodes',
        'owner_user_id,projection_id,kind,label,knowledge_state,confidence,role,approximate_radius,geom,details,updated_at',
        playerId,
      );
      const routeRows = await loadRows(
        client,
        'map_routes',
        'owner_user_id,projection_id,from_projection_id,to_projection_id,label,knowledge_state,geom,updated_at',
        playerId,
      );

      const projection = parseMapProjection(
        buildPlayerMapProjection({
          mapKey: PLAYER_MAP_KEY,
          generatedAt: now(),
          nodes: nodeRows.map((row) => parseNode(row, playerId)),
          routes: routeRows.map((row) => parseRoute(row, playerId)),
        }),
      );
      assertPlayerProjectionSafe(projection);
      return projection;
    },
  };
}
