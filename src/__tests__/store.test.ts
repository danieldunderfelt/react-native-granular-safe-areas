import { fixtures } from '../fixtures';
import { buildRegions } from '../geometry';
import { GranularSafeAreaStore, type BackButtonRegistration } from '../store';

const duo = fixtures.iPhoneDuoOuterPortraitWithTabBar;

function makeStore() {
  const measure = jest.fn(() => ({ x: 0, y: 0, width: 466, height: 678 }));
  const refresh = jest.fn();
  const store = new GranularSafeAreaStore(measure, refresh);
  const listener = jest.fn();
  store.subscribe(listener);
  return { store, measure, refresh, listener };
}

describe('GranularSafeAreaStore', () => {
  describe('accessories', () => {
    const boardingPass = {
      kind: 'accessory' as const,
      edge: 'bottom' as const,
      frame: { x: 12, y: 560, width: 442, height: 70 },
      owner: -42,
    };

    it('adds an accessory to the regions and to the bands, where views avoiding whole bands find it', () => {
      const { store, listener } = makeStore();
      store.publish(
        buildRegions(duo),
        duo,
        buildRegions(duo, { granular: false })
      );
      listener.mockClear();
      store.setAccessory(boardingPass.owner, boardingPass);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot().regions).toContainEqual(boardingPass);
      expect(store.getSnapshot().bands).toContainEqual(boardingPass);
    });

    it('ignores an accessory reported again where it already is, and removes it', () => {
      const { store, listener } = makeStore();
      store.publish(buildRegions(duo), duo);
      store.setAccessory(boardingPass.owner, boardingPass);
      listener.mockClear();
      store.setAccessory(boardingPass.owner, { ...boardingPass });
      expect(listener).not.toHaveBeenCalled();
      store.setAccessory(boardingPass.owner, null);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot().regions).not.toContainEqual(boardingPass);
    });
  });

  it('notifies when the regions change, and not when equal regions are published again', () => {
    const { store, listener } = makeStore();
    store.publish(buildRegions(duo), duo);
    expect(listener).toHaveBeenCalledTimes(1);
    // A fresh native event with the same values, e.g. after a refresh that found nothing new.
    const again = JSON.parse(JSON.stringify(duo));
    store.publish(buildRegions(again), again);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies when the system UI changes, such as the Dynamic Island growing', () => {
    const { store, listener } = makeStore();
    store.publish(buildRegions(duo), duo);
    const liveActivity = {
      ...duo,
      occlusions: [{ x: 396, y: 20, width: 46, height: 260, active: true }],
    };
    store.publish(buildRegions(liveActivity), liveActivity);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().regions[0]?.frame.height).toBe(280);
  });

  it('measures the provider once per change, however many elements ask', () => {
    const { store, measure } = makeStore();
    store.publish(buildRegions(duo), duo);
    store.getProviderRect();
    store.getProviderRect();
    expect(measure).toHaveBeenCalledTimes(1);
    store.invalidateLayout();
    store.getProviderRect();
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('notifies on a layout change even when the regions are the same', () => {
    const { store, listener } = makeStore();
    store.publish(buildRegions(duo), duo);
    store.invalidateLayout();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('coalesces refresh requests in the same tick', () => {
    jest.useFakeTimers();
    const { store, refresh } = makeStore();
    store.requestRefresh();
    store.requestRefresh();
    store.requestRefresh();
    jest.runAllTimers();
    expect(refresh).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  describe('vertical bar back button', () => {
    const plainDuo = fixtures.iPhoneDuoOuterPortrait;
    const register = (
      store: GranularSafeAreaStore,
      overrides: Partial<BackButtonRegistration> = {}
    ) => {
      const id = store.createBackButtonId();
      const onPress = jest.fn();
      store.registerBackButton(id, {
        onPress,
        icon: 'back',
        accessibilityLabel: 'Back',
        enabled: true,
        inWindow: true,
        ...overrides,
      });
      return { id, onPress };
    };

    it('shows the button below the status cluster, and adds it as a region', () => {
      const { store } = makeStore();
      store.publish(buildRegions(plainDuo), plainDuo);
      const { id } = register(store);
      const { backButton, regions } = store.getSnapshot();
      expect(backButton).toMatchObject({
        owner: id,
        frame: { x: 394, y: 174, width: 48, height: 48 },
      });
      expect(regions).toContainEqual({
        kind: 'controls',
        edge: 'right',
        frame: { x: 382, y: 174, width: 84, height: 48 },
        // Drawn by the button, so a sheet over it ignores it.
        owner: store.backButtonOwnerId,
      });
    });

    it('shows nothing without a vertical bar', () => {
      const { store } = makeStore();
      const phone = fixtures.iPhone18ProPortrait;
      store.publish(buildRegions(phone), phone);
      register(store);
      expect(store.getSnapshot().backButton).toBeNull();
    });

    it('goes to the most recent screen that is showing, and presses its handler', () => {
      const { store } = makeStore();
      store.publish(buildRegions(plainDuo), plainDuo);
      const first = register(store);
      const second = register(store);
      expect(store.getSnapshot().backButton?.owner).toBe(second.id);

      // The second screen's tab is no longer selected.
      store.updateBackButton(second.id, { inWindow: false });
      expect(store.getSnapshot().backButton?.owner).toBe(first.id);
      store.pressBackButton();
      expect(first.onPress).toHaveBeenCalledTimes(1);
      expect(second.onPress).not.toHaveBeenCalled();

      store.unregisterBackButton(first.id);
      expect(store.getSnapshot().backButton).toBeNull();
    });

    it('skips disabled buttons', () => {
      const { store } = makeStore();
      store.publish(buildRegions(plainDuo), plainDuo);
      register(store, { enabled: false });
      expect(store.getSnapshot().backButton).toBeNull();
    });

    it('follows the status cluster as it grows', () => {
      const { store } = makeStore();
      store.publish(buildRegions(plainDuo), plainDuo);
      register(store);
      const liveActivity = {
        ...plainDuo,
        occlusions: [{ x: 382, y: 0, width: 84, height: 290, active: true }],
      };
      store.publish(buildRegions(liveActivity), liveActivity);
      expect(store.getSnapshot().backButton?.frame.y).toBe(290);
    });
  });

  it('stops notifying after unsubscribing', () => {
    const { store } = makeStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.publish(buildRegions(duo), duo);
    expect(listener).not.toHaveBeenCalled();
  });
});
