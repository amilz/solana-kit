/**
 * @solana/legacy - Legacy web3.js-compatible API backed by @solana/kit
 *
 * This package provides backward-compatible classes matching the @solana/web3.js API,
 * internally powered by @solana/kit primitives.
 */

// Phase 1: PublicKey
export { PublicKey } from './publickey';
export type { PublicKeyInitData } from './publickey';

// Phase 2: Keypair + Signer
export { Keypair } from './keypair';
export type { Signer } from './keypair';

// Phase 3: Message (TODO)
// export { Message, MessageV0 } from './message';

// Phase 4: Transaction (TODO)
// export { Transaction, VersionedTransaction } from './transaction';

// Phase 5: Connection (TODO)
// export { Connection } from './connection';
