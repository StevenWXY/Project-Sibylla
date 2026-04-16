/**
 * Conflict Resolver Type Definitions
 *
 * Internal types for the ConflictResolver service.
 * Public-facing types (ConflictInfo, ResolutionType, ConflictResolution)
 * are defined in shared/types.ts for cross-process sharing.
 */

/** Internal representation of parsed conflict sections within a file */
export interface ConflictSection {
  /** Lines belonging to ours (local) version */
  readonly oursLines: readonly string[]
  /** Lines belonging to theirs (remote) version */
  readonly theirsLines: readonly string[]
}
