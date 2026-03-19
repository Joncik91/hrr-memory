/**
 * Bucket — a single HRR memory vector with fixed capacity.
 * Auto-splits are managed by HRRMemory, not by the bucket itself.
 */

export const MAX_BUCKET_SIZE = 25;

export class Bucket {
  constructor(name, d = 2048) {
    this.name = name;
    this.d = d;
    this.memory = new Float32Array(d);
    this.count = 0;
    this.triples = [];
  }

  /** Add a pre-computed association vector */
  storeVector(association, triple) {
    for (let i = 0; i < this.d; i++) this.memory[i] += association[i];
    this.count++;
    this.triples.push(triple);
  }

  /** Whether the bucket has reached max capacity */
  get isFull() { return this.count >= MAX_BUCKET_SIZE; }

  /** Serialize */
  toJSON() {
    return {
      name: this.name,
      memory: Array.from(this.memory),
      count: this.count,
      triples: this.triples,
    };
  }

  /** Deserialize */
  static fromJSON(data, d) {
    const b = new Bucket(data.name, d);
    b.memory = new Float32Array(data.memory);
    b.count = data.count || 0;
    b.triples = data.triples || [];
    return b;
  }
}
