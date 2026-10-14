/**
 * Procedural barista props built from Three primitives (no external models, so
 * the deploy stays small and loads fast on Quest). Every builder returns the
 * root object plus references to the parts the BaristaSystem animates.
 *
 * Origins sit at the base of each prop so "on the counter" is simply y = counterTop.
 */
import {
  BackSide,
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from '@iwsdk/core';

export const ESPRESSO_COLOR = new Color(0x3b2314);
export const LATTE_COLOR = new Color(0xc69c6d);

const mat = (color: number, extra: Partial<MeshStandardMaterial> = {}) =>
  Object.assign(new MeshStandardMaterial({ color, roughness: 0.6 }), extra);

// ---------------------------------------------------------------- counter
export function buildCounter(): Group {
  const g = new Group();
  g.name = 'Counter';
  const top = new Mesh(new BoxGeometry(1.15, 0.05, 0.46), mat(0x6b4a33, { roughness: 0.45 }));
  top.position.y = -0.025;
  const skirt = new Mesh(new BoxGeometry(1.15, 0.22, 0.03), mat(0x2a2a2e));
  skirt.position.set(0, -0.16, 0.215);
  const edge = new Mesh(new BoxGeometry(1.16, 0.012, 0.47), mat(0xd4a373, { metalness: 0.4 }));
  edge.position.y = 0.001;
  g.add(top, skirt, edge);
  return g;
}

// ---------------------------------------------------------------- machine
export interface MachineParts {
  root: Group;
  brewButton: Mesh;
  /** Local position of the drip tray centre (where the cup goes). */
  trayLocal: [number, number, number];
  /** Local position of the steam wand tip. */
  wandTipLocal: [number, number, number];
  /** Local position of the group head outlet (espresso comes out here). */
  groupHeadLocal: [number, number, number];
}

export function buildMachine(): MachineParts {
  const root = new Group();
  root.name = 'Espresso Machine';
  const steel = mat(0xc9ccd1, { metalness: 0.85, roughness: 0.25 });
  const dark = mat(0x1f2933, { roughness: 0.5 });

  const body = new Mesh(new BoxGeometry(0.3, 0.34, 0.22), steel);
  body.position.set(0, 0.17, -0.04);
  const topPlate = new Mesh(new BoxGeometry(0.31, 0.02, 0.23), dark);
  topPlate.position.set(0, 0.35, -0.04);
  // Front overhang that holds the group head.
  const brow = new Mesh(new BoxGeometry(0.3, 0.07, 0.06), steel);
  brow.position.set(0, 0.29, 0.1);
  const groupHead = new Mesh(new CylinderGeometry(0.035, 0.03, 0.04, 20), dark);
  groupHead.position.set(-0.04, 0.235, 0.1);
  const portafilterHandle = new Mesh(new CylinderGeometry(0.01, 0.012, 0.12, 12), dark);
  portafilterHandle.rotation.z = Math.PI / 2;
  portafilterHandle.position.set(0.04, 0.225, 0.1);
  // Drip tray
  const tray = new Mesh(new BoxGeometry(0.2, 0.015, 0.11), dark);
  tray.position.set(-0.04, 0.0075, 0.1);
  const grate = new Mesh(new BoxGeometry(0.18, 0.003, 0.095), steel);
  grate.position.set(-0.04, 0.016, 0.1);

  // Steam wand on the right side, angled down and forward.
  const wand = new Mesh(new CylinderGeometry(0.006, 0.006, 0.16, 10), steel);
  wand.position.set(0.12, 0.2, 0.08);
  wand.rotation.x = 0.35;
  const wandKnob = new Mesh(new CylinderGeometry(0.015, 0.015, 0.03, 14), dark);
  wandKnob.position.set(0.12, 0.29, 0.06);

  // Big friendly brew button on the brow.
  const brewButton = new Mesh(
    new CylinderGeometry(0.022, 0.022, 0.018, 24),
    mat(0xdc2626, { emissive: new Color(0x7f1d1d), emissiveIntensity: 0.6 }),
  );
  brewButton.rotation.x = Math.PI / 2;
  brewButton.position.set(0.075, 0.3, 0.135);
  brewButton.name = 'Brew Button';

  // A few cups stacked on top for flavour.
  for (let i = 0; i < 3; i++) {
    const deco = new Mesh(new CylinderGeometry(0.03, 0.025, 0.05, 16), mat(0xf5f5f4));
    deco.position.set(-0.09 + i * 0.07, 0.385, -0.06);
    root.add(deco);
  }

  root.add(body, topPlate, brow, groupHead, portafilterHandle, tray, grate, wand, wandKnob);
  return {
    root,
    brewButton,
    trayLocal: [-0.04, 0.017, 0.1],
    wandTipLocal: [0.12, 0.125, 0.105],
    groupHeadLocal: [-0.04, 0.215, 0.1],
  };
}

// ---------------------------------------------------------------- cup
/** Tulip cappuccino cup on a saucer: sage glaze outside, cream inside, gold rims. */
const CUP_LIFT = 0.002; // cup foot sits in the saucer well
export const CUP_HEIGHT = 0.072;
export const CUP_RIM = CUP_LIFT + CUP_HEIGHT;
export const CUP_LIQUID_BASE = CUP_LIFT + 0.009;
export const CUP_LIQUID_DEPTH = CUP_RIM - 0.006 - CUP_LIQUID_BASE;

const CUP_OUTER: [number, number][] = [
  [0.021, 0], [0.025, 0.002], [0.028, 0.006], [0.034, 0.014], [0.041, 0.026],
  [0.046, 0.042], [0.048, 0.058], [0.049, 0.068], [0.0495, CUP_HEIGHT],
];
const CUP_INNER: [number, number][] = [
  [0, 0.008], [0.02, 0.009], [0.031, 0.016], [0.038, 0.027],
  [0.043, 0.042], [0.0452, 0.058], [0.0465, CUP_HEIGHT],
];

/** Inner wall radius at a height measured from the cup root (for the liquid surface). */
export function cupInnerRadiusAt(rootY: number): number {
  const y = rootY - CUP_LIFT;
  for (let i = 1; i < CUP_INNER.length; i++) {
    const [r0, y0] = CUP_INNER[i - 1];
    const [r1, y1] = CUP_INNER[i];
    if (y <= y1) {
      const t = Math.max(0, (y - y0) / (y1 - y0));
      return r0 + (r1 - r0) * t;
    }
  }
  return CUP_INNER[CUP_INNER.length - 1][0];
}

export interface CupParts {
  root: Group;
  liquid: Mesh;
  liquidMaterial: MeshStandardMaterial;
  art: Group;
}

export function buildCup(): CupParts {
  const root = new Group();
  root.name = 'Latte Cup';
  const glaze = new MeshPhysicalMaterial({
    color: 0x86a596, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12,
  });
  const creamGlaze = new MeshPhysicalMaterial({
    color: 0xf7f0e4, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, side: BackSide,
  });
  const creamUp = new MeshPhysicalMaterial({ color: 0xf7f0e4, roughness: 0.2, clearcoat: 1 });
  const gold = new MeshStandardMaterial({ color: 0xd2a94e, metalness: 1, roughness: 0.25 });

  const body = new Group();
  body.position.y = CUP_LIFT;
  const outer = new Mesh(new LatheGeometry(CUP_OUTER.map(([r, y]) => new Vector2(r, y)), 48), glaze);
  const inner = new Mesh(new LatheGeometry(CUP_INNER.map(([r, y]) => new Vector2(r, y)), 48), creamGlaze);
  const foot = new Mesh(new CircleGeometry(0.021, 32), glaze);
  foot.rotation.x = Math.PI / 2;
  const rim = new Mesh(new TorusGeometry(0.048, 0.0017, 8, 64), gold);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = CUP_HEIGHT;
  const handle = new Mesh(new TorusGeometry(0.016, 0.0045, 10, 24, Math.PI * 1.25), glaze);
  handle.position.set(0.05, 0.041, 0);
  handle.rotation.z = -Math.PI * 0.62;
  body.add(outer, inner, foot, rim, handle);

  // Saucer with a cream well and a gold edge.
  const saucer = new Mesh(
    new LatheGeometry(
      [[0.0, 0.0], [0.047, 0.0], [0.06, 0.004], [0.068, 0.008], [0.071, 0.011]].map(([r, y]) => new Vector2(r, y)),
      56,
    ),
    new MeshPhysicalMaterial({ color: 0x86a596, roughness: 0.32, clearcoat: 1, side: DoubleSide }),
  );
  const well = new Mesh(new CircleGeometry(0.034, 40), creamUp);
  well.rotation.x = -Math.PI / 2;
  well.position.y = 0.0012;
  const saucerRim = new Mesh(new TorusGeometry(0.071, 0.0012, 6, 64), gold);
  saucerRim.rotation.x = Math.PI / 2;
  saucerRim.position.y = 0.011;

  // Invisible grab volume so it is easy to pick up with a pinch.
  const grabVolume = new Mesh(
    new CylinderGeometry(0.065, 0.065, CUP_RIM + 0.02, 12),
    new MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  grabVolume.position.y = CUP_RIM / 2;

  // Liquid: unit cylinder anchored at its base; height = fill, width follows the bowl.
  const liquidGeometry = new CylinderGeometry(1, 1, 1, 40);
  liquidGeometry.translate(0, 0.5, 0);
  const liquidMaterial = mat(ESPRESSO_COLOR.getHex(), { roughness: 0.15 });
  const liquid = new Mesh(liquidGeometry, liquidMaterial);
  liquid.position.y = CUP_LIQUID_BASE;
  liquid.scale.set(0.03, 0.0001, 0.03);
  liquid.visible = false;

  // Latte art: a rosetta-style heart of cream on the surface (sized for r = 0.04).
  const art = new Group();
  const cream = mat(0xfff8ec, { roughness: 0.5 });
  const big = new Mesh(new CircleGeometry(0.022, 32), cream);
  big.rotation.x = -Math.PI / 2;
  big.position.z = 0.004;
  const l = new Mesh(new CircleGeometry(0.013, 24), cream);
  l.rotation.x = -Math.PI / 2;
  l.position.set(-0.01, 0.0005, -0.012);
  const r = l.clone();
  r.position.x = 0.01;
  art.add(big, l, r);
  art.visible = false;

  root.add(body, saucer, well, saucerRim, liquid, art, grabVolume);
  return { root, liquid, liquidMaterial, art };
}

// ---------------------------------------------------------------- pitcher
export interface PitcherParts {
  root: Group;
  milk: Mesh;
  spout: Object3D;
}

export function buildPitcher(): PitcherParts {
  const root = new Group();
  root.name = 'Milk Pitcher';
  const steel = mat(0xd9dde2, { metalness: 0.9, roughness: 0.2, side: DoubleSide });
  const h = 0.12;
  const wall = new Mesh(new CylinderGeometry(0.036, 0.046, h, 26, 1, true), steel);
  wall.position.y = h / 2;
  const base = new Mesh(new CircleGeometry(0.046, 26), steel);
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.002;
  const handle = new Mesh(new TorusGeometry(0.03, 0.007, 8, 20, Math.PI), steel);
  handle.position.set(-0.048, h * 0.55, 0);
  handle.rotation.z = Math.PI / 2;
  const lip = new Mesh(new ConeGeometry(0.014, 0.03, 12, 1, true), steel);
  lip.rotation.z = -Math.PI / 2;
  lip.position.set(0.042, h - 0.004, 0);

  const milkGeometry = new CylinderGeometry(0.034, 0.044, 1, 24);
  milkGeometry.translate(0, 0.5, 0);
  const milk = new Mesh(milkGeometry, mat(0xfdfbf5, { roughness: 0.8 }));
  milk.position.y = 0.003;
  milk.scale.y = 0.07;

  const spout = new Object3D();
  spout.position.set(0.055, h, 0);

  const grabVolume = new Mesh(
    new CylinderGeometry(0.065, 0.065, h + 0.02, 12),
    new MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  grabVolume.position.y = h / 2;

  root.add(wall, base, handle, lip, milk, spout, grabVolume);
  return { root, milk, spout };
}

// ---------------------------------------------------------------- coaster
export function buildCoaster(): Group {
  const g = new Group();
  g.name = 'Serve Coaster';
  const disc = new Mesh(
    new CylinderGeometry(0.06, 0.06, 0.006, 32),
    mat(0x16a34a, { emissive: new Color(0x14532d), emissiveIntensity: 0.5 }),
  );
  disc.position.y = 0.003;
  const ring = new Mesh(new TorusGeometry(0.066, 0.004, 8, 40), mat(0x86efac, { emissive: new Color(0x22c55e), emissiveIntensity: 0.6 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  g.add(disc, ring);
  return g;
}

// ---------------------------------------------------------------- streams + steam
export function buildStream(color: number, radius: number): Mesh {
  const geometry = new CylinderGeometry(radius, radius * 0.8, 1, 10);
  geometry.translate(0, -0.5, 0); // origin at the top, extends downward
  const stream = new Mesh(geometry, mat(color, { roughness: 0.2 }));
  stream.visible = false;
  return stream;
}

export function buildSteamPuffs(count: number): Mesh[] {
  const geometry = new SphereGeometry(0.012, 8, 6);
  const material = new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  const puffs: Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const puff = new Mesh(geometry, material);
    puff.visible = false;
    puffs.push(puff);
  }
  return puffs;
}

// ---------------------------------------------------------------- guide marker
export function buildMarker(): Mesh {
  const ring = new Mesh(
    new TorusGeometry(0.05, 0.004, 8, 40),
    new MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: new Color(0xf59e0b),
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  return ring;
}
