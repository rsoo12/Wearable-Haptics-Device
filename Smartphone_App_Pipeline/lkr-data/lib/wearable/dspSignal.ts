/**
 * SciPy/NumPy signal helpers used by FPA (Butterworth, filtfilt, convolve, Hanning).
 * Ported from scipy.signal / numpy semantics for on-device parity with Python.
 */

type C = { re: number; im: number };

const czero: C = { re: 0, im: 0 };
const cone: C = { re: 1, im: 0 };

function cadd(a: C, b: C): C {
  return { re: a.re + b.re, im: a.im + b.im };
}

function csub(a: C, b: C): C {
  return { re: a.re - b.re, im: a.im - b.im };
}

function cmul(a: C, b: C): C {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function cdiv(a: C, b: C): C {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) return { re: 0, im: 0 };
  return {
    re: (a.re * b.re + a.im * b.im) / d,
    im: (a.im * b.re - a.re * b.im) / d,
  };
}

function cscale(t: number, a: C): C {
  return { re: t * a.re, im: t * a.im };
}

function polyMulAsc(p: C[], q: C[]): C[] {
  const out: C[] = Array.from({ length: p.length + q.length - 1 }, () => ({ re: 0, im: 0 }));
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      const t = cmul(p[i], q[j]);
      const k = i + j;
      out[k] = cadd(out[k], t);
    }
  }
  return out;
}

function polyFromRootsAsc(roots: C[]): C[] {
  let p: C[] = [cone];
  for (const r of roots) {
    const factor: C[] = [cscale(-1, r), cone];
    p = polyMulAsc(p, factor);
  }
  return p;
}

function ascToDescReal(p: C[]): number[] {
  const d = p.length - 1;
  const out = new Array<number>(p.length);
  for (let i = 0; i < p.length; i++) {
    const c = p[d - i];
    if (Math.abs(c.im) > 1e-9) {
      throw new Error('Expected real polynomial coefficients');
    }
    out[i] = c.re;
  }
  return out;
}

function polyScaleDesc(b: number[], k: number): number[] {
  return b.map((v) => v * k);
}

function relativeDegree(z: C[], p: C[]): number {
  return p.length - z.length;
}

function buttap(N: number): { z: C[]; p: C[]; k: number } {
  if (N !== Math.floor(N) || N < 0) {
    throw new Error('Filter order must be a nonnegative integer');
  }
  const m: number[] = [];
  for (let v = -N + 1; v < N; v += 2) {
    m.push(v);
  }
  const p = m.map((mm) => {
    const th = (Math.PI * mm) / (2 * N);
    return { re: -Math.cos(th), im: -Math.sin(th) };
  });
  return { z: [], p, k: 1 };
}

function lp2lpZpk(z: C[], p: C[], k: number, wo: number): { z: C[]; p: C[]; k: number } {
  const deg = relativeDegree(z, p);
  const zLp = z.map((c) => cscale(wo, c));
  const pLp = p.map((c) => cscale(wo, c));
  const kLp = k * wo ** deg;
  return { z: zLp, p: pLp, k: kLp };
}

function cprod(vals: C[]): C {
  let acc = cone;
  for (const v of vals) {
    acc = cmul(acc, v);
  }
  return acc;
}

function bilinearZpk(z: C[], p: C[], k: number, fs: number): { z: C[]; p: C[]; k: number } {
  const deg = relativeDegree(z, p);
  const fs2 = 2 * fs;
  const zZ = z.map((c) => cdiv(cadd({ re: fs2, im: 0 }, c), csub({ re: fs2, im: 0 }, c)));
  const pZ = p.map((c) => cdiv(cadd({ re: fs2, im: 0 }, c), csub({ re: fs2, im: 0 }, c)));
  const zExtra: C[] = Array.from({ length: deg }, () => ({ re: -1, im: 0 }));
  const allZ = [...zZ, ...zExtra];
  const num = cprod(z.map((c) => csub({ re: fs2, im: 0 }, c)));
  const den = cprod(p.map((c) => csub({ re: fs2, im: 0 }, c)));
  const ratio = cdiv(num, den);
  const kZ = k * ratio.re;
  return { z: allZ, p: pZ, k: kZ };
}

export function butterLowpassBa(order: number, wn: number): { b: number[]; a: number[] } {
  if (wn <= 0 || wn >= 1) {
    throw new Error('Digital Wn must be in (0, 1) (fraction of Nyquist, scipy style)');
  }
  const { z, p, k } = buttap(order);
  const fs = 2;
  const warped = 2 * fs * Math.tan((Math.PI * wn) / fs);
  const lp = lp2lpZpk(z, p, k, warped);
  const dig = bilinearZpk(lp.z, lp.p, lp.k, fs);
  return zpk2tf(dig.z, dig.p, dig.k);
}

function zpk2tf(z: C[], p: C[], k: number): { b: number[]; a: number[] } {
  const bAsc = z.length === 0 ? [cone] : polyFromRootsAsc(z);
  const aAsc = polyFromRootsAsc(p);
  let bDesc = ascToDescReal(bAsc);
  const aDesc = ascToDescReal(aAsc);
  bDesc = polyScaleDesc(bDesc, k);
  return { b: bDesc, a: aDesc };
}

function normalizeBa(b: number[], a: number[]): { b: number[]; a: number[] } {
  const a0 = a[0];
  return {
    b: b.map((v) => v / a0),
    a: a.map((v) => v / a0),
  };
}

function padBa(b: number[], a: number[]): { b: number[]; a: number[] } {
  const n = Math.max(b.length, a.length);
  return {
    b: [...b, ...new Array(n - b.length).fill(0)],
    a: [...a, ...new Array(n - a.length).fill(0)],
  };
}

/** scipy.linalg.companion(c) for coeffs [c0, c1, ... cn] with c0 + c1 x + ... (first is low degree). */
function companionTransposeFromA(aDesc: number[]): number[][] {
  const a = aDesc.slice();
  if (a[0] !== 1) {
    throw new Error('Expected normalized denominator');
  }
  const rest = a.slice(1);
  const m = rest.length;
  if (m === 0) return [];
  const A: number[][] = [];
  for (let r = 0; r < m; r++) {
    A[r] = new Array(m).fill(0);
  }
  for (let c = 0; c < m; c++) {
    A[0][c] = -rest[c];
  }
  for (let r = 1; r < m; r++) {
    A[r][r - 1] = 1;
  }
  return transpose(A);
}

function transpose(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0].length;
  const T: number[][] = [];
  for (let c = 0; c < cols; c++) {
    T[c] = [];
    for (let r = 0; r < rows; r++) {
      T[c][r] = A[r][c];
    }
  }
  return T;
}

function matVec(A: number[][], x: number[]): number[] {
  return A.map((row) => row.reduce((s, v, i) => s + v * x[i], 0));
}

/** Returns I - A (scipy: `eye(n) - companion(a).T`). */
function identityMinus(A: number[][]): number[][] {
  const n = A.length;
  const M: number[][] = [];
  for (let i = 0; i < n; i++) {
    M[i] = [];
    for (let j = 0; j < n; j++) {
      M[i][j] = (i === j ? 1 : 0) - A[i][j];
    }
  }
  return M;
}

function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) {
        piv = r;
      }
    }
    [M[col], M[piv]] = [M[piv], M[col]];
    const div = M[col][col];
    if (Math.abs(div) < 1e-18) {
      throw new Error('Singular matrix in lfilter_zi');
    }
    for (let c = col; c <= n; c++) {
      M[col][c] /= div;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) {
        M[r][c] -= f * M[col][c];
      }
    }
  }
  return M.map((row) => row[n]);
}

export function lfilterZi(b: number[], a: number[]): number[] {
  let bn = [...b];
  let an = [...a];
  while (an.length > 1 && an[0] === 0) {
    an = an.slice(1);
  }
  if (an.length < 1) {
    throw new Error('Invalid denominator');
  }
  if (an[0] !== 1) {
    const a0 = an[0];
    bn = bn.map((v) => v / a0);
    an = an.map((v) => v / a0);
  }
  const padded = padBa(bn, an);
  bn = padded.b;
  an = padded.a;
  const n = bn.length;
  const m = n - 1;
  if (m === 0) return [];
  const Ac = companionTransposeFromA(an);
  const IminusA = identityMinus(Ac);
  const B = new Array(m);
  for (let i = 0; i < m; i++) {
    B[i] = bn[i + 1] - an[i + 1] * bn[0];
  }
  return solveLinear(IminusA, B);
}

/**
 * scipy.signal.lfilter — direct Form II transposed, 1-D.
 */
export function lfilter(b: number[], a: number[], x: number[], zi?: number[]): number[] {
  const norm = normalizeBa(b, a);
  const pad = padBa(norm.b, norm.a);
  const bp = pad.b;
  const ap = pad.a;
  const n = bp.length;
  const m = n - 1;
  const z = zi ? [...zi] : new Array(m).fill(0);
  if (z.length !== m) {
    throw new Error(`zi length must be ${m}`);
  }
  const y = new Array<number>(x.length);
  for (let i = 0; i < x.length; i++) {
    y[i] = bp[0] * x[i] + z[0];
    for (let j = 0; j < m - 1; j++) {
      z[j] = bp[j + 1] * x[i] - ap[j + 1] * y[i] + z[j + 1];
    }
    if (m > 0) {
      z[m - 1] = bp[m] * x[i] - ap[m] * y[i];
    }
  }
  return y;
}

export function oddExt1d(x: number[], n: number): number[] {
  if (n < 1) {
    return x.slice();
  }
  if (n > x.length - 1) {
    throw new Error(`odd_ext: n=${n} too large for len=${x.length}`);
  }
  const leftEnd = x[0];
  const leftExt: number[] = [];
  for (let i = n; i >= 1; i--) {
    leftExt.push(x[i]);
  }
  const left = leftExt.map((v) => 2 * leftEnd - v);
  const rightEnd = x[x.length - 1];
  const rightExt: number[] = [];
  for (let k = 0; k < n; k++) {
    rightExt.push(x[x.length - 2 - k]);
  }
  const right = rightExt.map((v) => 2 * rightEnd - v);
  return [...left, ...x, ...right];
}

/** scipy filtfilt with method="pad", padtype="odd", default padlen. */
export function filtfilt1d(b: number[], a: number[], x: number[]): number[] {
  const ntaps = Math.max(a.length, b.length);
  const edge = ntaps * 3;
  if (x.length <= edge) {
    throw new Error(`x length must be > padlen (${edge}) for filtfilt`);
  }
  const ext = oddExt1d(x, edge);
  const zi = lfilterZi(b, a);
  const x0 = ext[0];
  const ziScaled = zi.map((v) => v * x0);
  let y = lfilter(b, a, ext, ziScaled);
  const y0 = y[y.length - 1];
  const zi2 = zi.map((v) => v * y0);
  y = lfilter(b, a, y.slice().reverse(), zi2);
  y.reverse();
  return y.slice(edge, y.length - edge);
}

export function conv1dFull(a: number[], v: number[]): number[] {
  const out = new Array(a.length + v.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < v.length; j++) {
      out[i + j] += a[i] * v[j];
    }
  }
  return out;
}

/** numpy.convolve(..., mode="same") length = max(len(a), len(v)). */
export function conv1dSame(a: number[], v: number[]): number[] {
  const full = conv1dFull(a, v);
  const n = Math.max(a.length, v.length);
  const start = Math.floor((full.length - n) / 2);
  return full.slice(start, start + n);
}

export function hanning(n: number): number[] {
  if (n === 1) return [1];
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  }
  return out;
}

/** Matches scipy.signal.butter + filtfilt for 1-D or column axis-0 2-D (call per column). */
export function dataFilt(
  data: number[],
  cutOffFre = 3.8,
  samplingFre = 100,
  filterOrder = 4,
): number[] {
  const wn = cutOffFre / (samplingFre / 2);
  const { b, a } = butterLowpassBa(filterOrder, wn);
  return filtfilt1d(b, a, data);
}
