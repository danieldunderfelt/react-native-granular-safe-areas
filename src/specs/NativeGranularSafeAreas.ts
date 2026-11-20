import {
  TurboModuleRegistry,
  type CodegenTypes,
  type TurboModule,
} from 'react-native';

export interface Spec extends TurboModule {
  getConstants(): {
    /** `GranularSafeAreaMetrics` for the key window as JSON, or an empty string when there is no window yet. */
    initialWindowMetrics: string;
  };
  /** Everything the native side can see, as JSON, for bug reports and for working out new devices. */
  getDiagnostics(): Promise<string>;
  /**
   * Starts following the app's window, for apps without a provider: its metrics come with `onWindowMetricsChange`,
   * starting with the current ones.
   */
  observeWindow(): void;
  /** Re-reads the window's metrics, e.g. after navigation changed the bars. Reports only if something changed. */
  refreshWindow(): void;
  /** `GranularSafeAreaMetrics` for the app's window as JSON, whenever they change. */
  readonly onWindowMetricsChange: CodegenTypes.EventEmitter<string>;
}

export default TurboModuleRegistry.get<Spec>('GranularSafeAreas');
