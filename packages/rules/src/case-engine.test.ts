import { describe, expect, it } from 'vitest';

import {
  SCENE_CLOSURE_CONTEXT_ENTITY,
  applySceneClosureV1,
  createCaseRuntimeV1,
  validateCaseDefinitionV1,
  validateSceneClosureV1,
  type CaseDefinitionV1,
  type RuleEvaluationContextV1,
} from './index';

const context: RuleEvaluationContextV1 = { schemaVersion: 1 };

function caseDefinition(): CaseDefinitionV1 {
  return {
    schemaVersion: 1,
    id: 'case-missing-villagers',
    name: 'Desaparecimentos de Qinghe',
    initialState: 'active',
    transitions: [
      {
        id: 'pause-on-retreat',
        from: ['active'],
        to: 'paused',
        closureStatus: 'partial',
        when: {
          op: 'attribute',
          entityId: SCENE_CLOSURE_CONTEXT_ENTITY,
          field: 'outcome.action',
          operator: 'eq',
          value: 'retreat',
        },
        effects: [
          { kind: 'emit_signal', signalKey: 'case.followup', payload: { urgency: 'medium' } },
        ],
      },
      {
        id: 'resolve-rescue',
        from: ['active', 'paused'],
        to: 'resolved',
        closureStatus: 'final',
        when: {
          op: 'attribute',
          entityId: SCENE_CLOSURE_CONTEXT_ENTITY,
          field: 'outcome.result',
          operator: 'eq',
          value: 'rescued',
        },
        effects: [
          { kind: 'world_event', eventKind: 'villagers_rescued', payload: { village: 'Qinghe' } },
          { kind: 'world_clock_delta', clockKey: 'missing-villagers', delta: -4 },
        ],
      },
    ],
  };
}

function closure(
  closureKey: string,
  status: 'partial' | 'final',
  outcome: Record<string, string>,
  role: 'player' | 'narrator' | 'admin' | 'system' = 'player',
) {
  return {
    schemaVersion: 1,
    closureKey,
    caseId: 'case-missing-villagers',
    status,
    summary: `Closure ${closureKey}`,
    occurredAt: '2026-08-29T20:00:00Z',
    actor: { id: 'actor-a', role },
    outcome,
  };
}

describe('Case Engine V1', () => {
  it('keeps a Case partial when no transition is eligible, then resolves it later', () => {
    const definition = caseDefinition();
    const initial = createCaseRuntimeV1(definition);

    const partial = applySceneClosureV1(
      definition,
      initial,
      closure('closure-partial-search', 'partial', { action: 'continue-search' }),
      context,
    );
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    expect(partial.reason).toBe('partial_no_transition');
    expect(partial.runtime.state).toBe('active');
    expect(partial.runtime.appliedClosures).toHaveLength(1);
    expect(partial.effects).toEqual([]);

    const final = applySceneClosureV1(
      definition,
      partial.runtime,
      closure('closure-final-rescue', 'final', { result: 'rescued' }),
      context,
    );
    expect(final.ok).toBe(true);
    if (!final.ok) return;
    expect(final.reason).toBe('transition');
    expect(final.transitionId).toBe('resolve-rescue');
    expect(final.runtime.state).toBe('resolved');
    expect(final.runtime.appliedClosures).toHaveLength(2);
    expect(final.effects.map((effect) => effect.kind)).toEqual([
      'world_event',
      'world_clock_delta',
    ]);
    expect(final.assessments.find((item) => item.transitionId === 'resolve-rescue')).toMatchObject({
      eligible: true,
      reason: 'condition_passed',
    });
  });

  it('is idempotent for the same closure and rejects closureKey reuse with different content', () => {
    const definition = caseDefinition();
    const initial = createCaseRuntimeV1(definition);
    const input = closure('closure-idempotent', 'partial', { action: 'continue-search' });
    const first = applySceneClosureV1(definition, initial, input, context);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const duplicate = applySceneClosureV1(definition, first.runtime, input, context);
    expect(duplicate).toMatchObject({ ok: true, applied: false, reason: 'duplicate' });
    if (!duplicate.ok) return;
    expect(duplicate.runtime).toBe(first.runtime);
    expect(duplicate.runtime.appliedClosures).toHaveLength(1);

    const conflict = applySceneClosureV1(
      definition,
      first.runtime,
      { ...input, summary: 'Different canonical content' },
      context,
    );
    expect(conflict).toMatchObject({ ok: false, code: 'closure_conflict' });
  });

  it('supports structured narrator/admin custom outcomes for unforeseen ON results', () => {
    const definition = caseDefinition();
    const runtime = createCaseRuntimeV1(definition);
    const custom = {
      ...closure('closure-custom', 'final', { result: 'unexpected-alliance' }, 'narrator'),
      customResolution: {
        toState: 'transformed',
        reason: 'The missing-person case became a faction alliance thread.',
        effects: [
          {
            kind: 'emit_signal',
            signalKey: 'case.alliance-thread',
            payload: { faction: 'crane-sect' },
          },
          {
            kind: 'knowledge_change',
            ownerId: 'player-a',
            targetKey: 'faction:crane-sect',
            state: 'confirmed',
            confidence: 0.9,
          },
        ],
      },
    };

    const result = applySceneClosureV1(definition, runtime, custom, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reason).toBe('custom_resolution');
    expect(result.runtime.state).toBe('transformed');
    expect(result.effects).toHaveLength(2);
  });

  it('rejects custom narrative resolution from an unauthorized player', () => {
    const definition = caseDefinition();
    const runtime = createCaseRuntimeV1(definition);
    const custom = {
      ...closure('closure-player-override', 'final', { result: 'self-declared' }, 'player'),
      customResolution: {
        toState: 'resolved',
        reason: 'Player cannot canonize this alone.',
        effects: [],
      },
    };

    expect(applySceneClosureV1(definition, runtime, custom, context)).toMatchObject({
      ok: false,
      code: 'unauthorized_custom_resolution',
    });
  });

  it('fails closed on ambiguous eligible transitions instead of choosing by array order', () => {
    const definition: CaseDefinitionV1 = {
      schemaVersion: 1,
      id: 'case-ambiguous',
      name: 'Ambiguous test',
      initialState: 'active',
      transitions: [
        { id: 'one', from: ['active'], to: 'resolved', closureStatus: 'final', effects: [] },
        { id: 'two', from: ['active'], to: 'failed', closureStatus: 'final', effects: [] },
      ],
    };
    const runtime = createCaseRuntimeV1(definition);
    const input = {
      schemaVersion: 1,
      closureKey: 'closure-ambiguous',
      caseId: 'case-ambiguous',
      status: 'final',
      summary: 'Ambiguous',
      occurredAt: '2026-08-29T20:00:00Z',
      actor: { id: 'actor-a', role: 'player' },
      outcome: {},
    };

    const result = applySceneClosureV1(definition, runtime, input, context);
    expect(result).toMatchObject({ ok: false, code: 'ambiguous_transition' });
    if (!result.ok) expect(result.assessments?.filter((item) => item.eligible)).toHaveLength(2);
  });

  it('requires an eligible transition or authorized structured override for final closures', () => {
    const definition = caseDefinition();
    const result = applySceneClosureV1(
      definition,
      createCaseRuntimeV1(definition),
      closure('closure-final-unmatched', 'final', { result: 'unknown' }),
      context,
    );
    expect(result).toMatchObject({ ok: false, code: 'no_transition' });
  });

  it('strictly validates versioned Case/SceneClosure data and rejects arbitrary effects', () => {
    const invalidDefinition = validateCaseDefinitionV1({
      ...caseDefinition(),
      transitions: [
        {
          id: 'unsafe',
          from: ['active'],
          to: 'resolved',
          effects: [{ kind: 'script', source: 'return true' }],
        },
      ],
    });
    expect(invalidDefinition.ok).toBe(false);
    if (!invalidDefinition.ok) {
      expect(invalidDefinition.issues.some((issue) => issue.code === 'unknown_effect')).toBe(true);
    }

    const invalidClosure = validateSceneClosureV1({
      ...closure('closure-v2', 'partial', {}),
      schemaVersion: 2,
    });
    expect(invalidClosure.ok).toBe(false);
    if (!invalidClosure.ok) {
      expect(invalidClosure.issues.some((issue) => issue.code === 'unsupported_version')).toBe(
        true,
      );
    }
  });

  it('rejects prototype-polluting keys inside structured outcome payloads', () => {
    const malicious = JSON.parse(
      '{"schemaVersion":1,"closureKey":"closure-safe","caseId":"case-missing-villagers","status":"partial","summary":"x","occurredAt":"2026-08-29T20:00:00Z","actor":{"id":"actor-a","role":"player"},"outcome":{"__proto__":{"polluted":true}}}',
    );
    const validation = validateSceneClosureV1(malicious);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues.some((issue) => issue.code === 'forbidden_key_segment')).toBe(true);
    }
  });
});
