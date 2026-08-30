import {
  validateWorldDocument,
  type EntityType,
  type WorldDocument,
  type WorldEntity,
} from '@murim/domain';
import { prepareStudioDocument, STUDIO_WORLD_ID } from './studio-assets';

export const STUDIO_STORAGE_KEY = 'murim-map-studio:world-document:v1';

export interface StudioStoredDocument {
  schemaVersion: 1;
  savedAt: string;
  document: WorldDocument;
}

export interface StudioInspectorField {
  property: string;
  label: string;
  kind: 'text';
  fallback?: string;
}

const EMPTY_FIELDS: readonly StudioInspectorField[] = [];

export const STUDIO_ENTITY_SCHEMA_REGISTRY: Partial<
  Record<EntityType, readonly StudioInspectorField[]>
> = {
  world: [{ property: 'name', label: 'Nome', kind: 'text' }],
  location: [
    { property: 'name', label: 'Nome', kind: 'text' },
    { property: 'locationKind', label: 'Tipo', kind: 'text', fallback: 'place' },
  ],
  route: [{ property: 'routeKind', label: 'Tipo da rota', kind: 'text', fallback: 'path' }],
};

export function createInitialWorldDocument(now = new Date().toISOString()): WorldDocument {
  return prepareStudioDocument({
    schemaVersion: 1,
    rootWorldId: STUDIO_WORLD_ID,
    entities: [
      {
        id: STUDIO_WORLD_ID,
        type: 'world',
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        name: 'Círculo Exterior — Rascunho',
        coordinateSystem: {
          kind: 'planar',
          unit: 'world-unit',
          origin: { x: 0, y: 0 },
        },
      },
    ],
  });
}

export function inspectorFieldsFor(entity: WorldEntity): readonly StudioInspectorField[] {
  return STUDIO_ENTITY_SCHEMA_REGISTRY[entity.type] ?? EMPTY_FIELDS;
}

export function inspectorStringValue(entity: WorldEntity, property: string): string {
  const value = (entity as unknown as Record<string, unknown>)[property];
  return typeof value === 'string' ? value : '';
}

export function encodeStudioDocument(
  document: WorldDocument,
  savedAt = new Date().toISOString(),
): string {
  const prepared = prepareStudioDocument(document);
  const issues = validateWorldDocument(prepared);
  if (issues.length > 0) {
    throw new Error(
      `Cannot persist invalid world document: ${issues[0]?.message ?? 'unknown issue'}`,
    );
  }

  const envelope: StudioStoredDocument = {
    schemaVersion: 1,
    savedAt,
    document: prepared,
  };
  return JSON.stringify(envelope);
}

export type DecodeStudioDocumentResult =
  { ok: true; envelope: StudioStoredDocument } | { ok: false; reason: string };

export function decodeStudioDocument(raw: string): DecodeStudioDocumentResult {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, reason: 'Save envelope must be an object.' };
    }

    const record = parsed as Record<string, unknown>;
    if (record.schemaVersion !== 1 || typeof record.savedAt !== 'string') {
      return { ok: false, reason: 'Unsupported or malformed save envelope.' };
    }
    if (!record.document || typeof record.document !== 'object') {
      return { ok: false, reason: 'Save envelope does not contain a world document.' };
    }

    const rawDocument = record.document as WorldDocument;
    if (rawDocument.schemaVersion !== 1) {
      return { ok: false, reason: 'Unsupported world document schema version.' };
    }

    const document = prepareStudioDocument(rawDocument);
    const issues = validateWorldDocument(document);
    if (issues.length > 0) {
      return { ok: false, reason: issues[0]?.message ?? 'World document is invalid.' };
    }

    return {
      ok: true,
      envelope: {
        schemaVersion: 1,
        savedAt: record.savedAt,
        document,
      },
    };
  } catch {
    return { ok: false, reason: 'Save payload is not valid JSON.' };
  }
}
