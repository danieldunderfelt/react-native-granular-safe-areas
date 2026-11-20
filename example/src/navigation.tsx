import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform } from 'react-native';
import { GranularSafeAreaProvider } from 'react-native-granular-safe-areas';
import { HeaderItemsScreen } from './screens/HeaderItemsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MarkersScreen } from './screens/MarkersScreen';
import { ProbeScreen } from './screens/ProbeScreen';
import { TripDetailsScreen } from './screens/TripDetailsScreen';
import { TripScreen } from './screens/TripScreen';

export const linking = {
  prefixes: [],
  config: {
    screens: {
      Home: '',
      Trip: 'trip',
      TripDetails: 'trip/:code',
      Markers: 'markers',
      Tabs: 'tabs',
      HeaderItems: 'header-items',
      Probe: 'probe',
      Sheet: 'sheet',
    },
  },
};

export type RootStackParamList = {
  Home: undefined;
  Trip: undefined;
  TripDetails: { code: string };
  Markers: undefined;
  Tabs: undefined;
  HeaderItems: undefined;
  Probe: undefined;
  Sheet: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
// Native tabs only exist on iOS and Android; the web build never reaches the Tabs route.
const Tabs = Platform.OS === 'web' ? null : createNativeBottomTabNavigator();

function TabsScreen() {
  if (!Tabs) return null;
  return (
    <Tabs.Navigator>
      <Tabs.Screen
        name="TripsTab"
        component={TripScreen}
        options={{
          title: 'Trips',
          tabBarIcon: { type: 'sfSymbol', name: 'airplane' },
        }}
      />
      <Tabs.Screen
        name="BookTab"
        component={ProbeScreen}
        options={{
          title: 'Probe',
          tabBarIcon: { type: 'sfSymbol', name: 'scope' },
        }}
      />
      <Tabs.Screen
        name="ProfileTab"
        component={ProbeScreen}
        options={{
          title: 'Profile',
          tabBarIcon: { type: 'sfSymbol', name: 'person' },
        }}
      />
    </Tabs.Navigator>
  );
}

/** A sheet is presented in its own view controller, so it gets its own provider. */
function SheetScreen() {
  return (
    <GranularSafeAreaProvider>
      <ProbeScreen />
    </GranularSafeAreaProvider>
  );
}

export function RootStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Granular safe areas' }}
      />
      <Stack.Screen
        name="Trip"
        component={TripScreen}
        options={{ headerShown: false, statusBarStyle: 'light' }}
      />
      <Stack.Screen
        name="TripDetails"
        component={TripDetailsScreen}
        options={{ headerShown: false, statusBarStyle: 'light' }}
      />
      <Stack.Screen
        name="Markers"
        component={MarkersScreen}
        options={{ title: 'Edge markers' }}
      />
      <Stack.Screen
        name="Tabs"
        component={TabsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="HeaderItems"
        component={HeaderItemsScreen}
        options={{ title: 'Header items' }}
      />
      <Stack.Screen name="Probe" component={ProbeScreen} />
      <Stack.Screen
        name="Sheet"
        component={SheetScreen}
        options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1] }}
      />
    </Stack.Navigator>
  );
}
