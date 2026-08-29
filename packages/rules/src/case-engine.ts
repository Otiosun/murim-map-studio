import {
  CASE_STATES_V1,
  KNOWLEDGE_STATES_V1,
  RULE_AST_LIMITS_V1,
  type CaseStateV1,
  type KnowledgeStateV1,
  type RuleConditionV1,
  type RuleDefinitionV1,
  type RuleEvaluationContextV1,
  type RuleEvaluationV1,
  type RuleJsonObject,
  type RuleJsonValue,
} from './ast';
import { evaluateRuleV1 } from './evaluator';
import { validateRuleDefinitionV1 } from './validation';

export const SCENE_CLOSURE_SCHEMA_VERSION = 1 as const;
export const CASE_DEFINITION_SCHEMA_VERSION = 1 as const;
export const SCENE_CLOSURE_CONTEXT_ENTITY = 'scene-closure' as const;

export const SCENE_CLOSURE_STATUSES_V1 = ['partial', 'final'] as const;
export type SceneClosureStatusV1 = (typeof SCENE_CLOSURE_STATUSES_V1)[number];

export const SCENE_CLOSURE_ROLES_V1 = ['player', 'narrator', 'admin', 'system'] as const;
export type SceneClosureRoleV1 = (typeof SCENE_CLOSURE_ROLES_V1)[number];

export const OPPORTUNITY_STATES_V1 = ['available', 'dormant', 'blocked', 'consumed'] as const;
export type OpportunityStateV1 = (typeof OPPORTUNITY_STATES_V1)[number];

export type CaseEffectV1 =
  | { kind: 'world_event'; eventKind: string; payload: RuleJsonObject }
  | {
      kind: 'knowledge_change';
      ownerId: string;
      targetKey: string;
      state: KnowledgeStateV1;
      confidence: number;
    }
  | { kind: 'world_clock_delta'; clockKey: string; delta: number }
  | { kind: 'opportunity_state'; opportunityId: string; state: OpportunityStateV1 }
  | { kind: 'set_fact'; factKey: string; value: RuleJsonValue }
  | { kind: 'emit_signal'; signalKey: string; payload: RuleJsonObject };

export interface CaseTransitionV1 {
  id: string;
  from: CaseStateV1[];
  to: CaseStateV1;
  closureStatus?: SceneClosureStatusV1;
  when?: RuleConditionV1;
  effects: CaseEffectV1[];
}

export interface CaseDefinitionV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  initialState: CaseStateV1;
  transitions: CaseTransitionV1[];
}

export interface SceneClosureActorV1 {
  id: string;
  role: SceneClosureRoleV1;
}

export interface CustomCaseResolutionV1 {
  toState: CaseStateV1;
  reason: string;
  effects: CaseEffectV1[];
}

export interface SceneClosureV1 {
  schemaVersion: 1;
  closureKey: string;
  caseId: string;
  status: SceneClosureStatusV1;
  summary: string;
  occurredAt: string;
  actor: SceneClosureActorV1;
  outcome: RuleJsonObject;
  customResolution?: CustomCaseResolutionV1;
}

export interface AppliedSceneClosureV1 {
  closureKey: string;
  fingerprint: string;
}

export interface CaseRuntimeV1 {
  caseId: string;
  state: CaseStateV1;
  appliedClosures: readonly AppliedSceneClosureV1[];
}

export interface CaseDataIssueV1 {
  path: string;
  code: string;
  message: string;
}

export type CaseDefinitionValidationResultV1 =
  | { ok: true; value: CaseDefinitionV1 }
  | { ok: false; issues: CaseDataIssueV1[] };

export type SceneClosureValidationResultV1 =
  | { ok: true; value: SceneClosureV1 }
  | { ok: false; issues: CaseDataIssueV1[] };

export type CaseTransitionAssessmentReasonV1 =
  | 'wrong_state'
  | 'closure_status_mismatch'
  | 'no_condition'
  | 'condition_passed'
  | 'condition_failed';

export interface CaseTransitionAssessmentV1 {
  transitionId: string;
  eligible: boolean;
  reason: CaseTransitionAssessmentReasonV1;
  evaluation?: RuleEvaluationV1;
}

export type CaseApplyFailureCodeV1 =
  | 'invalid_definition'
  | 'invalid_closure'
  | 'runtime_case_mismatch'
  | 'closure_case_mismatch'
  | 'closure_conflict'
  | 'unauthorized_custom_resolution'
  | 'no_transition'
  | 'ambiguous_transition';

export interface CaseApplyFailureV1 {
  ok: false;
  code: CaseApplyFailureCodeV1;
  message: string;
  issues?: CaseDataIssueV1[];
  assessments?: CaseTransitionAssessmentV1[];
}

export type CaseApplyReasonV1 =
  | 'duplicate'
  | 'partial_no_transition'
  | 'transition'
  | 'custom_resolution';

export interface CaseApplySuccessV1 {
  ok: true;
  applied: boolean;
  reason: CaseApplyReasonV1;
  runtime: CaseRuntimeV1;
  effects: CaseEffectV1[];
  transitionId?: string;
  assessments: CaseTransitionAssessmentV1[];
}

export type CaseApplyResultV1 = CaseApplySuccessV1 | CaseApplyFailureV1;

const SAFE_KEY = /^[A-Za-z0-9_.:-]+$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_TRANSITIONS = 64;
const MAX_EFFECTS = 64;
const MAX_OUTCOME_DEPTH = 12;
const MAX_JSON_NODES = 512;

interface JsonBudget {
  nodes: number;
}

function addIssue(
  issues: CaseDataIssueV1[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: CaseDataIssueV1[],
): void {
  const allow = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allow.has(key)) addIssue(issues, `${path}.${key}`, 'unknown_field', `Field ${key} is not allowed.`);
  }
}

function parseString(
  value: unknown,
  path: string,
  issues: CaseDataIssueV1[],
): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    addIssue(issues, path, 'invalid_string', 'Expected a non-empty string.');
    return null;
  }
  return value;
}

function parseSafeKey(
  value: unknown,
  path: string,
  issues: CaseDataIssueV1[],
): string | null {
  const parsed = parseString(value, path, issues);
  if (parsed === null) return null;
  if (parsed.length > RULE_AST_LIMITS_V1.maxKeyLength || !SAFE_KEY.test(parsed)) {
    addIssue(issues, path, 'invalid_key', 'Expected an allow-listed identifier.');
    return null;
  }
  if (parsed.split('.').some((segment) => FORBIDDEN_KEYS.has(segment))) {
    addIssue(issues, path, 'forbidden_key_segment', 'Unsafe key segment is forbidden.');
    return null;
  }
  return parsed;
}

function isCaseState(value: unknown): value is CaseStateV1 {
  return typeof value === 'string' && CASE_STATES_V1.some((state) => state === value);
}

function parseCaseState(
  value: unknown,
  path: string,
  issues: CaseDataIssueV1[],
): CaseStateV1 | null {
  if (!isCaseState(value)) {
    addIssue(issues, path, 'invalid_case_state', 'Unknown case state.');
    return null;
  }
  return value;
}

function parseClosureStatus(
  value: unknown,
  path: string,
  issues: CaseDataIssueV1[],
): SceneClosureStatusV1 | null {
  if (
    typeof value !== 'string' ||
    !SCENE_CLOSURE_STATUSES_V1.some((status) => status === value)
  ) {
    addIssue(issues, path, 'invalid_closure_status', 'Unknown scene closure status.');
    return null;
  }
  return value as SceneClosureStatusV1;
}

function parseJsonValue(
  value: unknown,
  path: string,
  depth: number,
  budget: JsonBudget,
  issues: CaseDataIssueV1[],
): RuleJsonValue | undefined {
  budget.nodes += 1;
  if (budget.nodes > MAX_JSON_NODES) {
    addIssue(issues, path, 'json_node_limit', 'Structured JSON payload is too large.');
    return undefined;
  }
  if (depth > MAX_OUTCOME_DEPTH) {
    addIssue(issues, path, 'json_depth_limit', 'Structured JSON payload is too deeply nested.');
    return undefined;
  }

  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      addIssue(issues, path, 'invalid_number', 'Numbers must be finite.');
      return undefined;
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > RULE_AST_LIMITS_V1.maxCollectionItems) {
      addIssue(issues, path, 'collection_too_large', 'Structured array is too large.');
      return undefined;
    }
    const parsed: RuleJsonValue[] = [];
    for (const [index, item] of value.entries()) {
      const child = parseJsonValue(item, `${path}[${index}]`, depth + 1, budget, issues);
      if (child !== undefined) parsed.push(child);
    }
    return parsed.length === value.length ? parsed : undefined;
  }

  if (!isRecord(value)) {
    addIssue(issues, path, 'invalid_json', 'Expected JSON-compatible data.');
    return undefined;
  }

  const keys = Object.keys(value);
  if (keys.length > RULE_AST_LIMITS_V1.maxCollectionItems) {
    addIssue(issues, path, 'collection_too_large', 'Structured object has too many fields.');
    return undefined;
  }

  const parsed: RuleJsonObject = {};
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) {
      addIssue(issues, `${path}.${key}`, 'forbidden_key_segment', 'Unsafe JSON key is forbidden.');
      continue;
    }
    if (key.length > RULE_AST_LIMITS_V1.maxKeyLength) {
      addIssue(issues, `${path}.${key}`, 'invalid_key', 'JSON key is too long.');
      continue;
    }
    const child = parseJsonValue(value[key], `${path}.${key}`, depth + 1, budget, issues);
    if (child !== undefined) parsed[key] = child;
  }
  return Object.keys(parsed).length === keys.length ? parsed : undefined;
}

function parseJsonObject(
  value: unknown,
  path: string,
  issues: CaseDataIssueV1[],
): RuleJsonObject | null {
  if (!isRecord(value)) {
    addIssue(issues, path, 'invalid_json_object', 'Expected a structured JSON object.');
    return null;
  }
  const budget: JsonBudget = { nodes: 0 };
  const parsed = parseJsonValue(value, path, 1, budget, issues);
  return parsed !== undefined && isRecord(parsed) ? (parsed as RuleJsonObject) : null;
}

function parseEffect(
  input: unknown,
  path: string,
  issues: CaseDataIssueV1[],
): CaseEffectV1 | null {
  if (!isRecord(input) || typeof input.kind !== 'string') {
    addIssue(issues, path, 'invalid_effect', 'Effect must be an object with an allow-listed kind.');
    return null;
  }

  if (input.kind === 'world_event') {
    exactKeys(input, ['kind', 'eventKind', 'payload'], path, issues);
    const eventKind = parseSafeKey(input.eventKind, `${path}.eventKind`, issues);
    const payload = parseJsonObject(input.payload, `${path}.payload`, issues);
    return eventKind !== null && payload !== null ? { kind: 'world_event', eventKind, payload } : null;
  }

  if (input.kind === 'knowledge_change') {
    exactKeys(input, ['kind', 'ownerId', 'targetKey', 'state', 'confidence'], path, issues);
    const ownerId = parseSafeKey(input.ownerId, `${path}.ownerId`, issues);
    const targetKey = parseSafeKey(input.targetKey, `${path}.targetKey`, issues);
    const state =
      typeof input.state === 'string' && KNOWLEDGE_STATES_V1.some((item) => item === input.state)
        ? (input.state as KnowledgeStateV1)
        : null;
    if (state === null) addIssue(issues, `${path}.state`, 'invalid_knowledge_state', 'Unknown knowledge state.');
    const confidence = typeof input.confidence === 'number' && Number.isFinite(input.confidence)
      ? input.confidence
      : null;
    if (confidence === null || confidence < 0 || confidence > 1) {
      addIssue(issues, `${path}.confidence`, 'invalid_confidence', 'Confidence must be between 0 and 1.');
    }
    return ownerId !== null && targetKey !== null && state !== null && confidence !== null && confidence >= 0 && confidence <= 1
      ? { kind: 'knowledge_change', ownerId, targetKey, state, confidence }
      : null;
  }

  if (input.kind === 'world_clock_delta') {
    exactKeys(input, ['kind', 'clockKey', 'delta'], path, issues);
    const clockKey = parseSafeKey(input.clockKey, `${path}.clockKey`, issues);
    const delta = typeof input.delta === 'number' && Number.isFinite(input.delta) ? input.delta : null;
    if (delta === null) addIssue(issues, `${path}.delta`, 'invalid_number', 'Clock delta must be finite.');
    return clockKey !== null && delta !== null ? { kind: 'world_clock_delta', clockKey, delta } : null;
  }

  if (input.kind === 'opportunity_state') {
    exactKeys(input, ['kind', 'opportunityId', 'state'], path, issues);
    const opportunityId = parseSafeKey(input.opportunityId, `${path}.opportunityId`, issues);
    const state =
      typeof input.state === 'string' && OPPORTUNITY_STATES_V1.some((item) => item === input.state)
        ? (input.state as OpportunityStateV1)
        : null;
    if (state === null) addIssue(issues, `${path}.state`, 'invalid_opportunity_state', 'Unknown opportunity state.');
    return opportunityId !== null && state !== null
      ? { kind: 'opportunity_state', opportunityId, state }
      : null;
  }

  if (input.kind === 'set_fact') {
    exactKeys(input, ['kind', 'factKey', 'value'], path, issues);
    const factKey = parseSafeKey(input.factKey, `${path}.factKey`, issues);
    const budget: JsonBudget = { nodes: 0 };
    const value = parseJsonValue(input.value, `${path}.value`, 1, budget, issues);
    return factKey !== null && value !== undefined ? { kind: 'set_fact', factKey, value } : null;
  }

  if (input.kind === 'emit_signal') {
    exactKeys(input, ['kind', 'signalKey', 'payload'], path, issues);
    const signalKey = parseSafeKey(input.signalKey, `${path}.signalKey`, issues);
    const payload = parseJsonObject(input.payload, `${path}.payload`, issues);
    return signalKey !== null && payload !== null ? { kind: 'emit_signal', signalKey, payload } : null;
  }

  addIssue(issues, `${path}.kind`, 'unknown_effect', `Effect ${input.kind} is not allow-listed.`);
  return null;
}

function parseEffects(
  value: unknown,
  path: string,
  issues: CaseDataIssueV1[],
): CaseEffectV1[] | null {
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'invalid_effects', 'Effects must be an array.');
    return null;
  }
  if (value.length > MAX_EFFECTS) {
    addIssue(issues, path, 'collection_too_large', 'Too many effects.');
    return null;
  }
  const effects: CaseEffectV1[] = [];
  for (const [index, effect] of value.entries()) {
    const parsed = parseEffect(effect, `${path}[${index}]`, issues);
    if (parsed !== null) effects.push(parsed);
  }
  return effects.length === value.length ? effects : null;
}

export function validateCaseDefinitionV1(input: unknown): CaseDefinitionValidationResultV1 {
  const issues: CaseDataIssueV1[] = [];
  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: '$', code: 'invalid_definition', message: 'Case definition must be an object.' }] };
  }

  exactKeys(input, ['schemaVersion', 'id', 'name', 'initialState', 'transitions'], '$', issues);
  if (input.schemaVersion !== CASE_DEFINITION_SCHEMA_VERSION) {
    addIssue(issues, '$.schemaVersion', 'unsupported_version', 'Only CaseDefinition schemaVersion 1 is supported.');
  }
  const id = parseSafeKey(input.id, '$.id', issues);
  const name = parseString(input.name, '$.name', issues);
  const initialState = parseCaseState(input.initialState, '$.initialState', issues);

  const transitions: CaseTransitionV1[] = [];
  const transitionIds = new Set<string>();
  if (!Array.isArray(input.transitions) || input.transitions.length > MAX_TRANSITIONS) {
    addIssue(issues, '$.transitions', 'invalid_transitions', `Transitions must be an array with at most ${MAX_TRANSITIONS} entries.`);
  } else {
    for (const [index, raw] of input.transitions.entries()) {
      const path = `$.transitions[${index}]`;
      if (!isRecord(raw)) {
        addIssue(issues, path, 'invalid_transition', 'Transition must be an object.');
        continue;
      }
      exactKeys(raw, ['id', 'from', 'to', 'closureStatus', 'when', 'effects'], path, issues);
      const transitionId = parseSafeKey(raw.id, `${path}.id`, issues);
      if (transitionId !== null) {
        if (transitionIds.has(transitionId)) addIssue(issues, `${path}.id`, 'duplicate_transition_id', 'Transition IDs must be unique.');
        transitionIds.add(transitionId);
      }

      const from: CaseStateV1[] = [];
      if (!Array.isArray(raw.from) || raw.from.length === 0 || raw.from.length > CASE_STATES_V1.length) {
        addIssue(issues, `${path}.from`, 'invalid_from_states', 'Transition requires one or more valid source states.');
      } else {
        for (const [stateIndex, state] of raw.from.entries()) {
          const parsed = parseCaseState(state, `${path}.from[${stateIndex}]`, issues);
          if (parsed !== null) from.push(parsed);
        }
      }
      const to = parseCaseState(raw.to, `${path}.to`, issues);

      let closureStatus: SceneClosureStatusV1 | undefined;
      if (raw.closureStatus !== undefined) {
        const parsed = parseClosureStatus(raw.closureStatus, `${path}.closureStatus`, issues);
        if (parsed !== null) closureStatus = parsed;
      }

      let when: RuleConditionV1 | undefined;
      if (raw.when !== undefined && transitionId !== null) {
        const validation = validateRuleDefinitionV1({
          schemaVersion: 1,
          id: `case:${id ?? 'invalid'}:transition:${transitionId}`,
          condition: raw.when,
        });
        if (!validation.ok) {
          for (const ruleIssue of validation.issues) {
            addIssue(issues, `${path}.when${ruleIssue.path}`, `rule_${ruleIssue.code}`, ruleIssue.message);
          }
        } else {
          when = validation.value.condition;
        }
      }

      const effects = parseEffects(raw.effects, `${path}.effects`, issues);
      if (transitionId !== null && from.length > 0 && to !== null && effects !== null) {
        transitions.push({
          id: transitionId,
          from,
          to,
          effects,
          ...(closureStatus === undefined ? {} : { closureStatus }),
          ...(when === undefined ? {} : { when }),
        });
      }
    }
  }

  if (issues.length > 0 || id === null || name === null || initialState === null) {
    return { ok: false, issues };
  }
  return { ok: true, value: { schemaVersion: 1, id, name, initialState, transitions } };
}

function parseActor(
  input: unknown,
  path: string,
  issues: CaseDataIssueV1[],
): SceneClosureActorV1 | null {
  if (!isRecord(input)) {
    addIssue(issues, path, 'invalid_actor', 'Closure actor must be an object.');
    return null;
  }
  exactKeys(input, ['id', 'role'], path, issues);
  const id = parseSafeKey(input.id, `${path}.id`, issues);
  const role =
    typeof input.role === 'string' && SCENE_CLOSURE_ROLES_V1.some((item) => item === input.role)
      ? (input.role as SceneClosureRoleV1)
      : null;
  if (role === null) addIssue(issues, `${path}.role`, 'invalid_actor_role', 'Unknown closure actor role.');
  return id !== null && role !== null ? { id, role } : null;
}

function parseCustomResolution(
  input: unknown,
  path: string,
  issues: CaseDataIssueV1[],
): CustomCaseResolutionV1 | null {
  if (!isRecord(input)) {
    addIssue(issues, path, 'invalid_custom_resolution', 'Custom resolution must be an object.');
    return null;
  }
  exactKeys(input, ['toState', 'reason', 'effects'], path, issues);
  const toState = parseCaseState(input.toState, `${path}.toState`, issues);
  const reason = parseString(input.reason, `${path}.reason`, issues);
  const effects = parseEffects(input.effects, `${path}.effects`, issues);
  return toState !== null && reason !== null && effects !== null ? { toState, reason, effects } : null;
}

export function validateSceneClosureV1(input: unknown): SceneClosureValidationResultV1 {
  const issues: CaseDataIssueV1[] = [];
  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: '$', code: 'invalid_closure', message: 'SceneClosure must be an object.' }] };
  }

  exactKeys(
    input,
    ['schemaVersion', 'closureKey', 'caseId', 'status', 'summary', 'occurredAt', 'actor', 'outcome', 'customResolution'],
    '$',
    issues,
  );
  if (input.schemaVersion !== SCENE_CLOSURE_SCHEMA_VERSION) {
    addIssue(issues, '$.schemaVersion', 'unsupported_version', 'Only SceneClosure schemaVersion 1 is supported.');
  }
  const closureKey = parseSafeKey(input.closureKey, '$.closureKey', issues);
  const caseId = parseSafeKey(input.caseId, '$.caseId', issues);
  const status = parseClosureStatus(input.status, '$.status', issues);
  const summary = parseString(input.summary, '$.summary', issues);
  const occurredAt = parseString(input.occurredAt, '$.occurredAt', issues);
  if (occurredAt !== null && !Number.isFinite(Date.parse(occurredAt))) {
    addIssue(issues, '$.occurredAt', 'invalid_timestamp', 'occurredAt must be a valid timestamp.');
  }
  const actor = parseActor(input.actor, '$.actor', issues);
  const outcome = parseJsonObject(input.outcome, '$.outcome', issues);
  let customResolution: CustomCaseResolutionV1 | undefined;
  if (input.customResolution !== undefined) {
    const parsed = parseCustomResolution(input.customResolution, '$.customResolution', issues);
    if (parsed !== null) customResolution = parsed;
  }

  if (
    issues.length > 0 ||
    closureKey === null ||
    caseId === null ||
    status === null ||
    summary === null ||
    occurredAt === null ||
    actor === null ||
    outcome === null
  ) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      closureKey,
      caseId,
      status,
      summary,
      occurredAt,
      actor,
      outcome,
      ...(customResolution === undefined ? {} : { customResolution }),
    },
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

export function fingerprintSceneClosureV1(closure: SceneClosureV1): string {
  return stableStringify(closure);
}

export function createCaseRuntimeV1(definition: CaseDefinitionV1): CaseRuntimeV1 {
  return { caseId: definition.id, state: definition.initialState, appliedClosures: [] };
}

function contextForClosure(
  definition: CaseDefinitionV1,
  runtime: CaseRuntimeV1,
  closure: SceneClosureV1,
  context: RuleEvaluationContextV1,
): RuleEvaluationContextV1 {
  const closureAttribute: RuleJsonObject = {
    status: closure.status,
    actorRole: closure.actor.role,
    outcome: closure.outcome,
  };
  return {
    ...context,
    schemaVersion: 1,
    facts: {
      ...(context.facts ?? {}),
      'scene.status': closure.status,
      'scene.actorRole': closure.actor.role,
    },
    attributes: {
      ...(context.attributes ?? {}),
      [SCENE_CLOSURE_CONTEXT_ENTITY]: closureAttribute,
    },
    caseStates: {
      ...(context.caseStates ?? {}),
      [definition.id]: runtime.state,
    },
  };
}

export function assessCaseTransitionsV1(
  definition: CaseDefinitionV1,
  runtime: CaseRuntimeV1,
  closure: SceneClosureV1,
  context: RuleEvaluationContextV1,
): CaseTransitionAssessmentV1[] {
  const closureContext = contextForClosure(definition, runtime, closure, context);
  return definition.transitions.map((transition) => {
    if (!transition.from.includes(runtime.state)) {
      return { transitionId: transition.id, eligible: false, reason: 'wrong_state' };
    }
    if (transition.closureStatus !== undefined && transition.closureStatus !== closure.status) {
      return { transitionId: transition.id, eligible: false, reason: 'closure_status_mismatch' };
    }
    if (transition.when === undefined) {
      return { transitionId: transition.id, eligible: true, reason: 'no_condition' };
    }

    const rule: RuleDefinitionV1 = {
      schemaVersion: 1,
      id: `case:${definition.id}:transition:${transition.id}`,
      condition: transition.when,
    };
    const evaluation = evaluateRuleV1(rule, closureContext);
    return {
      transitionId: transition.id,
      eligible: evaluation.passed,
      reason: evaluation.passed ? 'condition_passed' : 'condition_failed',
      evaluation,
    };
  });
}

function appendClosure(
  runtime: CaseRuntimeV1,
  closure: SceneClosureV1,
  nextState: CaseStateV1,
): CaseRuntimeV1 {
  return {
    caseId: runtime.caseId,
    state: nextState,
    appliedClosures: [
      ...runtime.appliedClosures,
      { closureKey: closure.closureKey, fingerprint: fingerprintSceneClosureV1(closure) },
    ],
  };
}

export function applySceneClosureV1(
  definitionInput: unknown,
  runtime: CaseRuntimeV1,
  closureInput: unknown,
  context: RuleEvaluationContextV1,
): CaseApplyResultV1 {
  const definitionValidation = validateCaseDefinitionV1(definitionInput);
  if (!definitionValidation.ok) {
    return {
      ok: false,
      code: 'invalid_definition',
      message: 'Case definition failed validation.',
      issues: definitionValidation.issues,
    };
  }
  const closureValidation = validateSceneClosureV1(closureInput);
  if (!closureValidation.ok) {
    return {
      ok: false,
      code: 'invalid_closure',
      message: 'SceneClosure failed validation.',
      issues: closureValidation.issues,
    };
  }

  const definition = definitionValidation.value;
  const closure = closureValidation.value;
  if (runtime.caseId !== definition.id) {
    return { ok: false, code: 'runtime_case_mismatch', message: 'Runtime does not belong to this Case definition.' };
  }
  if (closure.caseId !== definition.id) {
    return { ok: false, code: 'closure_case_mismatch', message: 'SceneClosure targets a different Case.' };
  }

  const fingerprint = fingerprintSceneClosureV1(closure);
  const existing = runtime.appliedClosures.find((item) => item.closureKey === closure.closureKey);
  if (existing !== undefined) {
    if (existing.fingerprint !== fingerprint) {
      return {
        ok: false,
        code: 'closure_conflict',
        message: 'This closureKey was already applied with different content.',
      };
    }
    return {
      ok: true,
      applied: false,
      reason: 'duplicate',
      runtime,
      effects: [],
      assessments: [],
    };
  }

  if (closure.customResolution !== undefined) {
    if (closure.actor.role !== 'narrator' && closure.actor.role !== 'admin') {
      return {
        ok: false,
        code: 'unauthorized_custom_resolution',
        message: 'Only narrator/admin closures may use a custom narrative resolution.',
      };
    }
    return {
      ok: true,
      applied: true,
      reason: 'custom_resolution',
      runtime: appendClosure(runtime, closure, closure.customResolution.toState),
      effects: [...closure.customResolution.effects],
      assessments: [],
    };
  }

  const assessments = assessCaseTransitionsV1(definition, runtime, closure, context);
  const eligibleIds = new Set(
    assessments.filter((assessment) => assessment.eligible).map((assessment) => assessment.transitionId),
  );
  const eligible = definition.transitions.filter((transition) => eligibleIds.has(transition.id));

  if (eligible.length > 1) {
    return {
      ok: false,
      code: 'ambiguous_transition',
      message: 'More than one Case transition is eligible; authoring must make the result deterministic.',
      assessments,
    };
  }

  const transition = eligible[0];
  if (transition !== undefined) {
    return {
      ok: true,
      applied: true,
      reason: 'transition',
      transitionId: transition.id,
      runtime: appendClosure(runtime, closure, transition.to),
      effects: [...transition.effects],
      assessments,
    };
  }

  if (closure.status === 'partial') {
    return {
      ok: true,
      applied: true,
      reason: 'partial_no_transition',
      runtime: appendClosure(runtime, closure, runtime.state),
      effects: [],
      assessments,
    };
  }

  return {
    ok: false,
    code: 'no_transition',
    message: 'Final SceneClosure has no eligible transition; narrator/admin may provide a structured custom resolution.',
    assessments,
  };
}
