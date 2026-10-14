/**
 * Loads the open-licensed models prepared at build time (scripts/fetch-models.mjs)
 * and fits them to real-world sizes. Every function degrades gracefully: if a
 * model is missing or fails to load, callers keep the procedural props.
 */
import { AssetManager, Box3, Group, Mesh, Object3D, Vector3 } from '@iwsdk/core';

export type ModelId = 'machine' | 'cup' | 'pitcher' | 'counter' | 'plant' | 'croissant';

export interface ModelManifest {
  models: Partial<Record<ModelId, { url: string }>>;
  credits: string[];
}

const EMPTY: ModelManifest = { models: {}, credits: [] };

export async function loadManifest(): Promise<ModelManifest> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}models/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return EMPTY;
    const json = (await res.json()) as ModelManifest;
    return { models: json.models ?? {}, credits: json.credits ?? [] };
  } catch {
    return EMPTY;
  }
}

export async function loadModel(manifest: ModelManifest, id: ModelId): Promise<Object3D | null> {
  const entry = manifest.models[id];
  if (!entry) return null;
  try {
    const gltf = await AssetManager.loadGLTF(`${import.meta.env.BASE_URL}${entry.url}`);
    const scene = gltf.scene;
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    return scene;
  } catch (err) {
    console.warn(`[barista] model "${id}" failed to load, keeping procedural prop`, err);
    return null;
  }
}

export interface FitOptions {
  /** Target size in metres along one axis; the model is scaled uniformly to match. */
  axis: 'x' | 'y' | 'z' | 'max';
  size: number;
  /** Extra rotation about Y (radians) applied before measuring. */
  yaw?: number;
}

export interface FittedModel {
  /** Wrapper whose origin is the model's bottom centre. */
  root: Group;
  /** Size of the fitted model in metres. */
  size: Vector3;
}

/** Wraps `model` so its origin sits at bottom-centre and it measures `size` along `axis`. */
export function fitModel(model: Object3D, opts: FitOptions): FittedModel {
  const inner = new Group();
  inner.add(model);
  if (opts.yaw) inner.rotation.y = opts.yaw;
  inner.updateMatrixWorld(true);

  const box = new Box3().setFromObject(inner);
  const size = box.getSize(new Vector3());
  const measured =
    opts.axis === 'max' ? Math.max(size.x, size.y, size.z) : size[opts.axis];
  const scale = measured > 0 ? opts.size / measured : 1;

  const centre = box.getCenter(new Vector3());
  inner.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
  inner.scale.setScalar(scale);

  const root = new Group();
  root.add(inner);
  return { root, size: size.multiplyScalar(scale) };
}

/** Lists mesh + material names (logged once so anchors/hiding can be tuned). */
export function describe(model: Object3D): string[] {
  const names: string[] = [];
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      names.push(`${mesh.name || '(mesh)'} / ${mat?.name || '(material)'}`);
    }
  });
  return names;
}

/** Meshes that look like the drink itself (coffee surface, foam, latte art). */
export function findDrinkMeshes(model: Object3D): Mesh[] {
  const pattern = /coffee|latte|liquid|foam|drink|milk|cream|art|espresso/i;
  const found: Mesh[] = [];
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (pattern.test(mesh.name) || pattern.test(mat?.name ?? '')) found.push(mesh);
  });
  return found;
}

/** Hides the procedural visuals of a prop, keeping functional helpers visible. */
export function hideProcedural(root: Object3D, keep: Object3D[]): void {
  for (const child of root.children) {
    if (keep.includes(child)) continue;
    const mesh = child as Mesh;
    const mat = mesh.isMesh ? (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) : null;
    // Invisible grab volumes have opacity 0 — leave them alone.
    if (mat && mat.transparent && mat.opacity === 0) continue;
    child.visible = false;
  }
}
