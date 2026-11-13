'use strict';

// Draws the seed's plans, sections and elevation as SVG, and exports each to seed/images as a JPEG.
// The SVG files in seed/drawings are build output: edit the geometry here.

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const W = 2400;
const H = 1800;
const PAPER = '#EDF0EC';
const INK = '#17201C';
const THIN = 2.5;
const MID = 5;

// ADR 0002: every original image file carries the IPTC marker for AI-generated media.
const XMP =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" ' +
  'Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/>' +
  '</rdf:RDF></x:xmpmeta>';

const n = (v) => Math.round(v * 100) / 100;

// A drawing in metres. `up` flips the y axis, for sections and elevations measured from the ground.
function drawing({ scale, ox, oy, up = false }) {
  const out = [];
  const X = (x) => n(ox + x * scale);
  const Y = (y) => n(up ? oy - y * scale : oy + y * scale);
  const stroke = (w, dash) => `fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="butt"${dash ? ` stroke-dasharray="${dash}"` : ''}`;
  const d = {
    X,
    Y,
    scale,
    raw: (s) => out.push(s),
    line(x1, y1, x2, y2, w = THIN, dash) {
      out.push(`<line x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}" ${stroke(w, dash)}/>`);
    },
    box(x, y, w, h, { weight = THIN, fill = 'none', dash } = {}) {
      const px = Math.min(X(x), X(x + w));
      const py = Math.min(Y(y), Y(y + h));
      const s = weight ? stroke(weight, dash).replace('fill="none"', `fill="${fill}"`) : `fill="${fill}"`;
      out.push(`<rect x="${px}" y="${py}" width="${n(Math.abs(w) * scale)}" height="${n(Math.abs(h) * scale)}" ${s}/>`);
    },
    solid(x, y, w, h) {
      d.box(x, y, w, h, { weight: 0, fill: INK });
    },
    blank(x, y, w, h) {
      d.box(x, y, w, h, { weight: 0, fill: PAPER });
    },
    circle(cx, cy, r, { weight = THIN, fill = 'none', dash } = {}) {
      out.push(`<circle cx="${X(cx)}" cy="${Y(cy)}" r="${n(r * scale)}" ${stroke(weight, dash).replace('fill="none"', `fill="${fill}"`)}/>`);
    },
    poly(points, { weight = THIN, fill = 'none', dash, close = false } = {}) {
      const p = points.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
      out.push(`<${close ? 'polygon' : 'polyline'} points="${p}" ${stroke(weight, dash).replace('fill="none"', `fill="${fill}"`)} stroke-linejoin="miter"/>`);
    },
    // Walls are centre lines; each becomes a filled bar that overlaps its neighbours at the corners.
    walls(t, segments) {
      for (const [x1, y1, x2, y2] of segments) {
        d.solid(Math.min(x1, x2) - t / 2, Math.min(y1, y2) - t / 2, Math.abs(x2 - x1) + t, Math.abs(y2 - y1) + t);
      }
    },
    // Cuts a wall between two points on its centre line. kind: 'open', 'window' or 'sill'.
    opening(t, x1, y1, x2, y2, kind = 'window') {
      const horizontal = y1 === y2;
      if (horizontal) d.blank(Math.min(x1, x2), y1 - t / 2 - 0.02, Math.abs(x2 - x1), t + 0.04);
      else d.blank(x1 - t / 2 - 0.02, Math.min(y1, y2), t + 0.04, Math.abs(y2 - y1));
      if (kind === 'open') return;
      const o = t / 2;
      if (horizontal) {
        d.line(x1, y1 - o, x2, y2 - o);
        d.line(x1, y1 + o, x2, y2 + o);
        if (kind === 'window') d.line(x1, y1, x2, y2);
      } else {
        d.line(x1 - o, y1, x2 - o, y2);
        d.line(x1 + o, y1, x2 + o, y2);
        if (kind === 'window') d.line(x1, y1, x2, y2);
      }
    },
    // A door leaf from its hinge, with the swing arc back to the closed position.
    door(hx, hy, cx, cy, side = 1) {
      const w = Math.hypot(cx - hx, cy - hy);
      const lx = hx + (-(cy - hy) / w) * side * w;
      const ly = hy + ((cx - hx) / w) * side * w;
      const flipped = up ? -side : side;
      d.line(hx, hy, lx, ly, THIN + 1);
      out.push(`<path d="M ${X(lx)} ${Y(ly)} A ${n(w * scale)} ${n(w * scale)} 0 0 ${flipped > 0 ? 0 : 1} ${X(cx)} ${Y(cy)}" ${stroke(THIN - 1)}/>`);
    },
    // A flight in plan: treads across the run, and an arrow pointing up the stair.
    stair(x, y, w, h, treads) {
      d.box(x, y, w, h);
      const alongX = Math.abs(w) >= Math.abs(h);
      for (let i = 1; i < treads; i++) {
        if (alongX) d.line(x + (w * i) / treads, y, x + (w * i) / treads, y + h, THIN - 1);
        else d.line(x, y + (h * i) / treads, x + w, y + (h * i) / treads, THIN - 1);
      }
      if (alongX) d.arrow(x + w * 0.08, y + h / 2, x + w * 0.92, y + h / 2);
      else d.arrow(x + w / 2, y + h * 0.08, x + w / 2, y + h * 0.92);
    },
    arrow(x1, y1, x2, y2, dash) {
      d.line(x1, y1, x2, y2, THIN - 0.5, dash);
      const a = Math.atan2(Y(y2) - Y(y1), X(x2) - X(x1));
      const tip = (k) => `${n(X(x2) - 22 * Math.cos(a + k))},${n(Y(y2) - 22 * Math.sin(a + k))}`;
      out.push(`<polyline points="${tip(0.4)} ${X(x2)},${Y(y2)} ${tip(-0.4)}" ${stroke(THIN - 0.5)}/>`);
    },
    // A standing figure, 1.7 m tall, to give sections and elevations a sense of scale.
    figure(x, y) {
      d.circle(x, y + 1.58, 0.12);
      d.poly([[x - 0.2, y + 0.8], [x - 0.16, y + 1.4], [x + 0.16, y + 1.4], [x + 0.2, y + 0.8]]);
      d.line(x - 0.1, y, x - 0.06, y + 0.82);
      d.line(x + 0.1, y, x + 0.06, y + 0.82);
    },
    tree(x, y, r) {
      d.circle(x, y, r, { weight: THIN - 0.5 });
      d.circle(x + r * 0.35, y - r * 0.3, r * 0.6, { weight: THIN - 1 });
      d.circle(x, y, 0.08, { fill: INK });
    },
    chairs(points, size = 0.42) {
      for (const [x, y] of points) d.box(x - size / 2, y - size / 2, size, size, { weight: THIN - 1 });
    },
  };
  d.svg = () => out.join('\n');
  return d;
}

function scaleBar(scale, steps = [0, 1, 2, 5]) {
  const x = 150;
  const y = H - 130;
  const parts = [];
  for (let i = 0; i < steps.length - 1; i++) {
    const a = x + steps[i] * scale;
    const w = (steps[i + 1] - steps[i]) * scale;
    parts.push(`<rect x="${n(a)}" y="${y}" width="${n(w)}" height="14" fill="${i % 2 ? PAPER : INK}" stroke="${INK}" stroke-width="2"/>`);
  }
  for (const s of steps) {
    parts.push(`<text x="${n(x + s * scale)}" y="${y + 52}" text-anchor="middle">${s}${s === steps[steps.length - 1] ? ' m' : ''}</text>`);
  }
  return parts.join('\n');
}

function northPoint() {
  const x = W - 190;
  const y = 210;
  return [
    `<circle cx="${x}" cy="${y}" r="46" fill="none" stroke="${INK}" stroke-width="2.5"/>`,
    `<polygon points="${x},${y - 46} ${x - 16},${y + 20} ${x},${y + 6}" fill="${INK}"/>`,
    `<polyline points="${x},${y - 46} ${x + 16},${y + 20} ${x},${y + 6}" fill="none" stroke="${INK}" stroke-width="2.5"/>`,
    `<text x="${x}" y="${y - 62}" text-anchor="middle">N</text>`,
  ].join('\n');
}

function sheet(body, extras) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Noto Sans, Arial, Helvetica, sans-serif" font-size="30" fill="${INK}">`,
    `<rect width="${W}" height="${H}" fill="${PAPER}"/>`,
    body,
    extras,
    '</svg>',
  ].join('\n');
}

function courtyardHousePlan() {
  const s = 84;
  const d = drawing({ scale: s, ox: 255, oy: 564 });
  const t = 0.25;
  d.poly([[-1.5, -0.6], [24.6, -0.6], [24.6, 8.6], [-1.5, 8.6]], { dash: '18 12', close: true, weight: THIN - 0.5 });
  d.walls(t, [
    [0, 0, 24, 0], [0, 0, 0, 8], [24, 0, 24, 8], [0, 8, 7, 8], [15, 8, 24, 8],
    [7, 3, 7, 8], [7, 3, 15, 3], [15, 3, 15, 8], [21, 0, 21, 2.5], [21, 2.5, 24, 2.5],
  ]);
  d.walls(0.14, [[7, 8.05, 15, 8.05]]);
  d.opening(t, 0, 0.9, 0, 2.9);
  d.opening(t, 0, 5.3, 0, 7.2);
  d.opening(t, 0, 3.6, 0, 4.5, 'open');
  d.door(0, 3.6, 0, 4.5, -1);
  d.opening(t, 7, 3.9, 7, 7.4);
  d.opening(t, 7.7, 3, 14.3, 3);
  d.opening(t, 15, 3.9, 15, 7.4);
  d.opening(t, 24, 4.2, 24, 7.1);
  d.opening(t, 21.4, 2.5, 22.2, 2.5, 'open');
  d.door(21.4, 2.5, 22.2, 2.5, -1);
  d.opening(t, 10.2, 0, 12.2, 0);
  // court
  d.tree(11.2, 5.7, 1.35);
  for (const [x, y, r] of [[8, 4, 0.4], [8.5, 7.1, 0.5], [13.6, 4.1, 0.45], [14, 6.9, 0.55], [9.6, 7.3, 0.3], [12.9, 7.3, 0.35]]) d.circle(x, y, r, { weight: THIN - 1 });
  for (let x = 7.6; x < 15; x += 0.6) d.line(x, 3.2, x, 3.75, THIN - 1.5);
  d.line(7.2, 3.75, 14.8, 3.75, THIN - 1);
  // living room
  d.box(0.35, 0.2, 5.6, 0.42);
  for (let x = 1.05; x < 5.9; x += 0.7) d.line(x, 0.2, x, 0.62, THIN - 1.5);
  d.box(2.1, 5.7, 2.7, 0.95);
  d.line(2.1, 6.4, 4.8, 6.4, THIN - 1);
  d.box(2.7, 4.2, 1.5, 0.75);
  d.box(5.2, 4.3, 0.85, 0.85);
  // stair in the link
  d.stair(8.6, 0.25, 3.6, 1.15, 13);
  d.box(12.6, 0.25, 1.9, 0.6);
  // kitchen and dining
  d.box(15.3, 0.2, 5.4, 0.65);
  d.circle(16.3, 0.52, 0.16, { weight: THIN - 1 });
  d.circle(16.8, 0.52, 0.16, { weight: THIN - 1 });
  d.box(18.2, 0.32, 0.8, 0.42, { weight: THIN - 1 });
  d.box(16.1, 1.9, 3.3, 0.9);
  d.box(18.3, 4.9, 2.8, 1.1);
  d.chairs([[18.8, 4.55], [19.7, 4.55], [20.6, 4.55], [18.8, 6.35], [19.7, 6.35], [20.6, 6.35]]);
  // bathroom
  d.box(22.9, 0.3, 0.9, 0.55, { weight: THIN - 1 });
  d.circle(21.7, 0.7, 0.25, { weight: THIN - 1 });
  return sheet(d.svg(), northPoint() + scaleBar(s));
}

function riverApartmentPlan() {
  const s = 120;
  const d = drawing({ scale: s, ox: 240, oy: 400 });
  const t = 0.22;
  d.walls(t, [[0, 0, 16, 0], [0, 0, 0, 8], [16, 0, 16, 8], [0, 8, 16, 8]]);
  d.walls(0.12, [[0, 5, 12.5, 5], [6, 5, 6, 8], [9.5, 5, 9.5, 8], [12.5, 4.4, 12.5, 8]]);
  for (let x = 0.5; x < 15.4; x += 3) d.opening(t, x, 0, Math.min(x + 2.7, 15.5), 0);
  d.opening(t, 13.7, 8, 14.6, 8, 'open');
  d.door(13.7, 8, 14.6, 8, -1);
  // the joinery along the inner wall
  d.box(0.11, 4.4, 12.39, 0.54, { weight: THIN });
  for (let x = 0.7; x < 12.4; x += 0.6) d.line(x, 4.4, x, 4.94, THIN - 1.5);
  for (const [a, b] of [[4.7, 5.6], [7.3, 8.2], [10.3, 11.1]]) {
    d.blank(a, 4.3, b - a, 0.8);
    d.line(a, 4.4, a, 5.06);
    d.line(b, 4.4, b, 5.06);
    d.door(a, 5.06, b, 5.06, 1);
  }
  d.circle(1.3, 4.67, 0.14, { weight: THIN - 1 });
  d.circle(1.75, 4.67, 0.14, { weight: THIN - 1 });
  d.box(2.7, 4.5, 0.7, 0.34, { weight: THIN - 1 });
  d.box(0.9, 2.8, 3.1, 0.9);
  // living
  d.box(9.6, 2.3, 2.9, 0.95);
  d.line(9.6, 3.0, 12.5, 3.0, THIN - 1);
  d.box(10.2, 0.9, 1.7, 0.8);
  d.box(13.2, 1.1, 0.9, 0.9);
  d.box(8.9, 0.6, 5.6, 3, { weight: THIN - 1.5, dash: '6 8' });
  d.box(5, 1.5, 2.6, 1.05);
  d.chairs([[5.5, 1.15], [6.3, 1.15], [7.1, 1.15], [5.5, 2.9], [6.3, 2.9], [7.1, 2.9]]);
  // bedroom, study, bath
  d.box(1.4, 5.9, 2, 1.95);
  d.line(1.4, 6.4, 3.4, 6.4, THIN - 1);
  d.box(0.25, 6.1, 0.5, 0.5, { weight: THIN - 1 });
  d.box(8.75, 5.5, 0.65, 2.3);
  d.chairs([[8.3, 6.6]]);
  d.box(11.6, 5.2, 0.78, 1.8, { weight: THIN - 1 });
  d.circle(10, 7.5, 0.22, { weight: THIN - 1 });
  d.box(9.7, 5.2, 0.5, 0.6, { weight: THIN - 1 });
  d.box(15.2, 4.7, 0.6, 2.4, { weight: THIN - 1 });
  // the river beyond
  for (const [y, a, b] of [[-1.3, 1, 9], [-1.9, 5, 15], [-2.5, 2.5, 11]]) d.line(a, y, b, y, THIN - 1.5, '40 22');
  return sheet(d.svg(), northPoint() + scaleBar(s));
}

function shophouseSection() {
  const s = 92;
  const d = drawing({ scale: s, ox: 330, oy: 1480, up: true });
  const levels = [3.6, 6.7, 9.8, 12.9];
  d.line(-3, 0, 23, 0, MID + 2);
  d.solid(0, -0.35, 20, 0.35);
  // beyond: the party wall
  d.box(0, 0, 20, 12.9, { weight: THIN - 1 });
  // floors and roof, broken by the lightwell
  for (const y of levels) {
    d.solid(0, y - 0.25, 8.5, 0.25);
    d.solid(11.5, y - 0.25, 8.5, 0.25);
  }
  // front and rear walls
  d.solid(0, 3.6, 0.3, 10.1);
  d.solid(19.7, 0, 0.3, 13.5);
  for (const y of [4.5, 7.6, 10.7]) {
    d.blank(-0.02, y, 0.34, 1.5);
    d.line(0.05, y, 0.05, y + 1.5);
    d.line(0.25, y, 0.25, y + 1.5);
    d.blank(19.68, y + 0.3, 0.34, 1);
    d.line(19.85, y + 0.3, 19.85, y + 1.3);
  }
  // folded shutters at the street
  for (const x of [0.12, 0.26, 0.4]) d.line(x, 0, x, 3.1);
  d.solid(0, 3.1, 0.5, 0.25);
  // lantern over the lightwell
  d.solid(8.5, 12.9, 0.2, 1.2);
  d.solid(11.3, 12.9, 0.2, 1.2);
  d.poly([[8.1, 14.5], [10, 15.1], [11.9, 14.5]], { weight: MID });
  d.line(8.5, 14.3, 11.5, 14.3, THIN - 1, '10 8');
  // balustrades at the lightwell
  for (const y of levels.slice(0, 3)) {
    d.line(8.5, y, 8.5, y + 1);
    d.line(11.5, y, 11.5, y + 1);
    d.line(8.3, y + 1, 8.6, y + 1);
    d.line(11.4, y + 1, 11.7, y + 1);
  }
  // stairs, floor by floor
  const flight = (x1, x2, y1, y2) => {
    const steps = 16;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      pts.push([x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps]);
      if (i < steps) pts.push([x1 + ((x2 - x1) * (i + 1)) / steps, y1 + ((y2 - y1) * i) / steps]);
    }
    d.poly(pts, { weight: THIN - 0.5 });
  };
  flight(12.2, 16.4, 0, 3.35);
  flight(16.4, 12.2, 3.6, 6.45);
  flight(12.2, 16.4, 6.7, 9.55);
  // partitions with doors
  for (const [x, y] of [[5, 3.6], [5, 6.7], [5, 9.8], [17.4, 3.6], [17.4, 6.7], [17.4, 9.8], [4, 0]]) {
    d.solid(x, y + 2.1, 0.12, (y === 0 ? 3.35 : 2.85) - 2.1);
    d.line(x + 0.06, y, x + 0.06, y + 2.1, THIN - 1);
  }
  // air and light
  d.arrow(10, 1.2, 10, 13.6, '14 10');
  d.arrow(12.6, 15.6, 10.6, 9.4, '6 10');
  d.figure(2.2, 0);
  d.figure(6.8, 6.7);
  d.figure(-1.6, 0);
  d.line(-3, 0.15, -0.6, 0.15, THIN - 1);
  return sheet(d.svg(), scaleBar(s));
}

function coffeeBarPlan() {
  const s = 105;
  const d = drawing({ scale: s, ox: 1010, oy: 110 });
  const t = 0.24;
  // pavement and kerb
  d.raw(`<path d="M ${d.X(-2.6)} ${d.Y(-0.6)} L ${d.X(-2.6)} ${d.Y(12.3)} Q ${d.X(-2.6)} ${d.Y(13.4)} ${d.X(-1.5)} ${d.Y(13.4)} L ${d.X(8)} ${d.Y(13.4)}" fill="none" stroke="${INK}" stroke-width="${THIN}"/>`);
  d.raw(`<path d="M ${d.X(-2.75)} ${d.Y(-0.6)} L ${d.X(-2.75)} ${d.Y(12.3)} Q ${d.X(-2.75)} ${d.Y(13.55)} ${d.X(-1.5)} ${d.Y(13.55)} L ${d.X(8)} ${d.Y(13.55)}" fill="none" stroke="${INK}" stroke-width="${THIN - 1}"/>`);
  d.tree(-1.5, 9.6, 0.9);
  // party walls, the shaded wall, and the back of house
  d.walls(t, [[0, 0, 7, 0], [7, 0, 7, 11], [0, 0, 0, 6], [0, 2.6, 7, 2.6], [3.4, 0, 3.4, 2.6]]);
  d.opening(t, 5.7, 2.6, 6.5, 2.6, 'open');
  d.door(5.7, 2.6, 6.5, 2.6, -1);
  d.opening(t, 2.2, 2.6, 3, 2.6, 'open');
  d.door(3, 2.6, 2.2, 2.6, 1);
  d.circle(0.8, 0.8, 0.24, { weight: THIN - 1 });
  d.box(1.7, 0.3, 0.5, 0.42, { weight: THIN - 1 });
  d.box(3.7, 0.25, 3, 0.6, { weight: THIN - 1 });
  // columns and folded shutters on the two street sides
  for (const [x, y] of [[0, 6], [0, 11], [3.5, 11], [7, 11]]) d.solid(x - 0.18, y - 0.18, 0.36, 0.36);
  d.line(0, 6.2, 0, 10.8, THIN - 1, '14 10');
  d.line(0.2, 11, 6.8, 11, THIN - 1, '14 10');
  for (const k of [0, 1, 2, 3]) {
    d.line(-0.02 + 0, 6.25 + k * 0.09, 0.42, 6.3 + k * 0.09, THIN - 1);
    d.line(0.25 + k * 0.09, 11, 0.3 + k * 0.09, 10.58, THIN - 1);
    d.line(6.75 - k * 0.09, 11, 6.7 - k * 0.09, 10.58, THIN - 1);
  }
  // one long counter, with the working side behind it
  d.box(4.2, 3.3, 0.75, 7.1, { weight: MID - 1 });
  d.box(6.3, 3.3, 0.55, 5.4);
  d.circle(6.57, 4.1, 0.2, { weight: THIN - 1 });
  d.circle(6.57, 4.75, 0.2, { weight: THIN - 1 });
  d.box(6.38, 5.6, 0.4, 0.9, { weight: THIN - 1 });
  d.box(6.38, 7.3, 0.4, 0.6, { weight: THIN - 1 });
  for (let y = 4; y < 10.3; y += 0.85) d.circle(3.75, y, 0.17, { weight: THIN - 1 });
  // the bench along the shaded wall, turning out onto the pavement
  d.poly([[0.12, 2.9], [0.62, 2.9], [0.62, 6.15], [0.3, 6.15], [0.3, 6.65], [-1.9, 6.65], [-1.9, 6.15], [0.12, 6.15]], { weight: MID - 1, close: true });
  for (const y of [3.5, 4.7, 5.6]) d.circle(1.25, y, 0.3, { weight: THIN - 1 });
  d.circle(-1.2, 7.4, 0.3, { weight: THIN - 1 });
  d.circle(-0.2, 7.4, 0.3, { weight: THIN - 1 });
  return sheet(d.svg(), northPoint() + scaleBar(s));
}

function noodleCounterElevation() {
  const s = 190;
  const d = drawing({ scale: s, ox: 820, oy: 1620, up: true });
  d.line(-4.2, 0, 8.2, 0, MID + 2);
  // neighbours, lighter
  d.box(-3.6, 0, 3.6, 7.1, { weight: THIN - 1 });
  d.box(-3.2, 0, 2.8, 2.9, { weight: THIN - 1 });
  for (let y = 0.25; y < 2.9; y += 0.25) d.line(-3.2, y, -0.4, y, THIN - 1.5);
  d.box(-2.8, 4.2, 0.9, 1.8, { weight: THIN - 1 });
  d.box(-1.6, 4.2, 0.9, 1.8, { weight: THIN - 1 });
  d.box(4, 0, 3.8, 7.9, { weight: THIN - 1 });
  d.box(4.4, 0, 3, 3, { weight: THIN - 1 });
  d.box(4.6, 4.4, 2.6, 1.6, { weight: THIN - 1 });
  // the shopfront
  d.box(0, 0, 4, 7.6, { weight: MID });
  d.line(0, 3.5, 4, 3.5, THIN);
  d.line(0, 3.38, 4, 3.38, THIN - 1);
  d.line(0, 6.9, 4, 6.9, THIN);
  d.line(-0.08, 7.6, 4.08, 7.6, MID);
  d.box(0.35, 0, 3.3, 2.9, { weight: THIN + 1 });
  // rolled steel shutter
  d.box(0.35, 2.9, 3.3, 0.38);
  for (let y = 2.98; y < 3.28; y += 0.075) d.line(0.35, y, 3.65, y, THIN - 1.5);
  // kitchen at the front
  d.box(0.5, 0, 1.45, 0.92);
  d.line(0.5, 0.78, 1.95, 0.78, THIN - 1);
  d.poly([[0.7, 0.92], [0.72, 1.3], [1.18, 1.3], [1.2, 0.92]]);
  d.poly([[1.35, 0.92], [1.37, 1.18], [1.75, 1.18], [1.77, 0.92]]);
  for (const x of [0.85, 1.05, 1.5]) d.raw(`<path d="M ${d.X(x)} ${d.Y(1.4)} q 14 -22 0 -44 q -14 -22 0 -44" fill="none" stroke="${INK}" stroke-width="1.5"/>`);
  // the counter and stools beyond
  d.line(1.95, 1.02, 3.65, 1.02, THIN + 1);
  d.line(1.95, 0.94, 3.65, 0.94, THIN - 1);
  for (const x of [2.3, 2.75, 3.2]) {
    d.raw(`<ellipse cx="${d.X(x)}" cy="${d.Y(0.66)}" rx="${n(0.17 * s)}" ry="${n(0.04 * s)}" fill="${PAPER}" stroke="${INK}" stroke-width="${THIN}"/>`);
    d.line(x, 0.62, x, 0.1);
    d.line(x - 0.14, 0, x, 0.14, THIN - 1);
    d.line(x + 0.14, 0, x, 0.14, THIN - 1);
  }
  for (const x of [2.2, 2.75, 3.3]) {
    d.line(x, 2.9, x, 2.25, THIN - 1.5);
    d.poly([[x - 0.13, 2.08], [x - 0.06, 2.25], [x + 0.06, 2.25], [x + 0.13, 2.08]], { close: true });
  }
  // upper floor shutters
  for (const x of [0.6, 2.3]) {
    d.box(x, 4.2, 1.1, 2);
    d.line(x + 0.55, 4.2, x + 0.55, 6.2);
    for (let y = 4.35; y < 6.2; y += 0.15) d.line(x + 0.06, y, x + 1.04, y, THIN - 1.5);
    d.line(x - 0.1, 4.2, x + 1.2, 4.2, THIN + 1);
  }
  d.figure(-1.3, 0);
  return sheet(d.svg(), scaleBar(s, [0, 1, 2]));
}

function lightingShowroomPlan() {
  const s = 105;
  const d = drawing({ scale: s, ox: 255, oy: 270 });
  const t = 0.26;
  d.walls(t, [[0, 0, 18, 0], [0, 12, 18, 12], [0, 0, 0, 12], [18, 0, 18, 12], [12.5, 0, 12.5, 12], [14.7, 1.9, 18, 1.9], [14.6, 9, 18, 9], [14.6, 9, 14.6, 12]]);
  d.opening(t, 0, 5.1, 0, 6.9, 'open');
  d.door(0, 5.1, 0, 6, -1);
  d.door(0, 6.9, 0, 6, 1);
  d.opening(t, 0, 8.4, 0, 10.2);
  d.opening(t, 12.5, 3.2, 12.5, 8.8, 'open');
  d.opening(t, 14.6, 9.6, 14.6, 10.4, 'open');
  d.door(14.6, 9.6, 14.6, 10.4, -1);
  // lamp groups, each with its pool of light
  for (const [x, y, r] of [[3, 2.8, 1.15], [6.6, 2.4, 1], [9.7, 4, 1.2], [3.2, 9.2, 1.1], [6.3, 6.1, 1.3], [9.8, 9.2, 1.15], [6.5, 10, 0.9]]) {
    d.circle(x, y, r, { weight: THIN - 1, dash: '8 10' });
    for (const [dx, dy, rr] of [[-0.3, -0.15, 0.16], [0.25, -0.22, 0.12], [0.05, 0.3, 0.2]]) d.circle(x + dx, y + dy, rr, { weight: THIN - 0.5 });
  }
  for (const [x, y] of [[4.8, 4.4], [8.2, 7.4], [10.6, 6.4]]) d.box(x, y, 0.5, 0.5);
  // the sample table at the back
  d.box(14.3, 4, 1.4, 3.8, { weight: MID - 1 });
  for (const [x, y, w, h] of [[14.45, 4.2, 0.5, 0.7], [15.05, 4.3, 0.5, 0.4], [14.5, 5.2, 0.8, 0.5], [14.6, 6, 0.4, 0.9], [15.1, 6.2, 0.45, 0.6], [14.5, 7.1, 0.9, 0.5]]) d.box(x, y, w, h, { weight: THIN - 1.5 });
  d.circle(15, 5.9, 0.18, { fill: INK });
  d.box(17.2, 2.4, 0.55, 6.2, { weight: THIN - 1 });
  for (let y = 3.2; y < 8.6; y += 0.8) d.line(17.2, y, 17.75, y, THIN - 1.5);
  // stair and its one pendant
  d.stair(14.6, 0.3, 3.1, 1.3, 12);
  d.circle(13.5, 0.95, 0.16, { fill: INK });
  d.circle(13.5, 0.95, 0.55, { weight: THIN - 1, dash: '8 10' });
  // office at the back
  d.box(15.4, 10.9, 1.8, 0.8, { weight: THIN - 1 });
  d.chairs([[16.3, 10.5]]);
  return sheet(d.svg(), northPoint() + scaleBar(s));
}

function officeUpperFloorPlan() {
  const s = 96;
  const d = drawing({ scale: s, ox: 150, oy: 290 });
  const t = 0.26;
  const p = 0.12;
  d.walls(t, [[0, 0, 20, 0], [0, 13, 20, 13], [0, 0, 0, 13], [20, 0, 20, 13]]);
  for (let x = 1; x < 19; x += 2.6) d.opening(t, x, 13, x + 1.9, 13);
  d.opening(t, 20, 5, 20, 7);
  d.opening(t, 20, 8.6, 20, 10.6);
  // stair core
  d.walls(p, [[5, 0, 5, 3.4], [0, 3.4, 5, 3.4], [2.6, 0, 2.6, 2]]);
  d.stair(0.3, 0.3, 2.1, 1.2, 8);
  d.stair(0.3, 1.7, 2.1, 1.2, 8);
  d.opening(p, 3.4, 3.4, 4.4, 3.4, 'open');
  d.door(3.4, 3.4, 4.4, 3.4, -1);
  d.circle(3.4, 0.7, 0.22, { weight: THIN - 1 });
  d.box(4.1, 0.35, 0.5, 0.42, { weight: THIN - 1 });
  // small quiet rooms along the north wall
  d.walls(p, [[5, 3.4, 20, 3.4], [8, 0, 8, 3.4], [11, 0, 11, 3.4], [14, 0, 14, 3.4], [16.2, 0, 16.2, 3.4]]);
  for (const x of [5, 8, 11]) {
    d.opening(p, x + 0.5, 3.4, x + 1.35, 3.4, 'open');
    d.door(x + 0.5, 3.4, x + 1.35, 3.4, -1);
    d.box(x + 0.6, 0.3, 1.9, 0.75);
    d.chairs([[x + 1.55, 1.4]]);
    d.opening(t, x + 0.7, 0, x + 2.3, 0);
  }
  d.opening(p, 14.4, 3.4, 15.25, 3.4, 'open');
  d.door(14.4, 3.4, 15.25, 3.4, -1);
  d.box(14.35, 0.3, 1.5, 0.75);
  d.chairs([[15.1, 1.4]]);
  // the room for four, with its round table
  d.opening(p, 16.7, 3.4, 17.6, 3.4, 'open');
  d.door(16.7, 3.4, 17.6, 3.4, -1);
  d.circle(18.2, 1.6, 0.72);
  d.chairs([[18.2, 0.55], [18.2, 2.65], [17.15, 1.6], [19.25, 1.6]]);
  d.opening(t, 17.2, 0, 19.2, 0);
  // phone rooms with glass fronts along the corridor
  d.walls(p, [[1.7, 4.6, 1.7, 11.4], [0, 4.6, 1.7, 4.6], [0, 6.3, 1.7, 6.3], [0, 8, 1.7, 8], [0, 9.7, 1.7, 9.7], [0, 11.4, 1.7, 11.4]]);
  for (const y of [4.6, 6.3, 8, 9.7]) {
    d.opening(p, 1.7, y + 0.2, 1.7, y + 1.5, 'sill');
    d.door(1.7, y + 0.35, 1.7, y + 1.15, 1);
    d.box(0.2, y + 0.3, 0.5, 1.1, { weight: THIN - 1 });
    d.chairs([[1.05, y + 0.85]], 0.36);
  }
  // desks turned away from one another, and the heavy curtains between them
  const desk = (x, y, w, h, cx, cy) => {
    d.box(x, y, w, h);
    d.chairs([[cx, cy]]);
  };
  for (const [ox2, flip] of [[3.6, 0], [9.6, 1], [15.2, 0]]) {
    desk(ox2, 5, 1.6, 0.75, ox2 + 0.8, flip ? 6.15 : 4.55);
    desk(ox2 + 2.4, 6.4, 0.75, 1.6, flip ? ox2 + 2 : ox2 + 3.55, 7.2);
    desk(ox2, 8.6, 1.6, 0.75, ox2 + 0.8, flip ? 8.2 : 9.75);
    desk(ox2 + 2.4, 10.2, 0.75, 1.6, flip ? ox2 + 3.55 : ox2 + 2, 11);
  }
  for (const x of [8.3, 14]) {
    let path = `M ${d.X(x)} ${d.Y(4.3)}`;
    for (let y = 4.3; y < 12.3; y += 0.4) path += ` q ${n(0.12 * s)} ${n(0.1 * s)} 0 ${n(0.2 * s)} q ${n(-0.12 * s)} ${n(0.1 * s)} 0 ${n(0.2 * s)}`;
    d.raw(`<path d="${path}" fill="none" stroke="${INK}" stroke-width="${THIN}"/>`);
  }
  return sheet(d.svg(), northPoint() + scaleBar(s));
}

function hillsideHouseSection() {
  const s = 70;
  const d = drawing({ scale: s, ox: 150, oy: 1420, up: true });
  const ground = (x) => 9 - x * 0.25;
  // the slope, with the earth hatched beneath it
  d.poly([[-1, ground(-1)], [31, ground(31)]], { weight: MID + 2 });
  for (let x = -0.6; x < 31; x += 0.55) d.line(x, ground(x) - 0.08, x - 0.35, ground(x) - 0.55, THIN - 1.5);
  // three floors stepping down, then the terrace
  const floors = [[6, 12, 7.6], [12, 18, 6.2], [18, 27.5, 4.8]];
  for (const [a, b, y] of floors) d.solid(a, y - 0.25, b - a, 0.25);
  d.solid(11.75, 6.2, 0.25, 1.4);
  d.solid(17.75, 4.8, 0.25, 1.4);
  for (const [x, y] of [[12, 6.2], [18, 4.8]]) {
    d.poly([[x, y + 0.93], [x + 0.3, y + 0.93], [x + 0.3, y + 0.47], [x + 0.6, y + 0.47], [x + 0.6, y]], { weight: THIN });
  }
  // piers down to the ground
  for (const [x, y] of [[6, 7.35], [12, 5.95], [15, 5.95], [18, 4.55], [21, 4.55], [24, 4.55], [27.3, 4.55]]) d.solid(x, ground(x) - 0.2, 0.22, y - ground(x) + 0.2);
  // one long roof
  const roof = (x) => 11.6 - (x - 4.2) * 0.2;
  d.poly([[4.2, roof(4.2)], [29.2, roof(29.2)], [29.2, roof(29.2) - 0.22], [4.2, roof(4.2) - 0.22]], { fill: INK, close: true, weight: 1 });
  // walls and glazing between floor and roof
  d.solid(6, 7.6, 0.25, roof(6) - 7.82);
  for (const [x, y] of [[12, 7.6], [18, 6.2]]) d.line(x, y, x, roof(x) - 0.22, THIN);
  d.line(24, 4.8, 24, roof(24) - 0.22, THIN + 1);
  d.line(24.12, 4.8, 24.12, roof(24.12) - 0.22, THIN - 1);
  for (const x of [27.4]) d.line(x, 4.8, x, roof(x) - 0.22, THIN + 1.5);
  d.line(24.3, 5.8, 27.4, 5.8, THIN - 1);
  for (let x = 24.8; x < 27.4; x += 0.5) d.line(x, 4.8, x, 5.8, THIN - 1.5);
  // furniture and people
  d.box(8, 7.6, 1.8, 0.75);
  d.box(14, 6.2, 2.2, 0.45);
  d.box(20, 4.8, 2.4, 0.42);
  d.line(20, 5.22, 20, 5.6, THIN - 1);
  d.figure(16.9, 6.2);
  d.figure(25.6, 4.8);
  // rainwater tank at the low end
  d.box(28.4, ground(29) - 0.05, 1.5, 2.3, { weight: MID - 1 });
  d.line(28.4, ground(29) + 1.7, 29.9, ground(29) + 1.7, THIN - 1);
  d.line(29.1, roof(29.1) - 0.22, 29.1, ground(29) + 2.25, THIN);
  // trees
  for (const [x, h, r] of [[1.2, 3.6, 1.5], [3.4, 4.8, 1.8], [30.2, 4, 1.6]]) {
    d.line(x, ground(x), x, ground(x) + h, THIN);
    d.circle(x, ground(x) + h + r * 0.5, r, { weight: THIN - 1 });
    d.circle(x - r * 0.5, ground(x) + h, r * 0.7, { weight: THIN - 1.5 });
  }
  return sheet(d.svg(), scaleBar(s, [0, 2, 5, 10]));
}

const drawings = {
  'courtyard-house-ari-plan': courtyardHousePlan,
  'river-apartment-khlong-san-plan': riverApartmentPlan,
  'shophouse-talat-noi-section': shophouseSection,
  'corner-coffee-bar-ari-plan': coffeeBarPlan,
  'noodle-counter-yaowarat-elevation': noodleCounterElevation,
  'lighting-showroom-sathorn-plan': lightingShowroomPlan,
  'office-silom-plan': officeUpperFloorPlan,
  'hillside-house-chiang-mai-section': hillsideHouseSection,
};

async function main() {
  const seed = path.join(__dirname, '..', 'seed');
  const svgDir = path.join(seed, 'drawings');
  fs.mkdirSync(svgDir, { recursive: true });
  for (const [name, draw] of Object.entries(drawings)) {
    const svg = draw();
    fs.writeFileSync(path.join(svgDir, `${name}.svg`), svg);
    await sharp(Buffer.from(svg))
      .flatten({ background: PAPER })
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
      .withXmp(XMP)
      .toFile(path.join(seed, 'images', `${name}.jpg`));
    console.log(`drew ${name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
