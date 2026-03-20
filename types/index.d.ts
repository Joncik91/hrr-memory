export interface QueryResult {
  match: string | null;
  score: number;
  confident: boolean;
  bucket: string | null;
}

export interface Fact {
  relation: string;
  object: string;
}

export interface Triple {
  subject: string;
  relation: string;
  object: string;
}

export interface DirectAskResult {
  type: 'direct';
  match: string;
  score: number;
  confident: boolean;
  subject: string;
  relation: string;
  bucket: string | null;
}

export interface SubjectAskResult {
  type: 'subject';
  subject: string;
  facts: Fact[];
}

export interface SearchAskResult {
  type: 'search';
  term: string;
  results: Triple[];
}

export interface MissAskResult {
  type: 'miss';
  query: string;
}

export type AskResult = DirectAskResult | SubjectAskResult | SearchAskResult | MissAskResult;

export interface BucketStats {
  name: string;
  facts: number;
  full: boolean;
}

export interface Stats {
  dimensions: number;
  maxBucketSize: number;
  symbols: number;
  buckets: number;
  subjects: number;
  totalFacts: number;
  ramBytes: number;
  ramMB: number;
  perBucket: BucketStats[];
}

export interface SerializedMemory {
  version: number;
  d: number;
  symbols: Record<string, number[]>;
  buckets: Record<string, unknown>;
  routing: Record<string, string[]>;
}

export class HRRMemory {
  constructor(dimensions?: number);

  store(subject: string, relation: string, object: string): boolean;
  forget(subject: string, relation: string, object: string): boolean;
  query(subject: string, relation: string): QueryResult;
  querySubject(subject: string): Fact[];
  search(relation: string | null, object: string | null): Triple[];
  ask(question: string): AskResult;
  stats(): Stats;

  save(filePath: string): void;
  static load(filePath: string, dimensions?: number): HRRMemory;

  toJSON(): SerializedMemory;
  static fromJSON(data: SerializedMemory): HRRMemory;
}

export class SymbolTable {
  constructor(dimensions?: number);
  get(name: string): Float32Array;
  has(name: string): boolean;
  readonly size: number;
  readonly bytes: number;
  nearest(
    vec: Float32Array,
    candidates?: Map<string, Float32Array> | null,
    topK?: number
  ): { name: string; score: number } | { name: string; score: number }[] | null;
  toJSON(): Record<string, number[]>;
  static fromJSON(data: Record<string, number[]>, dimensions: number): SymbolTable;
}

export class Bucket {
  constructor(name: string, dimensions?: number);
  readonly name: string;
  readonly count: number;
  readonly isFull: boolean;
  storeVector(association: Float32Array, triple: Triple): void;
  rebuild(symbols: SymbolTable): void;
  toJSON(): unknown;
  static fromJSON(data: unknown, dimensions: number): Bucket;
}

export function bind(a: Float32Array, b: Float32Array): Float32Array;
export function unbind(key: Float32Array, memory: Float32Array): Float32Array;
export function similarity(a: Float32Array, b: Float32Array): number;
export function randomVector(dimensions: number): Float32Array;
export function normalize(v: Float32Array): Float32Array;
