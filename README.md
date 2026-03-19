# hrr-memory

**Your AI agent already has RAG. Now give it instant fact recall.**

hrr-memory stores structured facts as `(subject, relation, object)` triples and retrieves them in under 2 milliseconds — no vector database, no embeddings API, no dependencies. It complements RAG, not replaces it.

<p align="center">
  <img src="assets/hrr-diagram.svg" alt="How HRR Memory Works" width="800" />
</p>

## Install

```bash
npm install hrr-memory
```

## 30-Second Demo

```js
import { HRRMemory } from 'hrr-memory';

const mem = new HRRMemory();

mem.store('alice', 'lives_in', 'paris');
mem.store('alice', 'works_at', 'acme');
mem.store('bob', 'lives_in', 'tokyo');

mem.query('alice', 'lives_in');  // → { match: 'paris', confident: true }
mem.query('bob', 'lives_in');    // → { match: 'tokyo', confident: true }

mem.querySubject('alice');
// → [{ relation: 'lives_in', object: 'paris' },
//    { relation: 'works_at', object: 'acme' }]

mem.save('memory.json');
```

## Why Not Just RAG?

| Query | RAG | hrr-memory |
|-------|-----|------------|
| "What is Alice's timezone?" | Returns paragraphs, maybe | Returns `cet` in <1ms |
| "Find notes about deployment" | Ranked chunks | Can't — not a triple |

Use both. HRR for structured facts, RAG for semantic search. [See the architecture guide →](docs/architecture.md)

## Performance

| Facts | Accuracy | Query | RAM |
|-------|----------|-------|-----|
| 100 | 100% | <1ms | 0.1 MB |
| 1,000 | 100% | 1.5ms | 4 MB |
| 10,000 | 100% | 1.8ms | 86 MB |

## Documentation

- **[Getting Started](docs/getting-started.md)** — installation, first facts, persistence
- **[API Reference](docs/api.md)** — every method, parameter, and return type
- **[Architecture](docs/architecture.md)** — how HRR works, auto-sharding, RAG integration
- **[Performance](docs/performance.md)** — benchmarks, scaling limits, tuning

## License

MIT
