/**
 * BaristaSystem — builds the barista bar and runs the five-step latte lesson:
 *   1. place the cup on the drip tray
 *   2. press BREW (ray-click or touch the red button) → espresso pours
 *   3. hold the milk pitcher under the steam wand → milk steams
 *   4. tilt the pitcher over the cup → latte pours
 *   5. set the cup on the green coaster → served, kit panel opens
 */
import {
  Box3,
  createSystem,
  DoubleSide,
  MeshBasicMaterial,
  PlaneGeometry,
  Raycaster,
  Entity,
  Grabbed,
  Group,
  Mesh,
  Object3D,
  OneHandGrabbable,
  Pressed,
  Quaternion,
  RayInteractable,
  UIKit,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { BaristaProp } from './barista-components.js';
import {
  buildCoaster,
  buildCounter,
  buildCup,
  buildMarker,
  buildPointer,
  buildMachine,
  buildPitcher,
  buildSteamPuffs,
  buildStream,
  CUP_LIQUID_BASE,
  CUP_LIQUID_DEPTH,
  CUP_RIM,
  cupInnerRadiusAt,
  CupParts,
  ESPRESSO_COLOR,
  LATTE_COLOR,
  MachineParts,
  PitcherParts,
} from './barista-props.js';
import { describe, fitModel, hideProcedural, loadManifest, loadModel, removeJunk } from './premium-models.js';
import { fetchKit, KitResult, rememberKit, showCredits, showShopOverlay } from './shop-client.js';

/** Per-model yaw corrections (radians) if a model faces away from the user. */
const MODEL_YAW = { machine: 0 };

enum Step {
  PlaceCup = 1,
  Brew = 2,
  Steam = 3,
  Pour = 4,
  Serve = 5,
  Done = 6,
}

const STEP_COPY: Record<Step, { title: string; body: string; hint: string }> = {
  [Step.PlaceCup]: {
    title: 'Put your cup under the machine',
    body: 'Grab the green cup at the front of the counter. Set it on the metal grill under the LEFT side of the coffee machine, inside the glowing yellow ring.',
    hint: 'Hands: pinch to grab. Controllers: squeeze the side grip button. Follow the yellow arrow.',
  },
  [Step.Brew]: {
    title: 'Start the coffee',
    body: 'Touch the glowing orange circle on the front of the machine, just above your cup (top left). Coffee will start pouring into the cup.',
    hint: 'Reach out and tap it with your finger or controller, or point at it and pinch.',
  },
  [Step.Steam]: {
    title: 'Heat the milk',
    body: 'Pick up the small gold metal jug (back right of the counter). Hold it under the thin metal pipe sticking out of the RIGHT side of the machine, at the glowing ring.',
    hint: 'Baristas call that pipe the "steam wand". Keep the jug there until it reaches 100%.',
  },
  [Step.Pour]: {
    title: 'Pour the milk in',
    body: 'Bring the jug over your cup and tip it forward, like pouring a glass of water.',
    hint: 'Tip it a lot. The milk flows once the jug is well tilted over the cup.',
  },
  [Step.Serve]: {
    title: 'Serve it',
    body: 'Pick up your latte and set it down on the glowing green circle at the front right of the counter.',
    hint: 'Careful, it is full!',
  },
  [Step.Done]: {
    title: 'You made your first latte!',
    body: 'Hooray, and thank you for brewing with us! Want to make it at home? Your kit is on the right.',
    hint: 'Press Start over to brew another and beat your time.',
  },
};

const BASE_COUNTER_TOP = 0.9;
const COUNTER_Z = -0.55;
const ESPRESSO_TARGET = 0.32; // fraction of cup height
const LATTE_TARGET = 0.92;
const BREW_RATE = 0.11; // fill per second
const POUR_RATE = 0.2;
const STEAM_SECONDS = 3;
const BEST_TIME_KEY = 'barista-xr-best-seconds';

export class BaristaSystem extends createSystem({
  held: { required: [BaristaProp, Grabbed] },
  pressed: { required: [BaristaProp, Pressed] },
}) {
  // props
  private machine!: MachineParts;
  private cup!: CupParts;
  private pitcher!: PitcherParts;
  private counter!: Group;
  private coaster!: Group;
  private espressoStream!: Mesh;
  private milkStream!: Mesh;
  private puffs!: Mesh[];
  private cupEntity!: Entity;
  private pitcherEntity!: Entity;
  private movable: { obj: Object3D; home: Vector3 }[] = [];
  private trayMarker!: Mesh;
  private pointer!: Mesh;
  private wandMarker!: Mesh;

  // panels
  private stepEls: Partial<Record<'label' | 'title' | 'body' | 'progress' | 'hint', UIKit.Text>> = {};
  private shopEls: { status?: UIKit.Text; rows: { title?: UIKit.Text; meta?: UIKit.Text }[] } = { rows: [] };
  private shopPanel?: Object3D;
  private panels: Object3D[] = [];

  // state
  private step: Step = Step.PlaceCup;
  private fill = 0; // 0..1 of cup height
  private milkRatio = 0; // 0 espresso .. 1 latte colour
  private steam = 0; // 0..1
  private pitcherMilk = 1; // 0..1
  private brewing = false;
  private counterTop = BASE_COUNTER_TOP;
  private calibrated = false;
  private startTime = -1;
  private elapsedText = '';
  private kit: KitResult | null = null;
  private kitLoading = false;
  private chime?: HTMLAudioElement;
  private lastProgressText = '';

  // prop dimensions (procedural defaults, replaced when premium models load)
  private cupRim = CUP_RIM;
  private liquidBase = CUP_LIQUID_BASE;
  private liquidDepth = CUP_LIQUID_DEPTH;
  private servePlaced = false;
  private confetti!: Group;
  private confettiVel!: Float32Array;
  private confettiSpin!: Float32Array;
  private confettiAge = -1;
  private milkRest = 0.07;
  private milkFull = 0.085;
  private counterModel: Group | null = null;
  private counterModelHeight = 1;
  private servedCup: Object3D | null = null;
  private plainCupParts: Object3D[] = [];
  private credits: string[] = [];

  // scratch (no allocation in update)
  private v1!: Vector3;
  private v2!: Vector3;
  private v3!: Vector3;
  private up!: Vector3;
  private q!: Quaternion;

  init(): void {
    this.v1 = new Vector3();
    this.v2 = new Vector3();
    this.v3 = new Vector3();
    this.up = new Vector3();
    this.q = new Quaternion();

    this.buildScene();
    this.bindPanels();

    try {
      this.chime = new Audio(`${import.meta.env.BASE_URL}audio/chime.mp3`);
      this.chime.volume = 0.6;
    } catch {
      /* audio unavailable */
    }

    // Release: snap props back onto the counter (or into a zone) so nothing floats.
    this.queries.held.subscribe('disqualify', (entity) => this.onRelease(entity));

    // Brew button via ray select / pinch.
    this.queries.pressed.subscribe('qualify', (entity) => {
      if (entity.getValue(BaristaProp, 'kind') === 'brew-button') {
        this.tryBrew();
      }
    });

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        const immersive = state !== VisibilityState.NonImmersive;
        if (!immersive) {
          this.calibrated = false;
        }
      }),
    );

    this.setStep(Step.PlaceCup);
    this.prefetchKit();
    void this.upgradeWithModels().catch((err) => console.warn('[barista] model upgrade failed', err));
  }

  // ------------------------------------------------------------------ build
  private buildScene(): void {
    const top = BASE_COUNTER_TOP;

    this.counter = buildCounter();
    this.counter.position.set(0, top, COUNTER_Z);
    this.world.createTransformEntity(this.counter);

    this.machine = buildMachine();
    this.machine.root.position.set(-0.25, top, COUNTER_Z - 0.04);
    this.world.createTransformEntity(this.machine.root);

    // The brew button gets its own entity so it can be ray-pressed.
    const button = this.machine.brewButton;
    this.machine.root.updateMatrixWorld(true);
    button.getWorldPosition(this.v1);
    button.removeFromParent();
    button.position.copy(this.v1);
    const buttonEntity = this.world.createTransformEntity(button);
    buttonEntity.addComponent(RayInteractable);
    buttonEntity.addComponent(BaristaProp, { kind: 'brew-button' });

    this.coaster = buildCoaster();
    this.coaster.position.set(0.46, top, COUNTER_Z + 0.1);
    this.world.createTransformEntity(this.coaster);

    this.cup = buildCup();
    this.cup.root.position.set(0.17, top, COUNTER_Z + 0.13);
    this.cupEntity = this.world.createTransformEntity(this.cup.root);
    this.cupEntity.addComponent(OneHandGrabbable, { rotate: true, translate: true });
    this.cupEntity.addComponent(BaristaProp, { kind: 'cup' });

    this.pitcher = buildPitcher();
    this.pitcher.root.position.set(0.31, top, COUNTER_Z - 0.07);
    this.pitcherEntity = this.world.createTransformEntity(this.pitcher.root);
    this.pitcherEntity.addComponent(OneHandGrabbable, { rotate: true, translate: true });
    this.pitcherEntity.addComponent(BaristaProp, { kind: 'pitcher' });

    this.espressoStream = buildStream(0x4a2c17, 0.004);
    this.world.createTransformEntity(this.espressoStream);
    this.milkStream = buildStream(0xfdf6e8, 0.006);
    this.world.createTransformEntity(this.milkStream);

    this.buildConfetti();
    this.puffs = buildSteamPuffs(8);
    for (const puff of this.puffs) {
      this.world.createTransformEntity(puff);
    }

    this.movable = [
      this.counter,
      this.machine.root,
      button,
      this.coaster,
      this.cup.root,
      this.pitcher.root,
    ].map((obj) => ({ obj, home: obj.position.clone() }));

    // Guide rings: show where the cup goes and where to hold the pitcher.
    this.trayMarker = buildMarker();
    this.world.createTransformEntity(this.trayMarker);
    this.pointer = buildPointer();
    this.world.createTransformEntity(this.pointer);
    this.wandMarker = buildMarker();
    this.wandMarker.scale.setScalar(0.8);
    this.world.createTransformEntity(this.wandMarker);
  }

  // ------------------------------------------------------------------ premium models
  /** Swaps procedural props for the open-licensed models fetched at build time. */
  private async upgradeWithModels(): Promise<void> {
    const manifest = await loadManifest();
    this.credits = manifest.credits;
    showCredits(manifest.credits);
    const [machine, cup, pitcher, counter, plant, croissant] = await Promise.all([
      loadModel(manifest, 'machine'),
      loadModel(manifest, 'cup'),
      loadModel(manifest, 'pitcher'),
      loadModel(manifest, 'counter'),
      loadModel(manifest, 'plant'),
      loadModel(manifest, 'croissant'),
    ]);
    const lift = this.counterTop - BASE_COUNTER_TOP;

    if (counter) {
      console.info('[barista] counter', describe(counter));
      const fit = fitModel(counter, { axis: 'x', size: 1.2 });
      hideProcedural(this.counter, []);
      const holder = new Group();
      holder.add(fit.root);
      holder.position.set(0, 0, COUNTER_Z);
      this.counterModelHeight = fit.size.y;
      holder.scale.y = this.counterTop / fit.size.y;
      this.counterModel = holder;
      this.world.createTransformEntity(holder);
    }

    if (machine) {
      console.info('[barista] machine', describe(machine));
      const fit = fitModel(machine, { axis: 'x', size: 0.68, yaw: MODEL_YAW.machine });
      const { x: w, y: h, z: d } = fit.size;
      hideProcedural(this.machine.root, []);
      this.machine.root.add(fit.root);
      const front = d / 2;
      // Anchors for a two-group commercial machine (drip tray grate ~30% up).
      const gx = -0.24 * w;
      const gz = front - 0.25 * d;
      this.machine.root.updateMatrixWorld(true);
      // Measure the real drip-tray surface and spout height by casting rays into the model.
      const rc = new Raycaster();
      const down = new Vector3(0, -1, 0);
      const up = new Vector3(0, 1, 0);
      let trayY = 0.33 * h;
      let headY = 0.55 * h;
      this.machinePoint([gx, 0.5 * h, gz], this.v1);
      rc.set(this.v1, down);
      const trayHit = rc.intersectObject(fit.root, true)[0];
      if (trayHit) trayY = this.machine.root.worldToLocal(this.v2.copy(trayHit.point)).y;
      this.machinePoint([gx, trayY + 0.02, gz], this.v1);
      rc.set(this.v1, up);
      const headHit = rc.intersectObject(fit.root, true)[0];
      if (headHit) headY = this.machine.root.worldToLocal(this.v2.copy(headHit.point)).y - 0.004;
      console.info('[barista] tray', trayY.toFixed(3), 'spout', headY.toFixed(3), 'of', h.toFixed(3));
      this.machine.trayLocal = [gx, trayY, gz];
      this.machine.groupHeadLocal = [gx, headY, gz];
      this.machine.wandTipLocal = [0.47 * w, 0.4 * h, front - 0.1 * d];
      // Touch target sits right in front of the spout, just above the cup.
      this.machinePoint([gx, headY + 0.035, gz + 0.09], this.v1);
      this.machine.brewButton.position.copy(this.v1);
      this.setHome(this.machine.brewButton, lift);
    }

    if (cup) {
      // This model is a finished latte (cup, saucer, foam art in one mesh), so the
      // lesson uses the plain cup to fill and this one is revealed when served.
      console.info('[barista] cup', describe(cup));
      removeJunk(cup);
      const fit = fitModel(cup, { axis: 'max', size: 0.14 });
      fit.root.visible = false;
      this.cup.root.add(fit.root);
      this.servedCup = fit.root;
      this.plainCupParts = this.cup.root.children.filter(
        (c) => c !== fit.root && c !== this.cup.liquid && c !== this.cup.art,
      );
    }

    if (pitcher) {
      console.info('[barista] pitcher', describe(pitcher));
      removeJunk(pitcher);
      const fit = fitModel(pitcher, { axis: 'y', size: 0.12 });
      hideProcedural(this.pitcher.root, [this.pitcher.milk, this.pitcher.spout]);
      this.pitcher.root.add(fit.root);
      const inner = Math.min(fit.size.x, fit.size.z) * 0.36;
      this.pitcher.milk.scale.x = this.pitcher.milk.scale.z = inner / 0.044;
      this.milkRest = fit.size.y * 0.55;
      this.milkFull = fit.size.y * 0.7;
      if (this.step <= Step.Steam) this.pitcher.milk.scale.y = this.milkRest;
      this.pitcher.spout.position.set(0, fit.size.y, 0);
    }

    if (plant) {
      const fit = fitModel(plant, { axis: 'y', size: 0.32 });
      fit.root.position.set(0.5, this.counterTop, COUNTER_Z - 0.15);
      this.world.createTransformEntity(fit.root);
      this.movable.push({ obj: fit.root, home: fit.root.position.clone().setY(BASE_COUNTER_TOP) });
    }
    if (croissant) {
      const fit = fitModel(croissant, { axis: 'max', size: 0.12 });
      fit.root.position.set(0.19, this.counterTop, COUNTER_Z - 0.17);
      fit.root.rotation.y = 0.6;
      this.world.createTransformEntity(fit.root);
      this.movable.push({ obj: fit.root, home: fit.root.position.clone().setY(BASE_COUNTER_TOP) });
    }
  }

  /** Records an object's current position as its home (relative to the base counter height). */
  private setHome(obj: Object3D, lift: number): void {
    const entry = this.movable.find((m) => m.obj === obj);
    if (entry) {
      entry.home.copy(obj.position);
      entry.home.y -= lift;
    }
  }

  private updateMarkers(time: number): void {
    const showTray = this.step === Step.PlaceCup || (this.step === Step.Brew && !this.cupInTray());
    this.trayMarker.visible = showTray;
    if (showTray) {
      this.machinePoint(this.machine.trayLocal, this.v1);
      this.trayMarker.position.copy(this.v1);
      this.trayMarker.position.y += 0.004;
    }
    const showWand = this.step === Step.Steam && !this.pitcherAtWand();
    this.wandMarker.visible = showWand;
    if (showWand) {
      this.machinePoint(this.machine.wandTipLocal, this.v1);
      this.wandMarker.position.copy(this.v1);
    }
    // The brew target only exists while it's the thing to touch.
    const brewTarget = this.machine.brewButton;
    brewTarget.visible = this.step === Step.Brew && !this.brewing;
    if (brewTarget.visible) brewTarget.scale.setScalar(1 + Math.sin(time * 5) * 0.1);

    // Bouncing arrow over the next thing to touch.
    let target: Vector3 | null = null;
    if (this.step === Step.PlaceCup) {
      target = this.cupEntity.hasComponent(Grabbed)
        ? this.machinePoint(this.machine.trayLocal, this.v1)
        : this.cup.root.getWorldPosition(this.v1).setY(this.v1.y + this.cupRim);
    } else if (this.step === Step.Brew && !this.brewing) {
      target = brewTarget.getWorldPosition(this.v1).setY(this.v1.y + 0.03);
    } else if (this.step === Step.Steam && !this.pitcherAtWand()) {
      target = this.pitcherEntity.hasComponent(Grabbed)
        ? this.machinePoint(this.machine.wandTipLocal, this.v1)
        : this.pitcher.root.getWorldPosition(this.v1).setY(this.v1.y + 0.13);
    } else if (this.step === Step.Pour && !this.pitcherPouring()) {
      target = this.cup.root.getWorldPosition(this.v1).setY(this.v1.y + this.cupRim);
    } else if (this.step === Step.Serve) {
      target = this.cupEntity.hasComponent(Grabbed)
        ? this.coaster.getWorldPosition(this.v1)
        : this.cup.root.getWorldPosition(this.v1).setY(this.v1.y + this.cupRim);
    }
    this.pointer.visible = target != null;
    if (target) {
      this.pointer.position.set(target.x, target.y + 0.07 + Math.abs(Math.sin(time * 3.2)) * 0.035, target.z);
    }

    const pulse = 1 + Math.sin(time * 4) * 0.08;
    this.trayMarker.scale.setScalar(pulse);
    this.wandMarker.scale.setScalar(0.8 * pulse);
  }

  private bindPanels(): void {
    const step = this.world.getSceneObject<UIKitMLAsset>('step-panel');
    if (step) {
      this.panels.push(step);
      this.stepEls.label = step.getElementById<UIKit.Text>('step-label') ?? undefined;
      this.stepEls.title = step.getElementById<UIKit.Text>('step-title') ?? undefined;
      this.stepEls.body = step.getElementById<UIKit.Text>('step-body') ?? undefined;
      this.stepEls.progress = step.getElementById<UIKit.Text>('step-progress') ?? undefined;
      this.stepEls.hint = step.getElementById<UIKit.Text>('step-hint') ?? undefined;
      const restart = step.getElementById('restart-button');
      const onRestart = () => this.restart();
      restart?.addEventListener('click', onRestart);
      this.cleanupFuncs.push(() => restart?.removeEventListener('click', onRestart));
    }

    const shop = this.world.getSceneObject<UIKitMLAsset>('shop-panel');
    if (shop) {
      this.panels.push(shop);
      this.shopPanel = shop;
      shop.visible = false;
      this.shopEls.status = shop.getElementById<UIKit.Text>('shop-status') ?? undefined;
      for (let i = 0; i < 4; i++) {
        this.shopEls.rows.push({
          title: shop.getElementById<UIKit.Text>(`p${i}-title`) ?? undefined,
          meta: shop.getElementById<UIKit.Text>(`p${i}-meta`) ?? undefined,
        });
      }
      const button = shop.getElementById('shop-button');
      const onShop = () => {
        if (this.world.visibilityState.peek() !== VisibilityState.NonImmersive) {
          this.world.exitXR();
        }
        showShopOverlay();
      };
      button?.addEventListener('click', onShop);
      this.cleanupFuncs.push(() => button?.removeEventListener('click', onShop));
    }

    // Panels move with the counter when it is fitted to the user's height.
    const welcome = this.world.getSceneObject('welcome-panel');
    void welcome;
  }

  // ------------------------------------------------------------------ loop
  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.05);
    this.calibrateHeight();

    if (this.startTime < 0 && this.step !== Step.Done) {
      this.startTime = time;
    }

    const cupHeld = this.cupEntity.hasComponent(Grabbed);

    switch (this.step) {
      case Step.PlaceCup:
        if (!cupHeld && this.cupInTray()) this.setStep(Step.Brew);
        break;

      case Step.Brew:
        this.checkButtonTouch();
        if (this.brewing && this.cupInTray()) {
          this.fill = Math.min(ESPRESSO_TARGET, this.fill + BREW_RATE * dt);
          this.showEspressoStream(true);
          this.setProgress(`Extracting... ${Math.round((this.fill / ESPRESSO_TARGET) * 100)}%`);
          if (this.fill >= ESPRESSO_TARGET) {
            this.brewing = false;
            this.showEspressoStream(false);
            this.setStep(Step.Steam);
          }
        } else {
          this.showEspressoStream(false);
          if (this.brewing) this.setProgress('Put the cup back under the machine!');
        }
        break;

      case Step.Steam:
        if (this.pitcherAtWand()) {
          this.steam = Math.min(1, this.steam + dt / STEAM_SECONDS);
          this.animateSteam(time, true);
          this.pitcher.milk.scale.y = this.milkRest + (this.milkFull - this.milkRest) * 0.6 * this.steam; // milk foams up
          this.setProgress(`Steaming... ${Math.round(this.steam * 100)}%`);
          if (this.steam >= 1) {
            this.animateSteam(time, false);
            this.setStep(Step.Pour);
          }
        } else {
          this.animateSteam(time, false);
          if (this.steam > 0) this.setProgress(`Steaming... ${Math.round(this.steam * 100)}% (hold it under the wand)`);
        }
        break;

      case Step.Pour:
        if (this.pitcherPouring()) {
          this.fill = Math.min(LATTE_TARGET, this.fill + POUR_RATE * dt);
          this.milkRatio = (this.fill - ESPRESSO_TARGET) / (LATTE_TARGET - ESPRESSO_TARGET);
          this.pitcherMilk = 1 - this.milkRatio;
          this.pitcher.milk.scale.y = Math.max(0.004, this.milkFull * this.pitcherMilk);
          this.showMilkStream(true);
          this.setProgress(`Pouring... ${Math.round(this.milkRatio * 100)}%`);
          if (this.fill >= LATTE_TARGET) {
            this.showMilkStream(false);
            this.cup.art.visible = true;
            this.setStep(Step.Serve);
          }
        } else {
          this.showMilkStream(false);
        }
        break;

      case Step.Serve:
        // Only a deliberate set-down counts, so step 5 is always a real step.
        if (this.servePlaced && !cupHeld && this.cupOnCoaster()) {
          this.finish(time);
        }
        break;

      case Step.Done:
        break;
    }

    this.updateCupLiquid();
    this.updateMarkers(time);
    this.updateConfetti(dt);
  }

  // ------------------------------------------------------------------ steps
  private setStep(step: Step): void {
    const changed = step !== this.step;
    this.step = step;
    const copy = STEP_COPY[step];
    this.servePlaced = false;
    this.setText(this.stepEls.label, step === Step.Done ? 'TA-DA!  STEP 5 OF 5 COMPLETE' : `STEP ${step} OF 5`);
    this.setText(this.stepEls.title, copy.title);
    this.setText(this.stepEls.body, copy.body);
    this.setText(this.stepEls.hint, copy.hint);
    this.setProgress(step === Step.Done ? this.elapsedText : ' ');
    if (changed && step !== Step.PlaceCup) this.playChime();
  }

  private finish(time: number): void {
    const seconds = Math.max(1, Math.round(time - this.startTime));
    let best = seconds;
    try {
      const stored = Number(localStorage.getItem(BEST_TIME_KEY));
      if (stored > 0 && stored < best) best = stored;
      localStorage.setItem(BEST_TIME_KEY, String(best));
    } catch {
      /* storage unavailable */
    }
    this.elapsedText = best === seconds ? `Served in ${seconds}s. New best!` : `Served in ${seconds}s. Best: ${best}s`;
    if (this.servedCup) {
      // Reveal the premium finished latte in place of the practice cup.
      this.servedCup.visible = true;
      this.cup.liquid.visible = false;
      this.cup.art.visible = false;
      for (const part of this.plainCupParts) {
        const mesh = part as Mesh;
        const mat = mesh.isMesh ? (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) : null;
        if (!(mat && mat.transparent && mat.opacity === 0)) part.visible = false;
      }
    }
    this.setStep(Step.Done);
    this.celebrate();
    if (this.shopPanel) this.shopPanel.visible = true;
    if (this.kit == null) this.prefetchKit();
  }

  private restart(): void {
    for (const entity of [this.cupEntity, this.pitcherEntity]) {
      if (entity.hasComponent(Grabbed)) return; // let go first
    }
    const delta = this.counterTop - BASE_COUNTER_TOP;
    for (const { obj, home } of this.movable) {
      obj.position.copy(home);
      obj.position.y += delta;
      obj.quaternion.identity();
    }
    this.fill = 0;
    this.milkRatio = 0;
    this.steam = 0;
    this.pitcherMilk = 1;
    this.brewing = false;
    this.pitcher.milk.scale.y = this.milkRest;
    if (this.servedCup) {
      this.servedCup.visible = false;
      for (const part of this.plainCupParts) part.visible = true;
    }
    this.cup.art.visible = false;
    this.showEspressoStream(false);
    this.showMilkStream(false);
    for (const puff of this.puffs) puff.visible = false;
    if (this.shopPanel) this.shopPanel.visible = false;
    this.startTime = -1;
    this.setStep(Step.PlaceCup);
  }

  private tryBrew(): void {
    if (this.step !== Step.Brew) return;
    if (!this.cupInTray()) {
      this.setProgress('Place the cup on the drip tray first.');
      return;
    }
    this.brewing = true;
    this.playChime();
  }

  /** Lets people simply poke the brew button with a hand or controller. */
  private checkButtonTouch(): void {
    if (this.brewing) return;
    this.machine.brewButton.getWorldPosition(this.v1);
    const grips = this.player.gripSpaces;
    for (const space of [grips.left, grips.right]) {
      if (space == null) continue;
      space.getWorldPosition(this.v2);
      if (this.v2.distanceTo(this.v1) < 0.08) {
        this.tryBrew();
        return;
      }
    }
  }

  // ------------------------------------------------------------------ zones
  private machinePoint(local: [number, number, number], out: Vector3): Vector3 {
    out.set(local[0], local[1], local[2]);
    return this.machine.root.localToWorld(out);
  }

  private horizontalDistance(a: Vector3, b: Vector3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  private cupInTray(): boolean {
    this.cup.root.getWorldPosition(this.v1);
    this.machinePoint(this.machine.trayLocal, this.v2);
    return this.horizontalDistance(this.v1, this.v2) < 0.07 && Math.abs(this.v1.y - this.v2.y) < 0.05;
  }

  private cupOnCoaster(): boolean {
    this.cup.root.getWorldPosition(this.v1);
    this.coaster.getWorldPosition(this.v2);
    return this.horizontalDistance(this.v1, this.v2) < 0.08 && Math.abs(this.v1.y - this.v2.y) < 0.05;
  }

  private pitcherAtWand(): boolean {
    this.machinePoint(this.machine.wandTipLocal, this.v2);
    this.pitcher.root.getWorldPosition(this.v1);
    // The wand tip should be inside the pitcher: close horizontally, below its rim.
    return this.horizontalDistance(this.v1, this.v2) < 0.07 && this.v2.y > this.v1.y - 0.01 && this.v2.y < this.v1.y + 0.16;
  }

  private pitcherPouring(): boolean {
    this.pitcher.root.getWorldQuaternion(this.q);
    this.up.set(0, 1, 0).applyQuaternion(this.q);
    if (this.up.y > 0.6) return false; // not tilted enough (~53°)
    this.pitcher.spout.getWorldPosition(this.v1);
    this.cup.root.getWorldPosition(this.v2);
    const rimY = this.v2.y + this.cupRim;
    return this.horizontalDistance(this.v1, this.v2) < 0.11 && this.v1.y > rimY - 0.03 && this.v1.y < rimY + 0.3;
  }

  // ------------------------------------------------------------------ release / snapping
  private onRelease(entity: Entity): void {
    const obj = entity.object3D;
    if (obj == null) return;
    const kind = entity.getValue(BaristaProp, 'kind');
    obj.getWorldPosition(this.v1);
    this.counter.getWorldPosition(this.v2);

    const onCounter = Math.abs(this.v1.x - this.v2.x) < 0.6 && Math.abs(this.v1.z - this.v2.z) < 0.28;

    if (kind === 'cup') {
      this.machinePoint(this.machine.trayLocal, this.v3);
      if (this.horizontalDistance(this.v1, this.v3) < 0.1) {
        obj.position.set(this.v3.x, this.v3.y, this.v3.z);
        obj.quaternion.identity();
        return;
      }
      this.coaster.getWorldPosition(this.v3);
      if (this.horizontalDistance(this.v1, this.v3) < 0.11) {
        obj.position.set(this.v3.x, this.v3.y + 0.006, this.v3.z);
        obj.quaternion.identity();
        if (this.step === Step.Serve) this.servePlaced = true;
        return;
      }
    }

    if (onCounter) {
      obj.position.y = this.counterTop;
      obj.quaternion.identity();
    } else {
      // Dropped off the bar: put it back where it started.
      const entry = this.movable.find((m) => m.obj === obj);
      if (entry) {
        obj.position.copy(entry.home);
        obj.position.y += this.counterTop - BASE_COUNTER_TOP;
        obj.quaternion.identity();
      }
    }
  }

  /** Fit the bar to the user's height once per session (seated or standing). */
  private calibrateHeight(): void {
    if (this.calibrated) return;
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    this.world.camera.getWorldPosition(this.v1);
    if (this.v1.y < 0.5) return; // tracking not settled yet
    if (this.cupEntity.hasComponent(Grabbed) || this.pitcherEntity.hasComponent(Grabbed)) return;
    const target = Math.min(1.05, Math.max(0.62, this.v1.y - 0.55));
    const delta = target - this.counterTop;
    for (const { obj } of this.movable) obj.position.y += delta;
    for (const panel of this.panels) panel.position.y += delta;
    if (this.counterModel) this.counterModel.scale.y = target / this.counterModelHeight;
    this.counterTop = target;
    this.calibrated = true;
  }

  // ------------------------------------------------------------------ visuals
  private updateCupLiquid(): void {
    const liquid = this.cup.liquid;
    liquid.visible = this.fill > 0.001 && !(this.step === Step.Done && this.servedCup != null);
    liquid.scale.y = Math.max(0.0001, this.fill * this.liquidDepth);
    // The bowl flares, so the surface widens as it fills.
    const r = cupInnerRadiusAt(liquid.position.y + liquid.scale.y) - 0.0006;
    liquid.scale.x = liquid.scale.z = r;
    this.cup.art.scale.setScalar(r / 0.042);
    this.cup.liquidMaterial.color.copy(ESPRESSO_COLOR).lerp(LATTE_COLOR, this.milkRatio);
    this.cup.art.position.y = liquid.position.y + liquid.scale.y + 0.001;
  }

  private showEspressoStream(on: boolean): void {
    const s = this.espressoStream;
    s.visible = on;
    if (!on) return;
    this.machinePoint(this.machine.groupHeadLocal, this.v1);
    this.cup.root.getWorldPosition(this.v2);
    const surface = this.v2.y + this.liquidBase + this.fill * this.liquidDepth;
    s.position.copy(this.v1);
    s.scale.y = Math.max(0.01, this.v1.y - surface);
  }

  private showMilkStream(on: boolean): void {
    const s = this.milkStream;
    s.visible = on;
    if (!on) return;
    this.pitcher.spout.getWorldPosition(this.v1);
    this.cup.root.getWorldPosition(this.v2);
    const surface = this.v2.y + this.liquidBase + this.fill * this.liquidDepth;
    s.position.copy(this.v1);
    s.scale.y = Math.max(0.01, this.v1.y - surface);
  }

  private animateSteam(time: number, on: boolean): void {
    if (!on) {
      for (const puff of this.puffs) puff.visible = false;
      return;
    }
    this.pitcher.root.getWorldPosition(this.v1);
    const n = this.puffs.length;
    for (let i = 0; i < n; i++) {
      const phase = (time * 0.9 + i / n) % 1;
      const puff = this.puffs[i];
      puff.visible = true;
      puff.position.set(
        this.v1.x + Math.sin(i * 2.3 + time) * 0.025,
        this.v1.y + 0.13 + phase * 0.18,
        this.v1.z + Math.cos(i * 1.7 + time) * 0.025,
      );
      puff.scale.setScalar(0.6 + phase * 1.6);
    }
  }

  // ------------------------------------------------------------------ celebration
  private buildConfetti(): void {
    const colors = [0xf59e0b, 0xef4444, 0x22c55e, 0x3b82f6, 0xec4899, 0xfde68a];
    const materials = colors.map((c) => new MeshBasicMaterial({ color: c, side: DoubleSide }));
    const geometry = new PlaneGeometry(0.014, 0.007);
    this.confetti = new Group();
    const n = 90;
    for (let i = 0; i < n; i++) {
      const piece = new Mesh(geometry, materials[i % materials.length]);
      piece.visible = false;
      this.confetti.add(piece);
    }
    this.confettiVel = new Float32Array(n * 3);
    this.confettiSpin = new Float32Array(n * 3);
    this.world.createTransformEntity(this.confetti);
  }

  /** Ta-da: confetti over the served cup plus a double chime. */
  private celebrate(): void {
    this.cup.root.getWorldPosition(this.v1);
    const pieces = this.confetti.children;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      p.visible = true;
      p.position.set(this.v1.x, this.v1.y + 0.12, this.v1.z);
      const a = Math.random() * Math.PI * 2;
      const spread = 0.25 + Math.random() * 0.55;
      this.confettiVel[i * 3] = Math.cos(a) * spread;
      this.confettiVel[i * 3 + 1] = 1.3 + Math.random() * 1.2;
      this.confettiVel[i * 3 + 2] = Math.sin(a) * spread;
      this.confettiSpin[i * 3] = (Math.random() - 0.5) * 14;
      this.confettiSpin[i * 3 + 1] = (Math.random() - 0.5) * 14;
      this.confettiSpin[i * 3 + 2] = (Math.random() - 0.5) * 14;
    }
    this.confettiAge = 0;
    this.playChime();
    setTimeout(() => this.playChime(), 280);
  }

  private updateConfetti(dt: number): void {
    if (this.confettiAge < 0) return;
    this.confettiAge += dt;
    const pieces = this.confetti.children;
    const done = this.confettiAge > 3.2;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (done) {
        p.visible = false;
        continue;
      }
      const vy = i * 3 + 1;
      this.confettiVel[vy] -= 2.6 * dt;
      // Flutter: drag on the fall so pieces drift like paper.
      if (this.confettiVel[vy] < -0.35) this.confettiVel[vy] = -0.35;
      p.position.x += this.confettiVel[i * 3] * dt;
      p.position.y += this.confettiVel[vy] * dt;
      p.position.z += this.confettiVel[i * 3 + 2] * dt;
      this.confettiVel[i * 3] *= 0.985;
      this.confettiVel[i * 3 + 2] *= 0.985;
      p.rotation.x += this.confettiSpin[i * 3] * dt;
      p.rotation.y += this.confettiSpin[i * 3 + 1] * dt;
      p.rotation.z += this.confettiSpin[i * 3 + 2] * dt;
    }
    if (done) this.confettiAge = -1;
  }

  // ------------------------------------------------------------------ text + audio
  private setText(el: UIKit.Text | undefined, text: string): void {
    el?.setProperties({ text });
  }

  private setProgress(text: string): void {
    if (text === this.lastProgressText) return;
    this.lastProgressText = text;
    this.setText(this.stepEls.progress, text);
  }

  private playChime(): void {
    if (this.chime == null) return;
    try {
      this.chime.currentTime = 0;
      void this.chime.play().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------ shop
  private prefetchKit(): void {
    if (this.kitLoading) return;
    this.kitLoading = true;
    this.setText(this.shopEls.status, 'Finding live products from Shop...');
    fetchKit()
      .then((kit) => {
        this.kit = kit;
        rememberKit(kit);
        this.renderKit();
      })
      .catch(() => {
        this.setText(this.shopEls.status, 'Shop is unreachable right now. Try Start over in a moment.');
      })
      .finally(() => {
        this.kitLoading = false;
      });
  }

  private renderKit(): void {
    const kit = this.kit;
    if (kit == null) return;
    const warning = kit.warnings[0];
    this.setText(
      this.shopEls.status,
      warning ?? (kit.items.length ? 'Live from Shop. Prices may change.' : 'No matching products right now.'),
    );
    for (let i = 0; i < this.shopEls.rows.length; i++) {
      const row = this.shopEls.rows[i];
      const item = kit.items[i];
      this.setText(row.title, item ? `${item.role}: ${truncate(item.title, 44)}` : ' ');
      this.setText(row.meta, item ? `${item.price} from ${truncate(item.seller, 28)}` : ' ');
    }
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
