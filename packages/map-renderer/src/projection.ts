import type {
  ApproximateLocation,
  AreaGeometry,
  JsonObject,
  KnowledgeState,
  PolylineGeometry,
  WorldPoint,
} from '@murim/domain';

export const PLAYER_NODE_DETAIL_CATEGORY_MAX_LENGTH = 80;
export const PLAYER_NODE_DETAIL_SUMMARY_MAX_LENGTH = 600;
export const PLAYER_KNOWLEDGE_SOURCE_LABEL_MAX_LENGTH = 120;

export type ProjectionItemId = string;

export type ProjectionConfidenceBand = 'low' | 'moderate' | 'high' | 'very-high';

export type ProjectionKnowledgeSourceKind =
  | 'system'
  | 'exploration'
  | 'npc'
  | 'player'
  | 'document'
  | 'scene';

export interface ProjectionKnowledgeSource {
  kind: ProjectionKnowledgeSourceKind;
  label?: string;
}

export type ProjectionFreshness =
  | 'just-updated'
  | 'recent'
  | 'aging'
  | 'stale'
  | 'not-applicable';

export type ProjectionKnowledgePrivacy = 'private' | 'shared' | 'public';

export interface ProjectionKnowledgePresentation {
  confidence: ProjectionConfidenceBand;
  source: ProjectionKnowledgeSource;
  freshness: ProjectionFreshness;
  privacy: ProjectionKnowledgePrivacy;
}

export interface ProjectionNodeDetail {
  category?: string;
  summary?: string;
}

interface ProjectionItemBase<TKind extends string> {
  id: ProjectionItemId;
  kind: TKind;
  metadata: JsonObject;
}

export interface ProjectionNode extends ProjectionItemBase<'node'> {
  position: WorldPoint;
  role: 'known' | 'ghost';
  symbolKey: string;
  label?: string;
  knowledgeState?: KnowledgeState;
  knowledgePresentation: ProjectionKnowledgePresentation;
  approximateLocation?: ApproximateLocation;
  detail?: ProjectionNodeDetail;
}

export interface ProjectionRoute extends ProjectionItemBase<'route'> {
  fromItemId: ProjectionItemId;
  toItemId: ProjectionItemId;
  path: PolylineGeometry;
  styleKey: string;
  label?: string;
  knowledgeState?: KnowledgeState;
  knowledgePresentation: ProjectionKnowledgePresentation;
}

export interface ProjectionArea extends ProjectionItemBase<'area'> {
  geometry: AreaGeometry;
  styleKey: string;
  label?: string;
  knowledgeState?: KnowledgeState;
}

export interface ProjectionRing extends ProjectionItemBase<'ring'> {
  center: WorldPoint;
  innerRadius: number;
  outerRadius: number;
  styleKey: string;
  label?: string;
}

export interface ProjectionAnnotation extends ProjectionItemBase<'annotation'> {
  position: WorldPoint;
  text: string;
  annotationKind: 'private-note' | 'system';
}

export type MapProjectionItem =
  ProjectionNode | ProjectionRoute | ProjectionArea | ProjectionRing | ProjectionAnnotation;

export interface MapProjection {
  projectionVersion: 1;
  mapKey: string;
  generatedAt: string;
  items: MapProjectionItem[];
}
