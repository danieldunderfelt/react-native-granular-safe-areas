import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import {
  fixtures,
  GranularSafeAreaDebugOverlay,
  GranularSafeAreaProvider,
  SafeAreaProvider,
} from 'react-native-granular-safe-areas';
import { DeviceFrame } from './DeviceFrame';
import { linking, RootStack } from './navigation';
import {
  initialSettingsFromURL,
  SettingsProvider,
  useSettings,
  withLiveActivity,
} from './settings';

export default function App() {
  return (
    <SettingsProvider
      initial={
        Platform.OS === 'web'
          ? // On the web, start in the iPhone Duo simulation: browsers have no granular metrics of their own.
            initialSettingsFromURL({
              fixture: 'iPhoneDuoOuterPortraitWithTabBar',
            })
          : {}
      }
    >
      <SafeAreaProvider>
        <Root />
      </SafeAreaProvider>
    </SettingsProvider>
  );
}

function Root() {
  const { avoidance, overlay, fixture, liveActivity } = useSettings();
  const recorded = fixture ? fixtures[fixture] : null;
  const metrics =
    recorded && liveActivity ? withLiveActivity(recorded) : recorded;

  const app = (
    <GranularSafeAreaProvider
      // Remount when the simulated device changes, so nothing measured for the old one lingers.
      key={fixture ?? 'device'}
      mock={metrics}
      refine={avoidance === 'granular'}
    >
      <NavigationContainer linking={linking}>
        <RootStack />
      </NavigationContainer>
      {overlay ? <GranularSafeAreaDebugOverlay /> : null}
      <StatusBar style="auto" />
    </GranularSafeAreaProvider>
  );

  return metrics ? <DeviceFrame metrics={metrics}>{app}</DeviceFrame> : app;
}
