import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fixtures,
  type FixtureName,
  type GranularSafeAreaMetrics,
  type SafeAreaRegionKind,
} from 'react-native-granular-safe-areas';

/**
 * - `granular`: the library as intended.
 * - `bands`: `refine={false}`, the same as a regular safe area, for comparison.
 * - `off`: no avoidance at all, the state the screenshot in the README shows.
 */
export type Avoidance = 'granular' | 'bands' | 'off';

type Settings = {
  avoidance: Avoidance;
  setAvoidance: (value: Avoidance) => void;
  overlay: boolean;
  setOverlay: (value: boolean) => void;
  /** Web only: a recorded device to simulate. */
  fixture: FixtureName | null;
  setFixture: (value: FixtureName | null) => void;
  /** Web only: grow the simulated camera area, as a Live Activity does, to watch everything follow it. */
  liveActivity: boolean;
  setLiveActivity: (value: boolean) => void;
};

const SettingsContext = createContext<Settings | null>(null);

type InitialSettings = Partial<
  Pick<Settings, 'avoidance' | 'overlay' | 'fixture' | 'liveActivity'>
>;

/**
 * Web: `?device=<fixture>|none&avoidance=granular|bands|off&overlay=0|1&liveActivity=0|1` override the defaults.
 */
export function initialSettingsFromURL(
  defaults: InitialSettings
): InitialSettings {
  const { location } = globalThis as { location?: { search: string } };
  const params = new URLSearchParams(location?.search ?? '');
  const device = params.get('device');
  const avoidance = params.get('avoidance');
  const overlay = params.get('overlay');
  const liveActivity = params.get('liveActivity');
  return {
    ...defaults,
    ...(device === 'none' ? { fixture: null } : null),
    ...(device && device in fixtures
      ? { fixture: device as FixtureName }
      : null),
    ...(avoidance === 'granular' || avoidance === 'bands' || avoidance === 'off'
      ? { avoidance }
      : null),
    ...(overlay ? { overlay: overlay === '1' } : null),
    ...(liveActivity ? { liveActivity: liveActivity === '1' } : null),
  };
}

export function SettingsProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial: InitialSettings;
}) {
  const [avoidance, setAvoidance] = useState<Avoidance>(
    initial.avoidance ?? 'granular'
  );
  const [overlay, setOverlay] = useState(initial.overlay ?? false);
  const [fixture, setFixture] = useState(initial.fixture ?? null);
  const [liveActivity, setLiveActivity] = useState(
    initial.liveActivity ?? false
  );
  const value = useMemo(
    () => ({
      avoidance,
      setAvoidance,
      overlay,
      setOverlay,
      fixture,
      setFixture,
      liveActivity,
      setLiveActivity,
    }),
    [avoidance, overlay, fixture, liveActivity]
  );
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Settings {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error('useSettings needs a SettingsProvider');
  return settings;
}

/** What every demo element avoids: the default, or nothing at all when avoidance is switched off. */
export function useAvoid(): readonly SafeAreaRegionKind[] | undefined {
  return useSettings().avoidance === 'off' ? NOTHING : undefined;
}
const NOTHING: readonly SafeAreaRegionKind[] = [];

/** The camera area growing by 120 pt, with the status bar moving down below it, as for a Live Activity. */
export function withLiveActivity(
  metrics: GranularSafeAreaMetrics
): GranularSafeAreaMetrics {
  const grow = 120;
  return {
    ...metrics,
    occlusions: metrics.occlusions.map((o) =>
      o.active ? { ...o, height: o.height + grow } : o
    ),
    statusBar: metrics.statusBar
      ? { ...metrics.statusBar, y: metrics.statusBar.y + grow }
      : null,
    barRegionInsets: metrics.barRegionInsets
      ? { ...metrics.barRegionInsets, top: metrics.barRegionInsets.top + grow }
      : null,
  };
}
