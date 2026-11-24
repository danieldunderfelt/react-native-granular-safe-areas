import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { OverlayContent } from './overlays';
import { HeaderItemsScreen } from './screens/HeaderItemsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MarkersScreen } from './screens/MarkersScreen';
import { MovingScreen } from './screens/MovingScreen';
import { ProbeScreen } from './screens/ProbeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
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
      Settings: 'settings',
      Moving: 'moving',
      Tabs: 'tabs',
      HeaderItems: 'header-items',
      Probe: 'probe',
      Sheet: 'sheet',
      Modal: 'modal',
    },
  },
};

export type RootStackParamList = {
  Home: undefined;
  Trip: undefined;
  TripDetails: { code: string };
  Markers: undefined;
  Settings: undefined;
  Moving: undefined;
  Tabs: undefined;
  HeaderItems: undefined;
  Probe: undefined;
  Sheet: undefined;
  Modal: undefined;
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

/**
 * A native sheet. It's presented outside the app's root view, on top of the screen it came from, and needs no provider
 * of its own: its content ignores that screen's tab bar and accessories, and keeps clear of the home indicator.
 */
function SheetScreen() {
  const navigation = useNavigation();
  return <OverlayContent title="Form sheet" onClose={navigation.goBack} />;
}

/** A full-screen modal: on the iPhone Duo it reaches the status cluster, which it keeps clear of. */
function ModalScreen() {
  const navigation = useNavigation();
  return (
    <OverlayContent title="Full-screen modal" onClose={navigation.goBack} />
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
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings list' }}
      />
      <Stack.Screen
        name="Moving"
        component={MovingScreen}
        options={{ title: 'Moving elements' }}
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
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.6, 1],
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="Modal"
        component={ModalScreen}
        options={{ presentation: 'fullScreenModal', headerShown: false }}
      />
    </Stack.Navigator>
  );
}
