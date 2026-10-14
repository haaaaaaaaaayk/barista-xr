/**
 * Client side of the "Make it at home" kit. Results come live from Shop MCP via
 * our /api/shop route on every request (no caching, no re-hosted images, product
 * URLs kept exactly as returned).
 */

export interface KitItem {
  role: string;
  title: string;
  price: string;
  seller: string;
  url: string;
  available: boolean;
}

export interface KitResult {
  items: KitItem[];
  warnings: string[];
}

export const KIT_QUERIES: { role: string; query: string }[] = [
  { role: 'Espresso machine', query: 'espresso machine with milk steam wand' },
  { role: 'Milk pitcher', query: 'stainless steel milk frothing pitcher' },
  { role: 'Latte cup', query: 'ceramic latte cup and saucer' },
  { role: 'Espresso beans', query: 'whole bean espresso coffee' },
];

export async function fetchKit(): Promise<KitResult> {
  const params = new URLSearchParams();
  for (const q of KIT_QUERIES) {
    params.append('role', q.role);
    params.append('q', q.query);
  }
  const response = await fetch(`${import.meta.env.BASE_URL}api/shop?${params}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Shop request failed (${response.status})`);
  }
  return (await response.json()) as KitResult;
}

// ------------------------------------------------------------ 2D overlay
// Opened after leaving XR so shoppers get real, tappable merchant links.

let lastKit: KitResult | null = null;

export function rememberKit(kit: KitResult): void {
  lastKit = kit;
}

export function showShopOverlay(): void {
  const overlay = document.getElementById('shop-overlay');
  const list = document.getElementById('shop-list');
  const warnings = document.getElementById('shop-warnings');
  if (overlay == null || list == null || warnings == null) {
    return;
  }
  list.replaceChildren();
  warnings.replaceChildren();

  if (lastKit == null || lastKit.items.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Live products are still loading or unavailable. Try again in a moment.';
    list.append(empty);
  } else {
    for (const item of lastKit.items) {
      const a = document.createElement('a');
      a.className = 'shop-item';
      a.href = item.url; // exactly as returned by Shop MCP
      a.target = '_blank';
      a.rel = 'noopener';
      const role = document.createElement('span');
      role.className = 'shop-role';
      role.textContent = item.role;
      const title = document.createElement('span');
      title.className = 'shop-title';
      title.textContent = item.title;
      const meta = document.createElement('span');
      meta.className = 'shop-meta';
      meta.textContent = `${item.price} · ${item.seller}${item.available ? '' : ' · currently unavailable'}`;
      a.append(role, title, meta);
      list.append(a);
    }
    for (const w of lastKit.warnings) {
      const p = document.createElement('p');
      p.textContent = w;
      warnings.append(p);
    }
  }
  overlay.hidden = false;
}

export function initShopOverlay(): void {
  document.getElementById('shop-close')?.addEventListener('click', () => {
    const overlay = document.getElementById('shop-overlay');
    if (overlay) overlay.hidden = true;
  });
}

/** Attribution required by the CC BY models (shown on the 2D page and overlay). */
export function showCredits(credits: string[]): void {
  const el = document.getElementById('credits');
  if (el == null || credits.length === 0) return;
  el.textContent = `3D models: ${credits.join(' · ')}`;
  el.hidden = false;
}
