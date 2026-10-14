import { AssetType, defineAssets } from '@iwsdk/core';

// Build every public URL from BASE_URL so the runtime, the managed editor, and
// subpath builds all resolve the same file.
const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'welcome-panel': {
    url: publicAssetUrl('ui/welcome.uikitml'),
    type: AssetType.UIKitML,
    name: 'Welcome Panel',
  },
  'step-panel': {
    url: publicAssetUrl('ui/step.uikitml'),
    type: AssetType.UIKitML,
    name: 'Barista Step Panel',
  },
  'shop-panel': {
    url: publicAssetUrl('ui/shop.uikitml'),
    type: AssetType.UIKitML,
    name: 'Shop Kit Panel',
  },
});
