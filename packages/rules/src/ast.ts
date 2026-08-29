export type RuleJsonPrimitive = string | number | boolean | null;
export type RuleJsonValue = RuleJsonPrimitive | RuleJsonObject | RuleJsonValue[];
export interface RuleJsonObject {
  [key: string]: RuleJsonValue;
}

export const RULE_SCHEMA_VERSION = 1 as const;

export const RULE_COMPARISON_OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'] as const;
export type RuleComparisonOperator = (typeof RULE_COMPARISON_OPERATORS)[number];

export const KNOWLEDGE_STATES_V1 = [
  'rumor',
  'indication',
  'localized',
  'confirmed',
  'investigated',
  'understood',
] as const;
export type KnowledgeStateV1 = (typeof KNOWLEDGE_STATES_V1)[number];

export const CASE_STATES_V1 = [
  'available',
  'open',
  'active',
  'paused',
  'resolved',
  'failed',
  'escalated',
  'transformed',
  'archived',
] as const;
export type CaseStateV1 = (typeof CASE_STATES_V1)[number];

export interface AllConditionV1 {
  op: 'and';
  conditions: RuleConditionV1[];
}

export interface AnyConditionV1 {
  op: 'or';
  conditions: RuleConditionV1[];
}

export interface NotConditionV1 {
  op: 'not';
  condition: RuleConditionV1;
}

export interface CompareFactConditionV1 {
  op: 'compare';
  factKey: string;
  operator: RuleComparisonOperator;
  value: RuleJsonPrimitive;
}

export interface ContainsFactConditionV1 {
  op: 'contains';
  factKey: string;
  value: RuleJsonPrimitive;
}

export interface HasTagConditionV1 {
  op: 'has_tag';
  entityId: string;
  tag: string;
}

export interface PlayerHasKnowledgeConditionV1 {
  op: 'player_has_knowledge';
  ownerId: string;
  targetKey: string;
  minState?: KnowledgeStateV1;
  minConfidence?: number;
}

export interface ReputationConditionV1 {
  op: 'reputation';
  actorId: string;
  factionId: string;
  operator: RuleComparisonOperator;
  value: number;
}

export interface CaseStateConditionV1 {
  op: 'case_state';
  caseId: string;
  states: CaseStateV1[];
}

export interface WorldClockConditionV1 {
  op: 'world_clock';
  clockKey: string;
  operator: RuleComparisonOperator;
  value: number;
}

export interface LocationStateConditionV1 {
  op: 'location_state';
  locationId: string;
  field: string;
  operator: RuleComparisonOperator;
  value: RuleJsonPrimitive;
}

export interface FactionStateConditionV1 {
  op: 'faction_state';
  factionId: string;
  field: string;
  operator: RuleComparisonOperator;
  value: RuleJsonPrimitive;
}

export interface InventoryConditionV1 {
  op: 'inventory';
  ownerId: string;
  itemKey: string;
  operator: RuleComparisonOperator;
  quantity: number;
}

export interface AttributeConditionV1 {
  op: 'attribute';
  entityId: string;
  field: string;
  operator: RuleComparisonOperator;
  value: RuleJsonPrimitive;
}

export type RuleConditionV1 =
  | AllConditionV1
  | AnyConditionV1
  | NotConditionV1
  | CompareFactConditionV1
  | ContainsFactConditionV1
  | HasTagConditionV1
  | PlayerHasKnowledgeConditionV1
  | ReputationConditionV1
  | CaseStateConditionV1
  | WorldClockConditionV1
  | LocationStateConditionV1
  | FactionStateConditionV1
  | InventoryConditionV1
  | AttributeConditionV1;

export interface RuleDefinitionV1 {
  schemaVersion: 1;
  id: string;
  name?: string;
  condition: RuleConditionV1;
}

export interface PlayerKnowledgeSnapshotV1 {
  ownerId: string;
  targetKey: string;
  state: KnowledgeStateV1;
  confidence: number;
}

export interface RuleEvaluationContextV1 {
  schemaVersion: 1;
  facts?: Readonly<Record<string, RuleJsonValue>>;
  tagsByEntity?: Readonly<Record<string, readonly string[]>>;
  playerKnowledge?: readonly PlayerKnowledgeSnapshotV1[];
  reputations?: Readonly<Record<string, number>>;
  caseStates?: Readonly<Record<string, CaseStateV1>>;
  worldClocks?: Readonly<Record<string, number>>;
  locationStates?: Readonly<Record<string, RuleJsonObject>>;
  factionStates?: Readonly<Record<string, RuleJsonObject>>;
  inventories?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  attributes?: Readonly<Record<string, RuleJsonObject>>;
}

export interface RuleTraceV1 {
  op: RuleConditionV1['op'];
  passed: boolean;
  message: string;
  actual?: RuleJsonValue;
  expected?: RuleJsonValue;
  children?: RuleTraceV1[];
}

export interface RuleEvaluationV1 {
  schemaVersion: 1;
  ruleId: string;
  passed: boolean;
  trace: RuleTraceV1;
}

export interface RuleValidationIssueV1 {
  path: string;
  code: string;
  message: string;
}

export type RuleValidationResultV1 =
  | { ok: true; value: RuleDefinitionV1 }
  | { ok: false; issues: RuleValidationIssueV1[] };

export const RULE_AST_LIMITS_V1 = {
  maxDepth: 16,
  maxNodes: 256,
  maxCollectionItems: 64,
  maxKeyLength: 128,
} as const;

export const RULE_ENGINE_CAPABILITIES_V1 = {
  arbitraryCode: false,
  eval: false,
  rng: 'unsupported' as const,
} as const;
