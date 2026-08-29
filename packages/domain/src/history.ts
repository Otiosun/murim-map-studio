import type { WorldDocument } from './document';
import {
  applyWorldCommand,
  type CommandApplyFailure,
  type CommandAuditEvent,
  type CommandMetadata,
  type CommandPayload,
  type WorldCommand,
} from './commands';

export interface CommandHistoryEntry {
  forward: CommandPayload;
  inverse: CommandPayload;
  originalCommandId: string;
}

export interface CommandHistory {
  past: CommandHistoryEntry[];
  future: CommandHistoryEntry[];
}

export interface HistorySuccess {
  ok: true;
  document: WorldDocument;
  history: CommandHistory;
  auditEvent: CommandAuditEvent;
}

export interface HistoryFailure {
  ok: false;
  document: WorldDocument;
  history: CommandHistory;
  error: CommandApplyFailure['error'] | { code: 'history_empty'; message: string };
}

export type HistoryResult = HistorySuccess | HistoryFailure;

export function createCommandHistory(): CommandHistory {
  return { past: [], future: [] };
}

export function executeWithHistory(
  document: WorldDocument,
  history: CommandHistory,
  command: WorldCommand,
): HistoryResult {
  const result = applyWorldCommand(document, command);
  if (!result.ok) {
    return { ok: false, document, history, error: result.error };
  }

  return {
    ok: true,
    document: result.document,
    history: {
      past: [
        ...history.past,
        {
          forward: structuredClone(command.payload),
          inverse: structuredClone(result.inverse),
          originalCommandId: command.meta.commandId,
        },
      ],
      future: [],
    },
    auditEvent: result.auditEvent,
  };
}

function historyAudit(
  event: CommandAuditEvent,
  operation: 'undo' | 'redo',
  originalCommandId: string,
): CommandAuditEvent {
  return {
    ...event,
    payload: {
      ...event.payload,
      historyOperation: operation,
      originalCommandId,
    },
  };
}

export function undoWithHistory(
  document: WorldDocument,
  history: CommandHistory,
  meta: CommandMetadata,
): HistoryResult {
  const entry = history.past.at(-1);
  if (!entry) {
    return {
      ok: false,
      document,
      history,
      error: { code: 'history_empty', message: 'There is no committed command to undo.' },
    };
  }

  const result = applyWorldCommand(document, { meta, payload: structuredClone(entry.inverse) });
  if (!result.ok) {
    return { ok: false, document, history, error: result.error };
  }

  return {
    ok: true,
    document: result.document,
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, entry],
    },
    auditEvent: historyAudit(result.auditEvent, 'undo', entry.originalCommandId),
  };
}

export function redoWithHistory(
  document: WorldDocument,
  history: CommandHistory,
  meta: CommandMetadata,
): HistoryResult {
  const entry = history.future.at(-1);
  if (!entry) {
    return {
      ok: false,
      document,
      history,
      error: { code: 'history_empty', message: 'There is no undone command to redo.' },
    };
  }

  const result = applyWorldCommand(document, { meta, payload: structuredClone(entry.forward) });
  if (!result.ok) {
    return { ok: false, document, history, error: result.error };
  }

  return {
    ok: true,
    document: result.document,
    history: {
      past: [
        ...history.past,
        {
          forward: structuredClone(entry.forward),
          inverse: structuredClone(result.inverse),
          originalCommandId: entry.originalCommandId,
        },
      ],
      future: history.future.slice(0, -1),
    },
    auditEvent: historyAudit(result.auditEvent, 'redo', entry.originalCommandId),
  };
}
