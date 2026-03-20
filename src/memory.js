/**
 * HRRMemory — auto-sharded holographic memory store.
 *
 * Stores (subject, relation, object) triples in sharded buckets.
 * Each bucket holds max 25 facts. When full, a new overflow bucket
 * is created automatically. Queries scan all buckets for a subject.
 *
 * Symbol vectors are shared across all buckets.
 * All values are lowercased on store. If you need case-sensitive values,
 * normalize them yourself before calling store().
 *
 * @typedef {{ match: string|null, score: number, confident: boolean, bucket: string|null }} QueryResult
 * @typedef {{ relation: string, object: string }} Fact
 * @typedef {{ subject: string, relation: string, object: string }} Triple
 * @typedef {{ type: 'direct', match: string, score: number, confident: boolean, subject: string, relation: string, bucket: string|null }} DirectAskResult
 * @typedef {{ type: 'subject', subject: string, facts: Fact[] }} SubjectAskResult
 * @typedef {{ type: 'search', term: string, results: Triple[] }} SearchAskResult
 * @typedef {{ type: 'miss', query: string }} MissAskResult
 * @typedef {DirectAskResult | SubjectAskResult | SearchAskResult | MissAskResult} AskResult
 * @typedef {{ dimensions: number, maxBucketSize: number, symbols: number, buckets: number, subjects: number, totalFacts: number, ramBytes: number, ramMB: number, perBucket: Array<{name: string, facts: number, full: boolean}> }} Stats
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { bind, unbind, similarity } from './ops.js';
import { SymbolTable } from './symbols.js';
import { Bucket, MAX_BUCKET_SIZE } from './bucket.js';

const STOP_WORDS = new Set([
  'what', 'is', 'the', 'a', 'an', 'does', 'do', 'where', 'who', 'how',
  'which', 'of', 'for', 'in', 'at', 'to', 'my', 'your', 'their', 'has',
  'have', 'was', 'were', 'are', 'been',
]);

export class HRRMemory {
  /**
   * Create a new HRR memory store.
   * @param {number} d - Vector dimensions (default 2048). Higher = more capacity per bucket.
   */
  constructor(d = 2048) {
    this.d = d;
    this.symbols = new SymbolTable(d);
    this.buckets = new Map();
    this.routing = new Map();  // subject → [bucket_id, ...]
  }

  // ── Bucket management ──────────────────────────────

  /** Get the active (non-full) bucket for a subject, splitting if needed */
  _activeBucket(subject) {
    const key = subject.toLowerCase().trim();
    const ids = this.routing.get(key);

    if (ids) {
      const lastId = ids[ids.length - 1];
      const last = this.buckets.get(lastId);
      if (!last.isFull) return last;

      // Overflow: create new bucket
      const newId = key + '#' + ids.length;
      const nb = new Bucket(newId, this.d);
      this.buckets.set(newId, nb);
      ids.push(newId);
      return nb;
    }

    // First bucket for this subject
    const b = new Bucket(key, this.d);
    this.buckets.set(key, b);
    this.routing.set(key, [key]);
    return b;
  }

  /** Get all buckets for a subject */
  _subjectBuckets(subject) {
    const ids = this.routing.get(subject.toLowerCase().trim()) || [];
    return ids.map(id => this.buckets.get(id)).filter(Boolean);
  }

  // ── Store ──────────────────────────────────────────

  /**
   * Store a fact as a (subject, relation, object) triple.
   * @param {string} subject - The entity (e.g., 'alice')
   * @param {string} relation - The attribute (e.g., 'lives_in')
   * @param {string} object - The value (e.g., 'paris')
   * @returns {boolean} true if stored, false if duplicate
   */
  store(subject, relation, object) {
    const triple = {
      subject: subject.toLowerCase().trim(),
      relation: relation.toLowerCase().trim(),
      object: object.toLowerCase().trim(),
    };

    // Dedup across all subject buckets
    for (const b of this._subjectBuckets(subject)) {
      if (b.triples.some(t =>
        t.subject === triple.subject &&
        t.relation === triple.relation &&
        t.object === triple.object
      )) return false;
    }

    const s = this.symbols.get(subject);
    const r = this.symbols.get(relation);
    const o = this.symbols.get(object);
    const association = bind(bind(s, r), o);

    this._activeBucket(subject).storeVector(association, triple);
    return true;
  }

  // ── Forget ─────────────────────────────────────────

  /**
   * Remove a fact from memory.
   * Rebuilds the affected bucket's memory vector from remaining triples.
   * @param {string} subject
   * @param {string} relation
   * @param {string} object
   * @returns {boolean} true if found and removed, false if not found
   */
  forget(subject, relation, object) {
    const s = subject.toLowerCase().trim();
    const r = relation.toLowerCase().trim();
    const o = object.toLowerCase().trim();

    const ids = this.routing.get(s);
    if (!ids) return false;

    for (let i = 0; i < ids.length; i++) {
      const bucket = this.buckets.get(ids[i]);
      const idx = bucket.triples.findIndex(t =>
        t.subject === s && t.relation === r && t.object === o
      );
      if (idx === -1) continue;

      bucket.triples.splice(idx, 1);
      bucket.rebuild(this.symbols);

      // Clean up empty overflow buckets
      if (bucket.count === 0 && ids[i].includes('#')) {
        this.buckets.delete(ids[i]);
        ids.splice(i, 1);
      }
      return true;
    }
    return false;
  }

  // ── Query ──────────────────────────────────────────

  /**
   * Query: given subject and relation, retrieve the object.
   * @param {string} subject
   * @param {string} relation
   * @returns {{ match: string|null, score: number, confident: boolean, bucket: string|null }}
   */
  query(subject, relation) {
    const buckets = this._subjectBuckets(subject);
    if (buckets.length === 0) return { match: null, score: 0, confident: false, bucket: null };

    const probe = bind(this.symbols.get(subject), this.symbols.get(relation));
    let bestName = null, bestScore = -1, bestBucket = null;

    for (const bucket of buckets) {
      if (bucket.count === 0) continue;
      const result = unbind(probe, bucket.memory);

      // Optimized: only scan object symbols in this bucket
      for (const t of bucket.triples) {
        const score = similarity(result, this.symbols.get(t.object));
        if (score > bestScore) {
          bestScore = score;
          bestName = t.object;
          bestBucket = bucket.name;
        }
      }
    }

    return {
      match: bestName,
      score: Math.round(bestScore * 1000) / 1000,
      confident: bestScore > 0.1,
      bucket: bestBucket,
    };
  }

  /**
   * Get all known facts about a subject (symbolic, exact).
   * @param {string} subject
   * @returns {Array<{ relation: string, object: string }>}
   */
  querySubject(subject) {
    const key = subject.toLowerCase().trim();
    const facts = [];
    for (const bucket of this._subjectBuckets(subject)) {
      for (const t of bucket.triples) {
        if (t.subject === key) facts.push({ relation: t.relation, object: t.object });
      }
    }
    return facts;
  }

  /**
   * Search across all buckets for triples matching a relation and/or object.
   * @param {string|null} relation - Filter by relation (null = any)
   * @param {string|null} object - Filter by object value (null = any)
   * @returns {Array<{ subject: string, relation: string, object: string }>}
   */
  search(relation, object) {
    const results = [];
    const rel = relation ? relation.toLowerCase().trim() : null;
    const obj = object ? object.toLowerCase().trim() : null;
    for (const [_, bucket] of this.buckets) {
      for (const t of bucket.triples) {
        if (rel && t.relation !== rel) continue;
        if (obj && t.object !== obj) continue;
        results.push(t);
      }
    }
    return results;
  }

  /**
   * Free-form query: strips stop words and possessives, then tries subject+relation pairs,
   * subject lookup, and cross-bucket search in that order.
   * @param {string} question - Natural language question (e.g., "What is alice's timezone?")
   * @returns {AskResult} One of: DirectAskResult, SubjectAskResult, SearchAskResult, or MissAskResult
   * @example
   * mem.store('alice', 'timezone', 'cet');
   * mem.ask("What is alice's timezone?"); // → { type: 'direct', match: 'cet', ... }
   * mem.ask('alice');                      // → { type: 'subject', facts: [...] }
   */
  ask(question) {
    const parts = question.toLowerCase().trim()
      .replace(/[?.,!]/g, '')
      .replace(/'s\b/g, '')     // possessive: alice's → alice
      .replace(/-/g, '_')       // lives-in → lives_in
      .split(/\s+/)
      .filter(w => !STOP_WORDS.has(w) && w.length > 0);

    // Try consecutive word pairs as subject+relation
    for (let i = 0; i < parts.length - 1; i++) {
      const result = this.query(parts[i], parts[i + 1]);
      if (result.confident) return { type: 'direct', ...result, subject: parts[i], relation: parts[i + 1] };
    }

    // Try each word as a subject
    for (const word of parts) {
      const facts = this.querySubject(word);
      if (facts.length > 0) return { type: 'subject', subject: word, facts };
    }

    // Search across all buckets for any matching object
    for (const word of parts) {
      const results = this.search(null, word);
      if (results.length > 0) return { type: 'search', term: word, results };
    }

    return { type: 'miss', query: question };
  }

  // ── Stats ──────────────────────────────────────────

  /**
   * Get memory statistics: dimensions, bucket count, total facts, RAM usage.
   * @returns {Stats}
   */
  stats() {
    let totalFacts = 0;
    const bucketInfo = [];
    for (const [_, b] of this.buckets) {
      totalFacts += b.count;
      bucketInfo.push({ name: b.name, facts: b.count, full: b.isFull });
    }
    const symBytes = this.symbols.size * this.d * 4;
    const bktBytes = this.buckets.size * this.d * 4;
    return {
      dimensions: this.d,
      maxBucketSize: MAX_BUCKET_SIZE,
      symbols: this.symbols.size,
      buckets: this.buckets.size,
      subjects: this.routing.size,
      totalFacts,
      ramBytes: symBytes + bktBytes,
      ramMB: Math.round((symBytes + bktBytes) / 1024 / 1024 * 10) / 10,
      perBucket: bucketInfo,
    };
  }

  // ── Persistence ────────────────────────────────────

  /**
   * Serialize the entire memory store to a plain object.
   * @returns {{ version: number, d: number, symbols: object, buckets: object, routing: object }}
   */
  toJSON() {
    const buckets = {};
    for (const [k, v] of this.buckets) buckets[k] = v.toJSON();
    const routing = {};
    for (const [k, v] of this.routing) routing[k] = v;
    return { version: 3, d: this.d, symbols: this.symbols.toJSON(), buckets, routing };
  }

  /**
   * Deserialize from a plain object (as produced by toJSON).
   * @param {object} data - Serialized memory data
   * @returns {HRRMemory}
   */
  static fromJSON(data) {
    const d = data.d || 2048;
    const mem = new HRRMemory(d);
    mem.symbols = SymbolTable.fromJSON(data.symbols || {}, d);
    for (const [k, v] of Object.entries(data.buckets || {})) {
      mem.buckets.set(k, Bucket.fromJSON(v, d));
    }
    for (const [k, v] of Object.entries(data.routing || {})) {
      mem.routing.set(k, Array.isArray(v) ? v : [v]);
    }
    return mem;
  }

  /**
   * Save the memory store to a JSON file.
   * @param {string} filePath - Path to write the JSON file
   */
  save(filePath) {
    writeFileSync(filePath, JSON.stringify(this.toJSON()));
  }

  /**
   * Load a memory store from a JSON file. Returns a new empty store if the file doesn't exist.
   * @param {string} filePath - Path to the JSON file
   * @param {number} [d=2048] - Vector dimensions (used only if creating new store)
   * @returns {HRRMemory}
   */
  static load(filePath, d = 2048) {
    if (!existsSync(filePath)) return new HRRMemory(d);
    try { return HRRMemory.fromJSON(JSON.parse(readFileSync(filePath, 'utf8'))); }
    catch { return new HRRMemory(d); }
  }
}
