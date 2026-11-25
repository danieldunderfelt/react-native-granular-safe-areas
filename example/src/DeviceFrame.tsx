import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  type GranularSafeAreaMetrics,
} from 'react-native-granular-safe-areas';
import { getSystemControls } from 'react-native-granular-safe-areas/testing';

/**
 * Web preview of a recorded device: a frame of the device's size that feeds the recorded insets to
 * react-native-safe-area-context (so React Navigation follows them) and draws stand-ins for the OS UI on top.
 */
export function DeviceFrame({
  metrics,
  children,
}: {
  metrics: GranularSafeAreaMetrics;
  children: ReactNode;
}) {
  const frame = { x: 0, y: 0, width: metrics.width, height: metrics.height };
  return (
    <View style={styles.backdrop}>
      <View
        style={[
          styles.device,
          { width: metrics.width, height: metrics.height },
        ]}
      >
        <SafeAreaFrameContext.Provider value={frame}>
          <SafeAreaInsetsContext.Provider value={metrics.insets}>
            {children}
          </SafeAreaInsetsContext.Provider>
        </SafeAreaFrameContext.Provider>
        <FakeSystemUI metrics={metrics} />
      </View>
    </View>
  );
}

function FakeSystemUI({ metrics }: { metrics: GranularSafeAreaMetrics }) {
  const { occlusions, systemBars, divisions, width, height } = metrics;
  const controls = getSystemControls(metrics);
  const bar = controls ? { column: controls.strip, top: controls.start } : null;
  // The occlusion that covers the whole status cluster isn't a camera; draw only the cameras inside it.
  const cameras = occlusions.filter(
    (o) => o.active && !(bar && o.width >= bar.column.width - 1)
  );
  // A vertical status bar reports a placeholder frame, so lay the time and signal out between the camera and the
  // bar items instead.
  const cameraBottom = Math.max(0, ...cameras.map((o) => o.y + o.height));
  const statusBar =
    metrics.statusBar &&
    metrics.statusBar.width >= 10 &&
    metrics.statusBar.height >= 10
      ? metrics.statusBar
      : bar
        ? {
            x: bar.column.x,
            y: cameraBottom,
            width: bar.column.width,
            height: bar.top - cameraBottom,
          }
        : null;
  const vertical = statusBar && statusBar.height > statusBar.width;
  return (
    <View style={styles.systemUI}>
      {cameras.map((o, i) => (
        <View
          key={`camera-${i}`}
          style={[
            styles.camera,
            {
              left: o.x + 4,
              top: o.y + 4,
              width: o.width - 8,
              height: o.height - 8,
            },
          ]}
        />
      ))}
      {statusBar ? (
        <View
          style={[
            styles.statusBar,
            !vertical && styles.statusBarRow,
            {
              left: statusBar.x,
              top: statusBar.y,
              width: statusBar.width,
              height: statusBar.height,
            },
          ]}
        >
          <Text style={styles.statusText}>9:41</Text>
          <Text style={styles.statusText}>5G</Text>
          <Text style={styles.statusText}>▮▮▮</Text>
        </View>
      ) : null}
      {systemBars.map((item, i) => (
        <View
          key={`bar-${i}`}
          style={[
            styles.systemBar,
            {
              left: item.x,
              top: item.y,
              width: item.width,
              height: item.height,
            },
          ]}
        >
          {/* A tall item is a tab bar platter; a square one a single button; a wide one a horizontal bar. */}
          {item.height > 100
            ? ['✈︎', '☰', '◎'].map((glyph) => (
                <Text key={glyph} style={styles.tabGlyph}>
                  {glyph}
                </Text>
              ))
            : item.width < 100
              ? [
                  <Text key="back" style={styles.tabGlyph}>
                    ‹
                  </Text>,
                ]
              : null}
        </View>
      ))}
      {divisions
        .filter((d) => d.active)
        .map((d, i) => (
          <View
            key={`fold-${i}`}
            style={[
              styles.fold,
              {
                left: d.x,
                top: d.y,
                width: Math.max(d.width, 1),
                height: d.height,
              },
            ]}
          />
        ))}
      <View
        style={[
          styles.homeIndicator,
          { left: width / 2 - 70, top: height - 13 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1c1e',
    padding: 24,
  },
  device: {
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 6,
    borderColor: '#3a3a3c',
    boxSizing: 'content-box',
  },
  systemUI: { ...StyleSheet.absoluteFill, pointerEvents: 'none' },
  camera: { position: 'absolute', backgroundColor: '#000', borderRadius: 999 },
  statusBar: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statusBarRow: { flexDirection: 'row' },
  statusText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  systemBar: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(60, 60, 67, 0.85)',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  tabGlyph: { color: '#fff', fontSize: 20 },
  fold: { position: 'absolute', backgroundColor: 'rgba(255, 255, 255, 0.25)' },
  homeIndicator: {
    position: 'absolute',
    width: 140,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
});
