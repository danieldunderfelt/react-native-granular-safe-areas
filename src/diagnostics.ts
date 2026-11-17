import { getDiagnosticsJSON } from './nativeBridge';

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
