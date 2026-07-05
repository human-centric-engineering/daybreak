/**
 * Data-slots capture capabilities (f-slot-capture) — the agent tools over the slot
 * engine: `get_state` (read, t-1) and `fill_slot` (write, t-2). Registered as framework
 * built-ins (via `registerFrameworkCapability`) from `initFramework()`.
 */

import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import { GetStateCapability } from '@/lib/framework/data-slots/capabilities/get-state';
import { FillSlotCapability } from '@/lib/framework/data-slots/capabilities/fill-slot';

export { GetStateCapability } from '@/lib/framework/data-slots/capabilities/get-state';
export { FillSlotCapability } from '@/lib/framework/data-slots/capabilities/fill-slot';

/** The data-slots capture capabilities registered at boot: `get_state` (read) +
 *  `fill_slot` (write). */
export const dataSlotCapabilities: readonly BaseCapability[] = [
  new GetStateCapability(),
  new FillSlotCapability(),
];
