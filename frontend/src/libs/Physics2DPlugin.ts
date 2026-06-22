/*!
 * Physics2DPlugin 3.15.0
 * https://gsap.com
 * 
 * @license Copyright 2026, GreenSock. All rights reserved.
 * Subject to the terms at https://gsap.com/standard-license.
 * @author: Jack Doyle, jack@greensock.com
 */

let t: any, v: number, o: any, f: any, w: any;
const j = () => t || (typeof window !== "undefined" && (t = (window as any).gsap) && t.registerPlugin && t);
const k = (e: number) => Math.round(1e4 * e) / 1e4;
const l = (e?: any) => { t = e || j(); if (!v) { o = t.utils.getUnit; f = t.core.getStyleSaver; w = t.core.reverting || (() => {}); v = 1; } };

class m {
  p: string; set: any; s: number; val: number; u: any; vel: number; v: number; acc: number; a: number;
  constructor(e: any, t: string, i: number, s: number, n: number) {
    let r = e._gsap, a = r.get(e, t); this.p = t; this.set = r.set(e, t); this.s = this.val = parseFloat(a);
    this.u = o(a) || 0; this.vel = i || 0; this.v = this.vel / n; if (s || 0 === s) { this.acc = s; this.a = this.acc / (n * n); } else this.acc = this.a = 0;
  }
}

const u = Math.PI / 180;
const i: any = {
  version: "3.15.0", name: "physics2D", register: l,
  init: function (e: any, t: any, s: any) {
    v || l(); let n = +t.angle || 0, r = +t.velocity || 0, a = +t.acceleration || 0, c = t.xProp || "x", p = t.yProp || "y", h = t.accelerationAngle || 0 === t.accelerationAngle ? +t.accelerationAngle : n;
    this.styles = f && f(e, t.xProp && "x" !== t.xProp ? t.xProp + "," + t.yProp : "transform"); this.target = e; this.tween = s; this.step = 0; this.sps = 30; if (t.gravity) { a = +t.gravity; h = 90; }
    n *= u; h *= u; this.fr = 1 - (+t.friction || 0); this._props.push(c, p); this.xp = new m(e, c, Math.cos(n) * r, Math.cos(h) * a, this.sps); this.yp = new m(e, p, Math.sin(n) * r, Math.sin(h) * a, this.sps); this.skipX = this.skipY = 0;
  },
  render: function (_e: number, t: any) {
    let i, s, n, r, a, o, p = t.xp, l = t.yp, c = t.tween, v = t.target, f = t.step, u = t.sps, h = t.fr, d = t.skipX, g = t.skipY, y = c._from ? c._dur - c._time : c._time;
    if (c._time || !w()) {
      if (1 === h) n = y * y * .5, i = p.s + p.vel * y + p.acc * n, s = l.s + l.vel * y + l.acc * n;
      else { for (r = o = (0 | (y *= u)) - f, o < 0 && (p.v = p.vel / u, l.v = l.vel / u, p.val = p.s, l.val = l.s, r = o = (t.step = 0) | y), a = y % 1 * h; o--; ) p.v += p.a, l.v += l.a, p.v *= h, l.v *= h, p.val += p.v, l.v += l.v; i = p.val + p.v * a; s = l.val + l.v * a; t.step += r; }
      d || p.set(v, p.p, k(i) + p.u); g || l.set(v, l.p, k(s) + l.u);
    } else t.styles.revert();
  },
  kill: function (e: string) { this.xp.p === e && (this.skipX = 1); this.yp.p === e && (this.skipY = 1); }
};

if (j()) j().registerPlugin(i);
export { i as Physics2DPlugin };
export default i;