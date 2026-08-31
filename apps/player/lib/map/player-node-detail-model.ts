import type {
  MapProjection,
  ProjectionNode,
  ProjectionNodeDetail,
} from '@murim/map-renderer';

export interface PlayerNodeDetailView {
  id: string;
  label?: string;
  role: 'known' | 'ghost';
  knowledgeState?: ProjectionNode['knowledgeState'];
  detail?: ProjectionNodeDetail;
}

function copyNodeDetail(detail: ProjectionNodeDetail): ProjectionNodeDetail {
  return {
    ...(detail.category === undefined ? {} : { category: detail.category }),
    ...(detail.summary === undefined ? {} : { summary: detail.summary }),
  };
}

export function buildPlayerNodeDetailViews(
  projection: MapProjection,
): PlayerNodeDetailView[] {
  return projection.items.flatMap((item) => {
    if (item.kind !== 'node') {
      return [];
    }

    return [
      {
        id: item.id,
        ...(item.label === undefined ? {} : { label: item.label }),
        role: item.role,
        ...(item.knowledgeState === undefined
          ? {}
          : { knowledgeState: item.knowledgeState }),
        ...(item.detail === undefined ? {} : { detail: copyNodeDetail(item.detail) }),
      },
    ];
  });
}

export function getPlayerNodeDisplayName(
  node: Pick<PlayerNodeDetailView, 'label'>,
): string {
  return node.label ?? 'Local não identificado';
}

export function getPlayerNodeAccessibleName(
  node: Pick<PlayerNodeDetailView, 'label' | 'role'>,
): string {
  const base = getPlayerNodeDisplayName(node);
  return node.role === 'ghost' ? `${base}, localização aproximada` : base;
}

export function formatPlayerKnowledgeState(
  state: NonNullable<ProjectionNode['knowledgeState']>,
): string {
  switch (state) {
    case 'rumor':
      return 'Rumor';
    case 'indication':
      return 'Indício';
    case 'localized':
      return 'Localizado';
    case 'confirmed':
      return 'Confirmado';
    case 'investigated':
      return 'Investigado';
    case 'understood':
      return 'Compreendido';
  }
}
