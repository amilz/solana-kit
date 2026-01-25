import { getBase58Decoder } from '@solana/codecs';
import { Keypair as Web3Keypair } from '@solana/web3.js';

import { Keypair } from '../keypair';
import { PublicKey } from '../publickey';

// Known test keypair (from solana-keygen)
const MOCK_SECRET_KEY = new Uint8Array([
    174, 47, 154, 16, 202, 193, 206, 113, 199, 190, 53, 133, 169, 175, 31, 56, 222, 53, 138, 189, 224, 216, 117, 173,
    10, 149, 53, 45, 73, 251, 237, 246, 15, 185, 186, 82, 177, 240, 148, 69, 241, 227, 167, 80, 141, 89, 240, 121, 121,
    35, 172, 247, 68, 251, 226, 218, 48, 63, 176, 109, 168, 89, 238, 135,
]);

const MOCK_SEED = MOCK_SECRET_KEY.slice(0, 32);

// Base58-encoded version of MOCK_SECRET_KEY
const MOCK_SECRET_KEY_BASE58 = getBase58Decoder().decode(MOCK_SECRET_KEY);

describe('Keypair compatibility with @solana/web3.js', () => {
    describe('fromSecretKey', () => {
        it('creates keypair with matching public key', async () => {
            const legacy = await Keypair.fromSecretKey(MOCK_SECRET_KEY);
            const web3 = Web3Keypair.fromSecretKey(MOCK_SECRET_KEY);

            expect(legacy.publicKey.toBase58()).toBe(web3.publicKey.toBase58());
        });

        it('returns matching secret key', async () => {
            const legacy = await Keypair.fromSecretKey(MOCK_SECRET_KEY);
            const web3 = Web3Keypair.fromSecretKey(MOCK_SECRET_KEY);

            expect(Array.from(legacy.secretKey)).toEqual(Array.from(web3.secretKey));
        });

        it('throws on invalid secret key length', async () => {
            await expect(Keypair.fromSecretKey(new Uint8Array(32))).rejects.toThrow();
            await expect(Keypair.fromSecretKey(new Uint8Array(65))).rejects.toThrow();
        });
    });

    describe('fromSeed', () => {
        it('creates keypair with matching public key', async () => {
            const legacy = await Keypair.fromSeed(MOCK_SEED);
            const web3 = Web3Keypair.fromSeed(MOCK_SEED);

            expect(legacy.publicKey.toBase58()).toBe(web3.publicKey.toBase58());
        });

        it('returns matching secret key', async () => {
            const legacy = await Keypair.fromSeed(MOCK_SEED);
            const web3 = Web3Keypair.fromSeed(MOCK_SEED);

            expect(Array.from(legacy.secretKey)).toEqual(Array.from(web3.secretKey));
        });

        it('throws on invalid seed length', async () => {
            await expect(Keypair.fromSeed(new Uint8Array(16))).rejects.toThrow();
            await expect(Keypair.fromSeed(new Uint8Array(64))).rejects.toThrow();
        });
    });

    describe('fromBase58', () => {
        it('creates keypair with matching public key', async () => {
            const legacy = await Keypair.fromBase58(MOCK_SECRET_KEY_BASE58);
            const web3 = Web3Keypair.fromSecretKey(MOCK_SECRET_KEY);

            expect(legacy.publicKey.toBase58()).toBe(web3.publicKey.toBase58());
        });

        it('returns matching secret key', async () => {
            const legacy = await Keypair.fromBase58(MOCK_SECRET_KEY_BASE58);

            expect(Array.from(legacy.secretKey)).toEqual(Array.from(MOCK_SECRET_KEY));
        });

        it('roundtrips through base58 encoding', async () => {
            const original = await Keypair.fromSecretKey(MOCK_SECRET_KEY);
            const base58 = getBase58Decoder().decode(original.secretKey);
            const restored = await Keypair.fromBase58(base58);

            expect(restored.publicKey.toBase58()).toBe(original.publicKey.toBase58());
            expect(Array.from(restored.secretKey)).toEqual(Array.from(original.secretKey));
        });

        it('throws on empty string', async () => {
            await expect(Keypair.fromBase58('')).rejects.toThrow();
        });

        it('throws on invalid base58 characters', async () => {
            await expect(Keypair.fromBase58('invalid!base58')).rejects.toThrow();
        });

        it('throws on base58 string that decodes to wrong length', async () => {
            // Base58 encode of 32 bytes (too short)
            const shortBase58 = getBase58Decoder().decode(MOCK_SEED);
            await expect(Keypair.fromBase58(shortBase58)).rejects.toThrow();
        });
    });

    describe('generate', () => {
        it('creates a valid keypair with 64-byte secret key', async () => {
            const keypair = await Keypair.generate();

            expect(keypair.publicKey).toBeInstanceOf(PublicKey);
            // Note: generated keypairs are non-extractable by default
            // so secretKey access would throw
        });

        it('generates unique keypairs', async () => {
            const kp1 = await Keypair.generate();
            const kp2 = await Keypair.generate();

            expect(kp1.publicKey.toBase58()).not.toBe(kp2.publicKey.toBase58());
        });
    });

    describe('publicKey', () => {
        it('returns a PublicKey instance', async () => {
            const keypair = await Keypair.fromSecretKey(MOCK_SECRET_KEY);

            expect(keypair.publicKey).toBeInstanceOf(PublicKey);
        });

        it('publicKey bytes match last 32 bytes of secretKey', async () => {
            const keypair = await Keypair.fromSecretKey(MOCK_SECRET_KEY);

            expect(Array.from(keypair.publicKey.toBytes())).toEqual(Array.from(keypair.secretKey.slice(32)));
        });
    });
});

describe('Keypair standalone tests', () => {
    describe('kit interop', () => {
        it('toSigner returns a KeyPairSigner', async () => {
            const keypair = await Keypair.fromSecretKey(MOCK_SECRET_KEY);
            const signer = keypair.toSigner();

            expect(signer.address).toBe(keypair.publicKey.toBase58());
            expect(typeof signer.signMessages).toBe('function');
            expect(typeof signer.signTransactions).toBe('function');
        });

        it('toCryptoKeyPair returns a CryptoKeyPair', async () => {
            const keypair = await Keypair.fromSecretKey(MOCK_SECRET_KEY);
            const cryptoKeyPair = keypair.toCryptoKeyPair();

            expect(cryptoKeyPair).toHaveProperty('privateKey');
            expect(cryptoKeyPair).toHaveProperty('publicKey');
            expect(cryptoKeyPair.privateKey).toBeInstanceOf(CryptoKey);
            expect(cryptoKeyPair.publicKey).toBeInstanceOf(CryptoKey);
        });
    });

    describe('fromLegacyKeypair', () => {
        it('creates keypair from web3.js keypair with matching public key', async () => {
            const web3Keypair = Web3Keypair.fromSecretKey(MOCK_SECRET_KEY);
            const legacy = await Keypair.fromLegacyKeypair(web3Keypair);

            expect(legacy.publicKey.toBase58()).toBe(web3Keypair.publicKey.toBase58());
        });

        it('creates keypair with extractable secretKey by default', async () => {
            const web3Keypair = Web3Keypair.fromSecretKey(MOCK_SECRET_KEY);
            const legacy = await Keypair.fromLegacyKeypair(web3Keypair);

            expect(() => legacy.secretKey).not.toThrow();
            expect(Array.from(legacy.secretKey)).toEqual(Array.from(web3Keypair.secretKey));
        });

        it('creates keypair with non-extractable secretKey when extractable=false', async () => {
            const web3Keypair = Web3Keypair.fromSecretKey(MOCK_SECRET_KEY);
            const legacy = await Keypair.fromLegacyKeypair(web3Keypair, false);

            expect(() => legacy.secretKey).toThrow(/extractable/);
        });

        it('toSigner works on keypair from legacy', async () => {
            const web3Keypair = Web3Keypair.fromSecretKey(MOCK_SECRET_KEY);
            const legacy = await Keypair.fromLegacyKeypair(web3Keypair);
            const signer = legacy.toSigner();

            expect(signer.address).toBe(web3Keypair.publicKey.toBase58());
        });
    });

    describe('secretKey access', () => {
        it('secretKey is accessible after fromSecretKey', async () => {
            const keypair = await Keypair.fromSecretKey(MOCK_SECRET_KEY);
            expect(() => keypair.secretKey).not.toThrow();
        });

        it('secretKey is accessible after fromSeed', async () => {
            const keypair = await Keypair.fromSeed(MOCK_SEED);
            expect(() => keypair.secretKey).not.toThrow();
        });

        it('secretKey throws for generated keypairs (non-extractable)', async () => {
            const keypair = await Keypair.generate();
            expect(() => keypair.secretKey).toThrow(/extractable/);
        });
    });
});
