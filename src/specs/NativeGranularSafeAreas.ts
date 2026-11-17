import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  getConstants(): {
    /** `GranularSafeAreaMetrics` for the key window as JSON, or an empty string when there is no window yet. */
    initialWindowMetrics: string;
  };
  /** Everything the native side can see, as JSON, for bug reports and for working out new devices. */
  getDiagnostics(): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('GranularSafeAreas');
