/*!
 * CustomWiggle 3.15.0
 * https://gsap.com
 * 
 * @license Copyright 2026, GreenSock. All rights reserved.
 * Subject to the terms at https://gsap.com/standard-license.
 * @author: Jack Doyle, jack@greensock.com
 */

let n: any, C: number, M: any;
const y: Record<string, any> = {
  easeOut: "M0,1,C0.7,1,0.6,0,1,0",
  easeInOut: "M0,0,C0.1,0,0.24,1,0.444,1,0.644,1,0.6,0,1,0",
  anticipate: "M0,0,C0,0.222,0.024,0.386,0,0.4,0.18,0.455,0.65,0.646,0.7,0.67,0.9,0.76,1,0.846,1,1",
  uniform: "M0,0,C0,0.95,0,1,0,1,0,1,1,1,1,1,1,1,1,0,1,0"
};

const g = () => n || (typeof window !== "undefined" && (n = (window as any).gsap) && n.registerPlugin && n);
const j = (e?: number) => { if (!C) { n = g(); M = n && n.parseEase("_CE"); if (M) { for (let t in y) y[t] = M("", y[t]); C = 1; (o as any).config = (e: any) => typeof e === "object" ? o("", e) : o(`wiggle(${e})`, { wiggles: +e }); } else e && console.warn("Please gsap.registerPlugin(CustomEase, CustomWiggle)"); } };
const k = (t: any, e?: boolean) => (typeof t !== "function" && (t = n.parseEase(t) || M("", t)), t.custom || !e ? t : (e: number) => 1 - t(e));

const o = (e: string, t: any): any => {
  C || j(1); let u: number, r: number, a: number, gVal: number, f: any[], l: number, c = Math.floor((t = t || {}).wiggles || 10), p = 1 / c, d = p / 2, m = t.type === "anticipate", h = y[t.type] || y.easeOut, w = m ? h : (x: any) => x;
  if (m) h = y.easeOut; if (t.timingEase) w = k(t.timingEase); if (t.amplitudeEase) h = k(t.amplitudeEase, true);
  f = [0, 0, (a = w(d)) / 4, 0, a / 2, gVal = m ? -h(d) : h(d), a, gVal];
  if (t.type === "random") { f.length = 4; let nX = w(p), nY = 2 * Math.random() - 1; for (l = 2; l < c; l++) { d = nX; gVal = nY; nX = w(p * l); nY = 2 * Math.random() - 1; let sA = Math.atan2(nY - f[f.length - 3], nX - f[f.length - 4]); u = Math.cos(sA) * p; r = Math.sin(sA) * p; f.push(d - u, gVal - r, d, gVal, d + u, gVal+r); } f.push(nX, 0, 1, 0); } 
  else { for (l = 1; l < c; l++) { f.push(w(d + p / 2), gVal); d += p; gVal = (0 < gVal ? -1 : 1) * h(l * p); a = w(d); f.push(w(d - p / 2), gVal, a, gVal); } f.push(w(d + p / 4), gVal, w(d + p / 4), 0, 1, 0); }
  for (l = f.length; -1 < --l; ) f[l] = ~~(1e3 * f[l]) / 1e3; (f as any)[2] = "C" + f[2]; return M(e, "M" + f.join(","));
};

export class CustomWiggle {
  static version = "3.15.0"; ease: any;
  constructor(e: string, t?: any) { this.ease = o(e, t); }
  static create(e: string, t?: any) { return o(e, t); }
  static register(e: any) { n = e; j(); }
}

if (g()) g().registerPlugin(CustomWiggle);
export default CustomWiggle;