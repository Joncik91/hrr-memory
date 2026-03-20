/**
 * HRR Memory benchmarks — store, query, forget, ask, accuracy at scale.
 */

import { HRRMemory } from '../src/index.js';

function bench(name, fn) {
  const t0 = performance.now();
  const result = fn();
  const ms = performance.now() - t0;
  console.log(`  ${name}: ${ms.toFixed(0)}ms`, result ? `(${result})` : '');
  return ms;
}

function accuracy(mem, subjects, factsPerSubject) {
  let ok = 0, total = 0;
  for (let s = 0; s < subjects; s++) {
    for (let f = 0; f < factsPerSubject; f++) {
      total++;
      if (mem.query('s' + s, 'r' + f).match === 'v' + s + '_' + f) ok++;
    }
  }
  return { ok, total, pct: (ok / total * 100).toFixed(1) };
}

console.log('hrr-memory benchmark\n');

// ── 25 facts (single bucket) ──
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

// ── 500 facts (50 subjects × 10) ──
console.log('\n--- 500 facts (50 subjects × 10) ---');
const med = new HRRMemory();
bench('store 500', () => {
  for (let s = 0; s < 50; s++) for (let f = 0; f < 10; f++) med.store('s' + s, 'r' + f, 'v' + s + '_' + f);
});
bench('query 500', () => {
  const r = accuracy(med, 50, 10);
  return `${r.ok}/${r.total} (${r.pct}%)`;
});

// ── 10,000 facts (500 subjects × 20) ──
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
bench('query ALL 10k', () => {
  const r = accuracy(large, 500, 20);
  return `${r.ok}/${r.total} (${r.pct}%)`;
});

// ── Heavy single subject: 200 facts (8 shards) ──
console.log('\n--- 200 facts on ONE subject (8 shards) ---');
const heavy = new HRRMemory();
bench('store 200', () => {
  for (let i = 0; i < 200; i++) heavy.store('target', 'attr_' + i, 'val_' + i);
});
bench('query 200', () => {
  let ok = 0;
  for (let i = 0; i < 200; i++) if (heavy.query('target', 'attr_' + i).match === 'val_' + i) ok++;
  return ok + '/200';
});

// ── forget() benchmark ──
console.log('\n--- forget() ---');
const forgetMem = new HRRMemory();
for (let i = 0; i < 100; i++) forgetMem.store('f', 'r' + i, 'v' + i);

bench('forget 50 from 100-fact subject', () => {
  for (let i = 0; i < 50; i++) forgetMem.forget('f', 'r' + i, 'v' + i);
  return forgetMem.stats().totalFacts + ' remaining';
});
bench('accuracy after forget', () => {
  let ok = 0;
  for (let i = 50; i < 100; i++) if (forgetMem.query('f', 'r' + i).match === 'v' + i) ok++;
  return ok + '/50';
});

// ── ask() benchmark ──
console.log('\n--- ask() normalization ---');
const askMem = new HRRMemory();
askMem.store('alice', 'timezone', 'cet');
askMem.store('alice', 'lives_in', 'paris');
askMem.store('alice', 'works_at', 'acme');
askMem.store('bob', 'timezone', 'pst');
askMem.store('bob', 'city', 'seattle');
for (let i = 0; i < 50; i++) askMem.store('user' + i, 'role', 'member');

bench('ask 1000 natural language queries', () => {
  const questions = [
    "What is alice's timezone?",
    "Where does alice live?",
    "alice works-at",
    "bob timezone",
    "What is bob's city?",
  ];
  let hits = 0;
  for (let i = 0; i < 1000; i++) {
    const r = askMem.ask(questions[i % questions.length]);
    if (r.type !== 'miss') hits++;
  }
  return hits + '/1000 hits';
});

// ── Persistence at scale ──
console.log('\n--- Persistence (10k facts) ---');
const jsonStr = bench('serialize 10k to JSON', () => {
  const s = JSON.stringify(large.toJSON());
  return (s.length / 1024 / 1024).toFixed(1) + 'MB';
});
bench('deserialize 10k from JSON', () => {
  const data = JSON.parse(JSON.stringify(large.toJSON()));
  const loaded = HRRMemory.fromJSON(data);
  return loaded.stats().totalFacts + ' facts';
});

// ── Summary ──
console.log('\n--- Summary ---');
const stats = large.stats();
console.log(`  Dimensions: ${stats.dimensions}`);
console.log(`  Buckets: ${stats.buckets} | Symbols: ${stats.symbols} | Subjects: ${stats.subjects}`);
console.log(`  Total facts: ${stats.totalFacts}`);
console.log(`  RAM: ${stats.ramMB}MB`);
console.log(`  JSON size: ${(JSON.stringify(large.toJSON()).length / 1024 / 1024).toFixed(1)}MB`);
