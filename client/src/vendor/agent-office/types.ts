// Adapted from agent-office client/world/types.ts (https://github.com/AgentSystemLabs/agent-office, commit 852e2ab).
// Copyright (c) 2026 AgentSystemLabs. MIT License: see THIRD_PARTY_NOTICES.md.

// Only the collider: what you bump into and stand on.

export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
  /** Underside, for things you walk beneath (the loft). Defaults to the floor. */
  bottom?: number;
  /** Only there to keep people out: its top isn't anything to land on, so confetti falls through it. */
  fence?: boolean;
}
