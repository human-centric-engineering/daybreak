/**
 * Data-slots capture capabilities (f-slot-capture) — the agent tools over the slot
 * engine: `get_state` (read, t-1) and `fill_slot` (write, t-2). Registered as framework
 * built-ins (via `registerFrameworkCapability`) from `initFramework()`.
 */

import type { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import { GetStateCapability } from '@/lib/framework/data-slots/capabilities/get-state';

export { GetStateCapability } from '@/lib/framework/data-slots/capabilities/get-state';

/** The data-slots capture capabilities to register at boot. `fill_slot` joins in t-2. */
export const dataSlotCapabilities: readonly BaseCapability[] = [new GetStateCapability()];
