import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StoreEvent } from '../storeGame/types';
import { Ledger } from './ledger';

/**
 * Afrizonemart World — shared game core. One WebGL renderer + one CSS2D
 * label layer + one isometric camera for every scene (City, Mall), a
 * model cache that auto-centres Kenney models on their footprint, and a
 * single requestAnimationFrame loop.
 *
 * Every scene keeps receiving events and updating even when it isn't on
 * screen, so switching City <-> Mall shows the same shoppers in the same
 * places. Only the active scene is rendered.
 *
 * Never setState per frame from here (HUD nav-hang lesson): the React
 * layer polls `hud()` at a few Hz.
 */

export interface HoverInfo {
  x: number;
  y: number;
  title: string;
  lines: string[];
  action?: { label: string; scene?: SceneId; href?: string };
}

export type SceneId = 'city' | 'mall';

export interface GameScene {
  id: SceneId;
  scene: THREE.Scene;
  /** camera framing when this scene opens */
  home: { target: THREE.Vector3; zoom: number; azimuth: number };
  init(core: GameCore): Promise<void>;
  apply(e: StoreEvent, instant: boolean): void;
  update(dt: number, dtReal: number, now: number): void;
  reset(): void;
  hoverTargets(): THREE.Object3D[];
  hoverInfo(obj: THREE.Object3D): Omit<HoverInfo, 'x' | 'y'> | null;
  /** world point a hover card should anchor to */
  hoverAnchor(obj: THREE.Object3D): THREE.Vector3;
}

const VIEW = 14; // half-height of the ortho frustum at zoom 1, in tiles

export class GameCore {
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  timeScale = 1;
  now = Date.now();
  scenes = new Map<SceneId, GameScene>();
  active: SceneId = 'city';
  ledger = new Ledger();

  private clock = new THREE.Clock();
  private raf = 0;
  private ro: ResizeObserver;
  private loader = new GLTFLoader();
  private models = new Map<string, Promise<GLTF>>();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(9, 9);
  private hover: HoverInfo | null = null;
  private hoverObj: THREE.Object3D | null = null;
  private hoverTick = 0;
  private fly: { from: THREE.Vector3; to: THREE.Vector3; z0: number; z1: number; t: number } | null = null;
  onSceneChange: (id: SceneId) => void = () => {};

  constructor(private container: HTMLElement) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.setSize(w, h);
    Object.assign(this.labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    container.appendChild(this.labels.domElement);

    const aspect = w / Math.max(1, h);
    this.camera = new THREE.OrthographicCamera(-VIEW * aspect, VIEW * aspect, VIEW, -VIEW, -200, 400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minZoom = 0.35;
    this.controls.maxZoom = 6;
    this.controls.maxPolarAngle = Math.PI / 2.6;
    this.controls.minPolarAngle = Math.PI / 7;
    this.controls.screenSpacePanning = true;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    this.renderer.domElement.addEventListener('pointermove', this.onPointer);
    this.renderer.domElement.addEventListener('pointerleave', this.onLeave);
    this.renderer.domElement.addEventListener('click', this.onClick);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
  }

  // ---- models ----------------------------------------------------------

  /** Load (once) a GLB; meshes cast/receive shadows. */
  load(url: string): Promise<GLTF> {
    let p = this.models.get(url);
    if (!p) {
      p = this.loader.loadAsync(url).then((g) => {
        g.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        return g;
      });
      this.models.set(url, p);
    }
    return p;
  }

  /**
   * A static copy of a model, centred on its footprint (x/z centre at the
   * origin, bottom at y=0). Kenney furniture pivots on a corner; this
   * makes every prop placeable by its middle.
   */
  async prop(url: string, scale = 1): Promise<THREE.Object3D> {
    const g = await this.load(url);
    const inner = g.scene.clone(true);
    inner.scale.setScalar(scale);
    const box = new THREE.Box3().setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -box.min.y, -c.z);
    const outer = new THREE.Group();
    outer.add(inner);
    return outer;
  }

  /** An animated character instance (skinned clone + its clips). */
  async character(url: string): Promise<{ root: THREE.Object3D; clips: THREE.AnimationClip[] }> {
    const g = await this.load(url);
    return { root: cloneSkinned(g.scene), clips: g.animations };
  }

  label(html: string, cls: string): CSS2DObject {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    return new CSS2DObject(el);
  }

  // ---- scenes ----------------------------------------------------------

  async add(scene: GameScene): Promise<void> {
    this.scenes.set(scene.id, scene);
    await scene.init(this);
  }

  start(): void {
    this.go(this.active, true);
    this.clock.start();
    this.loop();
  }

  /** Act an event out (and count it). `instant` = jump to its end state. */
  apply(e: StoreEvent, instant = false): void {
    this.ledger.tally(e);
    for (const s of Array.from(this.scenes.values())) s.apply(e, instant);
  }

  /** Count an old event toward today's totals without acting it out. */
  tally(e: StoreEvent): void {
    this.ledger.tally(e);
  }

  reset(): void {
    this.ledger.reset();
    for (const s of Array.from(this.scenes.values())) s.reset();
  }

  /** Switch scene with a short camera glide. */
  go(id: SceneId, immediate = false, focus?: THREE.Vector3): void {
    const s = this.scenes.get(id);
    if (!s) return;
    const prev = this.scenes.get(this.active);
    // CSS2DRenderer only touches labels of the scene it renders, so the old
    // scene's labels would linger on screen; hide them. (The renderer sets
    // display from `object.visible` every frame for the active scene.)
    if (prev && prev !== s) prev.scene.traverse((o) => o instanceof CSS2DObject && (o.element.style.display = 'none'));
    this.active = id;
    const target = focus ?? s.home.target;
    const d = 40;
    const az = s.home.azimuth;
    const offset = new THREE.Vector3(Math.sin(az) * d, d * 0.95, Math.cos(az) * d);
    if (immediate) {
      this.controls.target.copy(target);
      this.camera.position.copy(target).add(offset);
      this.camera.zoom = s.home.zoom;
      this.camera.updateProjectionMatrix();
    } else {
      this.controls.target.copy(target);
      this.camera.position.copy(target).add(offset);
      this.fly = { from: target.clone(), to: target.clone(), z0: s.home.zoom * 0.55, z1: s.home.zoom, t: 0 };
    }
    this.hover = null;
    this.onSceneChange(id);
  }

  // ---- loop ------------------------------------------------------------

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dtReal = Math.min(0.25, this.clock.getDelta()); // tolerate slow machines without slow motion
    const dt = dtReal * this.timeScale;
    for (const s of Array.from(this.scenes.values())) s.update(dt, dtReal, this.now);
    if (this.fly) {
      this.fly.t = Math.min(1, this.fly.t + dtReal / 0.7);
      const k = 1 - Math.pow(1 - this.fly.t, 3);
      this.camera.zoom = this.fly.z0 + (this.fly.z1 - this.fly.z0) * k;
      this.camera.updateProjectionMatrix();
      if (this.fly.t >= 1) this.fly = null;
    }
    this.updateHover();
    this.controls.update();
    const s = this.scenes.get(this.active);
    if (s) {
      this.renderer.render(s.scene, this.camera);
      this.labels.render(s.scene, this.camera);
    }
  };

  // ---- hover / click -----------------------------------------------------

  private onPointer = (ev: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  };
  private onLeave = () => this.pointer.set(9, 9);
  private onClick = () => {
    const a = this.hover?.action;
    if (a?.scene) this.go(a.scene);
    else if (a?.href) window.location.href = a.href;
  };

  private updateHover(): void {
    if (++this.hoverTick % 5) {
      if (this.hover && this.hoverObj) this.placeHover();
      return;
    }
    const s = this.scenes.get(this.active);
    if (!s || this.pointer.x > 1) {
      this.hover = null;
      this.hoverObj = null;
      this.renderer.domElement.style.cursor = '';
      return;
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(s.hoverTargets(), true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.hoverable) o = o.parent;
    const info = o ? s.hoverInfo(o) : null;
    if (!o || !info) {
      this.hover = null;
      this.hoverObj = null;
      this.renderer.domElement.style.cursor = '';
      return;
    }
    this.hoverObj = o;
    this.hover = { ...info, x: 0, y: 0 };
    this.renderer.domElement.style.cursor = info.action ? 'pointer' : '';
    this.placeHover();
  }

  private placeHover(): void {
    const s = this.scenes.get(this.active);
    if (!s || !this.hover || !this.hoverObj) return;
    const v = s.hoverAnchor(this.hoverObj).project(this.camera);
    const el = this.renderer.domElement;
    this.hover.x = ((v.x + 1) / 2) * el.clientWidth;
    this.hover.y = ((1 - v.y) / 2) * el.clientHeight;
  }

  getHover(): HoverInfo | null {
    return this.hover ? { ...this.hover } : null;
  }

  // ---- lifecycle -----------------------------------------------------------

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    const aspect = w / h;
    this.camera.left = -VIEW * aspect;
    this.camera.right = VIEW * aspect;
    this.camera.top = VIEW;
    this.camera.bottom = -VIEW;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.onPointer);
    el.removeEventListener('pointerleave', this.onLeave);
    el.removeEventListener('click', this.onClick);
    this.controls.dispose();
    this.renderer.dispose();
    el.remove();
    this.labels.domElement.remove();
  }
}

/** Sky, sun and ambient light shared by every scene. */
export function addLights(scene: THREE.Scene, size: number, sky = 0xbfe3ff): void {
  scene.background = new THREE.Color(sky);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7a4a, 1.25));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
  sun.position.set(size * 0.6, size * 1.2, size * 0.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.bias = -0.0005;
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = sc.bottom = -size;
  sc.right = sc.top = size;
  sc.near = 1;
  sc.far = size * 4;
  scene.add(sun);
  scene.add(sun.target);
}

/**
 * Merge every static mesh under `group` into one mesh per material, so a
 * scene of ~1,500 placed props renders in a few dozen draw calls instead
 * of thousands. Kenney GLBs use quantized (int16) vertex data, so
 * attributes are widened to float before transforming to world space.
 * Only for things that never move: characters, the door and hover
 * targets stay out of `group`.
 */
export function bakeStatic(group: THREE.Object3D): void {
  group.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const meshes: THREE.Mesh[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(m.material)) return;
    meshes.push(m);
  });
  for (const m of meshes) {
    const src = m.geometry;
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv'] as const) {
      const a = src.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (!a) continue;
      const out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) {
        out[i * a.itemSize] = a.getX(i);
        if (a.itemSize > 1) out[i * a.itemSize + 1] = a.getY(i);
        if (a.itemSize > 2) out[i * a.itemSize + 2] = a.getZ(i);
      }
      g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
    }
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(m.matrixWorld);
    const key = `${(m.material as THREE.Material).uuid}|${Object.keys(g.attributes).sort().join(',')}|${g.index ? 'i' : 'n'}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: m.material as THREE.Material, geos: [] }));
    b.geos.push(g);
  }
  for (const m of meshes) m.removeFromParent();
  for (const { mat, geos } of Array.from(buckets.values())) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // drop now-empty wrapper groups
  const empties: THREE.Object3D[] = [];
  group.traverse((o) => o !== group && !(o as THREE.Mesh).isMesh && o.children.length === 0 && empties.push(o));
  empties.forEach((o) => o.removeFromParent());
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Flag as an <img> (Windows can't draw flag emoji). Safe: cc is validated. */
export function flagImg(cc?: string | null, h = 12): string {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return '🌍';
  return `<img class="wg-flag" src="https://flagcdn.com/h20/${cc.toLowerCase()}.png" alt="${cc.toUpperCase()}" style="height:${h}px">`;
}

export function flag(cc?: string | null): string {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return '🌍';
  return String.fromCodePoint(...cc.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function humanize(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 48);
}

export function money(amt?: number | null, cur?: string | null): string {
  if (amt == null) return '';
  const sym = cur === 'USD' ? '$' : cur === 'GBP' ? '£' : '₦';
  return `${sym}${Math.round(amt).toLocaleString()}`;
}
