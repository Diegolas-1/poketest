// Ash's measurements (cm), for drafting his patterns: node tailor/measure.mjs
import { loadBody, girth, CM } from './body.mjs';
const body = await loadBody();
const cm = (u) => (u / CM).toFixed(1);
const legL = (p) => p[0] > 0.0 && Math.abs(p[0]) < 0.3;            // his left leg (and that side of the hips)
const torso = (p) => Math.abs(p[0]) < 0.2;
console.log('bones', Object.fromEntries(['Hips', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot'].map((n) => [n, body.bind[n].map((v) => +v.toFixed(3))])));
for (const y of [0.42, 0.3, 0.2, 0.1, 0.05, 0.0, -0.05, -0.1, -0.14]) { const g = girth(body, y, torso); console.log('torso y', y, 'girth', cm(g.c), 'w', cm(g.w), 'd', cm(g.d), 'cz', g.cz?.toFixed(3)); }
for (const y of [-0.2, -0.3, -0.4, -0.5, -0.6, -0.7, -0.8]) { const g = girth(body, y, legL); console.log('leg y', y, 'girth', cm(g.c), 'cx', g.cx?.toFixed(3), 'cz', g.cz?.toFixed(3), 'w', cm(g.w)); }
let crotch = 1; for (let i = 0; i < body.n; i++) { const p = body.P.subarray(i * 3, i * 3 + 3); if (Math.abs(p[0] + 0.006) < 0.01 && p[1] < 0 && p[1] > -0.4 && p[2] > -0.05 && p[2] < 0.12) crotch = Math.min(crotch, p[1]); }
console.log('crotch y', crotch.toFixed(3), 'neck girth', cm(girth(body, 0.48, torso).c));
const ua = girth(body, 0.33, (p) => p[0] > 0.2), fa = girth(body, 0.15, (p) => p[0] > 0.35);
console.log('upper arm girth (slice)', cm(ua.c), 'forearm', cm(fa.c));
