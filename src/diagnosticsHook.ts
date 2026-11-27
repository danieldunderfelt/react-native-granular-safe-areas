import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState, Platform } from 'react-native';
import { getDeviceInfo, type SafeAreaDeviceInfo } from './device';
import { checkDiagnostics, type DiagnosticCheck } from './diagnosticsCheck';
import {
  warnGranularUnavailable,
  type SafeAreaUnavailableReason,
} from './fallback';
import { useGranularSafeAreaStore } from './hooks';
import { getDiagnosticsJSON, isNativeModuleAvailable } from './nativeBridge';
import type { GranularSafeAreaMetrics } from './types';

/** Structured, JSON-serializable report produced by `useSafeAreaDiagnostics()` for logging or telemetry (e.g. Datadog). */
export type SafeAreaDiagnosticReport = {
  /** `true` when granular safe areas passed all checks (or on platforms without a native bridge, such as web). */
  ok: boolean;
  /** Primary machine-readable failure code when `ok` is `false`, or `null` when passing. */
  reason: SafeAreaUnavailableReason | null;
  /** Short human-readable summary of the check outcome. */
  summary: string;
  /** Platform the check ran on. */
  platform: 'ios' | 'android' | 'web' | 'unknown';
  /** Classified device type, posture, hardware/OS metadata, and granular capability flags. */
  device: SafeAreaDeviceInfo;
  /** `true` when band-avoidance fallback is active on the store (or on platforms that only use bands). */
  fallbackToBands: boolean;
  /** Individual checks run against the native state, in order. */
  checks: DiagnosticCheck[];
  /** Subset of `checks` with `status === 'fail'`, ready to attach to external logging attributes. */
  failedChecks: DiagnosticCheck[];
  /** ISO-8601 timestamp when the check completed. */
  timestamp: string;
  /** Raw payload from `getDiagnostics()`, only populated when `includeDiagnostics: true`. */
  diagnostics?: Record<string, unknown> | null;
};

export type UseSafeAreaDiagnosticsOptions = {
  /**
   * Called when granular safe areas fail to register or pass diagnostics (for example, to report to Datadog, Sentry,
   * or customer support logs). Only invoked on failures (`report.ok === false`).
   */
  onIssue?: (report: SafeAreaDiagnosticReport) => void;
  /**
   * Called after every diagnostic check (both passing and failing), e.g. to record health telemetry or observe
   * recovery after a transient failure.
   */
  onCheck?: (report: SafeAreaDiagnosticReport) => void;
  /** Enable or disable automatic diagnostic checks. Defaults to `true`. */
  enabled?: boolean;
  /**
   * Automatically fall back to whole-band safe-area avoidance while a check is failing, and restore granular regions
   * if a later check passes. Defaults to `true`.
   */
  fallbackToBands?: boolean;
  /**
   * Milliseconds to wait after mount, structural metrics changes, or returning to the foreground before inspecting
   * the native hierarchy, so initial layout and transitions can settle. Defaults to `1500`.
   */
  delayMs?: number;
  /** Re-run diagnostics when the app returns to the foreground (`AppState` -> `'active'`). Defaults to `true`. */
  checkOnForeground?: boolean;
  /**
   * Only invoke `onIssue` once per distinct failure signature (`reason` + failed check IDs) while mounted, avoiding
   * duplicate log entries on repeated foregrounds. Defaults to `true`.
   */
  deduplicate?: boolean;
  /**
   * Include the raw `getDiagnostics()` payload on `report.diagnostics`. Defaults to `false` so telemetry payloads
   * stay compact for services like Datadog.
   */
  includeDiagnostics?: boolean;
};

export type UseSafeAreaDiagnosticsResult = {
  /** Most recent diagnostic report, or `null` before the first check finishes. */
  report: SafeAreaDiagnosticReport | null;
  /** `true` while band-avoidance fallback is currently active on the store. */
  fallbackActive: boolean;
  /** Run a diagnostic check immediately and return its report. */
  checkNow: () => Promise<SafeAreaDiagnosticReport>;
};

function metricsSignature(metrics: GranularSafeAreaMetrics | null): string {
  if (!metrics) return 'null';
  return [
    metrics.platform,
    Math.round(metrics.width),
    Math.round(metrics.height),
    metrics.verticalBarEdge ?? 'none',
    metrics.barContainersVisible ? '1' : '0',
    metrics.barItemsKnown ? '1' : '0',
    metrics.reservedRegionsSupported ? '1' : '0',
    metrics.divisions.length,
  ].join(':');
}

function platformName(platform: 'ios' | 'android' | 'web' | 'unknown'): string {
  if (platform === 'ios') return 'iOS';
  if (platform === 'android') return 'Android';
  return platform;
}

/**
 * Opt-in runtime diagnostics and external logging hook.
 *
 * Verifies that the native safe-area bridge and system bar controls registered properly after mount, structural layout
 * changes, and app foregrounding. When a check fails:
 *
 * - Automatically switches the active store to whole-band avoidance (unless `fallbackToBands: false`) so content
 *   doesn't collide with unrecognized system bars, and restores granular regions if a later check passes.
 * - Logs a clear warning in `__DEV__`.
 * - Calls `onIssue(report)` with a structured, Datadog/Sentry-friendly payload for customer support debugging.
 *
 * ```tsx
 * useSafeAreaDiagnostics({
 *   onIssue: (report) => {
 *     DdLogs.warn('Granular safe areas unavailable', {
 *       reason: report.reason,
 *       summary: report.summary,
 *       device: report.device,
 *       failedChecks: report.failedChecks,
 *     });
 *   },
 * });
 * ```
 */
export function useSafeAreaDiagnostics(
  options: UseSafeAreaDiagnosticsOptions = {}
): UseSafeAreaDiagnosticsResult {
  const {
    onIssue,
    onCheck,
    enabled = true,
    fallbackToBands: autoFallback = true,
    delayMs = 1500,
    checkOnForeground = true,
    deduplicate = true,
    includeDiagnostics = false,
  } = options;

  const store = useGranularSafeAreaStore();
  const [report, setReport] = useState<SafeAreaDiagnosticReport | null>(null);
  const fallbackActive = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().fallbackToBands
  );
  const signature = useSyncExternalStore(store.subscribe, () =>
    metricsSignature(store.getSnapshot().metrics)
  );

  const onIssueRef = useRef(onIssue);
  const onCheckRef = useRef(onCheck);
  onIssueRef.current = onIssue;
  onCheckRef.current = onCheck;

  const mountedRef = useRef(true);
  const runIdRef = useRef(0);
  const appliedFallbackRef = useRef(false);
  const reportedIssuesRef = useRef(new Set<string>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitIssue = useCallback(
    (next: SafeAreaDiagnosticReport) => {
      if (next.ok || !next.reason) return;
      warnGranularUnavailable(next.reason, next.summary, {
        device: next.device,
        failedChecks: next.failedChecks.map((c) => c.id),
      });
      const key = `${next.reason}:${next.failedChecks.map((c) => c.id).join(',')}`;
      if (!deduplicate || !reportedIssuesRef.current.has(key)) {
        reportedIssuesRef.current.add(key);
        onIssueRef.current?.(next);
      }
    },
    [deduplicate]
  );

  const checkNow = useCallback(async (): Promise<SafeAreaDiagnosticReport> => {
    const runId = ++runIdRef.current;
    const timestamp = new Date().toISOString();
    const initialSnapshot = store.getSnapshot();

    if (store.isMocked) {
      const next: SafeAreaDiagnosticReport = {
        ok: true,
        reason: null,
        summary: 'Mock safe-area metrics active; native diagnostics skipped.',
        platform: initialSnapshot.device.platform,
        device: initialSnapshot.device,
        fallbackToBands: initialSnapshot.fallbackToBands,
        checks: [],
        failedChecks: [],
        timestamp,
        ...(includeDiagnostics ? { diagnostics: null } : {}),
      };
      if (mountedRef.current && runId === runIdRef.current) {
        setReport(next);
        onCheckRef.current?.(next);
      }
      return next;
    }

    if (Platform.OS === 'web') {
      const next: SafeAreaDiagnosticReport = {
        ok: true,
        reason: null,
        summary:
          'Web uses CSS safe-area bands; native granular diagnostics do not apply.',
        platform: 'web',
        device: initialSnapshot.device,
        fallbackToBands: true,
        checks: [],
        failedChecks: [],
        timestamp,
        ...(includeDiagnostics ? { diagnostics: null } : {}),
      };
      if (mountedRef.current && runId === runIdRef.current) {
        setReport(next);
        onCheckRef.current?.(next);
      }
      return next;
    }

    const runtimePlatform: 'ios' | 'android' | 'unknown' =
      Platform.OS === 'ios' || Platform.OS === 'android'
        ? Platform.OS
        : 'unknown';

    if (!isNativeModuleAvailable) {
      const check: DiagnosticCheck = {
        id: 'native-module',
        status: 'fail',
        message: `Native GranularSafeAreas module is unavailable on ${platformName(runtimePlatform)} (not linked or unsupported runtime).`,
      };
      if (autoFallback && mountedRef.current && runId === runIdRef.current) {
        store.setFallbackToBands(true);
        appliedFallbackRef.current = true;
      }
      const next: SafeAreaDiagnosticReport = {
        ok: false,
        reason: 'native-unavailable',
        summary: check.message,
        platform: runtimePlatform,
        device: getDeviceInfo(initialSnapshot.metrics, {
          platform: runtimePlatform,
          fallbackToBands: true,
        }),
        fallbackToBands: true,
        checks: [check],
        failedChecks: [check],
        timestamp,
        ...(includeDiagnostics ? { diagnostics: null } : {}),
      };
      if (mountedRef.current && runId === runIdRef.current) {
        setReport(next);
        emitIssue(next);
        onCheckRef.current?.(next);
      }
      return next;
    }

    let raw: Record<string, unknown> | null = null;
    try {
      const json = await getDiagnosticsJSON();
      raw = json ? (JSON.parse(json) as Record<string, unknown>) : null;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const check: DiagnosticCheck = {
        id: 'diagnostics',
        status: 'fail',
        message: `Failed to collect native safe-area diagnostics: ${detail}`,
      };
      if (autoFallback && mountedRef.current && runId === runIdRef.current) {
        store.setFallbackToBands(true);
        appliedFallbackRef.current = true;
      }
      const latest = store.getSnapshot();
      const next: SafeAreaDiagnosticReport = {
        ok: false,
        reason: 'check-failed',
        summary: check.message,
        platform: runtimePlatform,
        device: getDeviceInfo(latest.metrics, {
          platform: runtimePlatform,
          fallbackToBands: autoFallback ? true : latest.fallbackToBands,
        }),
        fallbackToBands: autoFallback ? true : latest.fallbackToBands,
        checks: [check],
        failedChecks: [check],
        timestamp,
        ...(includeDiagnostics ? { diagnostics: null } : {}),
      };
      if (mountedRef.current && runId === runIdRef.current) {
        setReport(next);
        emitIssue(next);
        onCheckRef.current?.(next);
      }
      return next;
    }

    const latest = store.getSnapshot();
    const result = checkDiagnostics(raw, {
      metrics: latest.metrics,
      regions: latest.regions,
    });
    const failedChecks = result.checks.filter((c) => c.status === 'fail');

    if (mountedRef.current && runId === runIdRef.current && autoFallback) {
      if (!result.ok) {
        store.setFallbackToBands(true);
        appliedFallbackRef.current = true;
      } else if (appliedFallbackRef.current) {
        store.setFallbackToBands(false);
        appliedFallbackRef.current = false;
      }
    }

    const effectiveFallback = autoFallback
      ? !result.ok
      : store.getSnapshot().fallbackToBands;
    const summary = result.ok
      ? `Granular safe areas verified on ${platformName(result.platform)}.`
      : failedChecks.map((c) => c.message).join(' ') ||
        'Granular safe-area diagnostics failed.';
    const next: SafeAreaDiagnosticReport = {
      ok: result.ok,
      reason: result.reason,
      summary,
      platform: result.platform,
      device: result.device,
      fallbackToBands: effectiveFallback,
      checks: result.checks,
      failedChecks,
      timestamp,
      ...(includeDiagnostics ? { diagnostics: raw } : {}),
    };

    if (mountedRef.current && runId === runIdRef.current) {
      setReport(next);
      emitIssue(next);
      onCheckRef.current?.(next);
    }
    return next;
  }, [store, autoFallback, includeDiagnostics, emitIssue]);

  const scheduleCheck = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      checkNow();
    }, delayMs);
  }, [checkNow, delayMs]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (appliedFallbackRef.current) {
        store.setFallbackToBands(false);
        appliedFallbackRef.current = false;
      }
    };
  }, [store]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (appliedFallbackRef.current) {
        store.setFallbackToBands(false);
        appliedFallbackRef.current = false;
      }
      return;
    }
    if (!autoFallback && appliedFallbackRef.current) {
      store.setFallbackToBands(false);
      appliedFallbackRef.current = false;
    }
    scheduleCheck();
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, autoFallback, signature, scheduleCheck, store]);

  useEffect(() => {
    if (!enabled || !checkOnForeground || Platform.OS === 'web') return;
    if (typeof AppState?.addEventListener !== 'function') return;
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (previous !== 'active' && nextState === 'active') {
        scheduleCheck();
      }
      previous = nextState;
    });
    return () => subscription.remove();
  }, [enabled, checkOnForeground, scheduleCheck]);

  return { report, fallbackActive, checkNow };
}
