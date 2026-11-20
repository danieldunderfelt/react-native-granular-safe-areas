import type { HostInstance } from 'react-native';
import { areRelated, isDrawnAbove } from '../drawOrder';

/** Nodes in a tree, with `compareDocumentPosition` like React Native's elements and the DOM. */
function tree() {
  const order = ['root', 'screen', 'content', 'accessory', 'sheet', 'footer'];
  const parent: Record<string, string> = {
    screen: 'root',
    content: 'screen',
    accessory: 'screen',
    sheet: 'root',
    footer: 'sheet',
  };
  const ancestors = (name: string) => {
    const out: string[] = [];
    for (let current = parent[name]; current; current = parent[current])
      out.push(current);
    return out;
  };
  const nodes: Record<string, HostInstance> = {};
  for (const name of order) {
    nodes[name] = {
      compareDocumentPosition(other: { name: string }) {
        if (ancestors(name).includes(other.name)) return 10; // contains me (8), precedes me (2)
        if (ancestors(other.name).includes(name)) return 20; // inside me (16), follows me (4)
        return order.indexOf(other.name) > order.indexOf(name) ? 4 : 2;
      },
      name,
    } as unknown as HostInstance;
  }
  return nodes as Record<(typeof order)[number], HostInstance>;
}

describe('draw order', () => {
  const nodes = tree();

  it('puts an accessory on top of the screen content rendered before it', () => {
    expect(isDrawnAbove(nodes.accessory!, nodes.content!)).toBe(true);
  });

  it('puts a sheet rendered later on top of the accessory, so its footer ignores it', () => {
    expect(isDrawnAbove(nodes.accessory!, nodes.footer!)).toBe(false);
    expect(isDrawnAbove(nodes.footer!, nodes.accessory!)).toBe(true);
  });

  it('never puts a view on top of its own ancestors or descendants', () => {
    expect(isDrawnAbove(nodes.content!, nodes.screen!)).toBe(false);
    expect(isDrawnAbove(nodes.screen!, nodes.content!)).toBe(false);
    expect(areRelated(nodes.screen!, nodes.content!)).toBe(true);
    expect(areRelated(nodes.accessory!, nodes.footer!)).toBe(false);
  });

  it('assumes a view is on top when there is no way to tell', () => {
    const plain = {} as HostInstance;
    expect(isDrawnAbove(plain, nodes.content!)).toBe(true);
    expect(areRelated(plain, nodes.content!)).toBe(false);
  });
});
