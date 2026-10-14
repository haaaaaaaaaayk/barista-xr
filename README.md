# Barista XR ☕

**Learn to make a café latte in mixed reality, then buy the kit to make it at home.**

Live: **https://baristaxr.vercel.app** (open in Meta Quest Browser → *Start in mixed reality*)

A life-size espresso bar appears in your real room on Meta Quest, fitted to your height. Grab the cup and milk jug with your hands (pinch) or controllers (grip) and follow five plain-language steps:

1. Put your cup under the machine
2. Touch the glowing circle to start the coffee
3. Heat the milk under the steam pipe
4. Tip the jug to pour the milk in
5. Serve it on the glowing coaster → 🎉 confetti, your time, and your best time

Then a **"Make it at home"** panel shows live products from Shopify via **Shop MCP**: espresso machine, frothing pitcher, latte cup and espresso beans, each linking to the real merchant.

## How it's built

- **Meta Immersive Web SDK** (WebXR `immersive-ar` passthrough, hand-tracking pinch-to-grab), from the IWSDK v0 template
- **Vercel**: static Vite app + a Vercel Function (`api/shop.ts`) calling Shop MCP `search_catalog` live (no caching, merchant URLs kept exactly as returned, warnings surfaced)
- **Open-licensed 3D models**, downloaded and optimized at build time (`scripts/fetch-models.mjs`, 1024px WebP textures). The app measures the real machine's drip tray and spout heights by raycasting into the model
- Guidance for first-timers: glowing target rings, a bouncing arrow over the next thing to touch, live coaching ("Now tip it more!")

## Credits

- "Commercial Coffee Machine" by M.Reslan, CC BY 4.0 (Sketchfab)
- "Barista Equipment - Milk Pitcher" by xpehik, CC BY 4.0 (Sketchfab)
- Wooden Table 03, Potted Plant 04, Croissant from Poly Haven, CC0

## Run locally

```bash
npm install
SKETCHFAB_API_TOKEN=... npm run dev   # token optional; without it simple built-in props are used
```

Add `?debug` to the URL to drive the flow from the console: `__barista.debugAct('place' | 'brew' | 'steam' | 'pour' | 'serve')`.

Built at the Fast Forward hackathon (Vercel × Meta), VR Apps track + Shopify Shop MCP challenge. Original template docs: [TEMPLATE_README.md](TEMPLATE_README.md).
