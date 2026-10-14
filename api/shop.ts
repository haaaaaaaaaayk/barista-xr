/**
 * Shop MCP search for the latte kit. Called live on every request — results are
 * never cached, product URLs are passed through exactly as returned, and
 * warning messages are surfaced to the shopper.
 */

const SHOP_MCP_URL = 'https://mcp.shop.com/';
const PROTOCOL_VERSION = '2026-07-28';

interface Money {
  amount: number;
  currency: string;
}

interface Variant {
  id: string;
  price: Money;
  availability?: { available?: boolean };
  url: string;
  seller?: { name?: string };
}

interface Product {
  id: string;
  title: string;
  variants?: Variant[];
}

interface Message {
  type?: string;
  content?: string;
}

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

function formatMoney({ amount, currency }: Money): string {
  const format = new Intl.NumberFormat('en-US', { style: 'currency', currency });
  return format.format(amount / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
}

async function searchCatalog(query: string): Promise<{ products: Product[]; messages: Message[] }> {
  const response = await fetch(SHOP_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
      'Mcp-Method': 'tools/call',
      'Mcp-Name': 'search_catalog',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'search_catalog',
        arguments: {
          catalog: {
            query,
            context: { address_country: 'US', currency: 'USD' },
            pagination: { limit: 3 },
          },
        },
        _meta: {
          'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
          'io.modelcontextprotocol/clientInfo': { name: 'barista-xr', version: '1.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });

  const text = await response.text();
  // The server may answer as JSON or as a single SSE event.
  const jsonText = text.trimStart().startsWith('{')
    ? text
    : (text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .pop() ?? '{}');
  const payload = JSON.parse(jsonText) as {
    result?: { isError?: boolean; structuredContent?: { products?: Product[]; messages?: Message[] } };
    error?: { message?: string };
  };
  if (payload.error) throw new Error(payload.error.message ?? 'Shop MCP error');
  if (payload.result?.isError) throw new Error('Shop MCP tool error');
  return {
    products: payload.result?.structuredContent?.products ?? [],
    messages: payload.result?.structuredContent?.messages ?? [],
  };
}

export async function searchKit(requests: { role: string; query: string }[]): Promise<KitResult> {
  const results = await Promise.allSettled(requests.map((r) => searchCatalog(r.query)));
  const items: KitItem[] = [];
  const warnings: string[] = [];

  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    for (const m of result.value.messages) {
      if (m.type === 'warning' && m.content) warnings.push(m.content);
    }
    const candidates = result.value.products
      .map((p) => ({ p, v: p.variants?.[0] }))
      .filter((c): c is { p: Product; v: Variant } => c.v != null && typeof c.v.url === 'string');
    const pick = candidates.find((c) => c.v.availability?.available !== false) ?? candidates[0];
    if (pick == null) return;
    items.push({
      role: requests[i].role,
      title: pick.p.title,
      price: formatMoney(pick.v.price),
      seller: pick.v.seller?.name ?? 'Shop merchant',
      url: pick.v.url, // exactly as returned
      available: pick.v.availability?.available !== false,
    });
  });

  if (items.length === 0 && results.every((r) => r.status === 'rejected')) {
    throw new Error('All Shop searches failed');
  }
  return { items, warnings };
}

/** Parses ?role=..&q=.. pairs (max 6) from a request URL. */
export function parseKitRequest(url: URL): { role: string; query: string }[] {
  const roles = url.searchParams.getAll('role');
  const queries = url.searchParams.getAll('q');
  return queries
    .slice(0, 6)
    .map((query, i) => ({ role: (roles[i] ?? 'Item').slice(0, 40), query: query.slice(0, 120) }))
    .filter((r) => r.query.trim().length > 0);
}


// Vercel Function: GET /api/shop?role=Espresso%20beans&q=espresso%20coffee%20beans&...
export async function GET(request: Request): Promise<Response> {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const requests = parseKitRequest(new URL(request.url));
  if (requests.length === 0) {
    return new Response(JSON.stringify({ error: 'Add at least one q= search' }), { status: 400, headers });
  }
  try {
    const kit = await searchKit(requests);
    return new Response(JSON.stringify(kit), { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Shop search failed';
    return new Response(JSON.stringify({ error: message }), { status: 502, headers });
  }
}
