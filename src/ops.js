/**
 * Core HRR operations — circular convolution, correlation, similarity.
 * All vectors are Float32Array. FFT computed in Float64 for precision.
 */

/** Generate a random unit vector of dimension d (Gaussian, normalized) */
export function randomVector(d) {
  const v = new Float32Array(d);
  for (let i = 0; i < d; i += 2) {
    const u1 = Math.random(), u2 = Math.random();
    const r = Math.sqrt(-2 * Math.log(u1));
    v[i] = r * Math.cos(2 * Math.PI * u2);
    if (i + 1 < d) v[i + 1] = r * Math.sin(2 * Math.PI * u2);
  }
  return normalize(v);
}

/** Normalize vector to unit length */
export function normalize(v) {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

/** Cosine similarity between two vectors */
export function similarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

// ── FFT (Cooley-Tukey radix-2) ──

function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? -1 : 1) * 2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i+j], uIm = im[i+j];
        const vRe = re[i+j+len/2]*curRe - im[i+j+len/2]*curIm;
        const vIm = re[i+j+len/2]*curIm + im[i+j+len/2]*curRe;
        re[i+j] = uRe+vRe; im[i+j] = uIm+vIm;
        re[i+j+len/2] = uRe-vRe; im[i+j+len/2] = uIm-vIm;
        const nr = curRe*wRe - curIm*wIm;
        curIm = curRe*wIm + curIm*wRe;
        curRe = nr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}

function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

/**
 * Circular convolution (binding): a ⊛ b
 * Creates an association between two vectors.
 * Computed in Float64, returned as Float32.
 */
export function bind(a, b) {
  const d = a.length, n = nextPow2(d);
  const aR = new Float64Array(n), aI = new Float64Array(n);
  const bR = new Float64Array(n), bI = new Float64Array(n);
  for (let i = 0; i < d; i++) { aR[i] = a[i]; bR[i] = b[i]; }
  fft(aR, aI, false); fft(bR, bI, false);
  const cR = new Float64Array(n), cI = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cR[i] = aR[i]*bR[i] - aI[i]*bI[i];
    cI[i] = aR[i]*bI[i] + aI[i]*bR[i];
  }
  fft(cR, cI, true);
  const out = new Float32Array(d);
  for (let i = 0; i < d; i++) out[i] = cR[i];
  return out;
}

/**
 * Circular correlation (unbinding): retrieve from association.
 * unbind(key, memory) ≈ the value that was bound with key.
 */
export function unbind(key, memory) {
  const d = key.length;
  const inv = new Float32Array(d);
  inv[0] = key[0];
  for (let i = 1; i < d; i++) inv[i] = key[d - i];
  return bind(inv, memory);
}
