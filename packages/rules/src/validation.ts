import {
  CASE_STATES_V1,
  KNOWLEDGE_STATES_V1,
  RULE_AST_LIMITS_V1,
  RULE_COMPARISON_OPERATORS,
  RULE_SCHEMA_VERSION,
  type CaseStateV1,
  type KnowledgeStateV1,
  type RuleComparisonOperator,
  type RuleConditionV1,
  type RuleDefinitionV1,
  type RuleJsonPrimitive,
  type RuleValidationIssueV1,
  type RuleValidationResultV1,
} from './ast';

const SAFE_KEY = /^[A-Za-z0-9_.:-]+$/;
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

interface ParseBudget {
  nodes: number;
}

function issue(issues: RuleValidationIssueV1[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: RuleValidationIssueV1[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      issue(issues, `${path}.${key}`, 'unknown_field', `Field ${key} is not allowed.`);
    }
  }
}

function parseNonEmptyString(
  value: unknown,
  path: string,
  issues: RuleValidationIssueV1[],
): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issue(issues, path, 'invalid_string', 'Expected a non-empty string.');
    return null;
  }
  return value;
}

function parseSafeKey(
  value: unknown,
  path: string,
  issues: RuleValidationIssueV1[],
): string | null {
  const parsed = parseNonEmptyString(value, path, issues);
  if (parsed === null) return null;

  if (parsed.length > RULE_AST_LIMITS_V1.maxKeyLength || !SAFE_KEY.test(parsed)) {
    issue(
      issues,
      path,
      'invalid_key',
      `Keys must be at most ${RULE_AST_LIMITS_V1.maxKeyLength} characters and use only allow-listed characters.`,
    );
    return null;
  }

  const segments = parsed.split('.');
  if (segments.some((segment) => FORBIDDEN_PATH_SEGMENTS.has(segment))) {
    issue(issues, path, 'forbidden_key_segment', 'Unsafe object-path segment is forbidden.');
    return null;
  }

  return parsed;
}

function parseFiniteNumber(
  value: unknown,
  path: string,
  issues: RuleValidationIssueV1[],
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issue(issues, path, 'invalid_number', 'Expected a finite number.');
    return null;
  }
  return value;
}

function parsePrimitive(
  value: unknown,
  path: string,
  issues: RuleValidationIssueV1[],
): RuleJsonPrimitive | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  issue(issues, path, 'invalid_primitive', 'Expected a JSON primitive with a finite number.');
  return undefined;
}

function parseComparisonOperator(
  value: unknown,
  path: string,
  issues: RuleValidationIssueV1[],
): RuleComparisonOperator | null {
  if (
    typeof value === 'string' &&
    RULE_COMPARISON_OPERATORS.some((operator) => operator === value)
  ) {
    return value as RuleComparisonOperator;
  }
  issue(issues, path, 'invalid_operator', 'Comparison operator is not allow-listed.');
  return null;
}

function parseKnowledgeState(
  value: unknown,
  path: string,
  issues: RuleValidationIssueV1[],
): KnowledgeStateV1 | null {
  if (typeof value === 'string' && KNOWLEDGE_STATES_V1.some((state) => state === value)) {
    return value as KnowledgeStateV1;
  }
  issue(issues, path, 'invalid_knowledge_state', 'Unknown knowledge state.');
  return null;
}

function parseCaseStates(
  value: unknown,
  path: string,
  issues: RuleValidationIssueV1[],
): CaseStateV1[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    issue(issues, path, 'invalid_case_states', 'Expected at least one case state.');
    return null;
  }
  if (value.length > RULE_AST_LIMITS_V1.maxCollectionItems) {
    issue(issues, path, 'collection_too_large', 'Too many case states.');
    return null;
  }

  const states: CaseStateV1[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string' || !CASE_STATES_V1.some((state) => state === item)) {
      issue(issues, `${path}[${index}]`, 'invalid_case_state', 'Unknown case state.');
      continue;
    }
    states.push(item as CaseStateV1);
  }
  return states.length === value.length ? states : null;
}

function parseCondition(
  input: unknown,
  path: string,
  depth: number,
  budget: ParseBudget,
  issues: RuleValidationIssueV1[],
): RuleConditionV1 | null {
  budget.nodes += 1;
  if (budget.nodes > RULE_AST_LIMITS_V1.maxNodes) {
    issue(issues, path, 'node_limit', 'Rule exceeds the maximum AST node count.');
    return null;
  }
  if (depth > RULE_AST_LIMITS_V1.maxDepth) {
    issue(issues, path, 'depth_limit', 'Rule exceeds the maximum AST depth.');
    return null;
  }
  if (!isRecord(input)) {
    issue(issues, path, 'invalid_condition', 'Condition must be a JSON object.');
    return null;
  }

  const op = input.op;
  if (typeof op !== 'string') {
    issue(issues, `${path}.op`, 'missing_operator', 'Condition requires an operator.');
    return null;
  }

  if (op === 'and' || op === 'or') {
    exactKeys(input, ['op', 'conditions'], path, issues);
    if (!Array.isArray(input.conditions) || input.conditions.length === 0) {
      issue(issues, `${path}.conditions`, 'invalid_children', `${op} requires at least one child.`);
      return null;
    }
    if (input.conditions.length > RULE_AST_LIMITS_V1.maxCollectionItems) {
      issue(issues, `${path}.conditions`, 'collection_too_large', 'Too many child conditions.');
      return null;
    }
    const conditions: RuleConditionV1[] = [];
    for (const [index, child] of input.conditions.entries()) {
      const parsed = parseCondition(
        child,
        `${path}.conditions[${index}]`,
        depth + 1,
        budget,
        issues,
      );
      if (parsed !== null) conditions.push(parsed);
    }
    if (conditions.length !== input.conditions.length) return null;
    return op === 'and' ? { op: 'and', conditions } : { op: 'or', conditions };
  }

  if (op === 'not') {
    exactKeys(input, ['op', 'condition'], path, issues);
    const condition = parseCondition(
      input.condition,
      `${path}.condition`,
      depth + 1,
      budget,
      issues,
    );
    return condition === null ? null : { op: 'not', condition };
  }

  if (op === 'compare') {
    exactKeys(input, ['op', 'factKey', 'operator', 'value'], path, issues);
    const factKey = parseSafeKey(input.factKey, `${path}.factKey`, issues);
    const operator = parseComparisonOperator(input.operator, `${path}.operator`, issues);
    const value = parsePrimitive(input.value, `${path}.value`, issues);
    return factKey !== null && operator !== null && value !== undefined
      ? { op: 'compare', factKey, operator, value }
      : null;
  }

  if (op === 'contains') {
    exactKeys(input, ['op', 'factKey', 'value'], path, issues);
    const factKey = parseSafeKey(input.factKey, `${path}.factKey`, issues);
    const value = parsePrimitive(input.value, `${path}.value`, issues);
    return factKey !== null && value !== undefined ? { op: 'contains', factKey, value } : null;
  }

  if (op === 'has_tag') {
    exactKeys(input, ['op', 'entityId', 'tag'], path, issues);
    const entityId = parseSafeKey(input.entityId, `${path}.entityId`, issues);
    const tag = parseNonEmptyString(input.tag, `${path}.tag`, issues);
    return entityId !== null && tag !== null ? { op: 'has_tag', entityId, tag } : null;
  }

  if (op === 'player_has_knowledge') {
    exactKeys(input, ['op', 'ownerId', 'targetKey', 'minState', 'minConfidence'], path, issues);
    const ownerId = parseSafeKey(input.ownerId, `${path}.ownerId`, issues);
    const targetKey = parseSafeKey(input.targetKey, `${path}.targetKey`, issues);
    let minState: KnowledgeStateV1 | undefined;
    let minConfidence: number | undefined;

    if (input.minState !== undefined) {
      const parsed = parseKnowledgeState(input.minState, `${path}.minState`, issues);
      if (parsed !== null) minState = parsed;
    }
    if (input.minConfidence !== undefined) {
      const parsed = parseFiniteNumber(input.minConfidence, `${path}.minConfidence`, issues);
      if (parsed !== null && parsed >= 0 && parsed <= 1) {
        minConfidence = parsed;
      } else if (parsed !== null) {
        issue(
          issues,
          `${path}.minConfidence`,
          'invalid_confidence',
          'Confidence must be between 0 and 1.',
        );
      }
    }

    if (ownerId === null || targetKey === null) return null;
    return {
      op: 'player_has_knowledge',
      ownerId,
      targetKey,
      ...(minState === undefined ? {} : { minState }),
      ...(minConfidence === undefined ? {} : { minConfidence }),
    };
  }

  if (op === 'reputation') {
    exactKeys(input, ['op', 'actorId', 'factionId', 'operator', 'value'], path, issues);
    const actorId = parseSafeKey(input.actorId, `${path}.actorId`, issues);
    const factionId = parseSafeKey(input.factionId, `${path}.factionId`, issues);
    const operator = parseComparisonOperator(input.operator, `${path}.operator`, issues);
    const value = parseFiniteNumber(input.value, `${path}.value`, issues);
    return actorId !== null && factionId !== null && operator !== null && value !== null
      ? { op: 'reputation', actorId, factionId, operator, value }
      : null;
  }

  if (op === 'case_state') {
    exactKeys(input, ['op', 'caseId', 'states'], path, issues);
    const caseId = parseSafeKey(input.caseId, `${path}.caseId`, issues);
    const states = parseCaseStates(input.states, `${path}.states`, issues);
    return caseId !== null && states !== null ? { op: 'case_state', caseId, states } : null;
  }

  if (op === 'world_clock') {
    exactKeys(input, ['op', 'clockKey', 'operator', 'value'], path, issues);
    const clockKey = parseSafeKey(input.clockKey, `${path}.clockKey`, issues);
    const operator = parseComparisonOperator(input.operator, `${path}.operator`, issues);
    const value = parseFiniteNumber(input.value, `${path}.value`, issues);
    return clockKey !== null && operator !== null && value !== null
      ? { op: 'world_clock', clockKey, operator, value }
      : null;
  }

  if (op === 'location_state' || op === 'faction_state' || op === 'attribute') {
    const idKey =
      op === 'location_state' ? 'locationId' : op === 'faction_state' ? 'factionId' : 'entityId';
    exactKeys(input, ['op', idKey, 'field', 'operator', 'value'], path, issues);
    const id = parseSafeKey(input[idKey], `${path}.${idKey}`, issues);
    const field = parseSafeKey(input.field, `${path}.field`, issues);
    const operator = parseComparisonOperator(input.operator, `${path}.operator`, issues);
    const value = parsePrimitive(input.value, `${path}.value`, issues);
    if (id === null || field === null || operator === null || value === undefined) return null;
    if (op === 'location_state') return { op, locationId: id, field, operator, value };
    if (op === 'faction_state') return { op, factionId: id, field, operator, value };
    return { op, entityId: id, field, operator, value };
  }

  if (op === 'inventory') {
    exactKeys(input, ['op', 'ownerId', 'itemKey', 'operator', 'quantity'], path, issues);
    const ownerId = parseSafeKey(input.ownerId, `${path}.ownerId`, issues);
    const itemKey = parseSafeKey(input.itemKey, `${path}.itemKey`, issues);
    const operator = parseComparisonOperator(input.operator, `${path}.operator`, issues);
    const quantity = parseFiniteNumber(input.quantity, `${path}.quantity`, issues);
    return ownerId !== null && itemKey !== null && operator !== null && quantity !== null
      ? { op: 'inventory', ownerId, itemKey, operator, quantity }
      : null;
  }

  issue(issues, `${path}.op`, 'unknown_operator', `Operator ${op} is not allow-listed.`);
  return null;
}

export function validateRuleDefinitionV1(input: unknown): RuleValidationResultV1 {
  const issues: RuleValidationIssueV1[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ path: '$', code: 'invalid_rule', message: 'Rule must be a JSON object.' }],
    };
  }

  exactKeys(input, ['schemaVersion', 'id', 'name', 'condition'], '$', issues);
  if (input.schemaVersion !== RULE_SCHEMA_VERSION) {
    issue(
      issues,
      '$.schemaVersion',
      'unsupported_version',
      'Only rule schemaVersion 1 is supported.',
    );
  }
  const id = parseSafeKey(input.id, '$.id', issues);
  let name: string | undefined;
  if (input.name !== undefined) {
    const parsed = parseNonEmptyString(input.name, '$.name', issues);
    if (parsed !== null) name = parsed;
  }

  const budget: ParseBudget = { nodes: 0 };
  const condition = parseCondition(input.condition, '$.condition', 1, budget, issues);
  if (issues.length > 0 || id === null || condition === null) {
    return { ok: false, issues };
  }

  const value: RuleDefinitionV1 = {
    schemaVersion: 1,
    id,
    condition,
    ...(name === undefined ? {} : { name }),
  };
  return { ok: true, value };
}
