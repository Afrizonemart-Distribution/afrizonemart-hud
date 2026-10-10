import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { shelfSlots, shelfSpot, type StoreLayout } from './layout';
import type { StoreEvent } from './types';

/**
 * The HUD Store Game engine: an isometric, Sims-style Three.js store where
 * every shopper's visit is a character acting out its real steps.
 *
 * Imperative and self-contained — it owns its own render loop and never
 * calls React setState per frame (the HUD nav-hang lesson). The host
 * feeds it events (`apply`) and the clock (`setClock`), and polls
 * `stats()` / hover info at its own slow rate.
 *
 * Models: Kenney "Mini Characters" + "Mini Market" (CC0), native scale
 * (1 unit = one floor tile).
 */

const CHAR_MODELS = ['female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f'];
const MARKET = [
  'shelf-boxes',
  'shelf-bags',
  'freezers-standing',
  'freezer',
  'display-fruit',
  'display-bread',
  'cash-register',
  'character-employee',
  'column',
  'wall',
  'wall-window',
  'wall-corner',
  'wall-door-rotate',
  'shopping-basket',
  'bottle-return',
] as const;

const WALK_SPEED = 1.1; // tiles per second at 1x
const IDLE_LEAVE_MS = 10 * 60 * 1000; // a visit silent this long walks out

type Task =
  | { k: 'walk'; to: THREE.Vector3; aisle: number | null }
  | { k: 'anim'; name: string; ms: number }
  | { k: 'face'; x: number; z: number }
  | { k: 'bubble'; html: string; tone: BubbleTone; ms: number }
  | { k: 'fx'; kind: 'coins' | 'smoke'; amount?: string }
  | { k: 'till' }
  | { k: 'despawn' };

type BubbleTone = 'info' | 'good' | 'bad' | 'search';

interface Shopper {
  id: string;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: string;
  tasks: Task[];
  taskT: number; // ms spent on the current timed task
  aisle: number | null; // lane the shopper is standing in, if any
  bubble: CSS2DObject;
  bubbleEl: HTMLDivElement;
  bubbleLeft: number;
  basket: THREE.Object3D | null;
  items: number;
  till: number | null;
  meta: { country?: string | null; platform: string; step: string; lastAt: number; spent?: string };
}

export interface HoverInfo {
  id: string;
  x: number;
  y: number;
  country?: string | null;
  platform: string;
  step: string;
  items: number;
  spent?: string;
}

export interface StoreStats {
  inStore: number;
  inAisles: number;
  atTills: number;
  items: number;
}

export interface ProductInfo {
  name: string;
  categorySlug?: string;
}

export class StoreEngine {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private raf = 0;
  private ro: ResizeObserver;
  private models = new Map<string, GLTF>();
  private shoppers = new Map<string, Shopper>();
  private fx: Array<{ obj: THREE.Mesh; vel: THREE.Vector3; life: number; coin: boolean }> = [];
  private tillQueue: number[] = [];
  private doorMixer: THREE.AnimationMixer | null = null;
  private doorClip: THREE.AnimationClip | null = null;
  private layout!: StoreLayout;
  private now = Date.now();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(9, 9);
  private hover: HoverInfo | null = null;
  private coinGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12);
  private coinMat = new THREE.MeshStandardMaterial({ color: 0xfbac34, metalness: 0.8, roughness: 0.3, emissive: 0x553300 });
  private smokeMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.6 });
  private smokeGeo = new THREE.SphereGeometry(0.08, 8, 8);
  /** Replay speed. Movement and animations run this many times faster. */
  timeScale = 1;
  /** Lookup for product names/categories; the host fills it asynchronously. */
  productInfo: (slug: string) => ProductInfo | null = () => null;

  constructor(private container: HTMLElement) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.setSize(w, h);
    Object.assign(this.labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    container.appendChild(this.labels.domElement);

    const aspect = w / Math.max(1, h);
    const f = 9;
    this.camera = new THREE.OrthographicCamera(-f * aspect, f * aspect, f, -f, 0.1, 200);
    this.camera.position.set(18, 16, 18);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 4;
    this.controls.maxPolarAngle = Math.PI / 2.4;
    this.controls.minPolarAngle = Math.PI / 6;

    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x1a1f4a, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(10, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -30;
    this.scene.add(sun);

    this.renderer.domElement.addEventListener('pointermove', this.onPointer);
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
  }

  // ---- setup ---------------------------------------------------------

  async init(layout: StoreLayout): Promise<void> {
    this.layout = layout;
    const loader = new GLTFLoader();
    const load = (key: string, url: string) =>
      loader.loadAsync(url).then((g) => {
        g.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.models.set(key, g);
      });
    await Promise.all([
      ...CHAR_MODELS.map((m) => load(`char:${m}`, `/models/characters/character-${m}.glb`)),
      ...MARKET.map((m) => load(m, `/models/market/${m}.glb`)),
    ]);
    this.buildStore();
    this.controls.target.set(0, 0, (layout.aisles[0]?.zBack ?? -6) / 2 + 2);
    this.controls.update();
    this.clock.start();
    this.loop();
  }

  private place(key: string, x: number, z: number, rotY = 0): THREE.Object3D {
    const g = this.models.get(key);
    const obj = g ? g.scene.clone(true) : new THREE.Object3D();
    obj.position.set(x, 0, z);
    obj.rotation.y = rotY;
    this.scene.add(obj);
    return obj;
  }

  private label(html: string, cls: string, x: number, y: number, z: number): CSS2DObject {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    const o = new CSS2DObject(el);
    o.position.set(x, y, z);
    this.scene.add(o);
    return o;
  }

  private buildStore(): void {
    const L = this.layout;
    const halfW = L.width / 2;
    const zBack = Math.min(...L.aisles.map((a) => a.zBack)) - 1;
    const zFront = L.door.z;

    // Floor: one big checked plane (cheaper than hundreds of tiles).
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cx = cv.getContext('2d')!;
    cx.fillStyle = '#e9e4da';
    cx.fillRect(0, 0, 64, 64);
    cx.fillStyle = '#ddd6c8';
    cx.fillRect(0, 0, 32, 32);
    cx.fillRect(32, 32, 32, 32);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(L.width, zFront - zBack);
    tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(L.width, zFront - zBack),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, (zFront + zBack) / 2);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Walls: back (windows), sides, front with the door.
    for (let x = -halfW + 0.5; x < halfW; x += 1) {
      this.place(Math.round(x) % 3 === 0 ? 'wall-window' : 'wall', x, zBack, 0);
      if (Math.abs(x - L.door.x) < 0.5) {
        const door = this.place('wall-door-rotate', x, zFront, Math.PI);
        const g = this.models.get('wall-door-rotate');
        if (g?.animations.length) {
          this.doorMixer = new THREE.AnimationMixer(door);
          this.doorClip = g.animations.find((a) => a.name === 'open-and-close') ?? g.animations[0];
        }
      } else {
        this.place('wall', x, zFront, Math.PI);
      }
    }
    for (let z = zBack + 0.5; z < zFront; z += 1) {
      this.place('wall', -halfW, z, Math.PI / 2);
      this.place('wall', halfW, z, -Math.PI / 2);
    }

    // Aisles: shelves facing the lane, a hanging sign over each lane mouth.
    for (const a of L.aisles) {
      for (const s of shelfSlots(a)) this.place(s.kind, s.x, s.z, s.side === -1 ? Math.PI / 2 : -Math.PI / 2);
      this.label(
        `<b>${escapeHtml(a.name)}</b><span>${a.productCount.toLocaleString()} products</span>`,
        'sg-sign',
        a.laneX,
        1.6,
        a.zFront,
      );
    }

    // Tills with a cashier each; the payments counter beside them.
    L.tills.forEach((t, i) => {
      this.place('cash-register', t.x, t.z, Math.PI);
      const staff = this.placeCharacter('character-employee', t.x, t.z + 0.75, Math.PI);
      staff.mixer.clipAction(staff.clips.find((c) => c.name === 'idle') ?? staff.clips[0]).play();
      this.label(`Till ${i + 1}`, 'sg-tag', t.x, 1.0, t.z);
      this.tillQueue.push(0);
    });
    this.place('column', L.bank.x, L.bank.z + 0.4);
    this.place('cash-register', L.bank.x, L.bank.z, Math.PI);
    this.label('<b>Payments</b><span>Squad · M-Pesa</span>', 'sg-sign sg-bank', L.bank.x, 1.4, L.bank.z);
    this.place('bottle-return', -halfW + 1, zFront - 1, Math.PI / 2);
    this.label('Entrance', 'sg-tag', L.door.x, 1.3, zFront + 0.4);
  }

  private staffMixers: THREE.AnimationMixer[] = [];
  private placeCharacter(key: string, x: number, z: number, rotY: number) {
    const g = this.models.get(key)!;
    const obj = cloneSkinned(g.scene);
    obj.position.set(x, 0, z);
    obj.rotation.y = rotY;
    this.scene.add(obj);
    const mixer = new THREE.AnimationMixer(obj);
    this.staffMixers.push(mixer);
    return { obj, mixer, clips: g.animations };
  }

  // ---- shoppers ------------------------------------------------------

  private spawn(e: StoreEvent, at?: THREE.Vector3): Shopper {
    const L = this.layout;
    const key = `char:${CHAR_MODELS[hash(e.s) % CHAR_MODELS.length]}`;
    const g = this.models.get(key)!;
    const root = cloneSkinned(g.scene);
    root.position.copy(at ?? new THREE.Vector3(L.door.x + (Math.random() - 0.5) * 0.4, 0, L.door.z + 1.2));
    root.rotation.y = Math.PI;
    root.userData.shopperId = e.s;
    this.scene.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of g.animations) actions.set(clip.name, mixer.clipAction(clip));

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'sg-bubble';
    bubbleEl.style.display = 'none';
    const bubble = new CSS2DObject(bubbleEl);
    bubble.position.set(0, 1.05, 0);
    root.add(bubble);

    const sh: Shopper = {
      id: e.s,
      root,
      mixer,
      actions,
      current: '',
      tasks: [],
      taskT: 0,
      aisle: null,
      bubble,
      bubbleEl,
      bubbleLeft: 0,
      basket: null,
      items: 0,
      till: null,
      meta: { country: e.c, platform: e.p, step: 'entering', lastAt: e.at },
    };
    this.play(sh, 'idle');
    this.shoppers.set(e.s, sh);
    if (this.doorMixer && this.doorClip) {
      const a = this.doorMixer.clipAction(this.doorClip);
      a.setLoop(THREE.LoopOnce, 1);
      a.reset().play();
    }
    return sh;
  }

  private play(sh: Shopper, name: string, once = false): void {
    if (sh.current === name && !once) return;
    const next = sh.actions.get(name) ?? sh.actions.get('idle');
    if (!next) return;
    const prev = sh.actions.get(sh.current);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.fadeIn(0.15).play();
    if (prev && prev !== next) prev.fadeOut(0.15);
    sh.current = name;
  }

  /** Points from where the shopper is to `to`, via the front corridor. */
  private route(sh: Shopper, to: THREE.Vector3, toAisle: number | null): THREE.Vector3[] {
    const L = this.layout;
    const pts: THREE.Vector3[] = [];
    const cz = L.corridorZ;
    if (sh.aisle !== null && sh.aisle !== toAisle) pts.push(new THREE.Vector3(L.aisles[sh.aisle].laneX, 0, cz));
    if (toAisle !== null && sh.aisle !== toAisle) pts.push(new THREE.Vector3(L.aisles[toAisle].laneX, 0, cz));
    pts.push(to);
    return pts;
  }

  private walkTo(sh: Shopper, to: THREE.Vector3, aisle: number | null): void {
    // Plan from where the shopper WILL be once earlier queued walks finish.
    const ghost = { ...sh, aisle: this.plannedAisle(sh) };
    for (const p of this.route(ghost, to, aisle)) sh.tasks.push({ k: 'walk', to: p, aisle });
  }

  private plannedAisle(sh: Shopper): number | null {
    for (let i = sh.tasks.length - 1; i >= 0; i--) {
      const t = sh.tasks[i];
      if (t.k === 'walk') return t.aisle;
    }
    return sh.aisle;
  }

  private aisleFor(e: StoreEvent): number {
    const L = this.layout;
    const info = e.prod ? this.productInfo(e.prod) : null;
    const slug = e.cat ?? info?.categorySlug;
    const idx = slug !== undefined && slug !== null ? L.aisleOf.get(slug) : undefined;
    if (idx !== undefined) return idx;
    return hash(e.prod ?? e.cat ?? e.s) % Math.max(1, L.aisles.length);
  }

  private bubble(sh: Shopper, html: string, tone: BubbleTone, ms: number) {
    sh.tasks.push({ k: 'bubble', html, tone, ms });
  }

  private money(e: StoreEvent): string {
    if (e.amt == null) return '';
    const sym = e.cur === 'USD' ? '$' : e.cur === 'GBP' ? '£' : '₦';
    return `${sym}${Math.round(e.amt).toLocaleString()}`;
  }

  private pickTill(): number {
    let best = 0;
    for (let i = 1; i < this.tillQueue.length; i++) if (this.tillQueue[i] < this.tillQueue[best]) best = i;
    return best;
  }

  private goToTill(sh: Shopper): void {
    if (sh.till !== null) return;
    const i = this.pickTill();
    sh.till = i;
    const q = this.tillQueue[i]++;
    const t = this.layout.tills[i];
    this.walkTo(sh, new THREE.Vector3(t.x, 0, t.z - 0.75 - q * 0.6), null);
    sh.tasks.push({ k: 'face', x: t.x, z: t.z + 5 });
  }

  private leaveStore(sh: Shopper): void {
    const L = this.layout;
    this.walkTo(sh, new THREE.Vector3(L.door.x, 0, L.door.z - 0.6), null);
    sh.tasks.push({ k: 'walk', to: new THREE.Vector3(L.door.x, 0, L.door.z + 1.5), aisle: null });
    sh.tasks.push({ k: 'despawn' });
  }

  /**
   * Feed one visit step. `instant` (used when seeking a replay) jumps the
   * shopper straight to where the step leaves them, with no animation.
   */
  apply(e: StoreEvent, instant = false): void {
    if (!this.layout) return;
    const L = this.layout;
    let sh = this.shoppers.get(e.s);
    if (!sh) {
      if (e.t === 'leave') return;
      sh = this.spawn(e);
      if (!instant) {
        sh.tasks.push({ k: 'walk', to: new THREE.Vector3(L.door.x + (Math.random() - 0.5) * 1.5, 0, L.door.z - 1.2), aisle: null });
      }
    }
    sh.meta.lastAt = e.at;
    if (e.c) sh.meta.country = e.c;

    if (instant) {
      this.applyInstant(sh, e);
      return;
    }

    switch (e.t) {
      case 'enter':
        sh.meta.step = 'just walked in';
        break;
      case 'aisle': {
        const i = this.aisleFor(e);
        const a = L.aisles[i];
        sh.meta.step = `browsing ${a?.name ?? e.cat}`;
        if (a) this.walkTo(sh, new THREE.Vector3(a.laneX + (Math.random() - 0.5) * 0.3, 0, a.zFront - 0.6 - Math.random() * (a.zFront - a.zBack - 1.2)), i);
        break;
      }
      case 'shelf': {
        const i = this.aisleFor(e);
        const a = L.aisles[i];
        const name = (e.prod && this.productInfo(e.prod)?.name) || humanize(e.prod ?? '');
        sh.meta.step = `looking at ${name}`;
        if (a) {
          const spot = shelfSpot(a, e.prod ?? e.s);
          this.walkTo(sh, new THREE.Vector3(spot.x, 0, spot.z), i);
          sh.tasks.push({ k: 'face', x: spot.x + spot.side * 2, z: spot.z });
        }
        this.bubble(sh, `👀 ${escapeHtml(name)}`, 'info', 3500);
        sh.tasks.push({ k: 'anim', name: 'interact-right', ms: 1400 });
        break;
      }
      case 'search':
        sh.meta.step = `searching “${e.q ?? ''}”`;
        this.bubble(sh, `🔍 ${escapeHtml(e.q ?? '')}`, 'search', 4000);
        sh.tasks.push({ k: 'anim', name: 'idle', ms: 600 });
        break;
      case 'cart_add': {
        const name = (e.prod && this.productInfo(e.prod)?.name) || humanize(e.prod ?? '');
        sh.meta.step = `added ${name}`;
        sh.tasks.push({ k: 'anim', name: 'pick-up', ms: 1100 });
        this.bubble(sh, `🧺 +1 ${escapeHtml(name)}`, 'good', 2500);
        sh.items++;
        break;
      }
      case 'checkout':
        sh.meta.step = 'at the till';
        sh.meta.spent = this.money(e);
        this.goToTill(sh);
        this.bubble(sh, `🧾 ${this.money(e) || 'checking out'}`, 'info', 3000);
        break;
      case 'pay_ok':
        sh.meta.step = 'paid';
        sh.meta.spent = this.money(e);
        this.goToTill(sh);
        sh.tasks.push({ k: 'anim', name: 'emote-yes', ms: 1400 });
        sh.tasks.push({ k: 'fx', kind: 'coins', amount: this.money(e) });
        this.bubble(sh, `✅ Paid ${this.money(e)}`, 'good', 3500);
        sh.tasks.push({ k: 'till' });
        this.leaveStore(sh);
        break;
      case 'pay_fail':
        sh.meta.step = 'payment failed';
        this.goToTill(sh);
        sh.tasks.push({ k: 'anim', name: 'emote-no', ms: 1400 });
        sh.tasks.push({ k: 'fx', kind: 'smoke' });
        this.bubble(sh, `✖ Payment failed${e.d ? `<small>${escapeHtml(e.d)}</small>` : ''}`, 'bad', 6000);
        break;
      case 'error':
        sh.meta.step = 'hit an error';
        sh.tasks.push({ k: 'fx', kind: 'smoke' });
        sh.tasks.push({ k: 'anim', name: 'emote-no', ms: 1200 });
        this.bubble(sh, `⚠ Error<small>${escapeHtml(e.d ?? '')}</small>`, 'bad', 5000);
        break;
      case 'leave':
        sh.meta.step = 'leaving';
        if (sh.till !== null) sh.tasks.push({ k: 'till' });
        this.leaveStore(sh);
        break;
    }
  }

  private applyInstant(sh: Shopper, e: StoreEvent): void {
    const L = this.layout;
    sh.tasks = [];
    if (e.t === 'aisle' || e.t === 'shelf') {
      const i = this.aisleFor(e);
      const a = L.aisles[i];
      if (a) {
        const spot = e.t === 'shelf' ? shelfSpot(a, e.prod ?? e.s) : { x: a.laneX, z: (a.zFront + a.zBack) / 2 };
        sh.root.position.set(spot.x, 0, spot.z);
        sh.aisle = i;
      }
    } else if (e.t === 'cart_add') {
      sh.items++;
    } else if (e.t === 'checkout' || e.t === 'pay_fail') {
      if (sh.till === null) {
        const i = this.pickTill();
        sh.till = i;
        this.tillQueue[i]++;
      }
      const t = L.tills[sh.till];
      sh.root.position.set(t.x, 0, t.z - 0.75);
      sh.aisle = null;
    } else if (e.t === 'pay_ok' || e.t === 'leave') {
      this.remove(sh);
    }
  }

  private remove(sh: Shopper): void {
    if (sh.till !== null) this.tillQueue[sh.till] = Math.max(0, this.tillQueue[sh.till] - 1);
    sh.root.remove(sh.bubble);
    sh.bubbleEl.remove();
    this.scene.remove(sh.root);
    sh.mixer.stopAllAction();
    this.shoppers.delete(sh.id);
  }

  /** Clear every shopper (before seeking a replay). */
  reset(): void {
    for (const sh of Array.from(this.shoppers.values())) this.remove(sh);
    this.tillQueue = this.tillQueue.map(() => 0);
    for (const f of this.fx) this.scene.remove(f.obj);
    this.fx = [];
  }

  setClock(ms: number): void {
    this.now = ms;
  }

  // ---- frame loop ----------------------------------------------------

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dtReal = Math.min(0.1, this.clock.getDelta());
    const dt = dtReal * this.timeScale;

    for (const sh of Array.from(this.shoppers.values())) {
      this.step(sh, dt);
      sh.mixer.update(dt);
      if (!sh.tasks.length && this.now - sh.meta.lastAt > IDLE_LEAVE_MS) {
        sh.meta.step = 'wandered off';
        this.leaveStore(sh);
      }
    }
    for (const m of this.staffMixers) m.update(dtReal);
    this.doorMixer?.update(dt);
    this.stepFx(dt);
    this.updateHover();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };

  private step(sh: Shopper, dt: number): void {
    // keep the basket in hand once they've added something
    if (sh.items > 0 && !sh.basket) {
      const g = this.models.get('shopping-basket');
      if (g) {
        sh.basket = g.scene.clone(true);
        sh.basket.scale.setScalar(0.55);
        sh.basket.position.set(0.22, 0.28, 0.12);
        sh.root.add(sh.basket);
      }
    }
    if (sh.bubbleLeft > 0) {
      sh.bubbleLeft -= dt * 1000;
      if (sh.bubbleLeft <= 0) sh.bubbleEl.style.display = 'none';
    }
    // Instant tasks run back to back; timed ones hold the queue.
    for (let guard = 0; guard < 8 && sh.tasks.length; guard++) {
      const t = sh.tasks[0];
      if (t.k === 'bubble') {
        sh.bubbleEl.innerHTML = t.html;
        sh.bubbleEl.className = `sg-bubble sg-${t.tone}`;
        sh.bubbleEl.style.display = '';
        sh.bubbleLeft = t.ms;
        sh.tasks.shift();
      } else if (t.k === 'face') {
        sh.root.rotation.y = Math.atan2(t.x - sh.root.position.x, t.z - sh.root.position.z);
        sh.tasks.shift();
      } else if (t.k === 'fx') {
        this.spawnFx(sh, t.kind);
        sh.tasks.shift();
      } else if (t.k === 'till') {
        if (sh.till !== null) this.tillQueue[sh.till] = Math.max(0, this.tillQueue[sh.till] - 1);
        sh.till = null;
        sh.tasks.shift();
      } else if (t.k === 'despawn') {
        this.remove(sh);
        return;
      } else break;
    }
    const t = sh.tasks[0];
    if (!t) {
      this.play(sh, 'idle');
      return;
    }
    if (t.k === 'walk') {
      const p = sh.root.position;
      const d = new THREE.Vector3(t.to.x - p.x, 0, t.to.z - p.z);
      const dist = d.length();
      const stepLen = WALK_SPEED * dt;
      this.play(sh, 'walk');
      if (dist <= stepLen) {
        p.set(t.to.x, 0, t.to.z);
        sh.aisle = t.aisle;
        sh.tasks.shift();
      } else {
        d.multiplyScalar(stepLen / dist);
        p.add(d);
        sh.root.rotation.y = Math.atan2(d.x, d.z);
      }
    } else if (t.k === 'anim') {
      if (sh.taskT === 0) this.play(sh, t.name, true);
      sh.taskT += dt * 1000;
      if (sh.taskT >= t.ms) {
        sh.taskT = 0;
        sh.tasks.shift();
      }
    }
  }

  private spawnFx(sh: Shopper, kind: 'coins' | 'smoke'): void {
    const base = sh.root.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    const n = kind === 'coins' ? 14 : 10;
    for (let i = 0; i < n; i++) {
      const obj = kind === 'coins' ? new THREE.Mesh(this.coinGeo, this.coinMat) : new THREE.Mesh(this.smokeGeo, this.smokeMat.clone());
      obj.position.copy(base);
      const a = Math.random() * Math.PI * 2;
      const vel =
        kind === 'coins'
          ? new THREE.Vector3(Math.cos(a) * 0.8, 2 + Math.random() * 1.5, Math.sin(a) * 0.8)
          : new THREE.Vector3(Math.cos(a) * 0.2, 0.6 + Math.random() * 0.4, Math.sin(a) * 0.2);
      this.scene.add(obj);
      this.fx.push({ obj, vel, life: kind === 'coins' ? 1.4 : 2, coin: kind === 'coins' });
    }
  }

  private stepFx(dt: number): void {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.obj);
        this.fx.splice(i, 1);
        continue;
      }
      if (f.coin) f.vel.y -= 6 * dt;
      f.obj.position.addScaledVector(f.vel, dt);
      f.obj.rotation.y += dt * 8;
      if (!f.coin) {
        const m = f.obj.material as THREE.MeshBasicMaterial;
        m.opacity = Math.max(0, f.life / 2) * 0.6;
        f.obj.scale.setScalar(1 + (2 - f.life));
      }
    }
  }

  // ---- hover ---------------------------------------------------------

  private onPointer = (ev: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  };
  private onPointerLeave = () => this.pointer.set(9, 9);

  private hoverTick = 0;
  private updateHover(): void {
    if (++this.hoverTick % 6) return; // ~10 Hz is plenty
    if (this.pointer.x > 1) {
      this.hover = null;
      return;
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const roots = Array.from(this.shoppers.values()).map((s) => s.root);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    if (!hit) {
      this.hover = null;
      return;
    }
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.shopperId) o = o.parent;
    const sh = o ? this.shoppers.get(o.userData.shopperId as string) : undefined;
    if (!sh) {
      this.hover = null;
      return;
    }
    const v = sh.root.position.clone().add(new THREE.Vector3(0, 1, 0)).project(this.camera);
    const r = this.renderer.domElement;
    this.hover = {
      id: sh.id,
      x: ((v.x + 1) / 2) * r.clientWidth,
      y: ((1 - v.y) / 2) * r.clientHeight,
      country: sh.meta.country,
      platform: sh.meta.platform,
      step: sh.meta.step,
      items: sh.items,
      spent: sh.meta.spent,
    };
  }

  getHover(): HoverInfo | null {
    return this.hover;
  }

  stats(): StoreStats {
    let inAisles = 0;
    let atTills = 0;
    let items = 0;
    for (const s of Array.from(this.shoppers.values())) {
      if (s.aisle !== null) inAisles++;
      if (s.till !== null) atTills++;
      items += s.items;
    }
    return { inStore: this.shoppers.size, inAisles, atTills, items };
  }

  // ---- lifecycle -----------------------------------------------------

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    const aspect = w / h;
    const f = 9;
    this.camera.left = -f * aspect;
    this.camera.right = f * aspect;
    this.camera.top = f;
    this.camera.bottom = -f;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.domElement.removeEventListener('pointermove', this.onPointer);
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function humanize(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 48);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
