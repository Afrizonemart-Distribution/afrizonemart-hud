import * as THREE from 'three';
import { Actor, Fx } from './actors';
import { addLights, bakeStatic, escapeHtml, hash, humanize, money, type GameCore, type GameScene } from './core';
import { MALL, buildMallLayout, inward, shopSpot, type MallLayout, type Shop } from './mallLayout';
import type { CategoryNode, StoreEvent } from '../storeGame/types';
import type { ProductInfo } from '../storeGame/types';

/**
 * The Mall: a big walk-in Afrizonemart where every live visit is a
 * life-size character. Shops are the real top categories; shoppers walk
 * the atrium between them, browse shelves, carry baskets, queue at the
 * Pay Point and walk out. Idle shoppers drift to the café or lounge.
 */

const M = (n: string) => `/models/market/${n}.glb`;
const F = (n: string) => `/models/furniture/${n}.glb`;
const C = (n: string) => `/models/city/${n}.glb`;
const WALK = 2.3; // the mall is ~54 tiles wide; slower reads as stuck
const IDLE_LEAVE_MS = 10 * 60 * 1000;
const MAX_ACTORS = 260;

interface Visit {
  actor: Actor;
  shop: number | null;
  till: number | null;
  idleFor: number; // seconds with nothing to do
}

export class MallScene implements GameScene {
  id = 'mall' as const;
  scene = new THREE.Scene();
  home = { target: new THREE.Vector3(0, 0, 1), zoom: 0.9, azimuth: Math.PI / 4 };
  layout!: MallLayout;
  productInfo: (slug: string) => ProductInfo | null = () => null;
  private core!: GameCore;
  private visits = new Map<string, Visit>();
  private tillQueue: number[] = [];
  private fx = new Fx(this.scene);
  private hoverables: THREE.Object3D[] = [];
  private shopObjs: THREE.Object3D[] = [];
  private spray: THREE.Points | null = null;
  private sprayMeta: Array<{ phase: number; ang: number }> = [];
  private doors: THREE.AnimationMixer[] = [];
  private doorAction: THREE.AnimationAction[] = [];
  private staff: THREE.AnimationMixer[] = [];
  private seats: THREE.Vector3[] = [];
  /** placed scenery that never moves; merged into a few meshes after build */
  private statics = new THREE.Group();

  constructor(private categories: CategoryNode[]) {}

  async init(core: GameCore): Promise<void> {
    this.core = core;
    this.layout = buildMallLayout(this.categories);
    this.tillQueue = this.layout.tills.map(() => 0);
    addLights(this.scene, 34, 0xcfe8ff);
    await this.build();
  }

  // ---- building -----------------------------------------------------------

  private async put(url: string, x: number, z: number, rotY = 0, scale = 1, y = 0, dynamic = false): Promise<THREE.Object3D> {
    const o = await this.core.prop(url, scale);
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    (dynamic ? this.scene : this.statics).add(o);
    return o;
  }

  private sign(html: string, cls: string, x: number, y: number, z: number) {
    const l = this.core.label(html, cls);
    l.position.set(x, y, z);
    this.scene.add(l);
    return l;
  }

  private plane(w: number, d: number, color: string | THREE.Texture, x: number, z: number, y = 0.006) {
    const mat =
      typeof color === 'string'
        ? new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
        : new THREE.MeshStandardMaterial({ map: color, roughness: 0.6 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  private tileTexture(a: string, b: string, repeatX: number, repeatY: number): THREE.CanvasTexture {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    g.fillStyle = a;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = b;
    g.fillRect(0, 0, 32, 32);
    g.fillRect(32, 32, 32, 32);
    g.strokeStyle = 'rgba(0,0,0,0.05)';
    g.strokeRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private awning(shop: Shop): void {
    const colors: Record<string, [string, string]> = {
      drinks: ['#2b9ed9', '#ffffff'],
      grocery: ['#3ddc97', '#ffffff'],
      books: ['#8a5a2b', '#f3e2c4'],
      baby: ['#ff8fb8', '#ffffff'],
      fashion: ['#8e5cf2', '#ffffff'],
      tech: ['#1d2a5c', '#4dd8ff'],
      care: ['#ff9e7a', '#ffffff'],
      home: ['#c9822d', '#fff3e0'],
      general: ['#fbac34', '#000066'],
    };
    const [a, b] = colors[shop.theme.key] ?? colors.general;
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 16;
    const g = cv.getContext('2d')!;
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(i * 8, 0, 8, 16);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(MALL.shopW, 0.06, 0.9),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }),
    );
    const dir = inward(shop);
    mesh.position.set(shop.cx, 1.18, shop.zOpen - dir * 0.35);
    mesh.rotation.x = dir * 0.28;
    mesh.castShadow = true;
    this.scene.add(mesh);
  }

  private async build(): Promise<void> {
    const L = this.layout;
    const W = MALL.halfW;
    this.scene.add(this.statics);

    // Ground: plaza paving outside, polished floor inside.
    this.plane(140, 110, '#cad4bd', 0, 4, 0); // plain: a full-screen textured plane is costly
    this.plane(W * 2, MALL.zFront - MALL.zBack, this.tileTexture('#f4efe6', '#ebe4d6', W * 2, 30), 0, 0);
    this.plane(20, 7, '#e3d8c6', 0, 19, 0.004); // front plaza

    // Perimeter walls (dollhouse height), windows on the facade, doors in the middle.
    const jobs: Array<Promise<unknown>> = [];
    for (let x = -W + 0.5; x < W; x += 1) {
      jobs.push(this.put(Math.round(x) % 4 === 0 ? M('wall-window') : M('wall'), x, MALL.zBack, 0));
      if (Math.abs(x) < 1) {
        jobs.push(
          this.put(M('wall-door-rotate'), x, MALL.zFront, Math.PI, 1, 0, true).then(async (o) => {
            const g = await this.core.load(M('wall-door-rotate'));
            const inner = o.children[0];
            const mixer = new THREE.AnimationMixer(inner);
            const clip = g.animations.find((a) => a.name === 'open-and-close') ?? g.animations[0];
            if (clip) {
              const act = mixer.clipAction(clip);
              act.setLoop(THREE.LoopOnce, 1);
              this.doors.push(mixer);
              this.doorAction.push(act);
            }
          }),
        );
      } else {
        jobs.push(this.put(Math.abs(x) < 9.5 ? M('wall-window') : M('wall'), x, MALL.zFront, Math.PI));
      }
    }
    for (let z = MALL.zBack + 0.5; z < MALL.zFront; z += 1) {
      jobs.push(this.put(M('wall'), -W, z, Math.PI / 2));
      jobs.push(this.put(M('wall'), W, z, -Math.PI / 2));
    }

    // Shops.
    for (const shop of L.shops) jobs.push(this.buildShop(shop));

    // Atrium: fountain, café, lounge, benches, plants.
    this.buildFountain();
    jobs.push(this.buildCafe());
    jobs.push(this.buildLounge());
    for (const x of [-8, -5, 5, 8]) {
      for (const z of [-4.2, 4.2]) {
        jobs.push(this.put(F('benchCushion'), x, z, z < 0 ? 0 : Math.PI, 1.5));
        this.seats.push(new THREE.Vector3(x, 0, z + (z < 0 ? 0.35 : -0.35)));
      }
    }
    for (const x of [-10.5, -3, 3, 10.5]) {
      jobs.push(this.put(F('pottedPlant'), x, -5.6, 0, 2));
      jobs.push(this.put(F('pottedPlant'), x, 5.6, 0, 2));
    }
    for (const x of [-20, 20]) jobs.push(this.put(F('trashcan'), x, 6.3, 0, 1.3));
    for (const x of [-6.5, 6.5]) jobs.push(this.put(F('lampRoundFloor'), x, 0, 0, 1.6));

    // Pay Point just inside the doors.
    L.tills.forEach((t, i) => {
      jobs.push(this.put(M('cash-register'), t.x, t.z, Math.PI));
      jobs.push(
        this.core.character(M('character-employee')).then(({ root, clips }) => {
          root.position.set(t.x, 0, t.z + 0.75);
          root.rotation.y = Math.PI;
          this.scene.add(root);
          const mixer = new THREE.AnimationMixer(root);
          mixer.clipAction(clips.find((c) => c.name === 'idle') ?? clips[0]).play();
          this.staff.push(mixer);
        }),
      );
      this.sign(`${i + 1}`, 'wg-till', t.x, 1.0, t.z);
    });
    const pay = this.sign('<b>Pay Point</b><span>Squad · M-Pesa · Card</span>', 'sg-sign sg-bank', 0, 1.9, 10.8);
    pay.element.style.pointerEvents = 'none';
    const payHit = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 1.5), new THREE.MeshBasicMaterial({ visible: false }));
    payHit.position.set(0, 0.6, 10.8);
    payHit.userData = { hoverable: true, kind: 'pay' };
    this.scene.add(payHit);
    this.hoverables.push(payHit);

    // Outside: plaza parasols, big mall sign.
    for (const [x, z] of [
      [-7, 19],
      [7, 19],
      [-11, 21],
      [11, 21],
    ]) {
      jobs.push(this.put(C('detail-parasol-a'), x, z, 0, 3));
      jobs.push(this.put(F('tableRound'), x, z, 0, 1.1));
    }
    for (const x of [-4, 4]) jobs.push(this.put(F('pottedPlant'), x, 16.2, 0, 2.2));
    this.sign('<b>AFRIZONEMART MALL</b><span>open 24/7 · live</span>', 'sg-sign wg-mall', 0, 2.6, MALL.zFront + 0.2);

    await Promise.all(jobs);
    bakeStatic(this.statics);
  }

  private async buildShop(shop: Shop): Promise<void> {
    const dir = inward(shop); // -1 back row (wall at -z), +1 front row
    const depth = MALL.rowDepth;
    const zMid = (shop.zWall + shop.zOpen) / 2;
    this.plane(MALL.shopW, depth, shop.theme.floor, shop.cx, zMid, 0.01);

    const jobs: Array<Promise<unknown>> = [];
    // Side walls.
    for (let k = 0; k < depth; k++) {
      const z = shop.zWall - dir * (k + 0.5);
      jobs.push(this.put(M('wall'), shop.cx - MALL.shopW / 2, z, Math.PI / 2));
      jobs.push(this.put(M('wall'), shop.cx + MALL.shopW / 2, z, -Math.PI / 2));
    }
    // Shopfront columns, awning, sign.
    jobs.push(this.put(M('column'), shop.cx - MALL.shopW / 2, shop.zOpen, 0));
    jobs.push(this.put(M('column'), shop.cx + MALL.shopW / 2, shop.zOpen, 0));
    this.awning(shop);
    this.sign(
      `<b>${escapeHtml(shop.name)}</b><span>${shop.productCount.toLocaleString()} products</span>`,
      'sg-sign wg-shop',
      shop.cx,
      1.95,
      shop.zOpen,
    );

    // Back-wall shelf run facing into the shop.
    const faceIn = dir === -1 ? 0 : Math.PI;
    const shelves = shop.theme.shelves;
    for (let i = 0; i < 7; i++) {
      jobs.push(this.put(shelves[i % shelves.length], shop.cx - 3.3 + i * 1.1, shop.zWall - dir * 0.45, faceIn));
    }
    // Island: two back-to-back runs.
    const zIsland = shop.zWall - dir * 3.65;
    for (let i = 0; i < 3; i++) {
      const x = shop.cx - 1.1 + i * 1.1;
      jobs.push(this.put(shelves[(i + 1) % shelves.length], x, zIsland + dir * 0.36, faceIn));
      jobs.push(this.put(shelves[i % shelves.length], x, zIsland - dir * 0.36, faceIn + Math.PI));
    }
    // Decor near the front, cashier on the right.
    const zFrontIn = shop.zOpen + dir * 1.1;
    const spots = [shop.cx - 3, shop.cx - 1.4, shop.cx + 1.2];
    shop.theme.decor.forEach((d, i) => {
      jobs.push(this.put(d.url, spots[i % spots.length], zFrontIn + (i >= spots.length ? dir * 0.8 : 0), faceIn + Math.PI, d.scale ?? 1.2));
    });
    jobs.push(this.put(M('cash-register'), shop.cx + 3, zFrontIn, faceIn + Math.PI * 0.5));
    jobs.push(
      this.core.character(M('character-employee')).then(({ root, clips }) => {
        root.position.set(shop.cx + 3.6, 0, zFrontIn);
        root.rotation.y = -Math.PI / 2;
        this.scene.add(root);
        const mixer = new THREE.AnimationMixer(root);
        mixer.clipAction(clips.find((c) => c.name === 'idle') ?? clips[0]).play();
        this.staff.push(mixer);
      }),
    );

    // Invisible hover box for the shop.
    const hit = new THREE.Mesh(new THREE.BoxGeometry(MALL.shopW, 1.4, depth), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(shop.cx, 0.7, zMid);
    hit.userData = { hoverable: true, kind: 'shop', shop: this.layout.shops.indexOf(shop) };
    this.scene.add(hit);
    this.shopObjs.push(hit);
    await Promise.all(jobs);
  }

  private buildFountain(): void {
    const { x, z, r } = MALL.fountain;
    const stone = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.6 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.1, 0.35, 40), stone);
    basin.position.set(x, 0.175, z);
    basin.castShadow = basin.receiveShadow = true;
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(r - 0.15, r - 0.15, 0.05, 40),
      new THREE.MeshStandardMaterial({ color: 0x4dc3ff, roughness: 0.1, metalness: 0.2, emissive: 0x0a3a5a }),
    );
    water.position.set(x, 0.33, z);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.1, 16), stone);
    pillar.position.set(x, 0.55, z);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.35, 0.18, 24), stone);
    bowl.position.set(x, 1.1, z);
    this.scene.add(basin, water, pillar, bowl);
    // one particle cloud = one draw call (40 separate droplets halved the frame rate)
    const n = 60;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.spray = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcff0ff, size: 0.09, sizeAttenuation: true }));
    for (let i = 0; i < n; i++) this.sprayMeta.push({ phase: Math.random(), ang: Math.random() * Math.PI * 2 });
    this.scene.add(this.spray);
    this.seats.push(new THREE.Vector3(x + r + 0.4, 0, z), new THREE.Vector3(x - r - 0.4, 0, z));
  }

  private async buildCafe(): Promise<void> {
    const { x, z } = MALL.cafe;
    this.plane(9, 7, '#e9d9c0', x, z, 0.008);
    const jobs: Array<Promise<unknown>> = [];
    for (let i = 0; i < 4; i++) jobs.push(this.put(F('kitchenBar'), x - 1.3 + i * 0.86, z - 2.4, 0, 2));
    jobs.push(this.put(F('kitchenCoffeeMachine'), x - 0.6, z - 2.45, 0, 2, 0.84));
    for (let i = 0; i < 4; i++) {
      jobs.push(this.put(F('stoolBar'), x - 1.3 + i * 0.86, z - 1.6, Math.PI, 1.6));
      this.seats.push(new THREE.Vector3(x - 1.3 + i * 0.86, 0, z - 1.4));
    }
    for (const [tx, tz] of [
      [x - 2.5, z + 0.8],
      [x + 1.5, z + 0.8],
      [x - 0.5, z + 2.6],
    ]) {
      jobs.push(this.put(F('tableRound'), tx, tz, 0, 1.4));
      jobs.push(this.put(F('chairRounded'), tx - 0.75, tz, Math.PI / 2, 1.6));
      jobs.push(this.put(F('chairRounded'), tx + 0.75, tz, -Math.PI / 2, 1.6));
      this.seats.push(new THREE.Vector3(tx - 0.95, 0, tz), new THREE.Vector3(tx + 0.95, 0, tz));
    }
    this.sign('<b>Afrizone Café</b><span>zobo · coffee · chin chin</span>', 'sg-sign wg-cafe', x, 1.9, z - 2.6);
    await Promise.all(jobs);
  }

  private async buildLounge(): Promise<void> {
    const { x, z } = MALL.lounge;
    const jobs: Array<Promise<unknown>> = [
      this.put(F('rugRectangle'), x, z, 0, 3),
      this.put(F('loungeSofa'), x, z - 1.5, 0, 1.6),
      this.put(F('loungeSofa'), x, z + 1.5, Math.PI, 1.6),
      this.put(F('tableCoffeeGlass'), x, z, 0, 1.6),
      this.put(F('lampSquareFloor'), x - 2.6, z - 1.5, 0, 1.6),
      this.put(F('lampSquareFloor'), x + 2.6, z + 1.5, 0, 1.6),
      this.put(F('televisionModern'), x + 3.4, z, -Math.PI / 2, 1.6),
      this.put(F('pottedPlant'), x - 3, z + 2, 0, 2),
      this.put(F('pottedPlant'), x + 3, z - 2, 0, 2),
    ];
    this.seats.push(new THREE.Vector3(x - 0.4, 0, z - 1.2), new THREE.Vector3(x + 0.4, 0, z + 1.2));
    this.sign('<b>Lounge</b>', 'sg-tag', x, 1.4, z - 2.2);
    await Promise.all(jobs);
  }

  // ---- shoppers ----------------------------------------------------------

  private shopFor(e: StoreEvent): number {
    const info = e.prod ? this.productInfo(e.prod) : null;
    const slug = e.cat ?? info?.categorySlug;
    const i = slug ? this.layout.shopOf.get(slug) : undefined;
    return i ?? hash(e.prod ?? e.cat ?? e.s) % Math.max(1, this.layout.shops.length);
  }

  /** Route avoiding the fountain; leaves shops through their door. */
  private walk(v: Visit, to: THREE.Vector3, toShop: number | null): void {
    const a = v.actor;
    const pts: THREE.Vector3[] = [];
    const last = this.plannedEnd(v);
    let from = last.pos;
    if (last.shop !== null && last.shop !== toShop) {
      const d = this.layout.shops[last.shop].door;
      pts.push(new THREE.Vector3(d.x, 0, d.z));
      from = pts[pts.length - 1];
    }
    const target = toShop !== null && last.shop !== toShop ? this.layout.shops[toShop].door : null;
    const legEnd = target ? new THREE.Vector3(target.x, 0, target.z) : to;
    // fountain detour
    const f = MALL.fountain;
    const mx = (from.x + legEnd.x) / 2;
    const mz = (from.z + legEnd.z) / 2;
    const crosses = Math.hypot(mx - f.x, mz - f.z) < f.r + 1.2 || this.segNear(from, legEnd, f.x, f.z, f.r + 0.9);
    if (crosses) pts.push(new THREE.Vector3(f.x + (from.x + legEnd.x >= 0 ? 1 : -1) * (f.r + 1.6), 0, f.z + (mz >= 0 ? 1 : -1) * (f.r + 1.2)));
    if (target) pts.push(legEnd);
    pts.push(to);
    for (const p of pts) a.tasks.push({ k: 'walk', to: p });
    a.tasks.push({ k: 'do', fn: () => (v.shop = toShop) });
  }

  private segNear(a: THREE.Vector3, b: THREE.Vector3, x: number, z: number, r: number): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    return Math.hypot(a.x + t * dx - x, a.z + t * dz - z) < r;
  }

  private plannedEnd(v: Visit): { pos: THREE.Vector3; shop: number | null } {
    let shop = v.shop;
    let pos = v.actor.root.position.clone();
    for (const t of v.actor.tasks) {
      if (t.k === 'walk') pos = t.to.clone();
    }
    // the last 'do' that sets shop is our own marker; approximate by position
    for (let i = this.layout.shops.length - 1; i >= 0; i--) {
      const s = this.layout.shops[i];
      const inX = Math.abs(pos.x - s.cx) < MALL.shopW / 2;
      const inZ = s.row === 'back' ? pos.z < s.zOpen : pos.z > s.zOpen;
      if (inX && inZ) {
        shop = i;
        return { pos, shop };
      }
    }
    if (v.actor.tasks.length) shop = null;
    return { pos, shop };
  }

  private spawn(e: StoreEvent): Visit | null {
    if (this.visits.size >= MAX_ACTORS) return null;
    const actor = new Actor(e.s, { country: e.c, platform: e.p, step: 'arriving', lastAt: e.at, items: 0 }, this.core, 1, WALK, true);
    void actor.load();
    actor.root.position.set((hash(e.s) % 9) - 4, 0, MALL.entrance.zOutside + 2);
    actor.root.rotation.y = Math.PI;
    this.scene.add(actor.root);
    this.hoverables.push(actor.root);
    const v: Visit = { actor, shop: null, till: null, idleFor: 0 };
    this.visits.set(e.s, v);
    actor.tasks.push({ k: 'walk', to: new THREE.Vector3((hash(e.s) % 3) - 1, 0, MALL.entrance.zOutside - 2.5) });
    actor.tasks.push({ k: 'do', fn: () => this.doorAction.forEach((d) => d.reset().play()) });
    actor.tasks.push({ k: 'walk', to: new THREE.Vector3((hash(e.s) % 5) - 2, 0, MALL.entrance.zInside - 2.5) });
    return v;
  }

  private goTill(v: Visit): void {
    if (v.till !== null) return;
    let best = 0;
    for (let i = 1; i < this.tillQueue.length; i++) if (this.tillQueue[i] < this.tillQueue[best]) best = i;
    v.till = best;
    const q = this.tillQueue[best]++;
    const t = this.layout.tills[best];
    this.walk(v, new THREE.Vector3(t.x, 0, t.z - 0.8 - q * 0.55), null);
    v.actor.tasks.push({ k: 'face', x: t.x, z: t.z + 5 });
  }

  private freeTill(v: Visit): void {
    if (v.till === null) return;
    this.tillQueue[v.till] = Math.max(0, this.tillQueue[v.till] - 1);
    v.till = null;
  }

  private leave(v: Visit): void {
    const a = v.actor;
    a.tasks.push({ k: 'do', fn: () => this.freeTill(v) });
    this.walk(v, new THREE.Vector3((hash(a.id) % 3) - 1, 0, MALL.entrance.zInside), null);
    a.tasks.push({ k: 'do', fn: () => this.doorAction.forEach((d) => d.reset().play()) });
    a.tasks.push({ k: 'walk', to: new THREE.Vector3((hash(a.id) % 9) - 4, 0, MALL.entrance.zOutside + 3) });
    a.tasks.push({ k: 'despawn' });
  }

  apply(e: StoreEvent, instant: boolean): void {
    if (!this.layout) return;
    let v = this.visits.get(e.s);
    if (!v) {
      if (e.t === 'leave' || e.t === 'pay_ok') return;
      v = this.spawn(e) ?? undefined;
      if (!v) return;
    }
    const a = v.actor;
    a.meta.lastAt = e.at;
    if (e.c && e.c !== a.meta.country) {
      a.meta.country = e.c;
      a.refreshTag();
    }
    v.idleFor = 0;
    if (instant) return this.applyInstant(v, e);

    switch (e.t) {
      case 'enter':
        a.meta.step = 'just walked in';
        break;
      case 'aisle': {
        const i = this.shopFor(e);
        const s = this.layout.shops[i];
        a.meta.step = `browsing ${s.name}`;
        const dir = inward(s);
        this.walk(v, new THREE.Vector3(s.cx + ((hash(e.s + e.at) % 5) - 2) * 0.6, 0, s.zOpen + dir * 1.8), i);
        break;
      }
      case 'shelf': {
        const i = this.shopFor(e);
        const s = this.layout.shops[i];
        const name = (e.prod && this.productInfo(e.prod)?.name) || humanize(e.prod ?? '');
        a.meta.step = `looking at ${name}`;
        const spot = shopSpot(s, e.prod ?? e.s, hash(e.prod ?? e.s));
        this.walk(v, new THREE.Vector3(spot.x, 0, spot.z), i);
        a.tasks.push({ k: 'face', x: spot.faceX, z: spot.faceZ });
        a.say(`👀 ${escapeHtml(name)}`, 'info', 3500);
        a.tasks.push({ k: 'anim', name: 'interact-right', ms: 1400 });
        break;
      }
      case 'search':
        a.meta.step = `searching “${e.q ?? ''}”`;
        a.say(`🔍 ${escapeHtml(e.q ?? '')}`, 'search', 4000);
        a.tasks.push({ k: 'wait', ms: 500 });
        break;
      case 'cart_add': {
        const name = (e.prod && this.productInfo(e.prod)?.name) || humanize(e.prod ?? '');
        a.meta.step = `added ${name}`;
        a.tasks.push({ k: 'anim', name: 'pick-up', ms: 1100 });
        a.tasks.push({ k: 'do', fn: () => a.setItems(a.meta.items + 1) });
        a.say(`🧺 +1 ${escapeHtml(name)}`, 'good', 2500);
        break;
      }
      case 'checkout':
        a.meta.step = 'queueing to pay';
        a.meta.spent = money(e.amt, e.cur);
        this.goTill(v);
        a.say(`🧾 ${money(e.amt, e.cur) || 'checking out'}`, 'info', 3000);
        break;
      case 'pay_ok':
        a.meta.step = 'paid';
        a.meta.spent = money(e.amt, e.cur);
        this.goTill(v);
        a.tasks.push({ k: 'anim', name: 'emote-yes', ms: 1400 });
        a.tasks.push({ k: 'do', fn: () => this.fx.coins(a.root.position.clone().add(new THREE.Vector3(0, 0.9, 0))) });
        a.say(`✅ Paid ${money(e.amt, e.cur)}`, 'good', 3500);
        this.leave(v);
        break;
      case 'pay_fail':
        a.meta.step = 'payment failed';
        this.goTill(v);
        a.tasks.push({ k: 'anim', name: 'emote-no', ms: 1400 });
        a.tasks.push({ k: 'do', fn: () => this.fx.smoke(a.root.position.clone().add(new THREE.Vector3(0, 0.9, 0))) });
        a.say(`✖ Payment failed${e.d ? `<small>${escapeHtml(e.d)}</small>` : ''}`, 'bad', 6000);
        break;
      case 'error':
        a.meta.step = 'hit an error';
        a.tasks.push({ k: 'do', fn: () => this.fx.smoke(a.root.position.clone().add(new THREE.Vector3(0, 0.9, 0))) });
        a.tasks.push({ k: 'anim', name: 'emote-no', ms: 1200 });
        a.say(`⚠ Error<small>${escapeHtml(e.d ?? '')}</small>`, 'bad', 5000);
        break;
      case 'leave':
        a.meta.step = 'leaving';
        this.leave(v);
        break;
    }
  }

  private applyInstant(v: Visit, e: StoreEvent): void {
    const a = v.actor;
    a.tasks = [];
    if (e.t === 'aisle' || e.t === 'shelf') {
      const i = this.shopFor(e);
      const s = this.layout.shops[i];
      const spot = shopSpot(s, e.prod ?? e.s, hash(e.prod ?? e.s));
      a.root.position.set(spot.x, 0, spot.z);
      v.shop = i;
    } else if (e.t === 'cart_add') {
      a.setItems(a.meta.items + 1);
    } else if (e.t === 'checkout' || e.t === 'pay_fail') {
      if (v.till === null) {
        let best = 0;
        for (let i = 1; i < this.tillQueue.length; i++) if (this.tillQueue[i] < this.tillQueue[best]) best = i;
        v.till = best;
        this.tillQueue[best]++;
      }
      const t = this.layout.tills[v.till];
      a.root.position.set(t.x, 0, t.z - 0.8);
      v.shop = null;
    } else if (e.t === 'pay_ok' || e.t === 'leave') {
      this.remove(v);
    } else if (e.t === 'enter') {
      a.root.position.set((hash(e.s) % 7) - 3, 0, MALL.entrance.zInside - 2.5);
    }
  }

  private remove(v: Visit): void {
    this.freeTill(v);
    v.actor.dispose();
    this.hoverables = this.hoverables.filter((o) => o !== v.actor.root);
    this.visits.delete(v.actor.id);
  }

  reset(): void {
    for (const v of Array.from(this.visits.values())) this.remove(v);
    this.tillQueue = this.tillQueue.map(() => 0);
    this.fx.clear();
  }

  update(dt: number, dtReal: number, now: number): void {
    for (const v of Array.from(this.visits.values())) {
      const a = v.actor;
      a.update(dt);
      if (a.gone) {
        this.remove(v);
        continue;
      }
      if (!a.busy) {
        v.idleFor += dt;
        if (now - a.meta.lastAt > IDLE_LEAVE_MS) {
          a.meta.step = 'wandered off';
          this.leave(v);
        } else if (v.idleFor > 25 && v.till === null && Math.random() < 0.004) {
          // ambience: idle shoppers drift to a seat in the atrium
          const seat = this.seats[hash(a.id + Math.floor(now / 60000)) % this.seats.length];
          a.meta.step = 'taking a break';
          this.walk(v, seat, null);
          a.tasks.push({ k: 'anim', name: 'sit', ms: 6000 });
          v.idleFor = 0;
        }
      }
    }
    for (const m of this.doors) m.update(dt);
    for (const m of this.staff) m.update(dtReal);
    // fountain spray
    const t = performance.now() / 1000;
    const f = MALL.fountain;
    if (this.spray) {
      const pos = this.spray.geometry.getAttribute('position') as THREE.BufferAttribute;
      this.sprayMeta.forEach((d, i) => {
        const p = (t * 0.7 + d.phase) % 1;
        const r = 0.15 + p * 0.95;
        pos.setXYZ(i, f.x + Math.cos(d.ang) * r, 1.2 + Math.sin(p * Math.PI) * 0.55 - p * 0.7, f.z + Math.sin(d.ang) * r);
      });
      pos.needsUpdate = true;
    }
    this.fx.update(dt);
  }

  hoverTargets(): THREE.Object3D[] {
    return [...this.hoverables, ...this.shopObjs];
  }

  hoverInfo(obj: THREE.Object3D) {
    if (obj.userData.actorId) {
      const v = this.visits.get(obj.userData.actorId as string);
      if (!v) return null;
      const m = v.actor.meta;
      return {
        title: `Visitor ${v.actor.id.slice(-4)}`,
        lines: [
          `${m.country ?? 'Unknown country'} · ${m.platform}`,
          m.step,
          `🧺 ${m.items} item${m.items === 1 ? '' : 's'}${m.spent ? ` · ${m.spent}` : ''}`,
        ],
      };
    }
    if (obj.userData.kind === 'shop') {
      const s = this.layout.shops[obj.userData.shop as number];
      const inside = Array.from(this.visits.values()).filter((v) => v.shop === obj.userData.shop).length;
      return { title: s.name, lines: [`${s.productCount.toLocaleString()} products`, `${inside} shopper${inside === 1 ? '' : 's'} inside now`] };
    }
    if (obj.userData.kind === 'pay') {
      const q = this.tillQueue.reduce((x, y) => x + y, 0);
      return { title: 'Pay Point', lines: [`${q} in the queue`, 'Checkout and payment outcomes land here'] };
    }
    return null;
  }

  hoverAnchor(obj: THREE.Object3D): THREE.Vector3 {
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);
    p.y += obj.userData.actorId ? 1.2 : 1.6;
    return p;
  }

  /** Who is where, for the game HUD. */
  counts(): { inMall: number; inShops: number; atTills: number; items: number; byShop: number[] } {
    const byShop = this.layout.shops.map(() => 0);
    let inShops = 0;
    let atTills = 0;
    let items = 0;
    for (const v of Array.from(this.visits.values())) {
      if (v.shop !== null) {
        inShops++;
        byShop[v.shop]++;
      }
      if (v.till !== null) atTills++;
      items += v.actor.meta.items;
    }
    return { inMall: this.visits.size, inShops, atTills, items, byShop };
  }
}
