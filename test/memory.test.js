import { describe, it } from 'node:test';
import assert from 'node:assert';
import { HRRMemory } from '../src/index.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';

describe('HRRMemory', () => {

  it('stores and retrieves a single fact', () => {
    const mem = new HRRMemory();
    mem.store('alice', 'lives_in', 'paris');
    const result = mem.query('alice', 'lives_in');
    assert.strictEqual(result.match, 'paris');
    assert.ok(result.confident);
    assert.ok(result.score > 0.1);
  });

  it('retrieves multiple facts about one subject', () => {
    const mem = new HRRMemory();
    mem.store('bob', 'color', 'blue');
    mem.store('bob', 'food', 'pizza');
    mem.store('bob', 'city', 'tokyo');

    assert.strictEqual(mem.query('bob', 'color').match, 'blue');
    assert.strictEqual(mem.query('bob', 'food').match, 'pizza');
    assert.strictEqual(mem.query('bob', 'city').match, 'tokyo');
  });

  it('isolates facts between subjects', () => {
    const mem = new HRRMemory();
    mem.store('alice', 'city', 'paris');
    mem.store('bob', 'city', 'tokyo');

    assert.strictEqual(mem.query('alice', 'city').match, 'paris');
    assert.strictEqual(mem.query('bob', 'city').match, 'tokyo');
  });

  it('returns low confidence for unknown queries', () => {
    const mem = new HRRMemory();
    mem.store('alice', 'city', 'paris');
    const result = mem.query('alice', 'phone_number');
    // May match something but with low score
    assert.ok(result.score < 0.2);
  });

  it('deduplicates identical triples', () => {
    const mem = new HRRMemory();
    assert.strictEqual(mem.store('x', 'y', 'z'), true);
    assert.strictEqual(mem.store('x', 'y', 'z'), false);
    assert.strictEqual(mem.stats().totalFacts, 1);
  });

  it('querySubject returns all facts symbolically', () => {
    const mem = new HRRMemory();
    mem.store('server', 'port', '8080');
    mem.store('server', 'host', 'localhost');
    mem.store('server', 'protocol', 'https');

    const facts = mem.querySubject('server');
    assert.strictEqual(facts.length, 3);
    assert.ok(facts.some(f => f.relation === 'port' && f.object === '8080'));
    assert.ok(facts.some(f => f.relation === 'host' && f.object === 'localhost'));
  });

  it('search finds triples across all buckets', () => {
    const mem = new HRRMemory();
    mem.store('alice', 'city', 'paris');
    mem.store('bob', 'city', 'paris');
    mem.store('carol', 'city', 'london');

    const results = mem.search(null, 'paris');
    assert.strictEqual(results.length, 2);
    assert.ok(results.every(r => r.object === 'paris'));
  });
});

describe('auto-sharding', () => {

  it('splits bucket at 25 facts', () => {
    const mem = new HRRMemory();
    for (let i = 0; i < 30; i++) {
      mem.store('entity', 'attr_' + i, 'val_' + i);
    }
    const buckets = mem.stats().perBucket.filter(b => b.name.startsWith('entity'));
    assert.strictEqual(buckets.length, 2);
    assert.strictEqual(buckets[0].facts, 25);
    assert.strictEqual(buckets[1].facts, 5);
  });

  it('maintains accuracy across split buckets', () => {
    const mem = new HRRMemory();
    for (let i = 0; i < 60; i++) {
      mem.store('big', 'key_' + i, 'answer_' + i);
    }
    let correct = 0;
    for (let i = 0; i < 60; i++) {
      if (mem.query('big', 'key_' + i).match === 'answer_' + i) correct++;
    }
    assert.strictEqual(correct, 60);
  });

  it('handles many subjects with auto-routing', () => {
    const mem = new HRRMemory();
    for (let s = 0; s < 100; s++) {
      for (let f = 0; f < 5; f++) {
        mem.store('s' + s, 'r' + f, 'v' + s + '_' + f);
      }
    }
    assert.strictEqual(mem.stats().subjects, 100);
    assert.strictEqual(mem.stats().totalFacts, 500);

    // Spot check
    assert.strictEqual(mem.query('s42', 'r3').match, 'v42_3');
    assert.strictEqual(mem.query('s99', 'r0').match, 'v99_0');
  });
});

describe('ask (free-form)', () => {

  it('resolves subject+relation pairs', () => {
    const mem = new HRRMemory();
    mem.store('jounes', 'timezone', 'cet');
    const result = mem.ask('jounes timezone');
    assert.strictEqual(result.type, 'direct');
    assert.strictEqual(result.match, 'cet');
  });

  it('falls back to subject listing', () => {
    const mem = new HRRMemory();
    mem.store('reef', 'port', '18789');
    mem.store('reef', 'model', 'glm5');
    const result = mem.ask('reef');
    assert.strictEqual(result.type, 'subject');
    assert.strictEqual(result.facts.length, 2);
  });

  it('searches across buckets for object values', () => {
    const mem = new HRRMemory();
    mem.store('server', 'location', 'krakow');
    const result = mem.ask('krakow');
    assert.strictEqual(result.type, 'search');
    assert.ok(result.results.some(r => r.object === 'krakow'));
  });

  it('returns miss for unknown queries', () => {
    const mem = new HRRMemory();
    const result = mem.ask('completely unknown thing');
    assert.strictEqual(result.type, 'miss');
  });
});

describe('persistence', () => {

  it('save and load preserves facts', () => {
    const filePath = join(tmpdir(), 'hrr-test-' + Date.now() + '.json');
    try {
      const mem = new HRRMemory();
      mem.store('alice', 'city', 'paris');
      mem.store('bob', 'city', 'tokyo');
      mem.save(filePath);

      const loaded = HRRMemory.load(filePath);
      assert.strictEqual(loaded.query('alice', 'city').match, 'paris');
      assert.strictEqual(loaded.query('bob', 'city').match, 'tokyo');
      assert.strictEqual(loaded.stats().totalFacts, 2);
    } finally {
      try { unlinkSync(filePath); } catch {}
    }
  });

  it('load returns empty store for missing file', () => {
    const mem = HRRMemory.load('/nonexistent/path.json');
    assert.strictEqual(mem.stats().totalFacts, 0);
  });
});

describe('stats', () => {

  it('reports accurate statistics', () => {
    const mem = new HRRMemory(1024);
    mem.store('a', 'b', 'c');
    mem.store('a', 'd', 'e');
    const stats = mem.stats();
    assert.strictEqual(stats.dimensions, 1024);
    assert.strictEqual(stats.totalFacts, 2);
    assert.strictEqual(stats.subjects, 1);
    assert.strictEqual(stats.buckets, 1);
    assert.strictEqual(stats.maxBucketSize, 25);
    assert.ok(stats.ramMB >= 0);
  });
});
