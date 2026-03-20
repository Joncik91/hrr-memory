# API Reference

## HRRMemory

The main class. Manages buckets, symbols, and routing.

### Constructor

```js
new HRRMemory(dimensions?)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dimensions` | `number` | `2048` | Vector dimensionality. Higher = more capacity per bucket, more RAM. |

---

### store(subject, relation, object)

Store a fact as a triple.

```js
mem.store('alice', 'lives_in', 'paris') // → true
mem.store('alice', 'lives_in', 'paris') // → false (duplicate)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `subject` | `string` | The entity (e.g., `'alice'`, `'server'`) |
| `relation` | `string` | The attribute (e.g., `'lives_in'`, `'port'`) |
| `object` | `string` | The value (e.g., `'paris'`, `'8080'`) |

**Returns:** `boolean` — `true` if stored, `false` if duplicate.

All values are lowercased and trimmed. The triple is encoded via circular convolution and added to the subject's active bucket. If the bucket is full (25 facts), a new overflow bucket is created automatically.

---

### forget(subject, relation, object)

Remove a fact from memory.

```js
mem.forget('alice', 'lives_in', 'paris') // → true
mem.forget('alice', 'lives_in', 'paris') // → false (already gone)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `subject` | `string` | The entity |
| `relation` | `string` | The attribute |
| `object` | `string` | The value |

**Returns:** `boolean` — `true` if found and removed, `false` if not found.

The affected bucket's memory vector is rebuilt from the remaining triples. This is an O(n) operation where n is the number of facts in the bucket (max 25). Empty overflow buckets are cleaned up automatically.

---

### query(subject, relation)

Algebraic retrieval: given subject and relation, find the object.

```js
mem.query('alice', 'lives_in')
// → { match: 'paris', score: 0.30, confident: true, bucket: 'alice' }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `subject` | `string` | The entity to query |
| `relation` | `string` | The attribute to look up |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `match` | `string \| null` | Best matching object symbol |
| `score` | `number` | Cosine similarity (0-1, higher = better) |
| `confident` | `boolean` | `true` if `score > 0.1` |
| `bucket` | `string \| null` | Bucket the match came from |

The query scans all buckets for the subject and returns the single best match across them.

---

### querySubject(subject)

List all known facts about a subject. This is a symbolic (exact) lookup, not algebraic.

```js
mem.querySubject('alice')
// → [{ relation: 'lives_in', object: 'paris' },
//    { relation: 'works_at', object: 'acme' }]
```

**Returns:** `Array<{ relation: string, object: string }>`

---

### search(relation, object)

Cross-bucket search. Filter by relation, object, or both.

```js
mem.search('lives_in', 'paris')   // specific
mem.search('lives_in', null)       // all "lives_in" facts
mem.search(null, 'paris')          // everything mentioning paris
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `relation` | `string \| null` | Filter by relation, or `null` for any |
| `object` | `string \| null` | Filter by object value, or `null` for any |

**Returns:** `Array<{ subject: string, relation: string, object: string }>`

---

### ask(question)

Free-form query with automatic strategy selection.

```js
mem.ask('alice timezone')     // → { type: 'direct', match: 'cet', ... }
mem.ask('alice')              // → { type: 'subject', facts: [...] }
mem.ask('paris')              // → { type: 'search', results: [...] }
mem.ask('unknown thing')      // → { type: 'miss' }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `question` | `string` | Natural language or keyword query |

**Returns:** One of:

| `type` | Meaning | Extra fields |
|--------|---------|-------------|
| `'direct'` | Matched subject+relation pair | `match`, `score`, `confident`, `subject`, `relation` |
| `'subject'` | Found facts about a word | `subject`, `facts` |
| `'search'` | Found matching triples | `term`, `results` |
| `'miss'` | Nothing found | `query` |

Strategy order:
1. Try consecutive word pairs as `subject + relation`
2. Try each word as a subject
3. Search all buckets for each word as an object value

---

### stats()

Memory statistics.

```js
mem.stats()
// {
//   dimensions: 2048,
//   maxBucketSize: 25,
//   symbols: 42,
//   buckets: 5,
//   subjects: 3,
//   totalFacts: 28,
//   ramBytes: 385024,
//   ramMB: 0.4,
//   perBucket: [
//     { name: 'alice', facts: 25, full: true },
//     { name: 'alice#1', facts: 3, full: false },
//     ...
//   ]
// }
```

---

### save(filePath)

Serialize to a JSON file.

```js
mem.save('/path/to/memory.json');
```

---

### HRRMemory.load(filePath, dimensions?)

Load from a JSON file. Returns a new empty store if the file doesn't exist.

```js
const mem = HRRMemory.load('/path/to/memory.json');
```

---

### toJSON() / fromJSON(data)

Manual serialization for custom storage backends.

```js
const data = mem.toJSON();       // plain object
const restored = HRRMemory.fromJSON(data);
```

---

## Low-Level Exports

For advanced use, the primitives are exported:

```js
import { bind, unbind, similarity, randomVector, normalize, SymbolTable, Bucket } from 'hrr-memory';
```

### bind(a, b)

Circular convolution. Returns a new Float32Array of the same dimensions.

### unbind(key, memory)

Circular correlation (approximate inverse of bind).

### similarity(a, b)

Cosine similarity between two vectors.

### randomVector(d)

Generate a random unit vector of dimension `d`.

### SymbolTable

Shared symbol table mapping string names to vectors.

### Bucket

Single memory vector with a 25-fact capacity limit.
