import type {
  ApproximateLocation,
  AreaGeometry,
  JsonObject,
  KnowledgeState,
  PolylineGeometry,
  WorldPoint,
} from '@murim/domain';

export type ProjectionItemId = string;

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
  confidence?: number;
  approximateLocation?: ApproximateLocation;
}

export interface ProjectionRoute extends ProjectionItemBase<'route'> {
  fromItemId: ProjectionItemId;
  toItemId: ProjectionItemId;
  path: PolylineGeometry;
  styleKey: string;
  label?: string;
  knowledgeState?: KnowledgeState;
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
