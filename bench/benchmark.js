/**
 * HRR Memory benchmarks — store, query, accuracy at scale.
 */

import { HRRMemory } from '../src/index.js';

function bench(name, fn) {
  const t0 = performance.now();
  const result = fn();
  const ms = performance.now() - t0;
  console.log(`${name}: ${ms.toFixed(0)}ms`, result ? `(${result})` : '');
  return ms;
}

console.log('hrr-memory benchmark\n');

// ── Small: 25 facts (single bucket) ──
console.log('--- 25 facts (1 bucket) ---');
const small = new HRRMemory();
bench('store 25', () => {
  for (let i = 0; i < 25; i++) small.store('s', 'r' + i, 'v' + i);
});
bench('query 25', () => {
  let ok = 0;
  for (let i = 0; i < 25; i++) if (small.query('s', 'r' + i).match === 'v' + i) ok++;
  return ok + '/25';
});

// ── Medium: 500 facts (50 subjects × 10) ──
console.log('\n--- 500 facts (50 subjects × 10) ---');
const med = new HRRMemory();
bench('store 500', () => {
  for (let s = 0; s < 50; s++) for (let f = 0; f < 10; f++) med.store('s' + s, 'r' + f, 'v' + s + '_' + f);
});
bench('query 500', () => {
  let ok = 0;
  for (let s = 0; s < 50; s++) for (let f = 0; f < 10; f++) if (med.query('s' + s, 'r' + f).match === 'v' + s + '_' + f) ok++;
  return ok + '/500';
});

// ── Large: 10,000 facts (500 subjects × 20) ──
console.log('\n--- 10,000 facts (500 × 20) ---');
const large = new HRRMemory();
bench('store 10k', () => {
  for (let s = 0; s < 500; s++) for (let f = 0; f < 20; f++) large.store('s' + s, 'r' + f, 'v' + s + '_' + f);
});
bench('query 2000 random', () => {
  let ok = 0;
  for (let i = 0; i < 2000; i++) {
    const s = Math.floor(Math.random() * 500), f = Math.floor(Math.random() * 20);
    if (large.query('s' + s, 'r' + f).match === 'v' + s + '_' + f) ok++;
  }
  return ok + '/2000';
});

// ── Stats ──
console.log('\n--- Stats ---');
const stats = large.stats();
console.log(`Buckets: ${stats.buckets} | Symbols: ${stats.symbols} | RAM: ${stats.ramMB}MB`);
console.log(`Serialized: ${(JSON.stringify(large.toJSON()).length / 1024 / 1024).toFixed(1)}MB`);
