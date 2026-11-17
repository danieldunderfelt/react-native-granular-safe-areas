import { fixtures } from '../fixtures';
import { buildRegions } from '../geometry';
import { GranularSafeAreaStore } from '../store';

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

  it('stops notifying after unsubscribing', () => {
    const { store } = makeStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.publish(buildRegions(duo), duo);
    expect(listener).not.toHaveBeenCalled();
  });
});
