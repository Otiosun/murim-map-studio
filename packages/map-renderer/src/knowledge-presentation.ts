export const PROJECTION_CONFIDENCE_BANDS = ['low', 'moderate', 'high', 'very-high'] as const;

export type ProjectionConfidenceBand = (typeof PROJECTION_CONFIDENCE_BANDS)[number];

export const PROJECTION_KNOWLEDGE_SOURCE_KINDS = [
  'system',
  'exploration',
  'npc',
  'player',
  'document',
  'scene',
] as const;

export type ProjectionKnowledgeSourceKind = (typeof PROJECTION_KNOWLEDGE_SOURCE_KINDS)[number];

export const PROJECTION_FRESHNESS_VALUES = [
  'just-updated',
  'recent',
  'aging',
  'stale',
  'not-applicable',
] as const;

export type ProjectionFreshness = (typeof PROJECTION_FRESHNESS_VALUES)[number];

export const PROJECTION_KNOWLEDGE_PRIVACY_VALUES = ['private', 'shared', 'public'] as const;

export type ProjectionKnowledgePrivacy = (typeof PROJECTION_KNOWLEDGE_PRIVACY_VALUES)[number];

export const PLAYER_KNOWLEDGE_SOURCE_LABEL_MAX_LENGTH = 120;

export interface ProjectionKnowledgeSource {
  kind: ProjectionKnowledgeSourceKind;
  label?: string;
}

export interface ProjectionKnowledgePresentation {
  confidence: ProjectionConfidenceBand;
  source: ProjectionKnowledgeSource;
  freshness: ProjectionFreshness;
  privacy: ProjectionKnowledgePrivacy;
}
