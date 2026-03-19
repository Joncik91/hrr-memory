# Performance

## Benchmarks

Run on a Celeron J4125 (4 cores, 2.0 GHz), 8GB RAM, Node.js 22.

### Store

| Facts | Subjects | Time | Per Fact |
|-------|----------|------|----------|
| 25 | 1 | 45ms | 1.8ms |
| 500 | 50 | 900ms | 1.8ms |
| 10,000 | 500 | 16s | 1.6ms |

Store time is dominated by FFT computation (bind operation). Roughly constant per fact regardless of total count.

### Query

| Facts | Time (1000 queries) | Per Query |
|-------|---------------------|-----------|
| 25 | 20ms | 0.02ms |
| 500 | 1,500ms | 1.5ms |
| 10,000 | 1,800ms | 1.8ms |

Query time scales with the number of object symbols per bucket (cosine similarity scan), not total facts.

### Accuracy vs Bucket Size

Measured with unique subject-relation-object triples in a single bucket:

| Facts/Bucket | Accuracy | Avg Confidence |
|-------------|----------|----------------|
| 1 | 100% | 0.48 |
| 5 | 100% | 0.35 |
| 10 | 100% | 0.27 |
| 20 | 100% | 0.21 |
| 25 | 100% | 0.19 |
| 50 | 100% | 0.14 |
| 100 | 96% | 0.10 |
| 200 | 64% | 0.08 |

Auto-sharding keeps every bucket at ≤25 facts, guaranteeing 100% accuracy.

## Memory Usage

### Formula

```
RAM ≈ (symbols + buckets) × dimensions × 4 bytes
```

### Estimates (d=2048)

| Facts | Unique Symbols | Buckets | RAM |
|-------|---------------|---------|-----|
| 25 | ~30 | 1 | 0.1 MB |
| 100 | ~100 | 5 | 0.8 MB |
| 500 | ~500 | 25 | 4 MB |
| 1,000 | ~1,000 | 50 | 8 MB |
| 10,000 | ~10,000 | 500 | 86 MB |
| 100,000 | ~50,000 | 5,000 | ~400 MB |

The symbol table dominates at scale. Each unique string (subject, relation, or object) consumes `d × 4` bytes (8KB at d=2048).

### Serialized Size

JSON serialization is ~5x the RAM footprint due to number encoding overhead. For large stores, consider compressing the output.

| Facts | RAM | JSON Size |
|-------|-----|-----------|
| 100 | 0.8 MB | ~4 MB |
| 1,000 | 8 MB | ~40 MB |
| 10,000 | 86 MB | ~460 MB |

## Scaling Limits

### What Scales Well

- **Accuracy**: 100% at any total fact count (with auto-sharding)
- **Query time**: <2ms up to 10K facts, grows slowly with symbol count
- **Bucket count**: no practical limit

### What Doesn't Scale

- **Symbol table RAM**: grows linearly with unique terms. At 100K unique symbols with d=2048: ~800MB
- **Serialization size**: JSON is verbose for large float arrays
- **Store time**: 1.6ms/fact is fixed cost (FFT-bound)

### Mitigation Strategies

**Reduce dimensions** for high-cardinality stores:

```js
const mem = new HRRMemory(1024); // half RAM, ~384 capacity/bucket
```

Accuracy remains 100% with auto-sharding (smaller buckets compensate).

**Symbol reuse**: design your triple vocabulary to reuse terms. `('server', 'port', '8080')` and `('database', 'port', '5432')` share the `port` symbol.

**Periodic cleanup**: remove obsolete facts and rebuild:

```js
const fresh = new HRRMemory();
for (const triple of getActiveFacts()) {
  fresh.store(triple.subject, triple.relation, triple.object);
}
```

## Run Benchmarks

```bash
git clone https://github.com/Joncik91/hrr-memory
cd hrr-memory
node bench/benchmark.js
```

## Comparison

| System | Query Type | Query Time | Dependencies | Self-Hosted |
|--------|-----------|------------|-------------|-------------|
| **hrr-memory** | Algebraic triples | <2ms | None | Yes (pure JS) |
| Pinecone | Semantic similarity | ~50ms | Cloud API | No |
| ChromaDB | Semantic similarity | ~20ms | Python + SQLite | Yes |
| LanceDB | Semantic similarity | ~10ms | Rust bindings | Yes |
| Redis + vectors | Semantic similarity | ~5ms | Redis server | Yes |

hrr-memory is not competing with these — it solves a different problem (structured facts vs semantic search). Use both.
