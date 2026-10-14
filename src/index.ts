import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { BaristaSystem } from './barista.js';
import { PanelSystem } from './panel.js';
import { initShopOverlay } from './shop-client.js';

initShopOverlay();

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(PanelSystem);
  world.registerSystem(BaristaSystem);
});
