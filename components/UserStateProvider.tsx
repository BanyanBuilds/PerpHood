"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  EMPTY_V53_USER_STATE,
  getV53UserStateSection,
  mergeV53UserState,
  normalizeV53UserState,
  setV53UserStateSection,
  validateV53RecoveryKey,
  v53UserStateEquals,
  type V53UserStateDocument,
} from "@/lib/v53-user-state";

const DOCUMENT_KEY = "perphood-v53-user-state";
const RECOVERY_KEY = "perphood-v53-recovery-key";
const DEVICE_KEY = "perphood-v53-device-id";
const DEVICE_LABEL_KEY = "perphood-v53-device-label";

export type V53SyncStatus = "booting" | "local-only" | "syncing" | "synced" | "offline" | "conflict" | "error";

type UserStateContextValue = {
  ready: boolean;
  status: V53SyncStatus;
  message: string;
  revision: number;
  document: V53UserStateDocument;
  recoveryKey: string;
  deviceId: string;
  getSection: <T>(key: string, fallback: T) => T;
  setSection: <T>(key: string, value: T) => void;
  syncNow: () => Promise<void>;
  copyRecoveryKey: () => Promise<boolean>;
  importRecoveryKey: (value: string) => boolean;
};

const UserStateContext = createContext<UserStateContextValue | null>(null);

function randomBase64Url(bytes = 32) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  let binary = "";
  values.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function ensureRecoveryKey() {
  const existing = window.localStorage.getItem(RECOVERY_KEY)?.trim() ?? "";
  if (validateV53RecoveryKey(existing)) return existing;
  const created = `ph53_${randomBase64Url(32)}`;
  window.localStorage.setItem(RECOVERY_KEY, created);
  return created;
}

function ensureDeviceId() {
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_KEY, created);
  return created;
}

function loadLocalDocument() {
  try { return normalizeV53UserState(JSON.parse(window.localStorage.getItem(DOCUMENT_KEY) ?? "{}")); }
  catch { return structuredClone(EMPTY_V53_USER_STATE); }
}

function persistLocalDocument(document: V53UserStateDocument) {
  window.localStorage.setItem(DOCUMENT_KEY, JSON.stringify(document));
}

async function requestRemote(method: "GET" | "PUT", recoveryKey: string, body?: unknown) {
  const response = await fetch("/api/v53/user-state", {
    method,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-perphood-sync-key": recoveryKey,
      "x-perphood-device-id": window.localStorage.getItem(DEVICE_KEY) ?? "",
      "x-perphood-device-label": window.localStorage.getItem(DEVICE_LABEL_KEY) || navigator.platform || "Browser",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, payload };
}

export function UserStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<V53SyncStatus>("booting");
  const [message, setMessage] = useState("Loading local user state…");
  const [revision, setRevision] = useState(0);
  const [document, setDocument] = useState<V53UserStateDocument>(EMPTY_V53_USER_STATE);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const documentRef = useRef(document);
  const revisionRef = useRef(revision);
  const recoveryKeyRef = useRef(recoveryKey);
  const deviceIdRef = useRef(deviceId);
  const remoteReadyRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);
  const pushInFlightRef = useRef(false);

  useEffect(() => { documentRef.current = document; }, [document]);
  useEffect(() => { revisionRef.current = revision; }, [revision]);
  useEffect(() => { recoveryKeyRef.current = recoveryKey; }, [recoveryKey]);
  useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);

  const pushRemote = useCallback(async (allowRetry = true) => {
    if (!remoteReadyRef.current || pushInFlightRef.current || !recoveryKeyRef.current) return;
    pushInFlightRef.current = true;
    setStatus("syncing");
    setMessage("Saving user settings to Supabase…");
    try {
      const result = await requestRemote("PUT", recoveryKeyRef.current, {
        expectedRevision: revisionRef.current,
        state: documentRef.current,
        deviceId: deviceIdRef.current,
        deviceLabel: window.localStorage.getItem(DEVICE_LABEL_KEY) || navigator.platform || "Browser",
      });
      if (result.response.status === 503) {
        setStatus("local-only");
        setMessage("Supabase is not configured. Settings remain safely stored on this device.");
        return;
      }
      if (result.response.status === 409) {
        const remote = normalizeV53UserState(result.payload.state);
        const merged = mergeV53UserState(remote, documentRef.current);
        setDocument(merged);
        persistLocalDocument(merged);
        const nextRevision = Number(result.payload.revision ?? 0);
        setRevision(nextRevision);
        revisionRef.current = nextRevision;
        setStatus("conflict");
        setMessage("A newer device revision was merged. Saving the merged state…");
        if (allowRetry) window.setTimeout(() => { void pushRemote(false); }, 40);
        return;
      }
      if (!result.response.ok) throw new Error(String(result.payload.error ?? `Sync failed with HTTP ${result.response.status}.`));
      const nextRevision = Number(result.payload.revision ?? revisionRef.current + 1);
      setRevision(nextRevision);
      revisionRef.current = nextRevision;
      setStatus("synced");
      setMessage("Presets, workspaces, watchlists, likes, and alerts are synced.");
    } catch (error) {
      setStatus(navigator.onLine ? "error" : "offline");
      setMessage(error instanceof Error ? error.message : "User-state sync is temporarily unavailable.");
    } finally {
      pushInFlightRef.current = false;
    }
  }, []);

  const schedulePush = useCallback(() => {
    if (!remoteReadyRef.current) return;
    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => { void pushRemote(); }, 650);
  }, [pushRemote]);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const key = ensureRecoveryKey();
      const device = ensureDeviceId();
      const local = loadLocalDocument();
      recoveryKeyRef.current = key;
      deviceIdRef.current = device;
      documentRef.current = local;
      setRecoveryKey(key);
      setDeviceId(device);
      setDocument(local);
      setStatus("syncing");
      setMessage("Checking Supabase for a newer cross-device state…");
      try {
        const result = await requestRemote("GET", key);
        if (cancelled) return;
        if (result.response.status === 503) {
          remoteReadyRef.current = true;
          setStatus("local-only");
          setMessage("Supabase is not configured. Local fallback is active.");
          setReady(true);
          return;
        }
        if (!result.response.ok) throw new Error(String(result.payload.error ?? `Sync failed with HTTP ${result.response.status}.`));
        const remote = normalizeV53UserState(result.payload.state);
        const currentLocal = documentRef.current;
        const merged = mergeV53UserState(remote, currentLocal);
        const nextRevision = Number(result.payload.revision ?? 0);
        documentRef.current = merged;
        revisionRef.current = nextRevision;
        setDocument(merged);
        setRevision(nextRevision);
        persistLocalDocument(merged);
        remoteReadyRef.current = true;
        setStatus("synced");
        setMessage("Cross-device user state is connected.");
        setReady(true);
        if (!v53UserStateEquals(merged, remote)) schedulePush();
      } catch (error) {
        if (cancelled) return;
        remoteReadyRef.current = true;
        setStatus(navigator.onLine ? "error" : "offline");
        setMessage(error instanceof Error ? error.message : "Supabase could not be reached. Local fallback remains active.");
        setReady(true);
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
      if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    };
  }, [schedulePush]);

  const getSection = useCallback(<T,>(key: string, fallback: T) => getV53UserStateSection(documentRef.current, key, fallback), []);

  const setSection = useCallback(<T,>(key: string, value: T) => {
    const next = setV53UserStateSection(documentRef.current, key, value);
    if (next === documentRef.current) return;
    documentRef.current = next;
    setDocument(next);
    persistLocalDocument(next);
    schedulePush();
  }, [schedulePush]);

  const syncNow = useCallback(async () => { await pushRemote(); }, [pushRemote]);

  const copyRecoveryKey = useCallback(async () => {
    try { await navigator.clipboard.writeText(recoveryKeyRef.current); return true; }
    catch { return false; }
  }, []);

  const importRecoveryKey = useCallback((value: string) => {
    const normalized = value.trim();
    if (!validateV53RecoveryKey(normalized)) return false;
    window.localStorage.setItem(RECOVERY_KEY, normalized);
    window.localStorage.removeItem(DOCUMENT_KEY);
    window.location.reload();
    return true;
  }, []);

  const value = useMemo<UserStateContextValue>(() => ({
    ready, status, message, revision, document, recoveryKey, deviceId,
    getSection, setSection, syncNow, copyRecoveryKey, importRecoveryKey,
  }), [copyRecoveryKey, deviceId, document, getSection, importRecoveryKey, message, ready, recoveryKey, revision, setSection, status, syncNow]);

  return <UserStateContext.Provider value={value}>{children}</UserStateContext.Provider>;
}

export function useUserState() {
  const context = useContext(UserStateContext);
  if (!context) throw new Error("useUserState must be used inside UserStateProvider");
  return context;
}
