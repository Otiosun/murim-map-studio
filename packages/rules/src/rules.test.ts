import { describe, expect, it } from 'vitest';

import {
  RULE_ENGINE_CAPABILITIES_V1,
  evaluateRuleV1,
  evaluateUnknownRuleV1,
  previewRuleV1,
  validateRuleDefinitionV1,
  type RuleDefinitionV1,
  type RuleEvaluationContextV1,
} from './index';

const baseContext: RuleEvaluationContextV1 = {
  schemaVersion: 1,
  facts: {
    weather: 'rain',
    omenCount: 3,
    rumors: ['north-road', 'red-moon'],
  },
  tagsByEntity: {
    'loc-qinghe': ['settlement', 'market'],
  },
  playerKnowledge: [
    {
      ownerId: 'player-a',
      targetKey: 'location:hidden-monastery',
      state: 'confirmed',
      confidence: 0.82,
    },
  ],
  reputations: {
    'player-a::faction-crane': 42,
  },
  caseStates: {
    'case-missing': 'active',
  },
  worldClocks: {
    'missing-villagers': 4,
  },
  locationStates: {
    'loc-qinghe': {
      danger: 2,
      access: { northGate: 'open' },
    },
  },
  factionStates: {
    'faction-crane': {
      posture: 'hostile',
      pressure: 7,
    },
  },
  inventories: {
    'player-a': {
      talisman: 2,
    },
  },
  attributes: {
    'player-a': {
      cultivation: { realm: 3 },
      insight: 8,
    },
  },
};

function rule(condition: RuleDefinitionV1['condition']): RuleDefinitionV1 {
  return { schemaVersion: 1, id: 'rule-test', condition };
}

describe('Rule Engine V1', () => {
  it('evaluates boolean composition deterministically and returns an explanation tree', () => {
    const definition = rule({
      op: 'and',
      conditions: [
        { op: 'compare', factKey: 'omenCount', operator: 'gte', value: 3 },
        {
          op: 'or',
          conditions: [
            { op: 'compare', factKey: 'weather', operator: 'eq', value: 'clear' },
            {
              op: 'not',
              condition: { op: 'compare', factKey: 'weather', operator: 'eq', value: 'clear' },
            },
          ],
        },
      ],
    });

    const first = evaluateRuleV1(definition, baseContext);
    const second = evaluateRuleV1(definition, baseContext);
    expect(first).toEqual(second);
    expect(first.passed).toBe(true);
    expect(first.trace.children).toHaveLength(2);
    expect(first.trace.message).toBe('All conditions passed.');
  });

  it('supports contains and explicit entity tags', () => {
    expect(
      evaluateRuleV1(rule({ op: 'contains', factKey: 'rumors', value: 'red-moon' }), baseContext)
        .passed,
    ).toBe(true);
    expect(
      evaluateRuleV1(rule({ op: 'has_tag', entityId: 'loc-qinghe', tag: 'market' }), baseContext)
        .passed,
    ).toBe(true);
  });

  it('evaluates player knowledge by minimum semantic state and confidence', () => {
    const passing = evaluateRuleV1(
      rule({
        op: 'player_has_knowledge',
        ownerId: 'player-a',
        targetKey: 'location:hidden-monastery',
        minState: 'localized',
        minConfidence: 0.8,
      }),
      baseContext,
    );
    const failing = evaluateRuleV1(
      rule({
        op: 'player_has_knowledge',
        ownerId: 'player-a',
        targetKey: 'location:hidden-monastery',
        minState: 'investigated',
      }),
      baseContext,
    );

    expect(passing.passed).toBe(true);
    expect(failing.passed).toBe(false);
    expect(failing.trace.message).toContain('confirmed');
    expect(failing.trace.message).toContain('investigated');
  });

  it('supports reputation, case state, world clocks, state fields, inventory and attributes', () => {
    const definition = rule({
      op: 'and',
      conditions: [
        {
          op: 'reputation',
          actorId: 'player-a',
          factionId: 'faction-crane',
          operator: 'gte',
          value: 40,
        },
        { op: 'case_state', caseId: 'case-missing', states: ['active', 'paused'] },
        { op: 'world_clock', clockKey: 'missing-villagers', operator: 'lt', value: 5 },
        {
          op: 'location_state',
          locationId: 'loc-qinghe',
          field: 'access.northGate',
          operator: 'eq',
          value: 'open',
        },
        {
          op: 'faction_state',
          factionId: 'faction-crane',
          field: 'pressure',
          operator: 'gte',
          value: 7,
        },
        { op: 'inventory', ownerId: 'player-a', itemKey: 'talisman', operator: 'gte', quantity: 2 },
        {
          op: 'attribute',
          entityId: 'player-a',
          field: 'cultivation.realm',
          operator: 'gte',
          value: 3,
        },
      ],
    });

    expect(evaluateRuleV1(definition, baseContext).passed).toBe(true);
  });

  it('fails closed when context data is missing and explains the missing value', () => {
    const evaluation = previewRuleV1(
      rule({ op: 'world_clock', clockKey: 'unknown-clock', operator: 'gte', value: 1 }),
      baseContext,
    );
    expect(evaluation.passed).toBe(false);
    expect(evaluation.trace.message).toContain('missing');
  });

  it('strictly validates the versioned JSON AST and rejects unknown fields/operators', () => {
    const unknownField = validateRuleDefinitionV1({
      schemaVersion: 1,
      id: 'rule-x',
      condition: {
        op: 'compare',
        factKey: 'weather',
        operator: 'eq',
        value: 'rain',
        script: 'hack()',
      },
    });
    expect(unknownField.ok).toBe(false);
    if (!unknownField.ok)
      expect(unknownField.issues.some((item) => item.code === 'unknown_field')).toBe(true);

    const arbitraryCode = validateRuleDefinitionV1({
      schemaVersion: 1,
      id: 'rule-code',
      condition: { op: 'eval', source: 'return true' },
    });
    expect(arbitraryCode.ok).toBe(false);
    if (!arbitraryCode.ok) expect(arbitraryCode.issues[0]?.code).toBe('unknown_operator');
  });

  it('rejects prototype-path segments and non-auditable RNG operators', () => {
    const unsafePath = validateRuleDefinitionV1({
      schemaVersion: 1,
      id: 'rule-unsafe',
      condition: {
        op: 'attribute',
        entityId: 'player-a',
        field: '__proto__.polluted',
        operator: 'eq',
        value: true,
      },
    });
    expect(unsafePath.ok).toBe(false);

    const rng = evaluateUnknownRuleV1(
      {
        schemaVersion: 1,
        id: 'rule-rng',
        condition: { op: 'random_chance', probability: 0.5 },
      },
      baseContext,
    );
    expect(rng.ok).toBe(false);
    expect(RULE_ENGINE_CAPABILITIES_V1.rng).toBe('unsupported');
  });

  it('enforces AST depth limits instead of accepting unbounded recursive input', () => {
    let condition: unknown = { op: 'compare', factKey: 'weather', operator: 'eq', value: 'rain' };
    for (let index = 0; index < 20; index += 1) condition = { op: 'not', condition };

    const validation = validateRuleDefinitionV1({ schemaVersion: 1, id: 'rule-deep', condition });
    expect(validation.ok).toBe(false);
    if (!validation.ok)
      expect(validation.issues.some((item) => item.code === 'depth_limit')).toBe(true);
  });
});
