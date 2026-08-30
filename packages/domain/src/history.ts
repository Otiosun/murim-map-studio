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
  beforeDocument: WorldDocument;
  afterDocument: WorldDocument;
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
  error:
    | CommandApplyFailure['error']
    | { code: 'history_empty'; message: string }
    | { code: 'history_document_mismatch'; message: string };
}

export type HistoryResult = HistorySuccess | HistoryFailure;

export function createCommandHistory(): CommandHistory {
  return { past: [], future: [] };
}

function sameDocument(left: WorldDocument, right: WorldDocument): boolean {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
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
          beforeDocument: document,
          afterDocument: result.document,
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

  if (!sameDocument(document, entry.afterDocument)) {
    return {
      ok: false,
      document,
      history,
      error: {
        code: 'history_document_mismatch',
        message: 'The current document diverged from the history head; undo was refused.',
      },
    };
  }

  const result = applyWorldCommand(document, { meta, payload: structuredClone(entry.inverse) });
  if (!result.ok) {
    return { ok: false, document, history, error: result.error };
  }

  return {
    ok: true,
    document: entry.beforeDocument,
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

  if (!sameDocument(document, entry.beforeDocument)) {
    return {
      ok: false,
      document,
      history,
      error: {
        code: 'history_document_mismatch',
        message: 'The current document diverged from the redo base; redo was refused.',
      },
    };
  }

  const result = applyWorldCommand(document, { meta, payload: structuredClone(entry.forward) });
  if (!result.ok) {
    return { ok: false, document, history, error: result.error };
  }

  return {
    ok: true,
    document: entry.afterDocument,
    history: {
      past: [...history.past, entry],
      future: history.future.slice(0, -1),
    },
    auditEvent: historyAudit(result.auditEvent, 'redo', entry.originalCommandId),
  };
}
