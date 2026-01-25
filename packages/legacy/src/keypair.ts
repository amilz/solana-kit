import { getBase58Encoder, ReadonlyUint8Array } from '@solana/codecs';
import { fromLegacyKeypair as compatFromLegacyKeypair } from '@solana/compat';
import {
    isSolanaError,
    SOLANA_ERROR__ADDRESSES__INVALID_BASE58_ENCODED_ADDRESS,
    SOLANA_ERROR__KEYS__INVALID_KEY_PAIR_BYTE_LENGTH,
    SolanaError,
} from '@solana/errors';
import {
    createKeyPairSignerFromBytes,
    createKeyPairSignerFromPrivateKeyBytes,
    createSignerFromKeyPair,
    generateKeyPairSigner,
    type KeyPairSigner,
} from '@solana/signers';
import type { Keypair as Web3Keypair } from '@solana/web3.js';

import { PublicKey } from './publickey';

/**
 * A Keypair for signing transactions, providing backward compatibility
 * with the legacy @solana/web3.js API while using @solana/kit internally.
 *
 * NOTE: Unlike web3.js, all factory methods are async because Kit uses WebCrypto.
 */
export class Keypair {
    /** Internal Kit KeyPairSigner */
    private readonly _signer: KeyPairSigner;

    /** Cached secret key bytes (64 bytes: 32 private + 32 public) */
    private _secretKey: Uint8Array | null = null;

    /**
     * Private constructor - use static factory methods.
     */
    private constructor(signer: KeyPairSigner) {
        this._signer = signer;
    }

    /**
     * The public key for this keypair.
     */
    get publicKey(): PublicKey {
        return PublicKey.fromAddress(this._signer.address);
    }

    /**
     * The raw secret key (64 bytes: 32 private + 32 public) for this keypair.
     *
     * NOTE: This requires the keypair to be created with extractable=true.
     * Throws if the keypair is non-extractable.
     */
    get secretKey(): Uint8Array {
        if (this._secretKey) {
            return this._secretKey;
        }
        throw new Error(
            'Cannot access secretKey: keypair was created with extractable=false. ' +
                'Use Keypair.fromSecretKey() or Keypair.fromSeed() with extractable=true to access the secret key.',
        );
    }

    /**
     * Generate a new random keypair.
     *
     * NOTE: Unlike web3.js, this is async because Kit uses WebCrypto.
     */
    static async generate(): Promise<Keypair> {
        const signer = await generateKeyPairSigner();
        return new Keypair(signer);
    }

    /**
     * Create a keypair from a raw secret key (64 bytes).
     *
     * @param secretKey - 64 bytes: first 32 are private key, last 32 are public key
     * @param options - Optional settings
     * @param options.skipValidation - Skip validation that public key matches private key (legacy option that is ignored in Kit - always validates)
     * @param options.extractable - Extractable flag for the keypair (default: true for backwards compatibility with web3.js)
     *
     * NOTE: Unlike web3.js, this is async because Kit uses WebCrypto.
     */
    static async fromSecretKey(
        secretKey: number[] | ReadonlyUint8Array | Uint8Array,
        options?: { extractable?: boolean; skipValidation: false },
    ): Promise<Keypair> {
        if (secretKey.length !== 64) {
            throw new SolanaError(SOLANA_ERROR__KEYS__INVALID_KEY_PAIR_BYTE_LENGTH, { byteLength: secretKey.length });
        }

        // Kit validates by default, skipValidation is ignored for now
        // (Kit always validates the keypair during creation)
        // default extractable to true if not provided and void skipValidation
        const extractable = options?.extractable ?? true;
        const bytes = secretKey instanceof Uint8Array ? secretKey : new Uint8Array(secretKey);

        const signer = await createKeyPairSignerFromBytes(bytes, extractable);
        const keypair = new Keypair(signer);
        keypair._secretKey = new Uint8Array(secretKey);
        return keypair;
    }

    /**
     * Create a keypair from a 32-byte seed.
     *
     * @param seed - 32-byte seed to derive the keypair from
     *
     * NOTE: Unlike web3.js, this is async because Kit uses WebCrypto.
     */
    static async fromSeed(seed: Uint8Array): Promise<Keypair> {
        if (seed.length !== 32) {
            throw new Error(`Invalid seed length: expected 32 bytes, got ${seed.length}`);
        }

        const signer = await createKeyPairSignerFromPrivateKeyBytes(seed, true /* extractable */);
        const keypair = new Keypair(signer);

        // Build the 64-byte secret key: seed (32) + public key bytes (32)
        const publicKeyBytes = keypair.publicKey.toBytes();
        const secretKey = new Uint8Array(64);
        secretKey.set(seed, 0);
        secretKey.set(publicKeyBytes, 32);
        keypair._secretKey = secretKey;

        return keypair;
    }

    /**
     * Get the internal Kit KeyPairSigner.
     * This is a Kit-specific extension for interop.
     */
    toSigner(): KeyPairSigner {
        return this._signer;
    }

    /**
     * Creates a keypair from a base58-encoded secret key string.
     * This format is commonly used in Solana CLI and some wallets.
     *
     * @param base58String - Base58-encoded secret key string
     * @returns Promise resolving to a KeyPairSigner
     * @throws Error if the base58 string is invalid or doesn't decode to 64 bytes
     * @example
     * ```typescript
     * const base58Key = "your-base58-encoded-secret-key";
     * const keypair = await Keypair.fromBase58(base58Key);
     * ```
     */
    static async fromBase58(base58String: string): Promise<Keypair> {
        if (!base58String || typeof base58String !== 'string') {
            throw new Error('Base58 string must be a non-empty string');
        }

        try {
            const secretKey = getBase58Encoder().encode(base58String);
            return await this.fromSecretKey(new Uint8Array(secretKey));
        } catch (error) {
            if (isSolanaError(error, SOLANA_ERROR__KEYS__INVALID_KEY_PAIR_BYTE_LENGTH)) {
                throw error; // Re-throw our own validation error
            }
            throw new SolanaError(SOLANA_ERROR__ADDRESSES__INVALID_BASE58_ENCODED_ADDRESS, {
                putativeAddress: 'base58privatekey',
            });
        }
    }

    /**
     * Creates a Keypair from a legacy @solana/web3.js Keypair.
     * Useful for migrating code that uses the old web3.js library.
     *
     * @param legacyKeypair - A Keypair from @solana/web3.js
     * @param extractable - Whether the private key should be extractable (default: true)
     * @returns Promise resolving to a Keypair
     * @example
     * ```typescript
     * import { Keypair as Web3Keypair } from '@solana/web3.js';
     * import { Keypair } from '@solana/legacy';
     *
     * const web3Keypair = Web3Keypair.generate();
     * const keypair = await Keypair.fromLegacyKeypair(web3Keypair);
     * ```
     */
    static async fromLegacyKeypair(legacyKeypair: Web3Keypair, extractable: boolean = true): Promise<Keypair> {
        const cryptoKeyPair = await compatFromLegacyKeypair(legacyKeypair, extractable);
        const signer = await createSignerFromKeyPair(cryptoKeyPair);
        const keypair = new Keypair(signer);

        // Cache the secret key if extractable
        if (extractable) {
            keypair._secretKey = new Uint8Array(legacyKeypair.secretKey);
        }

        return keypair;
    }

    /**
     * Get the underlying CryptoKeyPair from this Keypair.
     * This is useful for interop with WebCrypto APIs.
     *
     * @returns The CryptoKeyPair used internally by this Keypair
     */
    toCryptoKeyPair(): CryptoKeyPair {
        return this._signer.keyPair;
    }
}

/**
 * Legacy Signer interface matching @solana/web3.js
 */
export interface Signer {
    publicKey: PublicKey;
    secretKey: Uint8Array;
}
