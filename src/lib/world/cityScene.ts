import * as THREE from 'three';
import { Actor, Fx } from './actors';
import { addLights, bakeStatic, escapeHtml, flagImg, hash, money, type GameCore, type GameScene } from './core';
import type { StoreEvent } from '../storeGame/types';

/**
 * Afrizonemart City — the world map. Roads on an 8-tile grid, the Mall
 * in the middle, landmark buildings for the rest of the business
 * (Bank = payments, Server Tower = the API, Warehouse, Delivery Depot,
 * Supplier Market), and country gates at the city edge where shoppers
 * arrive. Shoppers are tiny walkers here; a sale sends coins to the Bank
 * and a delivery van out to the buyer's country gate.
 *
 * City scale: 1 unit = one road tile (Kenney City Kit). Roads run along
 * x unrotated (kerbs at z = ±0.5).
 */

const R = (n: string) => `/models/roads/${n}.glb`;
const C = (n: string) => `/models/city/${n}.glb`;
const F = (n: string) => `/models/furniture/${n}.glb`;

const AV = [-12, -4, 4, 12]; // avenue lines (x for north-south, z for east-west)
const EDGE = 17;
const WALKER_SCALE = 0.32;
const WALKER_SPEED = 2.4;
const MALL_DOOR = new THREE.Vector3(0, 0, 3.35);

type Landmark = 'mall' | 'bank' | 'server' | 'warehouse' | 'depot' | 'market';

interface Gate {
  cc: string;
  x: number;
  z: number;
  /** first waypoint inward, on the avenue grid */
  road: THREE.Vector3;
  label: HTMLElement;
}

const GATES: Array<{ cc: string; x: number; z: number }> = [
  { cc: 'NG', x: -4, z: EDGE },
  { cc: 'GH', x: 4, z: EDGE },
  { cc: 'KE', x: EDGE, z: 4 },
  { cc: 'ZA', x: EDGE, z: -4 },
  { cc: 'GB', x: -EDGE, z: 4 },
  { cc: 'US', x: -EDGE, z: -4 },
  { cc: '??', x: 4, z: -EDGE },
];

const COUNTRY_NAME: Record<string, string> = {
  NG: 'Nigeria',
  GH: 'Ghana',
  KE: 'Kenya',
  ZA: 'South Africa',
  GB: 'United Kingdom',
  US: 'United States',
  '??': 'Rest of world',
};

export class CityScene implements GameScene {
  id = 'city' as const;
  scene = new THREE.Scene();
  home = { target: new THREE.Vector3(0, 0, 1), zoom: 0.62, azimuth: Math.PI / 4 };
  private core!: GameCore;
  private fx = new Fx(this.scene);
  private walkers = new Map<string, Actor>();
  private gates: Gate[] = [];
  private landmarks = new Map<Landmark, { obj: THREE.Object3D; pos: THREE.Vector3; label: HTMLElement }>();
  private hoverables: THREE.Object3D[] = [];
  private vans: Array<{ obj: THREE.Object3D; path: THREE.Vector3[]; i: number }> = [];
  private flyers: Array<{ obj: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; onDone: () => void }> = [];
  private alarm: THREE.Mesh | null = null;
  private alarmT = 0;
  private serverLight: THREE.Mesh | null = null;
  private boxes: THREE.Object3D[] = [];
  /** placed scenery that never moves; merged after build */
  private statics = new THREE.Group();
  private treeMats = new Map<number, THREE.Material>();
  private trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230 });
  private coneGeo = new THREE.ConeGeometry(0.32, 0.75, 7);
  private ballGeo = new THREE.IcosahedronGeometry(0.33, 0);
  private trunkGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.35, 6);

  async init(core: GameCore): Promise<void> {
    this.core = core;
    addLights(this.scene, 30, 0xbfe3ff);
    await this.build();
  }

  // ---- building -----------------------------------------------------------

  private async put(url: string, x: number, z: number, rotY = 0, scale = 1, dynamic = false): Promise<THREE.Object3D> {
    const o = await this.core.prop(url, scale);
    o.position.set(x, 0, z);
    o.rotation.y = rotY;
    (dynamic ? this.scene : this.statics).add(o);
    return o;
  }

  private tree(x: number, z: number, s = 1): void {
    const trunk = new THREE.Mesh(this.trunkGeo, this.trunkMat);
    trunk.scale.setScalar(s);
    trunk.position.set(x, 0.175 * s, z);
    const tone = [0x3f9b4f, 0x4caf50, 0x2f8a46, 0x5cbf60][hash(`${x},${z}`) % 4];
    let mat = this.treeMats.get(tone);
    if (!mat) this.treeMats.set(tone, (mat = new THREE.MeshStandardMaterial({ color: tone, flatShading: true })));
    const crown = new THREE.Mesh(hash(`${z},${x}`) % 2 ? this.coneGeo : this.ballGeo, mat);
    crown.scale.setScalar(s);
    crown.position.set(x, 0.6 * s, z);
    this.statics.add(trunk, crown);
  }

  private sign(html: string, cls: string, x: number, y: number, z: number): HTMLElement {
    const l = this.core.label(html, cls);
    l.position.set(x, y, z);
    this.scene.add(l);
    return l.element;
  }

  private onRoad(x: number, z: number): boolean {
    const near = (v: number) => AV.some((a) => Math.abs(v - a) < 0.6);
    return (near(x) && Math.abs(z) <= EDGE + 0.5) || (near(z) && Math.abs(x) <= EDGE + 0.5);
  }

  private async build(): Promise<void> {
    this.scene.add(this.statics);
    // grass + a lake
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x8fca6a, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);
    const lake = new THREE.Mesh(
      new THREE.CircleGeometry(4.5, 40),
      new THREE.MeshStandardMaterial({ color: 0x4fb3e8, roughness: 0.15, metalness: 0.1, emissive: 0x08304a }),
    );
    lake.rotation.x = -Math.PI / 2;
    lake.scale.set(1.4, 1, 1);
    lake.position.set(-22, 0.01, -18);
    this.scene.add(lake);

    const jobs: Array<Promise<unknown>> = [];
    // Roads: crossroads where avenues meet, straights between, out to the edge.
    for (const x of AV) for (const z of AV) jobs.push(this.put(R('road-crossroad'), x, z));
    for (const a of AV) {
      for (let i = -EDGE; i <= EDGE; i++) {
        if (AV.includes(i)) continue;
        jobs.push(this.put(R('road-straight'), i, a, 0)); // east-west avenue at z = a
        jobs.push(this.put(R('road-straight'), a, i, Math.PI / 2)); // north-south avenue at x = a
      }
    }
    // streetlights along avenues
    for (const a of AV) {
      for (let i = -14; i <= 14; i += 4) {
        if (AV.includes(i)) continue;
        jobs.push(this.put(R('light-square'), i, a + 0.62, Math.PI, 1));
        jobs.push(this.put(R('light-square'), a - 0.62, i, Math.PI / 2, 1));
      }
    }
    for (const a of [-4, 4]) jobs.push(this.put(R('traffic-light'), a + 0.62, a + 0.62, -Math.PI / 4));

    // Landmarks on the inner blocks (block centres at -8, 0, 8).
    jobs.push(this.landmark('mall', C('building-n'), 0, 0, 2.5, '🛍 <b>Afrizonemart Mall</b>', 'Tap to go inside', { scene: 'mall' }));
    jobs.push(this.landmark('bank', C('building-skyscraper-a'), 8, -8, 1.9, '🏦 <b>Bank</b>', 'Payments · Squad · M-Pesa'));
    jobs.push(this.landmark('server', C('building-skyscraper-d'), -8, -8, 1.45, '🖥 <b>Server Tower</b>', 'The API · tap for the back room', { href: '/arcade' }));
    jobs.push(this.landmark('warehouse', C('building-k'), -8, 8, 2.6, '📦 <b>Warehouse</b>', 'Orders get packed here'));
    jobs.push(this.landmark('depot', C('building-e'), 8, 8, 2.4, '🚚 <b>Delivery Depot</b>', 'Vans leave for every country'));
    jobs.push(this.landmark('market', C('detail-parasol-a'), 8, 0, 4, '🧺 <b>Supplier Market</b>', 'Where products come from'));
    for (const [x, z] of [
      [6.4, -1.4],
      [9.6, -1.4],
      [6.4, 1.4],
      [9.6, 1.4],
    ])
      jobs.push(this.put(C(hash(`${x}${z}`) % 2 ? 'detail-parasol-b' : 'detail-parasol-a'), x, z, 0, 3.2));
    for (const [x, z] of [
      [-6.4, 9.6],
      [-9.6, 9.6],
      [-9.6, 6.4],
    ])
      for (let k = 0; k < 3; k++) {
        const b = this.put(F('cardboardBoxClosed'), x + k * 0.35, z, (k * Math.PI) / 5, 2.4, true);
        jobs.push(b.then((o) => this.boxes.push(o)));
      }

    // Filler blocks: a 2x2 of shops/offices with awnings.
    const filler = ['a', 'b', 'c', 'd', 'f', 'g', 'h', 'i', 'l', 'm'];
    for (const [bx, bz] of [
      [-8, 0],
      [0, -8],
      [0, 8],
    ]) {
      let k = 0;
      for (const dx of [-1.6, 1.6]) {
        for (const dz of [-1.6, 1.6]) {
          const key = filler[hash(`${bx}${bz}${k++}`) % filler.length];
          jobs.push(this.put(C(`building-${key}`), bx + dx, bz + dz, dz > 0 ? 0 : Math.PI, 1.9));
        }
      }
    }
    // Outer skyline + trees beyond the avenues.
    const low = 'abcdefghijklmn'.split('');
    for (let x = -26; x <= 26; x += 3.2) {
      for (const z of [-21, 21]) {
        if (this.onRoad(x, z)) continue;
        jobs.push(this.put(C(`low-detail-building-${low[hash(`${x}${z}`) % low.length]}`), x, z, z > 0 ? Math.PI : 0, 2.2));
      }
    }
    for (let i = 0; i < 160; i++) {
      const x = ((hash(`tx${i}`) % 520) / 10) - 26;
      const z = ((hash(`tz${i}`) % 520) / 10) - 26;
      const inner = Math.abs(x) < 14 && Math.abs(z) < 14;
      if (this.onRoad(x, z) || (inner && i % 4) || (Math.abs(x + 22) < 7 && Math.abs(z + 18) < 5)) continue;
      if (Math.abs(x) > 19 && Math.abs(z) > 19 && Math.abs(Math.abs(z) - 21) < 1.5) continue;
      this.tree(x, z, inner ? 0.9 : 1.3);
    }
    for (const [x, z] of [
      [-2.6, 4.9],
      [2.6, 4.9],
      [-5.2, -5.2],
      [5.2, 5.2],
    ])
      this.tree(x, z, 1.1);

    // Country gates.
    for (const g of GATES) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
      const across = Math.abs(g.z) === EDGE ? 'x' : 'z';
      for (const s of [-0.75, 0.75]) {
        const p = pole.clone();
        p.position.set(g.x + (across === 'x' ? s : 0), 0.8, g.z + (across === 'z' ? s : 0));
        this.scene.add(p);
      }
      const label = this.sign('', 'wg-gate', g.x, 1.9, g.z);
      const road =
        across === 'x' ? new THREE.Vector3(g.x + 0.3, 0, Math.sign(g.z) * 12) : new THREE.Vector3(Math.sign(g.x) * 12, 0, g.z + 0.3);
      this.gates.push({ ...g, road, label });
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2, 1.8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(g.x, 1, g.z);
      hit.userData = { hoverable: true, kind: 'gate', cc: g.cc };
      this.scene.add(hit);
      this.hoverables.push(hit);
    }

    // Bank alarm ring and server tower beacon.
    this.alarm = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.1, 40),
      new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    this.alarm.rotation.x = -Math.PI / 2;
    this.alarm.position.set(8, 0.03, -8);
    this.scene.add(this.alarm);
    this.serverLight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), new THREE.MeshBasicMaterial({ color: 0x3ddc97 }));
    this.serverLight.position.set(-8, 8.2, -8);
    this.scene.add(this.serverLight);

    // parked vans at the depot
    for (const dx of [-1.2, 0, 1.2]) this.scene.add(this.makeVan(8 + dx, 10.4, 0));

    await Promise.all(jobs);
    bakeStatic(this.statics);
    this.refreshSigns();
  }

  private async landmark(
    key: Landmark,
    url: string,
    x: number,
    z: number,
    scale: number,
    title: string,
    sub: string,
    action?: { scene?: 'mall'; href?: string },
  ): Promise<void> {
    const obj = await this.put(url, x, z, 0, scale, true);
    const box = new THREE.Box3().setFromObject(obj);
    const label = this.sign(`${title}<span>${escapeHtml(sub)}</span>`, `sg-sign wg-landmark wg-${key}`, x, box.max.y + 0.7, z);
    obj.traverse((o) => (o.userData.landmark = key));
    obj.userData = { ...obj.userData, hoverable: true, kind: 'landmark', landmark: key, action };
    this.hoverables.push(obj);
    this.landmarks.set(key, { obj, pos: new THREE.Vector3(x, box.max.y, z), label });
  }

  private makeVan(x: number, z: number, rotY: number): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.42, 0.38), new THREE.MeshStandardMaterial({ color: 0xfbac34 }));
    body.position.set(-0.08, 0.3, 0);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.36), new THREE.MeshStandardMaterial({ color: 0x000066 }));
    cab.position.set(0.42, 0.25, 0);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, metalness: 0.5 }));
    glass.position.set(0.57, 0.32, 0);
    g.add(body, cab, glass);
    const wheel = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12);
    const wm = new THREE.MeshStandardMaterial({ color: 0x222222 });
    for (const [wx, wz] of [
      [-0.3, 0.2],
      [-0.3, -0.2],
      [0.4, 0.2],
      [0.4, -0.2],
    ]) {
      const w = new THREE.Mesh(wheel, wm);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.08, wz);
      g.add(w);
    }
    g.traverse((o) => (o.castShadow = true));
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  }

  // ---- signs -----------------------------------------------------------

  refreshSigns(): void {
    const L = this.core.ledger;
    for (const g of this.gates) {
      const n = g.cc === '??' ? this.otherArrivals() : (L.byCountry.get(g.cc) ?? 0);
      g.label.innerHTML = `${g.cc === '??' ? '🌍' : flagImg(g.cc)} <b>${COUNTRY_NAME[g.cc]}</b><span>${n} today</span>`;
    }
    const bank = this.landmarks.get('bank');
    if (bank)
      bank.label.innerHTML = `🏦 <b>Bank</b><span>${money(L.sales, 'NGN')} · ${L.paid} paid${L.failed ? ` · <em>${L.failed} failed</em>` : ''}</span>`;
    const server = this.landmarks.get('server');
    if (server)
      server.label.innerHTML = `🖥 <b>Server Tower</b><span>${L.errors ? `<em>${L.errors} errors today</em>` : 'all good'} · tap for the back room</span>`;
    const mall = this.landmarks.get('mall');
    if (mall) mall.label.innerHTML = `🛍 <b>Afrizonemart Mall</b><span>${L.visits.size} visits today · tap to go inside</span>`;
  }

  private otherArrivals(): number {
    let n = 0;
    for (const [cc, c] of Array.from(this.core.ledger.byCountry.entries())) if (!GATES.some((g) => g.cc === cc)) n += c;
    return n;
  }

  private gateFor(cc?: string | null): Gate {
    const c = (cc ?? '').toUpperCase();
    return this.gates.find((g) => g.cc === c) ?? this.gates.find((g) => g.cc === '??')!;
  }

  /** gate -> its avenue -> the z=4 avenue -> the mall door */
  private pathIn(g: Gate): THREE.Vector3[] {
    const pts = [new THREE.Vector3(g.x, 0, g.z), g.road.clone()];
    const r = g.road;
    if (Math.abs(g.z) === EDGE) {
      // on a north-south avenue (x = g.x); walk to z = 4.4 then to the door
      pts.push(new THREE.Vector3(r.x, 0, 4.4));
    } else {
      // on an east-west avenue; go to the nearest north-south avenue (x = ±4), then down to z = 4.4
      const ax = Math.sign(g.x) * 4.3;
      pts.push(new THREE.Vector3(ax, 0, r.z));
      pts.push(new THREE.Vector3(ax, 0, 4.4));
    }
    pts.push(new THREE.Vector3(MALL_DOOR.x + ((g.x % 2) * 0.3), 0, 4.4), MALL_DOOR.clone());
    return pts;
  }

  // ---- events ----------------------------------------------------------

  apply(e: StoreEvent, instant: boolean): void {
    if (!this.gates.length) return;
    if (instant) {
      if (e.t === 'pay_ok' || e.t === 'enter' || e.t === 'pay_fail' || e.t === 'error') this.refreshSigns();
      return;
    }
    switch (e.t) {
      case 'enter':
        this.walkIn(e);
        break;
      case 'leave':
        this.walkOut(e);
        break;
      case 'pay_ok':
        this.sale(e);
        break;
      case 'pay_fail':
        this.alarmT = 4;
        this.say('bank', `✖ Payment failed${e.d ? `<small>${escapeHtml(e.d)}</small>` : ''}`, 'bad');
        this.fx.smoke(new THREE.Vector3(8, 4, -8), 0xff4d4d, 2.2);
        break;
      case 'error':
        this.say('server', `⚠ ${escapeHtml(e.d ?? 'Server error')}`, 'bad');
        this.fx.smoke(new THREE.Vector3(-8, 8.3, -8), 0x555555, 2.4);
        if (this.serverLight) (this.serverLight.material as THREE.MeshBasicMaterial).color.set(0xff4d4d);
        setTimeout(() => this.serverLight && (this.serverLight.material as THREE.MeshBasicMaterial).color.set(0x3ddc97), 4000);
        break;
    }
    this.refreshSigns();
  }

  private walkIn(e: StoreEvent): void {
    if (this.walkers.size > 120 || this.walkers.has(e.s)) return;
    const g = this.gateFor(e.c);
    const a = new Actor(e.s, { country: e.c, platform: e.p, step: 'on the way to the mall', lastAt: e.at, items: 0 }, this.core, WALKER_SCALE, WALKER_SPEED, false);
    void a.load();
    a.root.position.set(g.x, 0, g.z);
    this.scene.add(a.root);
    this.hoverables.push(a.root);
    for (const p of this.pathIn(g).slice(1)) a.tasks.push({ k: 'walk', to: p });
    a.tasks.push({ k: 'despawn' });
    this.walkers.set(e.s, a);
  }

  private walkOut(e: StoreEvent): void {
    if (this.walkers.size > 120 || this.walkers.has(e.s)) return;
    const g = this.gateFor(e.c);
    const a = new Actor(e.s, { country: e.c, platform: e.p, step: 'heading home', lastAt: e.at, items: 0 }, this.core, WALKER_SCALE, WALKER_SPEED, false);
    void a.load();
    a.root.position.copy(MALL_DOOR);
    this.scene.add(a.root);
    this.hoverables.push(a.root);
    for (const p of this.pathIn(g).reverse().slice(1)) a.tasks.push({ k: 'walk', to: p });
    a.tasks.push({ k: 'despawn' });
    this.walkers.set(e.s, a);
  }

  private sale(e: StoreEvent): void {
    // a gold coin arcs from the mall to the bank, then a van leaves the depot
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16),
      new THREE.MeshStandardMaterial({ color: 0xfbac34, metalness: 0.8, roughness: 0.25, emissive: 0x553300 }),
    );
    this.scene.add(coin);
    this.flyers.push({
      obj: coin,
      from: new THREE.Vector3(0, 6, 0),
      to: new THREE.Vector3(8, 6.5, -8),
      t: 0,
      onDone: () => {
        this.fx.coins(new THREE.Vector3(8, 5, -8), 2.5, 16);
        this.say('bank', `✅ +${money(e.amt, e.cur)}`, 'good');
        const box = this.boxes[hash(e.s) % Math.max(1, this.boxes.length)];
        if (box) this.fx.coins(box.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 0.8, 4);
        this.sendVan(e.c);
      },
    });
  }

  private sendVan(cc?: string | null): void {
    if (this.vans.length > 8) return;
    const g = this.gateFor(cc);
    const van = this.makeVan(8, 9.6, 0);
    this.scene.add(van);
    // depot -> z=12 avenue -> along to the gate's road -> out through the gate
    const path = [new THREE.Vector3(8, 0, 11.7)];
    if (Math.abs(g.z) === EDGE) {
      path.push(new THREE.Vector3(g.x - 0.25, 0, 11.7), new THREE.Vector3(g.x - 0.25, 0, Math.sign(g.z) * (EDGE + 2)));
    } else {
      const ax = Math.sign(g.x) * 11.7;
      path.push(new THREE.Vector3(ax, 0, 11.7), new THREE.Vector3(ax, 0, g.z - 0.25), new THREE.Vector3(Math.sign(g.x) * (EDGE + 2), 0, g.z - 0.25));
    }
    this.vans.push({ obj: van, path, i: 0 });
  }

  private bubbles = new Map<Landmark, { el: HTMLElement; obj: THREE.Object3D; left: number }>();
  private say(key: Landmark, html: string, tone: 'good' | 'bad'): void {
    const lm = this.landmarks.get(key);
    if (!lm) return;
    let b = this.bubbles.get(key);
    if (!b) {
      const l = this.core.label('', 'sg-bubble');
      l.position.copy(lm.pos).add(new THREE.Vector3(0, 3.4, 0));
      this.scene.add(l);
      b = { el: l.element, obj: l, left: 0 };
      this.bubbles.set(key, b);
    }
    b.el.innerHTML = html;
    b.el.className = `sg-bubble sg-${tone}`;
    b.obj.visible = true;
    b.left = 4;
  }

  reset(): void {
    for (const a of Array.from(this.walkers.values())) a.dispose();
    this.walkers.clear();
    for (const v of this.vans) v.obj.removeFromParent();
    this.vans = [];
    for (const f of this.flyers) f.obj.removeFromParent();
    this.flyers = [];
    this.fx.clear();
    this.hoverables = this.hoverables.filter((o) => !o.userData.actorId);
    if (this.gates.length) this.refreshSigns();
  }

  private signTick = 0;
  update(dt: number, dtReal: number): void {
    for (const [id, a] of Array.from(this.walkers.entries())) {
      a.update(dt);
      if (a.gone) {
        a.dispose();
        this.walkers.delete(id);
        this.hoverables = this.hoverables.filter((o) => o !== a.root);
      }
    }
    for (let i = this.vans.length - 1; i >= 0; i--) {
      const v = this.vans[i];
      const to = v.path[v.i];
      const p = v.obj.position;
      const dx = to.x - p.x;
      const dz = to.z - p.z;
      const d = Math.hypot(dx, dz);
      const step = 3.2 * dt;
      if (d <= step) {
        p.set(to.x, 0, to.z);
        if (++v.i >= v.path.length) {
          v.obj.removeFromParent();
          this.vans.splice(i, 1);
        }
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        v.obj.rotation.y = Math.atan2(-dz, dx);
      }
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t = Math.min(1, f.t + dt / 1.3);
      f.obj.position.lerpVectors(f.from, f.to, f.t);
      f.obj.position.y += Math.sin(f.t * Math.PI) * 5;
      f.obj.rotation.x += dt * 10;
      if (f.t >= 1) {
        f.obj.removeFromParent();
        this.flyers.splice(i, 1);
        f.onDone();
      }
    }
    if (this.alarm) {
      this.alarmT = Math.max(0, this.alarmT - dtReal);
      const m = this.alarm.material as THREE.MeshBasicMaterial;
      m.opacity = this.alarmT > 0 ? 0.35 + 0.35 * Math.sin(performance.now() / 120) : 0;
      this.alarm.scale.setScalar(1 + 0.15 * Math.sin(performance.now() / 200));
    }
    if (this.serverLight) this.serverLight.visible = Math.floor(performance.now() / 600) % 2 === 0;
    for (const b of Array.from(this.bubbles.values())) {
      if (b.left > 0) {
        b.left -= dtReal;
        if (b.left <= 0) b.obj.visible = false;
      }
    }
    if (++this.signTick % 120 === 0) this.refreshSigns();
    this.fx.update(dt);
  }

  hoverTargets(): THREE.Object3D[] {
    return this.hoverables;
  }

  hoverInfo(obj: THREE.Object3D) {
    if (obj.userData.actorId) {
      const a = this.walkers.get(obj.userData.actorId as string);
      if (!a) return null;
      return { title: `${(a.meta.country ?? '').toUpperCase()} Visitor ${a.id.slice(-4)}`, lines: [a.meta.step, a.meta.platform] };
    }
    if (obj.userData.kind === 'gate') {
      const cc = obj.userData.cc as string;
      const n = cc === '??' ? this.otherArrivals() : (this.core.ledger.byCountry.get(cc) ?? 0);
      return { title: `${COUNTRY_NAME[cc]} gate`, lines: [`${n} shoppers arrived today`] };
    }
    if (obj.userData.kind === 'landmark') {
      const L = this.core.ledger;
      const key = obj.userData.landmark as Landmark;
      const lines: Record<Landmark, string[]> = {
        mall: [`${L.visits.size} visits today`, 'Every shopper, live, inside'],
        bank: [`${money(L.sales, 'NGN')} taken today`, `${L.paid} paid · ${L.failed} failed`, L.lastFail ? `Last failure: ${L.lastFail.reason}` : ''],
        server: [`${L.errors} errors today`, L.lastError ? `Last: ${L.lastError.detail}` : 'No errors', 'Opens the Backend Arcade'],
        warehouse: [`${L.paid} orders to pack today`],
        depot: [`${L.paid} deliveries dispatched today`],
        market: ['Suppliers and their products', 'Coming soon: supplier activity'],
      };
      const titles: Record<Landmark, string> = {
        mall: '🛍 Afrizonemart Mall',
        bank: '🏦 Bank',
        server: '🖥 Server Tower',
        warehouse: '📦 Warehouse',
        depot: '🚚 Delivery Depot',
        market: '🧺 Supplier Market',
      };
      const action = obj.userData.action as { scene?: 'mall'; href?: string } | undefined;
      return {
        title: titles[key],
        lines: lines[key].filter(Boolean),
        action: action ? { label: action.scene ? 'Go inside' : 'Open', ...action } : undefined,
      };
    }
    return null;
  }

  hoverAnchor(obj: THREE.Object3D): THREE.Vector3 {
    if (obj.userData.kind === 'landmark') return this.landmarks.get(obj.userData.landmark as Landmark)!.pos.clone();
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);
    p.y += obj.userData.actorId ? 0.5 : 2;
    return p;
  }
}

