/**
 * The tool catalogue.
 *
 * One import for the whole surface. Adding a domain means adding one file
 * and one line here.
 */

import { Registry } from '../registry.js';
import { productTools } from './products.js';
import { inventoryTools } from './inventory.js';
import { orderTools } from './orders.js';
import { customerTools } from './customers.js';
import { storeTools } from './store.js';
import { adminTools } from './admin.js';

export const allTools = [
  ...storeTools,
  ...productTools,
  ...inventoryTools,
  ...orderTools,
  ...customerTools,
  ...adminTools,
];

export function createRegistry() {
  return new Registry(allTools);
}
