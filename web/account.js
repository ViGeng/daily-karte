import { createAccountStore as createCoreAccountStore } from './account-core.js';
import { connectCloud } from './cloud.js';

export function createAccountStore(options) {
  return createCoreAccountStore({ connect: connectCloud, ...options });
}
