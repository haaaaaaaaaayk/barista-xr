/**
 * Downloads the open-licensed 3D models used by Barista XR at build time and
 * optimizes them for Quest (textures resized to 1024px WebP, one .glb each).
 *
 *   - Poly Haven (CC0): no account needed.
 *   - Sketchfab (CC BY 4.0): needs SKETCHFAB_API_TOKEN (free account →
 *     https://sketchfab.com/settings/password → "API Token"). Without it those
 *     models are skipped and the app uses its built-in procedural props.
 *
 * Writes public/models/manifest.json listing what is available plus the
 * attribution each license requires. Never fails the build.
 */
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, weld } from '@gltf-transform/functions';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'models');
const TMP = join(ROOT, 'node_modules', '.cache', 'barista-models');
const UA = 'barista-xr-hackathon/1.0 (build script)';
const TOKEN = process.env.SKETCHFAB_API_TOKEN?.trim();

/** id → source. `role` is what the app uses it for. */
const MODELS = [
  {
    id: 'machine',
    source: 'sketchfab',
    uid: 'bab05bc7805d4b0dbc2cdcbb48441956',
    title: 'Commercial Coffee Machine',
    author: 'M.Reslan',
    license: 'CC BY 4.0',
    link: 'https://sketchfab.com/3d-models/commercial-coffee-machine-bab05bc7805d4b0dbc2cdcbb48441956',
  },
  {
    id: 'cup',
    source: 'sketchfab',
    uid: 'c5090fbf444c4cd0b9d9dd441f75be3e',
    title: 'Upscale coffee',
    author: 'kirigirinon',
    license: 'CC BY 4.0',
    link: 'https://sketchfab.com/3d-models/upscale-coffee-c5090fbf444c4cd0b9d9dd441f75be3e',
  },
  {
    id: 'pitcher',
    source: 'sketchfab',
    uid: 'ced53d1872b04e2b979c302eeef0fa09',
    title: 'Barista Equipment - Milk Pitcher',
    author: 'xpehik',
    license: 'CC BY 4.0',
    link: 'https://sketchfab.com/3d-models/barista-equipment-milk-pitcher-ced53d1872b04e2b979c302eeef0fa09',
  },
  { id: 'counter', source: 'polyhaven', asset: 'WoodenTable_03', title: 'Wooden Table 03', author: 'Gabriel Radić' },
  { id: 'plant', source: 'polyhaven', asset: 'potted_plant_04', title: 'Potted Plant 04', author: 'Poly Haven' },
  { id: 'croissant', source: 'polyhaven', asset: 'croissant', title: 'Croissant', author: 'Poly Haven' },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** Returns a path to a .gltf/.glb on disk. */
async function fetchSource(model) {
  const dir = join(TMP, model.id);
  if (model.source === 'polyhaven') {
    const files = await getJSON(`https://api.polyhaven.com/files/${model.asset}`);
    const entry = files.gltf?.['1k']?.gltf;
    if (!entry) throw new Error('no 1k glTF on Poly Haven');
    const main = join(dir, `${model.asset}.gltf`);
    await download(entry.url, main);
    for (const [rel, info] of Object.entries(entry.include ?? {})) {
      await download(info.url, join(dir, rel));
    }
    return main;
  }
  if (!TOKEN) throw new Error('SKETCHFAB_API_TOKEN not set');
  const links = await getJSON(`https://api.sketchfab.com/v3/models/${model.uid}/download`, {
    Authorization: `Token ${TOKEN}`,
  });
  const glb = links.glb?.url;
  if (!glb) throw new Error('no GLB archive offered');
  const path = join(dir, 'source.glb');
  await download(glb, path);
  return path;
}

async function optimize(input, output) {
  const doc = await io.read(input);
  // Decode Draco on read; write plain geometry so no encoder is needed.
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose();
  }
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
  );
  await mkdir(dirname(output), { recursive: true });
  await io.write(output, doc);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const manifestPath = join(OUT, 'manifest.json');
  const manifest = { models: {}, credits: [] };

  for (const model of MODELS) {
    const output = join(OUT, `${model.id}.glb`);
    const credit =
      model.source === 'polyhaven'
        ? `${model.title} by ${model.author} (Poly Haven, CC0)`
        : `"${model.title}" by ${model.author} (${model.link}), ${model.license}`;
    try {
      if (!(await exists(output))) {
        const t0 = Date.now();
        const src = await fetchSource(model);
        await optimize(src, output);
        const { size } = await stat(output);
        console.log(`[models] ${model.id}: ok (${(size / 1e6).toFixed(1)} MB, ${Date.now() - t0} ms)`);
      } else {
        console.log(`[models] ${model.id}: cached`);
      }
      manifest.models[model.id] = { url: `models/${model.id}.glb` };
      manifest.credits.push(credit);
    } catch (err) {
      console.warn(`[models] ${model.id}: skipped (${err instanceof Error ? err.message : err})`);
      await rm(output, { force: true });
    }
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[models] manifest: ${Object.keys(manifest.models).join(', ') || 'none (procedural fallback)'}`);
}

main().catch(async (err) => {
  console.warn('[models] failed, using procedural props:', err);
  try {
    await mkdir(OUT, { recursive: true });
    await writeFile(join(OUT, 'manifest.json'), JSON.stringify({ models: {}, credits: [] }));
  } catch {
    /* ignore */
  }
});
