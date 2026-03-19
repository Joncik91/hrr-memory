/**
 * Shared symbol table — maps string names to random vectors.
 * Shared across all buckets to save memory.
 */

import { randomVector, similarity } from './ops.js';

export class SymbolTable {
  constructor(d = 2048) {
    this.d = d;
    this.symbols = new Map();
  }

  /** Get or create a vector for a symbol name */
  get(name) {
    const key = name.toLowerCase().trim();
    if (!this.symbols.has(key)) this.symbols.set(key, randomVector(this.d));
    return this.symbols.get(key);
  }

  /** Check if a symbol exists */
  has(name) { return this.symbols.has(name.toLowerCase().trim()); }

  /** Number of symbols */
  get size() { return this.symbols.size; }

  /** Memory footprint in bytes */
  get bytes() { return this.symbols.size * this.d * 4; }

  /** Find the nearest symbol(s) to a result vector */
  nearest(vec, candidates = null, topK = 1) {
    const source = candidates || this.symbols;
    const results = [];
    for (const [name, svec] of source) {
      results.push({ name, score: similarity(vec, svec) });
    }
    results.sort((a, b) => b.score - a.score);
    return topK === 1 ? results[0] || null : results.slice(0, topK);
  }

  /** Serialize to plain object */
  toJSON() {
    const out = {};
    for (const [k, v] of this.symbols) out[k] = Array.from(v);
    return out;
  }

  /** Deserialize from plain object */
  static fromJSON(data, d) {
    const st = new SymbolTable(d);
    for (const [k, v] of Object.entries(data)) {
      st.symbols.set(k, new Float32Array(v));
    }
    return st;
  }
}
