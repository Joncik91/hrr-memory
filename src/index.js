/**
 * hrr-memory — Holographic Reduced Representations for structured agent memory.
 *
 * Zero dependencies. Pure JS. Float32 storage. Auto-sharding.
 *
 * Usage:
 *   import { HRRMemory } from 'hrr-memory';
 *   const mem = new HRRMemory();
 *   mem.store('alice', 'lives_in', 'paris');
 *   mem.query('alice', 'lives_in'); // → { match: 'paris', score: 0.3, confident: true }
 *
 * Based on Plate (1994): "Distributed Representations and Nested Compositional Structure"
 */

export { HRRMemory } from './memory.js';
export { SymbolTable } from './symbols.js';
export { Bucket } from './bucket.js';
export { bind, unbind, similarity, randomVector, normalize } from './ops.js';
