import {
  KNOWLEDGE_STATES_V1,
  type RuleComparisonOperator,
  type RuleConditionV1,
  type RuleDefinitionV1,
  type RuleEvaluationContextV1,
  type RuleEvaluationV1,
  type RuleJsonPrimitive,
  type RuleJsonValue,
  type RuleTraceV1,
  type RuleValidationResultV1,
} from './ast';
import { validateRuleDefinitionV1 } from './validation';

const KNOWLEDGE_RANK = Object.fromEntries(
  KNOWLEDGE_STATES_V1.map((state, index) => [state, index]),
) as Record<(typeof KNOWLEDGE_STATES_V1)[number], number>;

function primitiveEqual(left: RuleJsonValue | undefined, right: RuleJsonPrimitive): boolean {
  return left === right;
}

function compare(
  actual: RuleJsonValue | undefined,
  operator: RuleComparisonOperator,
  expected: RuleJsonPrimitive,
): boolean {
  if (operator === 'eq') return primitiveEqual(actual, expected);
  if (operator === 'ne') return !primitiveEqual(actual, expected);
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  if (operator === 'gt') return actual > expected;
  if (operator === 'gte') return actual >= expected;
  if (operator === 'lt') return actual < expected;
  return actual <= expected;
}

function display(value: RuleJsonValue | undefined): string {
  if (value === undefined) return 'missing';
  return JSON.stringify(value);
}

function trace(
  op: RuleConditionV1['op'],
  passed: boolean,
  message: string,
  options: {
    actual?: RuleJsonValue;
    expected?: RuleJsonValue;
    children?: RuleTraceV1[];
  } = {},
): RuleTraceV1 {
  return {
    op,
    passed,
    message,
    ...(options.actual === undefined ? {} : { actual: options.actual }),
    ...(options.expected === undefined ? {} : { expected: options.expected }),
    ...(options.children === undefined ? {} : { children: options.children }),
  };
}

function readPath(root: RuleJsonValue | undefined, field: string): RuleJsonValue | undefined {
  const segments = field.split('.');
  let current: RuleJsonValue | undefined = root;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function reputationKey(actorId: string, factionId: string): string {
  return `${actorId}::${factionId}`;
}

function evaluateCondition(
  condition: RuleConditionV1,
  context: RuleEvaluationContextV1,
): RuleTraceV1 {
  if (condition.op === 'and') {
    const children = condition.conditions.map((child) => evaluateCondition(child, context));
    const passed = children.every((child) => child.passed);
    return trace(
      'and',
      passed,
      passed ? 'All conditions passed.' : 'At least one condition failed.',
      {
        children,
      },
    );
  }

  if (condition.op === 'or') {
    const children = condition.conditions.map((child) => evaluateCondition(child, context));
    const passed = children.some((child) => child.passed);
    return trace(
      'or',
      passed,
      passed ? 'At least one condition passed.' : 'All conditions failed.',
      {
        children,
      },
    );
  }

  if (condition.op === 'not') {
    const child = evaluateCondition(condition.condition, context);
    const passed = !child.passed;
    return trace(
      'not',
      passed,
      passed ? 'Nested condition did not pass.' : 'Nested condition passed.',
      {
        children: [child],
      },
    );
  }

  if (condition.op === 'compare') {
    const actual = context.facts?.[condition.factKey];
    const passed = compare(actual, condition.operator, condition.value);
    return trace(
      'compare',
      passed,
      `Fact ${condition.factKey} is ${display(actual)}; required ${condition.operator} ${display(condition.value)}.`,
      { ...(actual === undefined ? {} : { actual }), expected: condition.value },
    );
  }

  if (condition.op === 'contains') {
    const actual = context.facts?.[condition.factKey];
    const passed =
      typeof actual === 'string'
        ? typeof condition.value === 'string' && actual.includes(condition.value)
        : Array.isArray(actual)
          ? actual.some((item) => item === condition.value)
          : false;
    return trace(
      'contains',
      passed,
      `Fact ${condition.factKey} ${passed ? 'contains' : 'does not contain'} ${display(condition.value)}.`,
      { ...(actual === undefined ? {} : { actual }), expected: condition.value },
    );
  }

  if (condition.op === 'has_tag') {
    const tags = context.tagsByEntity?.[condition.entityId] ?? [];
    const passed = tags.includes(condition.tag);
    return trace(
      'has_tag',
      passed,
      `Entity ${condition.entityId} ${passed ? 'has' : 'does not have'} tag ${condition.tag}.`,
      {
        actual: [...tags],
        expected: condition.tag,
      },
    );
  }

  if (condition.op === 'player_has_knowledge') {
    const match = context.playerKnowledge?.find(
      (knowledge) =>
        knowledge.ownerId === condition.ownerId && knowledge.targetKey === condition.targetKey,
    );
    const statePassed =
      condition.minState === undefined ||
      (match !== undefined && KNOWLEDGE_RANK[match.state] >= KNOWLEDGE_RANK[condition.minState]);
    const confidencePassed =
      condition.minConfidence === undefined ||
      (match !== undefined && match.confidence >= condition.minConfidence);
    const passed = match !== undefined && statePassed && confidencePassed;
    const requirements = [
      condition.minState === undefined ? null : `state >= ${condition.minState}`,
      condition.minConfidence === undefined ? null : `confidence >= ${condition.minConfidence}`,
    ]
      .filter((value): value is string => value !== null)
      .join(', ');
    return trace(
      'player_has_knowledge',
      passed,
      match === undefined
        ? `Player ${condition.ownerId} has no knowledge for ${condition.targetKey}.`
        : `Knowledge is ${match.state} at ${match.confidence}; required ${requirements || 'any known state'}.`,
      {
        ...(match === undefined
          ? {}
          : { actual: { state: match.state, confidence: match.confidence } }),
      },
    );
  }

  if (condition.op === 'reputation') {
    const actual = context.reputations?.[reputationKey(condition.actorId, condition.factionId)];
    const passed = compare(actual, condition.operator, condition.value);
    return trace(
      'reputation',
      passed,
      `Reputation ${condition.actorId}/${condition.factionId} is ${display(actual)}; required ${condition.operator} ${condition.value}.`,
      { ...(actual === undefined ? {} : { actual }), expected: condition.value },
    );
  }

  if (condition.op === 'case_state') {
    const actual = context.caseStates?.[condition.caseId];
    const passed = actual !== undefined && condition.states.includes(actual);
    return trace(
      'case_state',
      passed,
      `Case ${condition.caseId} is ${actual ?? 'missing'}; allowed states: ${condition.states.join(', ')}.`,
      { ...(actual === undefined ? {} : { actual }), expected: condition.states },
    );
  }

  if (condition.op === 'world_clock') {
    const actual = context.worldClocks?.[condition.clockKey];
    const passed = compare(actual, condition.operator, condition.value);
    return trace(
      'world_clock',
      passed,
      `World clock ${condition.clockKey} is ${display(actual)}; required ${condition.operator} ${condition.value}.`,
      { ...(actual === undefined ? {} : { actual }), expected: condition.value },
    );
  }

  if (condition.op === 'location_state') {
    const actual = readPath(context.locationStates?.[condition.locationId], condition.field);
    const passed = compare(actual, condition.operator, condition.value);
    return trace(
      'location_state',
      passed,
      `Location ${condition.locationId}.${condition.field} is ${display(actual)}; required ${condition.operator} ${display(condition.value)}.`,
      { ...(actual === undefined ? {} : { actual }), expected: condition.value },
    );
  }

  if (condition.op === 'faction_state') {
    const actual = readPath(context.factionStates?.[condition.factionId], condition.field);
    const passed = compare(actual, condition.operator, condition.value);
    return trace(
      'faction_state',
      passed,
      `Faction ${condition.factionId}.${condition.field} is ${display(actual)}; required ${condition.operator} ${display(condition.value)}.`,
      { ...(actual === undefined ? {} : { actual }), expected: condition.value },
    );
  }

  if (condition.op === 'inventory') {
    const actual = context.inventories?.[condition.ownerId]?.[condition.itemKey];
    const passed = compare(actual, condition.operator, condition.quantity);
    return trace(
      'inventory',
      passed,
      `Inventory ${condition.ownerId}/${condition.itemKey} is ${display(actual)}; required ${condition.operator} ${condition.quantity}.`,
      { ...(actual === undefined ? {} : { actual }), expected: condition.quantity },
    );
  }

  const actual = readPath(context.attributes?.[condition.entityId], condition.field);
  const passed = compare(actual, condition.operator, condition.value);
  return trace(
    'attribute',
    passed,
    `Attribute ${condition.entityId}.${condition.field} is ${display(actual)}; required ${condition.operator} ${display(condition.value)}.`,
    { ...(actual === undefined ? {} : { actual }), expected: condition.value },
  );
}

export function evaluateRuleV1(
  definition: RuleDefinitionV1,
  context: RuleEvaluationContextV1,
): RuleEvaluationV1 {
  const traceResult = evaluateCondition(definition.condition, context);
  return {
    schemaVersion: 1,
    ruleId: definition.id,
    passed: traceResult.passed,
    trace: traceResult,
  };
}

export type EvaluateUnknownRuleResultV1 =
  | { ok: true; evaluation: RuleEvaluationV1; definition: RuleDefinitionV1 }
  | { ok: false; validation: Extract<RuleValidationResultV1, { ok: false }> };

export function evaluateUnknownRuleV1(
  input: unknown,
  context: RuleEvaluationContextV1,
): EvaluateUnknownRuleResultV1 {
  const validation = validateRuleDefinitionV1(input);
  if (!validation.ok) return { ok: false, validation };
  return {
    ok: true,
    definition: validation.value,
    evaluation: evaluateRuleV1(validation.value, context),
  };
}

export function previewRuleV1(
  definition: RuleDefinitionV1,
  context: RuleEvaluationContextV1,
): RuleEvaluationV1 {
  return evaluateRuleV1(definition, context);
}
