import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import {
  fixtures,
  GranularSafeAreaProvider,
  SafeAreaProvider,
} from 'react-native-granular-safe-areas';
import { DeviceFrame } from './DeviceFrame';
import { linking, RootStack } from './navigation';
import { JsSheetProvider } from './overlays';
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

  const navigation = (
    <JsSheetProvider>
      <NavigationContainer linking={linking}>
        <RootStack />
      </NavigationContainer>
    </JsSheetProvider>
  );

  // No provider is needed: views follow the app's window on their own. One only comes in to simulate a recorded
  // device, to compare with plain bands, or to draw the regions.
  const app =
    metrics || overlay || avoidance !== 'granular' ? (
      <GranularSafeAreaProvider
        // Remount when the simulated device changes, so nothing measured for the old one lingers.
        key={fixture ?? 'device'}
        mock={metrics}
        granular={avoidance === 'granular'}
        debug={overlay}
      >
        {navigation}
        <StatusBar style="dark" />
      </GranularSafeAreaProvider>
    ) : (
      <>
        {navigation}
        <StatusBar style="dark" />
      </>
    );

  return metrics ? <DeviceFrame metrics={metrics}>{app}</DeviceFrame> : app;
}
