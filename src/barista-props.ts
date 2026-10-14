/**
 * Procedural barista props built from Three primitives (no external models, so
 * the deploy stays small and loads fast on Quest). Every builder returns the
 * root object plus references to the parts the BaristaSystem animates.
 *
 * Origins sit at the base of each prop so "on the counter" is simply y = counterTop.
 */
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
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
export const CUP_HEIGHT = 0.085;

export interface CupParts {
  root: Group;
  liquid: Mesh;
  liquidMaterial: MeshStandardMaterial;
  art: Group;
}

export function buildCup(): CupParts {
  const root = new Group();
  root.name = 'Latte Cup';
  const ceramic = mat(0xfafaf9, { roughness: 0.3, side: DoubleSide });
  const wall = new Mesh(new CylinderGeometry(0.045, 0.034, CUP_HEIGHT, 28, 1, true), ceramic);
  wall.position.y = CUP_HEIGHT / 2;
  const base = new Mesh(new CircleGeometry(0.034, 28), ceramic);
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.002;
  const handle = new Mesh(new TorusGeometry(0.022, 0.006, 8, 20, Math.PI * 1.2), ceramic);
  handle.position.set(0.05, CUP_HEIGHT * 0.55, 0);
  handle.rotation.z = -Math.PI * 0.6;
  // Invisible grab volume so it is easy to pick up with a pinch.
  const grabVolume = new Mesh(
    new CylinderGeometry(0.06, 0.06, CUP_HEIGHT + 0.02, 12),
    new MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  grabVolume.position.y = CUP_HEIGHT / 2;

  // Liquid: unit-height cylinder anchored at its base, scaled in y by fill level.
  const liquidGeometry = new CylinderGeometry(0.0425, 0.034, 1, 28);
  liquidGeometry.translate(0, 0.5, 0);
  const liquidMaterial = mat(ESPRESSO_COLOR.getHex(), { roughness: 0.2 });
  const liquid = new Mesh(liquidGeometry, liquidMaterial);
  liquid.position.y = 0.003;
  liquid.scale.y = 0.0001;
  liquid.visible = false;

  // Latte art: a simple heart-ish rosetta of cream circles on the surface.
  const art = new Group();
  const cream = mat(0xfff8ec, { roughness: 0.5 });
  const big = new Mesh(new CircleGeometry(0.022, 24), cream);
  big.rotation.x = -Math.PI / 2;
  big.position.z = 0.004;
  const l = new Mesh(new CircleGeometry(0.013, 20), cream);
  l.rotation.x = -Math.PI / 2;
  l.position.set(-0.01, 0.0005, -0.012);
  const r = l.clone();
  r.position.x = 0.01;
  const tip = new Mesh(new ConeGeometry(0.02, 0.03, 3), cream);
  tip.rotation.x = -Math.PI / 2;
  tip.scale.y = 0.02;
  tip.position.z = 0.025;
  art.add(big, l, r);
  art.visible = false;

  root.add(wall, base, handle, liquid, art, grabVolume);
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
