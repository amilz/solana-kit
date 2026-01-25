import {
    type Address,
    address,
    createAddressWithSeed,
    getAddressDecoder,
    getAddressEncoder,
    getProgramDerivedAddress,
    isAddress,
    isOffCurveAddress
} from '@solana/addresses';
import { fromLegacyPublicKey as compatFromLegacyPublicKey } from '@solana/compat';
import type { PublicKey as LegacyPublicKey } from '@solana/web3.js';

/**
 * Value used to represent a public key in various input forms.
 * Matches the legacy web3.js PublicKeyInitData type.
 */
export type PublicKeyInitData = number | string | Uint8Array | Array<number> | PublicKeyData;

/**
 * JSON representation of a PublicKey, matching legacy web3.js.
 */
export type PublicKeyData = {
    _bn: string; // base58 string for JSON serialization
};

/**
 * Maximum length of a program derived address seed.
 */
export const MAX_SEED_LENGTH = 32;

/**
 * Maximum number of seeds for a PDA.
 */
const MAX_SEEDS = 16;

/**
 * Size of a public key in bytes.
 */
const PUBLIC_KEY_LENGTH = 32;

/**
 * The "ProgramDerivedAddress" marker bytes appended when hashing PDAs.
 */
const PDA_MARKER_BYTES = new Uint8Array([
    80, 114, 111, 103, 114, 97, 109, 68, 101, 114, 105, 118, 101, 100, 65, 100, 100, 114, 101, 115, 115,
]);

/**
 * A class representing a Solana public key, providing backward compatibility
 * with the legacy @solana/web3.js API while using @solana/kit internally.
 */
export class PublicKey {
    /** Internal Kit Address representation */
    private readonly _address: Address;

    /** Cached bytes for performance */
    private _bytes: Uint8Array | null = null;

    /**
     * Create a new PublicKey instance.
     *
     * @param value - The value to create the PublicKey from
     */
    constructor(value: PublicKeyInitData) {
        if (value instanceof PublicKey) {
            this._address = value._address;
        } else if (typeof value === 'string') {
            if (!isAddress(value)) {
                throw new Error(`Invalid public key input: ${value}`);
            }
            this._address = address(value);
        } else if (typeof value === 'number') {
            // Legacy support: number as single byte value
            const bytes = new Uint8Array(PUBLIC_KEY_LENGTH);
            bytes[0] = value;
            this._address = getAddressDecoder().decode(bytes);
            this._bytes = bytes;
        } else if (value instanceof Uint8Array || Array.isArray(value)) {
            const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
            if (bytes.length !== PUBLIC_KEY_LENGTH) {
                throw new Error(`Invalid public key input: expected ${PUBLIC_KEY_LENGTH} bytes, got ${bytes.length}`);
            }
            this._address = getAddressDecoder().decode(bytes);
            this._bytes = bytes;
        } else if ('_bn' in value) {
            // JSON deserialization format
            this._address = address(value._bn);
        } else {
            throw new Error('Invalid public key input');
        }
    }

    /**
     * Default public key value (all zeros).
     */
    static default = new PublicKey(address('11111111111111111111111111111111'));

    /**
     * Compare two PublicKey instances for equality.
     */
    equals(publicKey: PublicKey): boolean {
        return this._address === publicKey._address;
    }

    /**
     * Return the raw bytes of this public key.
     */
    toBytes(): Uint8Array {
        if (!this._bytes) {
            // Kit returns ReadonlyUint8Array, copy to mutable Uint8Array for legacy compat
            const encoded = getAddressEncoder().encode(this._address);
            this._bytes = new Uint8Array(encoded);
        }
        return this._bytes;
    }

    /**
     * Return the base-58 representation of this public key.
     */
    toBase58(): string {
        return this._address;
    }

    /**
     * Return the JSON representation of this public key.
     */
    toJSON(): string {
        return this.toBase58();
    }

    /**
     * Return the string representation of this public key.
     */
    toString(): string {
        return this.toBase58();
    }

    /**
     * Return a buffer representation of this public key in big endian
     */
    toBuffer(): Buffer {
        //TODO
        return Buffer.from(this.toBytes());
    }

    /**
     * Get the internal Kit Address.
     * This is a Kit-specific extension for interop.
     */
    toAddress(): Address {
        return this._address;
    }

    /**
     * Create a PublicKey from a Kit Address.
     * This is a Kit-specific extension for interop.
     */
    static fromAddress(addr: Address): PublicKey {
        const pk = new PublicKey(addr);
        return pk;
    }

    /**
     * Derive a public key from another key, a seed, and a program ID.
     * The program ID will also serve as the owner of the derived key.
     */
    static async createWithSeed(fromPublicKey: PublicKey, seed: string, programId: PublicKey): Promise<PublicKey> {
        const derivedAddress = await createAddressWithSeed({
            baseAddress: fromPublicKey.toAddress(),
            programAddress: programId.toAddress(),
            seed,
        });
        return new PublicKey(derivedAddress);
    }

    /**
     * Synchronous version of createWithSeed (legacy compatibility).
     * Note: Uses WebCrypto which may not be available in all environments.
     */
    static createWithSeedSync(_fromPublicKey: PublicKey, _seed: string, _programId: PublicKey): PublicKey {
        // For sync version, we need a sync hash. Use the same approach as Kit.
        throw new Error(
            'createWithSeedSync is not supported in @solana/legacy. Use createWithSeed (async) instead.',
        );
    }

    /**
     * Derive a program address from seeds and a program ID.
     * Unlike findProgramAddress, this expects seeds to already include a valid bump
     * that produces an off-curve address.
     */
    static async createProgramAddress(seeds: Array<Uint8Array | string>, programId: PublicKey): Promise<PublicKey> {
        if (seeds.length > MAX_SEEDS) {
            throw new Error(`Max seed count exceeded: ${seeds.length} > ${MAX_SEEDS}`);
        }

        // Convert seeds to bytes and validate lengths
        const seedBytes: number[] = [];
        for (const seed of seeds) {
            const bytes = typeof seed === 'string' ? new TextEncoder().encode(seed) : seed;
            if (bytes.length > MAX_SEED_LENGTH) {
                throw new Error(`Max seed length exceeded: ${bytes.length} > ${MAX_SEED_LENGTH}`);
            }
            seedBytes.push(...bytes);
        }

        // Hash: seeds + programId + "ProgramDerivedAddress"
        const programBytes = programId.toBytes();
        const hashInput = new Uint8Array([...seedBytes, ...programBytes, ...PDA_MARKER_BYTES]);
        const hashBuffer = await crypto.subtle.digest('SHA-256', hashInput);
        const addressBytes = new Uint8Array(hashBuffer);

        // Verify the result is off-curve (valid PDA)
        const derivedAddress = getAddressDecoder().decode(addressBytes);
        if (!isOffCurveAddress(derivedAddress)) {
            throw new Error('Invalid seeds, address must fall off the curve');
        }

        return PublicKey.fromAddress(derivedAddress);
    }

    /**
     * Synchronous version of createProgramAddress (legacy compatibility).
     */
    static createProgramAddressSync(_seeds: Array<Uint8Array | string>, _programId: PublicKey): PublicKey {
        throw new Error(
            'createProgramAddressSync is not supported in @solana/legacy. Use createProgramAddress (async) instead.',
        );
    }

    /**
     * Find a valid program derived address and its bump seed.
     */
    static async findProgramAddress(
        seeds: Array<Uint8Array | string>,
        programId: PublicKey,
    ): Promise<[PublicKey, number]> {
        const processedSeeds = seeds.map(seed => {
            if (typeof seed === 'string') {
                return new TextEncoder().encode(seed);
            }
            return seed;
        });

        const [derivedAddress, bump] = await getProgramDerivedAddress({
            programAddress: programId.toAddress(),
            seeds: processedSeeds,
        });

        return [PublicKey.fromAddress(derivedAddress), bump];
    }

    /**
     * Synchronous version of findProgramAddress (legacy compatibility).
     */
    static findProgramAddressSync(_seeds: Array<Uint8Array | string>, _programId: PublicKey): [PublicKey, number] {
        throw new Error(
            'findProgramAddressSync is not supported in @solana/legacy. Use findProgramAddress (async) instead.',
        );
    }

    /**
     * Check if a string is a valid base-58 encoded public key.
     */
    static isOnCurve(pubkeyData: PublicKeyInitData): boolean {
        const address = new PublicKey(pubkeyData).toAddress();
        return !isOffCurveAddress(address);
    }

    /**
     * Convert a legacy PublicKey object to a PublicKey object.
     */
    static fromLegacyPublicKey(legacyPublicKey: LegacyPublicKey): PublicKey {
        return new PublicKey(compatFromLegacyPublicKey(legacyPublicKey));
    }
}
