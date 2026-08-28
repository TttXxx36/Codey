type RevisionedConfig = {
  settingsRevision: number;
};

function serialize(value: unknown) {
  return JSON.stringify(value);
}

/**
 * Rebase only the fields changed by the local settings draft onto the newest
 * persisted snapshot. This keeps unrelated concurrent updates intact while
 * preserving the user's edits for an intentional save.
 */
export function mergeConfigDraft<T extends RevisionedConfig>(
  base: T,
  draft: T,
  latest: T,
): T {
  const merged = { ...latest } as T;
  const baseRecord = base as unknown as Record<string, unknown>;
  const draftRecord = draft as unknown as Record<string, unknown>;
  const mergedRecord = merged as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(baseRecord), ...Object.keys(draftRecord)]);

  keys.delete("settingsRevision");
  for (const key of keys) {
    if (serialize(baseRecord[key]) !== serialize(draftRecord[key])) {
      mergedRecord[key] = draftRecord[key];
    }
  }

  merged.settingsRevision = latest.settingsRevision;
  return merged;
}

export function isSettingsRevisionConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("设置已被其他操作更新") ||
    message.includes("stale config revision")
  );
}
