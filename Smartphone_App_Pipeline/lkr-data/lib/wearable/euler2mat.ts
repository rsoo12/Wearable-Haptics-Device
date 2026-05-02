/**
 * Rotation matrix from Euler angles, `transforms3d.euler.euler2mat(..., axes='sxyz')`.
 * Matrix applied on the left to column vectors.
 */
const NEXT_AXIS = [1, 2, 0, 1];

export function euler2matSxyz(ai: number, aj: number, ak: number): number[][] {
  const firstaxis = 0;
  const parity = 0;
  const repetition = 0;
  const frame = 0;

  let a1 = ai;
  let a2 = aj;
  let a3 = ak;
  if (frame) {
    const t = a1;
    a1 = a3;
    a3 = t;
  }
  if (parity) {
    a1 = -a1;
    a2 = -a2;
    a3 = -a3;
  }

  const si = Math.sin(a1);
  const sj = Math.sin(a2);
  const sk = Math.sin(a3);
  const ci = Math.cos(a1);
  const cj = Math.cos(a2);
  const ck = Math.cos(a3);
  const cc = ci * ck;
  const cs = ci * sk;
  const sc = si * ck;
  const ss = si * sk;

  const i = firstaxis;
  const j = NEXT_AXIS[i + parity];
  const k = NEXT_AXIS[i - parity + 1];

  const M = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  if (repetition) {
    M[i][i] = cj;
    M[i][j] = sj * si;
    M[i][k] = sj * ci;
    M[j][i] = sj * sk;
    M[j][j] = -cj * ss + cc;
    M[j][k] = -cj * cs - sc;
    M[k][i] = -sj * ck;
    M[k][j] = cj * sc + cs;
    M[k][k] = cj * cc - ss;
  } else {
    M[i][i] = cj * ck;
    M[i][j] = sj * sc - cs;
    M[i][k] = sj * cc + ss;
    M[j][i] = cj * sk;
    M[j][j] = sj * ss + cc;
    M[j][k] = sj * cs - sc;
    M[k][i] = -sj;
    M[k][j] = cj * si;
    M[k][k] = cj * ci;
  }

  return M;
}
