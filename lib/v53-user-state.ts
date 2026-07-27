export const V53_USER_STATE_VERSION = 53 as const;

export type V53UserStateSection<T = unknown> = {
  updatedAt: number;
  value: T;
};

export type V53UserStateDocument = {
  version: typeof V53_USER_STATE_VERSION;
  sections: Record<string, V53UserStateSection>;
};

export const EMPTY_V53_USER_STATE: V53UserStateDocument = {
  version: V53_USER_STATE_VERSION,
  sections: {},
};

export function normalizeV53UserState(input: unknown): V53UserStateDocument {
  if (!input || typeof input !== "object") return structuredClone(EMPTY_V53_USER_STATE);
  const candidate = input as Partial<V53UserStateDocument>;
  const sections: Record<string, V53UserStateSection> = {};
  if (candidate.sections && typeof candidate.sections === "object") {
    for (const [key, raw] of Object.entries(candidate.sections)) {
      if (!raw || typeof raw !== "object") continue;
      const section = raw as Partial<V53UserStateSection>;
      if (!Number.isFinite(section.updatedAt) || section.updatedAt! < 0 || !("value" in section)) continue;
      sections[key] = { updatedAt: Number(section.updatedAt), value: section.value };
    }
  }
  return { version: V53_USER_STATE_VERSION, sections };
}

export function mergeV53UserState(...documents: Array<V53UserStateDocument | null | undefined>): V53UserStateDocument {
  const merged = structuredClone(EMPTY_V53_USER_STATE);
  for (const document of documents) {
    const normalized = normalizeV53UserState(document);
    for (const [key, section] of Object.entries(normalized.sections)) {
      const current = merged.sections[key];
      if (!current || section.updatedAt >= current.updatedAt) merged.sections[key] = structuredClone(section);
    }
  }
  return merged;
}

export function setV53UserStateSection<T>(document: V53UserStateDocument, key: string, value: T, updatedAt = Date.now()): V53UserStateDocument {
  const normalizedKey = key.trim();
  if (!normalizedKey) throw new Error("User-state section keys cannot be empty.");
  if (normalizedKey.length > 160) throw new Error("User-state section keys cannot exceed 160 characters.");
  if (!Number.isFinite(updatedAt) || updatedAt < 0) throw new Error("User-state timestamps must be non-negative finite numbers.");
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("User-state values must be JSON serializable.");
  const normalizedValue = JSON.parse(encoded) as T;
  const current = document.sections[normalizedKey];
  if (current && JSON.stringify(current.value) === encoded) return document;
  return {
    version: V53_USER_STATE_VERSION,
    sections: {
      ...document.sections,
      [normalizedKey]: { value: normalizedValue, updatedAt },
    },
  };
}

export function getV53UserStateSection<T>(document: V53UserStateDocument, key: string, fallback: T): T {
  const section = document.sections[key];
  return section ? structuredClone(section.value as T) : fallback;
}

export function v53UserStateEquals(left: V53UserStateDocument, right: V53UserStateDocument) {
  return JSON.stringify(normalizeV53UserState(left)) === JSON.stringify(normalizeV53UserState(right));
}

export function validateV53RecoveryKey(value: string) {
  return /^ph53_[A-Za-z0-9_-]{43}$/.test(value.trim());
}
