# Getting Started

## Installation

```bash
npm install hrr-memory
```

Requires Node.js 18+. No native modules, no build step.

## Basic Usage

```js
import { HRRMemory } from 'hrr-memory';

const mem = new HRRMemory();
```

### Storing Facts

Facts are `(subject, relation, object)` triples. All values are lowercased and trimmed automatically. This means `store('Alice', 'Name', 'Alice')` stores the object as `'alice'`. If you need case-sensitive values, normalize them yourself before calling store().

```js
mem.store('alice', 'lives_in', 'paris');
mem.store('alice', 'works_at', 'acme');
mem.store('alice', 'timezone', 'cet');
```

Duplicates are rejected:

```js
mem.store('alice', 'lives_in', 'paris'); // → true (stored)
mem.store('alice', 'lives_in', 'paris'); // → false (duplicate)
```

### Querying

Provide a subject and relation to retrieve the object:

```js
const result = mem.query('alice', 'lives_in');
// {
//   match: 'paris',
//   score: 0.30,
//   confident: true,
//   bucket: 'alice'
// }
```

- `match` — the retrieved value
- `score` — confidence (cosine similarity, higher is better)
- `confident` — `true` when score exceeds 0.1
- `bucket` — which internal bucket the answer came from

### Listing All Facts

```js
mem.querySubject('alice');
// [
//   { relation: 'lives_in', object: 'paris' },
//   { relation: 'works_at', object: 'acme' },
//   { relation: 'timezone', object: 'cet' }
// ]
```

### Searching Across Subjects

```js
// Who lives in Paris?
mem.search('lives_in', 'paris');
// → [{ subject: 'alice', relation: 'lives_in', object: 'paris' }]

// All "lives_in" facts
mem.search('lives_in', null);

// Everything mentioning "paris"
mem.search(null, 'paris');
```

### Free-Form Questions

`ask()` tries multiple strategies in order:

```js
mem.ask('alice timezone');
// → { type: 'direct', match: 'cet', confident: true }

mem.ask('alice');
// → { type: 'subject', facts: [...] }

mem.ask('paris');
// → { type: 'search', results: [...] }

mem.ask('completely unknown');
// → { type: 'miss' }
```

## Persistence

```js
// Save
mem.save('memory.json');

// Load
const loaded = HRRMemory.load('memory.json');
loaded.query('alice', 'lives_in'); // → { match: 'paris' }
```

The file is standard JSON. No database required.

## Custom Dimensions

Higher dimensions = more capacity per bucket, more RAM:

```js
const mem = new HRRMemory(1024);  // lighter, ~384 capacity/bucket
const mem = new HRRMemory(2048);  // default, ~768 capacity/bucket
const mem = new HRRMemory(4096);  // heavier, ~1536 capacity/bucket
```

In practice, auto-sharding means you rarely need to change this. The default (2048) handles any scale.

## Next Steps

- [API Reference](api.md) — every method and return type
- [Architecture](architecture.md) — how it works under the hood
- [Performance](performance.md) — benchmarks and scaling limits
