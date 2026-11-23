// THE WORLD TODAY — Monday 23 November 2026.
// A program that draws one 1024x1024 newspaper front page in code and writes
// it to /output/entry.png (or $MAKEFUN_OUTPUT_DIR/entry.png). Node 22 stdlib
// only: the PNG bytes are encoded here by hand (zlib + CRC32), every shape is
// rasterised here, and every letter comes from a small bitmap font defined
// below. No downloaded images, no network.
//
// The day's news (researched 23 Nov 2026 from SCMP, The Manila Times, The
// Economic Times, Arab News and The Standard, cross-checked against each
// other): COP31 climate talks collapse in Turkey; US Democrats win a House
// majority of 258 seats, most since 1992; suspected Ukrainian sea drones hit
// the Russian warship Merkury at Benghazi; an Indonesia factory fire leaves
// dozens missing; Russian strikes kill 6 in the Kyiv region; BepiColombo
// reaches Mercury; drone strikes hit a UN building in Khartoum.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- PNG out

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function encodePng(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (1 + w * 4) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- canvas

type RGB = [number, number, number];

const PAPER: RGB = [246, 241, 227];
const INK: RGB = [26, 26, 26];
const RED: RGB = [179, 38, 30];
const BLUE: RGB = [31, 78, 121];
const TEAL: RGB = [14, 90, 90];
const GOLD: RGB = [201, 162, 39];
const SKY: RGB = [38, 84, 124];
const SEA: RGB = [28, 68, 110];
const WHITE: RGB = [250, 250, 246];
const GREY: RGB = [120, 116, 104];
const ORANGE: RGB = [224, 122, 26];
const GREEN: RGB = [46, 125, 70];

class Canvas {
  readonly w: number;
  readonly h: number;
  private px: Uint8ClampedArray;
  constructor(w: number, h: number, bg: RGB) {
    this.w = w;
    this.h = h;
    this.px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      this.px[i * 4] = bg[0];
      this.px[i * 4 + 1] = bg[1];
      this.px[i * 4 + 2] = bg[2];
      this.px[i * 4 + 3] = 255;
    }
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.set(xx, yy, c);
    }
  }
  // filled circle
  circle(cx: number, cy: number, r: number, c: RGB): void {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, c);
      }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }
  // thick line as a chain of filled discs
  line(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    for (let i = 0; i <= steps; i++) {
      this.circle(x0 + (dx * i) / steps, y0 + (dy * i) / steps, t / 2, c);
    }
  }
  polyline(pts: [number, number][], t: number, c: RGB): void {
    for (let i = 0; i + 1 < pts.length; i++) {
      this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], t, c);
    }
  }
  // filled polygon, scanline
  polygon(pts: [number, number][], c: RGB): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) this.set(x, y, c);
      }
    }
  }
  // ring: circle outline of thickness t
  ring(cx: number, cy: number, r: number, t: number, c: RGB): void {
    const r2 = (r + t / 2) * (r + t / 2);
    const r1 = (r - t / 2) * (r - t / 2);
    for (let y = Math.floor(cy - r - t); y <= Math.ceil(cy + r + t); y++) {
      for (let x = Math.floor(cx - r - t); x <= Math.ceil(cx + r + t); x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2 && d2 >= r1) this.set(x, y, c);
      }
    }
  }
  toPng(): Buffer {
    return encodePng(this.w, this.h, this.px);
  }
}

// ---------------------------------------------------------------- font
// A 5x7 bitmap font, uppercase letters, digits and punctuation, each glyph
// seven rows of five bits. Drawn by hand for this page; scaled up for
// headlines so it stays crisp and legible.

const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ',': [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ':': [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ';': [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  '?': [0x0e, 0x11, 0x01, 0x02, 0x04, 0, 0x04],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '"': [0x0a, 0x0a, 0x0a, 0, 0, 0, 0],
  '-': [0, 0, 0, 0x1f, 0, 0, 0],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  '/': [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  '%': [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  '&': [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  '$': [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  '+': [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  '=': [0, 0, 0x1f, 0, 0x1f, 0, 0],
  '•': [0, 0, 0x0c, 0x0c, 0x0c, 0, 0],
  '—': [0, 0, 0, 0x1f, 0, 0, 0],
};

const CHAR_W = 6; // 5 px glyph + 1 px gap

function textWidth(s: string, scale: number): number {
  return s.length * CHAR_W * scale - scale;
}

function drawChar(cv: Canvas, ch: string, x: number, y: number, scale: number, c: RGB): void {
  const g = FONT[ch] ?? FONT[' '];
  for (let r = 0; r < 7; r++) {
    const row = g[r];
    for (let col = 0; col < 5; col++) {
      if (row & (0x10 >> col)) {
        cv.rect(x + col * scale, y + r * scale, scale, scale, c);
      }
    }
  }
}

function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB): void {
  for (let i = 0; i < s.length; i++) {
    drawChar(cv, s[i], x + i * CHAR_W * scale, y, scale, c);
  }
}

function drawTextCentred(cv: Canvas, s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(cv, s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}

// Word-wrap into lines that fit maxWidth, then draw them left-aligned.
function drawWrapped(
  cv: Canvas,
  s: string,
  x: number,
  y: number,
  maxWidth: number,
  scale: number,
  c: RGB,
  lineH: number,
): number {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (textWidth(trial, scale) <= maxWidth || !cur) cur = trial;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  lines.forEach((ln, i) => drawText(cv, ln, x, y + i * lineH, scale, c));
  return y + lines.length * lineH;
}

// Centre each wrapped line on cx.
function drawWrappedCentred(
  cv: Canvas,
  s: string,
  cx: number,
  y: number,
  maxWidth: number,
  scale: number,
  c: RGB,
  lineH: number,
): number {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (textWidth(trial, scale) <= maxWidth || !cur) cur = trial;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  lines.forEach((ln, i) => drawTextCentred(cv, ln, cx, y + i * lineH, scale, c));
  return y + lines.length * lineH;
}

// ---------------------------------------------------------------- pictures
// Every picture is drawn from shapes: no photographs, no downloaded art.

// Lead picture: a cracked Earth over a dark sky, with storm clouds and a
// broken summit table below it — the climate talks falling apart.
function drawGlobe(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, SKY);
  // stars
  const stars: [number, number][] = [
    [0.08, 0.1], [0.2, 0.05], [0.85, 0.08], [0.93, 0.2], [0.05, 0.35],
    [0.78, 0.3], [0.9, 0.45], [0.12, 0.55], [0.7, 0.12],
  ];
  for (const [fx, fy] of stars) cv.circle(x + fx * w, y + fy * h, 2, WHITE);
  const cx = x + w * 0.5;
  const cy = y + h * 0.42;
  const r = Math.min(w, h) * 0.3;
  // earth
  cv.circle(cx, cy, r, [44, 110, 180]);
  // continents (green blobs clipped roughly to the disc by drawing inside it)
  cv.ellipse(cx - r * 0.42, cy - r * 0.3, r * 0.34, r * 0.2, GREEN);
  cv.ellipse(cx + r * 0.35, cy + r * 0.1, r * 0.3, r * 0.24, GREEN);
  cv.ellipse(cx - r * 0.1, cy + r * 0.45, r * 0.26, r * 0.16, GREEN);
  cv.ellipse(cx + r * 0.55, cy - r * 0.42, r * 0.16, r * 0.12, GREEN);
  // polar cap
  cv.ellipse(cx, cy - r * 0.86, r * 0.42, r * 0.14, WHITE);
  // clouds
  cv.ellipse(cx - r * 0.55, cy - r * 0.62, r * 0.3, r * 0.1, WHITE);
  cv.ellipse(cx + r * 0.5, cy + r * 0.55, r * 0.34, r * 0.1, WHITE);
  // the crack: a jagged black split across the globe, glowing red at its ends
  const crack: [number, number][] = [
    [cx - r * 0.55, cy - r * 0.78],
    [cx - r * 0.3, cy - r * 0.4],
    [cx - r * 0.48, cy - r * 0.05],
    [cx - r * 0.15, cy + r * 0.3],
    [cx - r * 0.32, cy + r * 0.62],
    [cx + r * 0.05, cy + r * 0.9],
  ];
  cv.polyline(crack, 7, [12, 12, 12]);
  cv.circle(crack[0][0], crack[0][1], 9, RED);
  cv.circle(crack[crack.length - 1][0], crack[crack.length - 1][1], 9, RED);
  // a second, thinner crack
  cv.polyline(
    [
      [cx + r * 0.6, cy - r * 0.55],
      [cx + r * 0.35, cy - r * 0.2],
      [cx + r * 0.55, cy + r * 0.15],
      [cx + r * 0.3, cy + r * 0.5],
    ],
    5,
    [12, 12, 12],
  );
  // broken summit table at the bottom: a long table, two empty chairs, a
  // snapped flagpole
  const ty = y + h * 0.86;
  cv.rect(x + w * 0.08, ty, w * 0.84, 10, [90, 60, 30]);
  cv.rect(x + w * 0.08, ty + 10, w * 0.84, 4, [60, 40, 20]);
  // chairs
  for (const fx of [0.18, 0.82]) {
    const chx = x + w * fx;
    cv.rect(chx - 16, ty - 34, 32, 8, INK);
    cv.rect(chx - 16, ty - 34, 5, 52, INK);
    cv.rect(chx + 11, ty - 34, 5, 52, INK);
  }
  // snapped flagpole, leaning, flag torn
  cv.line(x + w * 0.5, ty, x + w * 0.56, ty - 58, 5, INK);
  cv.polygon(
    [
      [x + w * 0.56, ty - 58],
      [x + w * 0.66, ty - 50],
      [x + w * 0.56, ty - 40],
    ],
    RED,
  );
  // rising smoke from the broken table is left out: on the dark sky it
  // read as stray white blobs.
}

// US Capitol dome on a blue field, with a ballot box in front.
function drawCapitol(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, BLUE);
  cv.circle(x + w * 0.82, y + h * 0.2, 14, GOLD); // sun
  const cx = x + w * 0.5;
  const base = y + h * 0.88;
  // building base and wings
  cv.rect(x + w * 0.12, base - 34, w * 0.76, 34, WHITE);
  cv.rect(x + w * 0.2, base - 52, w * 0.6, 20, WHITE);
  // columns
  for (let i = 0; i < 7; i++) {
    cv.rect(x + w * (0.22 + i * 0.093), base - 52, 7, 52, [210, 210, 205]);
  }
  // dome
  cv.ellipse(cx, base - 52, w * 0.13, h * 0.3, WHITE);
  cv.rect(cx - w * 0.13, base - 56, w * 0.26, 8, WHITE);
  cv.rect(cx - 3, base - 52 - h * 0.3 - 22, 6, 24, INK);
  cv.circle(cx, base - 52 - h * 0.3 - 24, 5, RED);
  // ballot box, clear of the columns, sitting on the steps
  const bx = x + w * 0.74;
  const by = base - 22;
  cv.rect(bx, by, 34, 22, INK);
  cv.rect(bx - 3, by - 5, 40, 6, INK);
  cv.polygon(
    [
      [bx + 12, by - 16],
      [bx + 22, by - 16],
      [bx + 20, by - 5],
      [bx + 14, by - 5],
    ],
    WHITE,
  );
  // steps
  cv.rect(x + w * 0.3, base, w * 0.4, 5, [210, 210, 205]);
  cv.rect(x + w * 0.26, base + 5, w * 0.48, 5, [190, 190, 185]);
}

// A grey warship on dark waves, hit by a small drone above it, smoke rising.
function drawWarship(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, [16, 24, 38]);
  // moon
  cv.circle(x + w * 0.85, y + h * 0.16, 13, [235, 230, 200]);
  const wy = y + h * 0.62;
  // waves
  for (let i = 0; i < 3; i++) {
    const yy = wy + 26 + i * 22;
    for (let px = 0; px < w; px += 4) {
      const wave = Math.sin((px / w) * Math.PI * 3 + i * 1.7) * 5;
      cv.rect(x + px, yy + wave, 4, 3, [70, 110, 160]);
    }
  }
  // hull
  cv.polygon(
    [
      [x + w * 0.08, wy],
      [x + w * 0.9, wy],
      [x + w * 0.82, wy + 26],
      [x + w * 0.16, wy + 26],
    ],
    [120, 126, 132],
  );
  cv.rect(x + w * 0.08, wy, w * 0.82, 6, [90, 96, 102]);
  // superstructure + mast
  cv.rect(x + w * 0.42, wy - 34, w * 0.2, 34, [100, 106, 112]);
  cv.rect(x + w * 0.5, wy - 58, 5, 26, [90, 96, 102]);
  cv.circle(x + w * 0.52, wy - 60, 4, RED);
  // gun turret
  cv.rect(x + w * 0.16, wy - 18, w * 0.14, 18, [100, 106, 112]);
  cv.line(x + w * 0.3, wy - 12, x + w * 0.4, wy - 16, 5, [80, 86, 92]);
  // the strike: an explosion burst on the deck and a drone above
  cv.circle(x + w * 0.68, wy - 12, 16, ORANGE);
  cv.circle(x + w * 0.68, wy - 12, 9, [250, 220, 80]);
  cv.circle(x + w * 0.68, wy - 12, 4, WHITE);
  // smoke
  cv.ellipse(x + w * 0.68, wy - 44, 14, 20, [110, 110, 108]);
  cv.ellipse(x + w * 0.74, wy - 62, 10, 14, [140, 140, 138]);
  // drone
  const dx = x + w * 0.3;
  const dy = y + h * 0.2;
  cv.rect(dx - 10, dy - 5, 20, 10, INK);
  cv.circle(dx - 16, dy - 8, 7, [60, 60, 60]);
  cv.circle(dx + 16, dy - 8, 7, [60, 60, 60]);
  cv.line(dx - 24, dy - 8, dx - 8, dy - 8, 2, [60, 60, 60]);
  cv.line(dx + 8, dy - 8, dx + 24, dy - 8, 2, [60, 60, 60]);
  cv.circle(dx, dy + 3, 3, RED);
}

// A factory with chimneys, flames and thick smoke — the Java fire.
function drawFactory(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, [58, 44, 36]);
  const by = y + h * 0.86;
  // factory block
  cv.rect(x + w * 0.1, by - 52, w * 0.5, 52, [96, 88, 80]);
  cv.rect(x + w * 0.1, by - 52, w * 0.5, 8, [70, 64, 58]);
  // windows
  for (let i = 0; i < 4; i++) {
    cv.rect(x + w * (0.16 + i * 0.11), by - 38, 12, 14, [250, 220, 90]);
  }
  // chimneys
  cv.rect(x + w * 0.66, by - 92, 14, 92, [80, 72, 64]);
  cv.rect(x + w * 0.8, by - 74, 12, 74, [80, 72, 64]);
  // flames licking from the roof
  const flame = (fx: number, fh: number, c: RGB) => {
    cv.polygon(
      [
        [fx - 14, by - 52],
        [fx - 6, by - 52 - fh],
        [fx, by - 52 - fh * 0.55],
        [fx + 6, by - 52 - fh],
        [fx + 14, by - 52],
      ],
      c,
    );
  };
  flame(x + w * 0.24, 46, ORANGE);
  flame(x + w * 0.38, 58, ORANGE);
  flame(x + w * 0.5, 40, ORANGE);
  flame(x + w * 0.38, 34, [250, 220, 80]);
  flame(x + w * 0.24, 26, [250, 220, 80]);
  // smoke
  cv.ellipse(x + w * 0.7, y + h * 0.2, 22, 13, [120, 118, 112]);
  cv.ellipse(x + w * 0.82, y + h * 0.12, 16, 10, [140, 138, 132]);
  // ground line
  cv.rect(x, by, w, 4, INK);
}

// Small square icons for the bottom strip.
function drawIconFlame(cv: Canvas, x: number, y: number, s: number): void {
  cv.rect(x, y, s, s, [58, 44, 36]);
  cv.polygon(
    [
      [x + s * 0.2, y + s * 0.8],
      [x + s * 0.35, y + s * 0.3],
      [x + s * 0.5, y + s * 0.55],
      [x + s * 0.65, y + s * 0.25],
      [x + s * 0.8, y + s * 0.8],
    ],
    ORANGE,
  );
}
function drawIconPlanet(cv: Canvas, x: number, y: number, s: number): void {
  cv.rect(x, y, s, s, SKY);
  cv.circle(x + s * 0.5, y + s * 0.5, s * 0.26, [44, 110, 180]);
  cv.ellipse(x + s * 0.5, y + s * 0.5, s * 0.4, s * 0.09, GOLD);
  cv.circle(x + s * 0.78, y + s * 0.24, s * 0.05, WHITE);
}
function drawIconBuilding(cv: Canvas, x: number, y: number, s: number): void {
  cv.rect(x, y, s, s, [220, 214, 196]);
  cv.rect(x + s * 0.2, y + s * 0.3, s * 0.6, s * 0.5, BLUE);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      cv.rect(x + s * (0.28 + i * 0.18), y + s * (0.38 + j * 0.18), s * 0.09, s * 0.09, [250, 220, 90]);
    }
  }
}

// ---------------------------------------------------------------- the page

const W = 1024;
const H = 1024;
const M = 36; // margin

function drawPage(): Canvas {
  const cv = new Canvas(W, H, PAPER);

  // outer double border
  cv.rect(12, 12, W - 24, 3, INK);
  cv.rect(12, H - 15, W - 24, 3, INK);
  cv.rect(12, 12, 3, H - 24, INK);
  cv.rect(W - 15, 12, 3, H - 24, INK);
  cv.rect(22, 22, W - 44, 1, INK);
  cv.rect(22, H - 23, W - 44, 1, INK);
  cv.rect(22, 22, 1, H - 44, INK);
  cv.rect(W - 23, 22, 1, H - 44, INK);

  // ---- masthead
  drawTextCentred(cv, 'THE WORLD TODAY', W / 2, 44, 8, INK);
  cv.rect(M, 116, W - 2 * M, 2, INK);
  drawTextCentred(cv, 'MONDAY, 23 NOVEMBER 2026', W / 2, 130, 3, RED);
  cv.rect(M, 162, W - 2 * M, 4, INK);
  cv.rect(M, 170, W - 2 * M, 1, INK);

  // ---- lead story: COP31 collapse
  drawGlobe(cv, M, 186, 520, 374);
  const rx = 580;
  const rw = W - M - rx; // 408
  drawText(cv, 'CLIMATE • COP31 • TURKEY', rx, 192, 2, RED);
  drawText(cv, 'CLIMATE TALKS', rx, 222, 5, INK);
  drawText(cv, 'COLLAPSE', rx, 264, 5, INK);
  cv.rect(rx, 316, rw, 2, INK);
  drawWrapped(
    cv,
    'NEARLY 200 NATIONS FAIL TO AGREE IN TURKEY AS COP31 ENDS WITHOUT A DEAL.',
    rx,
    332,
    rw,
    2,
    INK,
    20,
  );
  drawText(cv, '"NO AMBIGUITY IN THE SCIENCE"', rx, 436, 2, RED);
  drawText(cv, '— UN CHIEF GUTERRES', rx, 458, 2, INK);
  cv.rect(rx, 492, rw, 1, GREY);
  drawWrapped(
    cv,
    'FOSSIL FUEL DIVISIONS DOOMED THE DEAL.',
    rx,
    506,
    rw,
    2,
    INK,
    18,
  );

  // ---- divider
  cv.rect(M, 578, W - 2 * M, 3, INK);

  // ---- three columns
  const colW = 301;
  const colX = [M, M + colW + 24, M + 2 * (colW + 24)];
  const cy = 596;

  // 1. US House
  drawCapitol(cv, colX[0], cy, colW, 120);
  drawText(cv, 'UNITED STATES', colX[0], cy + 130, 2, RED);
  drawText(cv, 'DEMOCRATS', colX[0], cy + 150, 4, INK);
  drawText(cv, 'TAKE HOUSE', colX[0], cy + 182, 4, INK);
  drawWrapped(cv, '258 SEATS — THE MOST SINCE 1992.', colX[0], cy + 220, colW, 2, INK, 18);

  // 2. Libya warship
  drawWarship(cv, colX[1], cy, colW, 120);
  drawText(cv, 'LIBYA', colX[1], cy + 130, 2, RED);
  drawText(cv, 'DRONES HIT', colX[1], cy + 150, 4, INK);
  drawText(cv, 'WARSHIP', colX[1], cy + 182, 4, INK);
  drawWrapped(cv, 'RUSSIAN CORVETTE BADLY DAMAGED; 10 HURT.', colX[1], cy + 220, colW, 2, INK, 18);

  // 3. Indonesia factory fire
  drawFactory(cv, colX[2], cy, colW, 120);
  drawText(cv, 'INDONESIA', colX[2], cy + 130, 2, RED);
  drawText(cv, 'FACTORY FIRE', colX[2], cy + 150, 4, INK);
  drawText(cv, 'MANY MISSING', colX[2], cy + 182, 4, INK);
  drawWrapped(cv, '24 BODY BAGS RECOVERED IN JAVA; SEARCH RESUMES.', colX[2], cy + 220, colW, 2, INK, 18);

  // ---- divider
  cv.rect(M, 860, W - 2 * M, 3, INK);

  // ---- bottom strip: three small stories
  const by = 878;
  const items: { icon: (cv: Canvas, x: number, y: number, s: number) => void; head: string[]; sub: string[] }[] = [
    {
      icon: drawIconBuilding,
      head: ['RUSSIAN STRIKES', 'KILL 6 IN KYIV'],
      sub: ['DYMER FLATS HIT;', '11 MISSING'],
    },
    {
      icon: drawIconPlanet,
      head: ['BEPICOLOMBO', 'REACHES MERCURY'],
      sub: ['SECOND MISSION', 'EVER IN ORBIT'],
    },
    {
      icon: drawIconFlame,
      head: ['DRONES HIT UN', 'SITE IN KHARTOUM'],
      sub: ['STRIKES HIT', 'SUDAN CAPITAL'],
    },
  ];
  items.forEach((it, i) => {
    const ix = colX[i];
    it.icon(cv, ix, by, 56);
    const tx = ix + 66;
    it.head.forEach((ln, j) => drawText(cv, ln, tx, by + 4 + j * 18, 2, INK));
    it.sub.forEach((ln, j) => drawText(cv, ln, tx, by + 44 + j * 16, 2, GREY));
  });

  // ---- footer
  cv.rect(M, 962, W - 2 * M, 1, INK);
  drawTextCentred(cv, 'THE WORLD TODAY • MONDAY 23 NOVEMBER 2026', W / 2, 976, 2, INK);

  return cv;
}

// ---------------------------------------------------------------- run

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const png = drawPage().toPng();
writeFileSync(join(outDir, 'entry.png'), png);
