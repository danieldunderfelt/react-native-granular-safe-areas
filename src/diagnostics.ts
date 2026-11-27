import { getDiagnosticsJSON } from './nativeBridge';

export {
  checkDiagnostics,
  type CheckDiagnosticsOptions,
  type DiagnosticCheck,
  type DiagnosticCheckStatus,
  type DiagnosticsCheckResult,
} from './diagnosticsCheck';
export {
  useSafeAreaDiagnostics,
  type SafeAreaDiagnosticReport,
  type UseSafeAreaDiagnosticsOptions,
  type UseSafeAreaDiagnosticsResult,
} from './diagnosticsHook';
export type { SafeAreaUnavailableReason } from './fallback';

/**
 * Everything the native side can see about the safe area, the status bar, reserved regions, vertical bars and the
 * UIKit views around them, for every window. Attach it to bug reports. Resolves to `null` on platforms without a
 * native implementation.
 */
export async function getDiagnostics(): Promise<Record<
  string,
  unknown
> | null> {
  const json = await getDiagnosticsJSON();
  return json ? (JSON.parse(json) as Record<string, unknown>) : null;
}
