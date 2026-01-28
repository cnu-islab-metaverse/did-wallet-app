import type { COLORS } from './const.js';
import type { TupleToUnion } from 'type-fest';

export type * from 'type-fest';
export type ColorType = 'success' | 'info' | 'error' | 'warning' | keyof typeof COLORS;
export type ExcludeValuesFromBaseArrayType<B extends string[], E extends (string | number)[]> = Exclude<
  TupleToUnion<B>,
  TupleToUnion<E>
>[];
export type ManifestType = chrome.runtime.ManifestV3;

// Unified error code shape used across extension services/UI
export interface AppError {
  code: string;         // machine-readable code, e.g., 'VC_VERIFY_FAILED'
  message: string;      // human-friendly message (localized upstream)
  details?: unknown;    // optional payload for debugging/telemetry
}
