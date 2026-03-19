# Architecture

## The Problem

RAG (Retrieval-Augmented Generation) answers "find documents related to X" well. It answers "What is Alice's timezone?" poorly — returning paragraphs when you need a single value, with a network round-trip to a vector database.

Agent memory needs both:
- **Semantic search** for fuzzy, contextual recall ("what did we discuss about deployment?")
- **Structured lookup** for exact facts ("what port does the server use?")

hrr-memory provides the second kind.

## Holographic Reduced Representations

HRR (Plate, 1994) encodes structured information into fixed-width vectors using three operations:

**Binding** (circular convolution `⊛`): combines two vectors into a third of the same dimension, approximately orthogonal to both inputs.

**Unbinding** (circular correlation `⊖`): approximate inverse of binding — given the bound result and one input, recovers the other.

**Superposition** (addition): multiple bindings can coexist in the same vector.

### Encoding a Fact

To store `(alice, lives_in, paris)`:

```
association = bind(bind(alice_vec, lives_in_vec), paris_vec)
memory += association
```

The memory vector now contains this fact superposed with all other facts.

### Retrieving a Fact

To answer "Where does Alice live?":

```
probe  = bind(alice_vec, lives_in_vec)
result = unbind(probe, memory)
match  = nearest_symbol(result)  →  paris_vec  →  "paris"
```

The result vector is approximately equal to `paris_vec`. Finding the nearest known symbol gives the answer.

### Why It Works

Circular convolution in the time domain equals element-wise multiplication in the frequency domain. The FFT makes this efficient. The key mathematical property: `unbind(bind(a, b), bind(bind(a, b), c)) ≈ c` — binding is approximately invertible.

## Auto-Sharding

A single vector can hold ~25 facts before noise degrades retrieval accuracy. This is a fundamental limit of superposition — more associations mean more noise.

hrr-memory solves this with automatic sharding:

```
alice       → bucket [25/25] full
alice#1     → bucket [25/25] full
alice#2     → bucket [8/25]  active
bob         → bucket [12/25]
server      → bucket [3/25]
```

Each subject gets its own bucket chain. When a bucket fills (25 facts), a new overflow bucket is created. Queries scan all buckets for the subject.

**Why 25?** Testing shows 100% accuracy at 20-30 facts per bucket, degrading to 96% at 50, and 80% at 150. We chose 25 as the sweet spot — well within the safe zone.

### Capacity

With auto-sharding, total capacity is limited only by available RAM:

| Buckets | Facts | Accuracy |
|---------|-------|----------|
| 10 | 250 | 100% |
| 100 | 2,500 | 100% |
| 1,000 | 25,000 | 100% |

## Shared Symbol Table

Every unique string (subject, relation, or object) gets a random vector. This vector is generated once and reused everywhere — across all buckets, for both encoding and decoding.

The symbol table is the main memory consumer: each symbol is a Float32 vector of `d` dimensions (default 2048 = 8KB per symbol). At 1,000 unique symbols, that's ~8MB.

Symbols are created lazily on first use and persist across save/load.

## Float32 Storage

Vectors are stored as Float32 (4 bytes per element) instead of Float64 (8 bytes). This halves memory usage with negligible precision loss — HRR's algebraic operations are robust to quantization at this level.

FFT computation internally uses Float64 for numerical stability, then truncates to Float32 for storage.

## Integration with RAG

The recommended pattern for agent memory:

```js
async function memoryQuery(question) {
  // 1. Try HRR (instant, structured)
  const hrr = mem.ask(question);
  if (hrr.type !== 'miss' && hrr.confident) {
    return { source: 'hrr', ...hrr };
  }

  // 2. Fall back to RAG (slower, semantic)
  const rag = await vectorSearch(question);
  return { source: 'rag', ...rag };
}
```

HRR handles ~20% of queries (structured fact lookups) instantly. RAG handles the remaining 80% (fuzzy, contextual, document-level). Neither replaces the other.

### What Goes Where

| Data Type | Store In | Why |
|-----------|----------|-----|
| User preferences | HRR | Structured: `(user, prefers, X)` |
| Configuration | HRR | Structured: `(server, port, 8080)` |
| Entity relationships | HRR | Structured: `(alice, works_at, acme)` |
| Meeting notes | RAG | Unstructured text |
| Research documents | RAG | Long-form content |
| Conversation history | RAG | Contextual, fuzzy recall |

## Data Model

```
HRRMemory
├── SymbolTable (shared)
│   └── Map<string, Float32Array>    # name → vector
├── Buckets
│   └── Map<string, Bucket>          # bucket_id → { memory, triples }
│       ├── memory: Float32Array     # superposed association vector
│       └── triples: Array           # symbolic backup for exact lookup
└── Routing
    └── Map<string, string[]>        # subject → [bucket_id, bucket_id#1, ...]
```

Every fact exists in two forms:
1. **Algebraic** — encoded in the bucket's memory vector (for HRR query)
2. **Symbolic** — stored as a plain triple (for querySubject, search, dedup)

This dual representation gives the best of both worlds: algebraic retrieval speed with symbolic exactness for listing and searching.

## Serialization Format

```json
{
  "version": 3,
  "d": 2048,
  "symbols": {
    "alice": [0.012, -0.034, ...],
    "lives_in": [0.056, 0.023, ...],
    "paris": [-0.011, 0.045, ...]
  },
  "buckets": {
    "alice": {
      "name": "alice",
      "memory": [0.123, -0.456, ...],
      "count": 3,
      "triples": [
        { "subject": "alice", "relation": "lives_in", "object": "paris" }
      ]
    }
  },
  "routing": {
    "alice": ["alice"]
  }
}
```

The format is versioned for forward compatibility.
