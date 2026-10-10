import * as THREE from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { escapeHtml, flagImg, hash, type GameCore } from './core';

/**
 * A walking character with a to-do list: walk waypoints, play an
 * animation, show a speech bubble, face a point, run a callback, vanish.
 * Used for shoppers in both the Mall (life size) and the City (tiny).
 */

export const CHAR_MODELS = [
  'female-a',
  'female-b',
  'female-c',
  'female-d',
  'female-e',
  'female-f',
  'male-a',
  'male-b',
  'male-c',
  'male-d',
  'male-e',
  'male-f',
].map((m) => `/models/characters/character-${m}.glb`);

export type Tone = 'info' | 'good' | 'bad' | 'search';

export type Task =
  | { k: 'walk'; to: THREE.Vector3 }
  | { k: 'anim'; name: string; ms: number }
  | { k: 'wait'; ms: number }
  | { k: 'face'; x: number; z: number }
  | { k: 'bubble'; html: string; tone: Tone; ms: number }
  | { k: 'do'; fn: () => void }
  | { k: 'despawn' };

export interface ActorMeta {
  country?: string | null;
  platform: string;
  step: string;
  lastAt: number;
  items: number;
  spent?: string;
}

export class Actor {
  root = new THREE.Group();
  tasks: Task[] = [];
  gone = false;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  private taskT = 0;
  private bubble: CSS2DObject;
  private bubbleLeft = 0;
  private tag: CSS2DObject;
  private basket: THREE.Object3D | null = null;

  constructor(
    public id: string,
    public meta: ActorMeta,
    private core: GameCore,
    private scale: number,
    private speed: number, // tiles per second at 1x
    showTag: boolean,
  ) {
    this.root.userData.hoverable = true;
    this.root.userData.actorId = id;
    this.bubble = core.label('', 'sg-bubble');
    this.bubble.position.set(0, 1.12 * scale, 0);
    this.bubble.visible = false;
    this.root.add(this.bubble);
    this.tag = core.label(this.tagHtml(), 'wg-name');
    this.tag.position.set(0, 0.95 * scale, 0);
    this.tag.visible = showTag;
    this.root.add(this.tag);
  }

  private tagHtml(): string {
    const p = this.meta.platform === 'ios' ? '' : this.meta.platform === 'android' ? '🤖' : this.meta.platform === 'web' ? '💻' : '';
    return `${flagImg(this.meta.country, 9)} ${escapeHtml(this.id.slice(-4))}${p ? ` ${p}` : ''}`;
  }

  refreshTag(): void {
    this.tag.element.innerHTML = this.tagHtml();
  }

  async load(): Promise<void> {
    const { root, clips } = await this.core.character(CHAR_MODELS[hash(this.id) % CHAR_MODELS.length]);
    root.scale.setScalar(this.scale);
    this.root.add(root);
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
    this.play('idle');
  }

  play(name: string, once = false): void {
    if (!this.mixer || (this.current === name && !once)) return;
    const next = this.actions.get(name) ?? this.actions.get('idle');
    if (!next) return;
    const prev = this.actions.get(this.current);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.fadeIn(0.15).play();
    if (prev && prev !== next) prev.fadeOut(0.15);
    this.current = name;
  }

  say(html: string, tone: Tone, ms: number): void {
    this.tasks.push({ k: 'bubble', html, tone, ms });
  }

  setItems(n: number): void {
    this.meta.items = n;
  }

  get busy(): boolean {
    return this.tasks.length > 0;
  }

  update(dt: number): void {
    if (this.gone) return;
    if (this.bubbleLeft > 0) {
      this.bubbleLeft -= dt * 1000;
      if (this.bubbleLeft <= 0) this.bubble.visible = false;
    }
    if (this.meta.items > 0 && !this.basket) void this.addBasket();

    for (let guard = 0; guard < 10 && this.tasks.length; guard++) {
      const t = this.tasks[0];
      if (t.k === 'bubble') {
        this.bubble.element.innerHTML = t.html;
        this.bubble.element.className = `sg-bubble sg-${t.tone}`;
        this.bubble.visible = true;
        this.bubbleLeft = t.ms;
      } else if (t.k === 'face') {
        this.root.rotation.y = Math.atan2(t.x - this.root.position.x, t.z - this.root.position.z);
      } else if (t.k === 'do') {
        t.fn();
      } else if (t.k === 'despawn') {
        this.gone = true;
        return;
      } else break;
      this.tasks.shift();
    }

    const t = this.tasks[0];
    if (!t) this.play('idle');
    else if (t.k === 'walk') {
      const p = this.root.position;
      const dx = t.to.x - p.x;
      const dz = t.to.z - p.z;
      const dist = Math.hypot(dx, dz);
      const step = this.speed * dt;
      this.play('walk');
      if (dist <= step) {
        p.set(t.to.x, p.y, t.to.z);
        this.tasks.shift();
      } else {
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        this.root.rotation.y = Math.atan2(dx, dz);
      }
    } else if (t.k === 'anim' || t.k === 'wait') {
      if (this.taskT === 0) this.play(t.k === 'anim' ? t.name : 'idle', t.k === 'anim');
      this.taskT += dt * 1000;
      if (this.taskT >= t.ms) {
        this.taskT = 0;
        this.tasks.shift();
      }
    }
    this.mixer?.update(dt);
  }

  private basketLoading = false;
  private async addBasket(): Promise<void> {
    if (this.basketLoading) return;
    this.basketLoading = true;
    const b = await this.core.prop('/models/market/shopping-basket.glb', 0.5);
    b.position.set(0.24 * this.scale, 0.3 * this.scale, 0.1 * this.scale);
    b.scale.multiplyScalar(this.scale);
    this.basket = b;
    this.root.add(b);
  }

  dispose(): void {
    this.bubble.element.remove();
    this.tag.element.remove();
    this.root.removeFromParent();
    this.mixer?.stopAllAction();
  }
}

/** Little particle bursts: coins for a sale, smoke for trouble. */
export class Fx {
  private items: Array<{ obj: THREE.Mesh; vel: THREE.Vector3; life: number; gravity: boolean; fade: boolean }> = [];
  private coinGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12);
  private coinMat = new THREE.MeshStandardMaterial({ color: 0xfbac34, metalness: 0.8, roughness: 0.3, emissive: 0x553300 });
  private smokeGeo = new THREE.SphereGeometry(0.08, 8, 8);

  constructor(private scene: THREE.Scene) {}

  coins(at: THREE.Vector3, scale = 1, n = 14): void {
    for (let i = 0; i < n; i++) {
      const obj = new THREE.Mesh(this.coinGeo, this.coinMat);
      obj.scale.setScalar(scale);
      obj.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      this.items.push({
        obj,
        vel: new THREE.Vector3(Math.cos(a) * 0.8, 2 + Math.random() * 1.5, Math.sin(a) * 0.8).multiplyScalar(scale),
        life: 1.4,
        gravity: true,
        fade: false,
      });
      this.scene.add(obj);
    }
  }

  smoke(at: THREE.Vector3, color = 0xff4d4d, scale = 1, n = 10): void {
    for (let i = 0; i < n; i++) {
      const obj = new THREE.Mesh(this.smokeGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }));
      obj.scale.setScalar(scale);
      obj.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      this.items.push({
        obj,
        vel: new THREE.Vector3(Math.cos(a) * 0.2, 0.6 + Math.random() * 0.4, Math.sin(a) * 0.2).multiplyScalar(scale),
        life: 2,
        gravity: false,
        fade: true,
      });
      this.scene.add(obj);
    }
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.obj);
        if (f.fade) (f.obj.material as THREE.Material).dispose();
        this.items.splice(i, 1);
        continue;
      }
      if (f.gravity) f.vel.y -= 6 * dt;
      f.obj.position.addScaledVector(f.vel, dt);
      f.obj.rotation.y += dt * 8;
      if (f.fade) {
        (f.obj.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life / 2) * 0.6;
        f.obj.scale.multiplyScalar(1 + dt * 0.8);
      }
    }
  }

  clear(): void {
    for (const f of this.items) this.scene.remove(f.obj);
    this.items = [];
  }
}
