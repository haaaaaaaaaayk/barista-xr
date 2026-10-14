import { createComponent, Types } from '@iwsdk/core';

/** Tags every barista prop so systems can find it. `kind` is cup | pitcher | brew-button. */
export const BaristaProp = createComponent('BaristaProp', {
  kind: { type: Types.String, default: '' },
});
