import { PublicKey as Web3PublicKey } from '@solana/web3.js';

import { PublicKey } from '../publickey';

// Well-known test addresses
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const RANDOM_ADDRESS = 'DcESq8KFcdTdpjWtr2DoGcvu5McM3VJoBetgM1X1vVct';

// Test bytes
const MOCK_BYTES = new Uint8Array([
    0xbb, 0x52, 0xc6, 0x2d, 0x52, 0x4f, 0x7f, 0xea, 0x4f, 0x2c, 0x27, 0x13, 0xd6, 0x20, 0x80, 0xad, 0x6a, 0x36, 0x9a,
    0x0e, 0x36, 0x71, 0x74, 0x32, 0x8d, 0x1a, 0xf7, 0xee, 0x7e, 0x04, 0x76, 0x19,
]);

describe('PublicKey compatibility with @solana/web3.js', () => {
    describe('constructor', () => {
        it('creates from base58 string identically', () => {
            const legacy = new PublicKey(RANDOM_ADDRESS);
            const web3 = new Web3PublicKey(RANDOM_ADDRESS);

            expect(legacy.toBase58()).toBe(web3.toBase58());
        });

        it('creates from Uint8Array identically', () => {
            const legacy = new PublicKey(MOCK_BYTES);
            const web3 = new Web3PublicKey(MOCK_BYTES);

            expect(legacy.toBase58()).toBe(web3.toBase58());
        });

        it('creates from number array identically', () => {
            const arr = Array.from(MOCK_BYTES);
            const legacy = new PublicKey(arr);
            const web3 = new Web3PublicKey(arr);

            expect(legacy.toBase58()).toBe(web3.toBase58());
        });
    });

    describe('toBase58', () => {
        it.each([SYSTEM_PROGRAM, TOKEN_PROGRAM, RANDOM_ADDRESS])('returns identical base58 for %s', address => {
            const legacy = new PublicKey(address);
            const web3 = new Web3PublicKey(address);

            expect(legacy.toBase58()).toBe(web3.toBase58());
        });
    });

    describe('toBytes', () => {
        it.each([SYSTEM_PROGRAM, TOKEN_PROGRAM, RANDOM_ADDRESS])('returns identical bytes for %s', address => {
            const legacy = new PublicKey(address);
            const web3 = new Web3PublicKey(address);

            expect(legacy.toBytes()).toEqual(web3.toBytes());
        });
    });

    describe('toBuffer', () => {
        it.each([SYSTEM_PROGRAM, TOKEN_PROGRAM, RANDOM_ADDRESS])('returns identical buffer content for %s', address => {
            const legacy = new PublicKey(address);
            const web3 = new Web3PublicKey(address);

            // Legacy returns Uint8Array, web3 returns Buffer
            // Compare contents, not types
            expect(Array.from(legacy.toBuffer())).toEqual(Array.from(web3.toBuffer()));
        });
    });

    describe('toString', () => {
        it.each([SYSTEM_PROGRAM, TOKEN_PROGRAM, RANDOM_ADDRESS])('returns identical string for %s', address => {
            const legacy = new PublicKey(address);
            const web3 = new Web3PublicKey(address);

            expect(legacy.toString()).toBe(web3.toString());
        });
    });

    describe('toJSON', () => {
        it.each([SYSTEM_PROGRAM, TOKEN_PROGRAM, RANDOM_ADDRESS])('returns identical JSON for %s', address => {
            const legacy = new PublicKey(address);
            const web3 = new Web3PublicKey(address);

            expect(legacy.toJSON()).toBe(web3.toJSON());
        });
    });

    describe('equals', () => {
        it('returns true for equal keys', () => {
            const legacy1 = new PublicKey(RANDOM_ADDRESS);
            const legacy2 = new PublicKey(RANDOM_ADDRESS);

            expect(legacy1.equals(legacy2)).toBe(true);
        });

        it('returns false for different keys', () => {
            const legacy1 = new PublicKey(SYSTEM_PROGRAM);
            const legacy2 = new PublicKey(TOKEN_PROGRAM);

            expect(legacy1.equals(legacy2)).toBe(false);
        });

        it('matches web3.js behavior', () => {
            const legacy1 = new PublicKey(RANDOM_ADDRESS);
            const legacy2 = new PublicKey(RANDOM_ADDRESS);
            const web31 = new Web3PublicKey(RANDOM_ADDRESS);
            const web32 = new Web3PublicKey(RANDOM_ADDRESS);

            expect(legacy1.equals(legacy2)).toBe(web31.equals(web32));
        });
    });

    describe('default', () => {
        it('matches web3.js default public key', () => {
            expect(PublicKey.default.toBase58()).toBe(Web3PublicKey.default.toBase58());
        });
    });

    describe('createWithSeed', () => {
        it('produces identical address to web3.js', async () => {
            const base = new PublicKey(RANDOM_ADDRESS);
            const web3Base = new Web3PublicKey(RANDOM_ADDRESS);
            const programId = new PublicKey(SYSTEM_PROGRAM);
            const web3ProgramId = new Web3PublicKey(SYSTEM_PROGRAM);
            const seed = 'test-seed';

            const legacy = await PublicKey.createWithSeed(base, seed, programId);
            const web3 = await Web3PublicKey.createWithSeed(web3Base, seed, web3ProgramId);

            expect(legacy.toBase58()).toBe(web3.toBase58());
        });

        it('produces identical address for various seeds', async () => {
            const seeds = ['', 'a', 'hello', 'test-seed-12345', '!@#$%^&*()'];

            for (const seed of seeds) {
                const base = new PublicKey(RANDOM_ADDRESS);
                const web3Base = new Web3PublicKey(RANDOM_ADDRESS);
                const programId = new PublicKey(TOKEN_PROGRAM);
                const web3ProgramId = new Web3PublicKey(TOKEN_PROGRAM);

                const legacy = await PublicKey.createWithSeed(base, seed, programId);
                const web3 = await Web3PublicKey.createWithSeed(web3Base, seed, web3ProgramId);

                expect(legacy.toBase58()).toBe(web3.toBase58());
            }
        });
    });

    describe('findProgramAddress', () => {
        it('produces identical PDA and bump to web3.js', async () => {
            const seeds = [Buffer.from('test')];
            const programId = new PublicKey(TOKEN_PROGRAM);
            const web3ProgramId = new Web3PublicKey(TOKEN_PROGRAM);

            const [legacyPda, legacyBump] = await PublicKey.findProgramAddress(seeds, programId);
            const [web3Pda, web3Bump] = await Web3PublicKey.findProgramAddress(seeds, web3ProgramId);

            expect(legacyPda.toBase58()).toBe(web3Pda.toBase58());
            expect(legacyBump).toBe(web3Bump);
        });

        it('handles multiple seeds identically', async () => {
            const seeds = [Buffer.from('seed1'), Buffer.from('seed2'), new Uint8Array([1, 2, 3])];
            const programId = new PublicKey(TOKEN_PROGRAM);
            const web3ProgramId = new Web3PublicKey(TOKEN_PROGRAM);

            const [legacyPda, legacyBump] = await PublicKey.findProgramAddress(seeds, programId);
            const [web3Pda, web3Bump] = await Web3PublicKey.findProgramAddress(seeds, web3ProgramId);

            expect(legacyPda.toBase58()).toBe(web3Pda.toBase58());
            expect(legacyBump).toBe(web3Bump);
        });

        it('handles string seeds identically', async () => {
            const seeds = ['hello', 'world'];
            const programId = new PublicKey(SYSTEM_PROGRAM);
            const web3ProgramId = new Web3PublicKey(SYSTEM_PROGRAM);

            const [legacyPda, legacyBump] = await PublicKey.findProgramAddress(seeds, programId);
            // web3.js requires Buffer/Uint8Array, convert strings
            const [web3Pda, web3Bump] = await Web3PublicKey.findProgramAddress(
                seeds.map(s => Buffer.from(s)),
                web3ProgramId,
            );

            expect(legacyPda.toBase58()).toBe(web3Pda.toBase58());
            expect(legacyBump).toBe(web3Bump);
        });
    });

    describe('createProgramAddress', () => {
        it('produces identical address to web3.js', async () => {
            // Use a known bump that produces a valid PDA
            const [, bump] = await Web3PublicKey.findProgramAddress(
                [Buffer.from('test')],
                new Web3PublicKey(TOKEN_PROGRAM),
            );

            const seeds = [Buffer.from('test'), new Uint8Array([bump])];
            const programId = new PublicKey(TOKEN_PROGRAM);
            const web3ProgramId = new Web3PublicKey(TOKEN_PROGRAM);

            const legacy = await PublicKey.createProgramAddress(seeds, programId);
            const web3 = await Web3PublicKey.createProgramAddress(seeds, web3ProgramId);

            expect(legacy.toBase58()).toBe(web3.toBase58());
        });
    });

    describe('isOnCurve', () => {
        it('returns true for on-curve addresses (same as web3.js)', () => {
            // Regular addresses are on-curve
            expect(PublicKey.isOnCurve(RANDOM_ADDRESS)).toBe(Web3PublicKey.isOnCurve(RANDOM_ADDRESS));
            expect(PublicKey.isOnCurve(TOKEN_PROGRAM)).toBe(Web3PublicKey.isOnCurve(TOKEN_PROGRAM));
        });

        it('returns false for PDAs (same as web3.js)', async () => {
            const [pda] = await Web3PublicKey.findProgramAddress(
                [Buffer.from('test')],
                new Web3PublicKey(TOKEN_PROGRAM),
            );

            expect(PublicKey.isOnCurve(pda.toBase58())).toBe(Web3PublicKey.isOnCurve(pda.toBase58()));
            expect(PublicKey.isOnCurve(pda.toBase58())).toBe(false);
        });
    });
});

describe('PublicKey standalone tests', () => {
    describe('kit interop', () => {
        it('toAddress returns valid Kit Address', () => {
            const pk = new PublicKey(RANDOM_ADDRESS);
            expect(pk.toAddress()).toBe(RANDOM_ADDRESS);
        });

        it('fromAddress creates valid PublicKey', () => {
            const original = new PublicKey(RANDOM_ADDRESS);
            const pk = PublicKey.fromAddress(original.toAddress());
            expect(pk.toBase58()).toBe(RANDOM_ADDRESS);
        });

        it('roundtrips through Kit Address', () => {
            const original = new PublicKey(RANDOM_ADDRESS);
            const address = original.toAddress();
            const restored = PublicKey.fromAddress(address);
            expect(restored.equals(original)).toBe(true);
        });
    });

    describe('fromLegacyPublicKey', () => {
        it('creates PublicKey from web3.js PublicKey', () => {
            const web3Pk = new Web3PublicKey(RANDOM_ADDRESS);
            const pk = PublicKey.fromLegacyPublicKey(web3Pk);

            expect(pk.toBase58()).toBe(web3Pk.toBase58());
        });

        it('resulting PublicKey equals one created directly', () => {
            const web3Pk = new Web3PublicKey(TOKEN_PROGRAM);
            const fromLegacy = PublicKey.fromLegacyPublicKey(web3Pk);
            const direct = new PublicKey(TOKEN_PROGRAM);

            expect(fromLegacy.equals(direct)).toBe(true);
        });
    });

    describe('sync methods throw', () => {
        it('createWithSeedSync throws', () => {
            const base = new PublicKey(RANDOM_ADDRESS);
            const programId = new PublicKey(SYSTEM_PROGRAM);
            expect(() => PublicKey.createWithSeedSync(base, 'seed', programId)).toThrow();
        });

        it('findProgramAddressSync throws', () => {
            const programId = new PublicKey(SYSTEM_PROGRAM);
            expect(() => PublicKey.findProgramAddressSync([Buffer.from('test')], programId)).toThrow();
        });

        it('createProgramAddressSync throws', () => {
            const programId = new PublicKey(SYSTEM_PROGRAM);
            expect(() => PublicKey.createProgramAddressSync([Buffer.from('test')], programId)).toThrow();
        });
    });
});
