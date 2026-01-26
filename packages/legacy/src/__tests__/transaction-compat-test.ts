import { AccountRole, type Instruction } from '@solana/instructions';
import { Keypair as Web3Keypair, PublicKey as Web3PublicKey, Transaction as Web3Transaction } from '@solana/web3.js';

import { Keypair } from '../keypair';
import { Message } from '../message';
import { PublicKey } from '../publickey';
import { Transaction, VersionedTransaction } from '../transaction';

// Well-known addresses
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

// Test blockhash
const TEST_BLOCKHASH = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k';

describe('Transaction compatibility with @solana/web3.js', () => {
    describe('constructor', () => {
        it('creates empty transaction', () => {
            const tx = new Transaction();
            expect(tx.signatures).toEqual([]);
            expect(tx.instructions).toEqual([]);
            expect(tx.recentBlockhash).toBeUndefined();
            expect(tx.feePayer).toBeUndefined();
        });

        it('creates transaction with blockhash', () => {
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                lastValidBlockHeight: 1000,
            });
            expect(tx.recentBlockhash).toBe(TEST_BLOCKHASH);
            expect(tx.lastValidBlockHeight).toBe(1000);
        });

        it('creates transaction with feePayer', () => {
            const feePayer = new PublicKey(SYSTEM_PROGRAM);
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer,
                lastValidBlockHeight: 1000,
            });
            expect(tx.feePayer?.toBase58()).toBe(SYSTEM_PROGRAM);
        });

        it('creates transaction with nonceInfo', () => {
            const noncePubkey = new PublicKey(SYSTEM_PROGRAM);
            const nonceInstruction = {
                data: Buffer.alloc(0),
                keys: [{ isSigner: false, isWritable: true, pubkey: noncePubkey }],
                programId: new PublicKey(SYSTEM_PROGRAM),
            };

            const tx = new Transaction({
                minContextSlot: 100,
                nonceInfo: {
                    nonce: TEST_BLOCKHASH,
                    nonceInstruction,
                },
            });

            expect(tx.nonceInfo).toBeDefined();
            expect(tx.nonceInfo?.nonce).toBe(TEST_BLOCKHASH);
            expect(tx.recentBlockhash).toBe(TEST_BLOCKHASH);
            expect(tx.minNonceContextSlot).toBe(100);
        });
    });

    describe('add', () => {
        it('adds instruction to transaction', () => {
            const tx = new Transaction();
            const programId = new PublicKey(SYSTEM_PROGRAM);
            const instruction = {
                data: Buffer.from([1, 2, 3]),
                keys: [],
                programId,
            };

            tx.add(instruction);

            expect(tx.instructions).toHaveLength(1);
            expect(tx.instructions[0].programId.toBase58()).toBe(SYSTEM_PROGRAM);
            expect(tx.instructions[0].data).toEqual(Buffer.from([1, 2, 3]));
        });

        it('adds multiple instructions', () => {
            const tx = new Transaction();
            const programId = new PublicKey(SYSTEM_PROGRAM);

            tx.add({ data: Buffer.from([1]), keys: [], programId }, { data: Buffer.from([2]), keys: [], programId });

            expect(tx.instructions).toHaveLength(2);
        });

        it('adds instructions from another transaction', () => {
            const tx1 = new Transaction();
            const tx2 = new Transaction();
            const programId = new PublicKey(SYSTEM_PROGRAM);

            tx1.add({ data: Buffer.from([1]), keys: [], programId });
            tx2.add(tx1);

            expect(tx2.instructions).toHaveLength(1);
        });

        it('returns this for chaining', () => {
            const tx = new Transaction();
            const programId = new PublicKey(SYSTEM_PROGRAM);

            const result = tx.add({ keys: [], programId });

            expect(result).toBe(tx);
        });

        it('adds Kit Instruction to transaction', () => {
            const tx = new Transaction();

            const kitInstruction: Instruction = {
                accounts: [
                    { address: SYSTEM_PROGRAM as `${string}`, role: AccountRole.WRITABLE_SIGNER },
                ],
                data: new Uint8Array([1, 2, 3]),
                programAddress: SYSTEM_PROGRAM as `${string}`,
            };

            tx.add(kitInstruction);

            expect(tx.instructions).toHaveLength(1);
            expect(tx.instructions[0].programId.toBase58()).toBe(SYSTEM_PROGRAM);
            expect(tx.instructions[0].data).toEqual(Buffer.from([1, 2, 3]));
            expect(tx.instructions[0].keys).toHaveLength(1);
            expect(tx.instructions[0].keys[0].isSigner).toBe(true);
            expect(tx.instructions[0].keys[0].isWritable).toBe(true);
        });

        it('adds multiple Kit Instructions', () => {
            const tx = new Transaction();

            const kitInstruction1: Instruction = {
                data: new Uint8Array([1]),
                programAddress: SYSTEM_PROGRAM as `${string}`,
            };

            const kitInstruction2: Instruction = {
                data: new Uint8Array([2]),
                programAddress: SYSTEM_PROGRAM as `${string}`,
            };

            tx.add(kitInstruction1, kitInstruction2);

            expect(tx.instructions).toHaveLength(2);
            expect(tx.instructions[0].data).toEqual(Buffer.from([1]));
            expect(tx.instructions[1].data).toEqual(Buffer.from([2]));
        });

        it('adds mixed Kit and legacy instructions', () => {
            const tx = new Transaction();
            const programId = new PublicKey(SYSTEM_PROGRAM);

            const kitInstruction: Instruction = {
                data: new Uint8Array([1]),
                programAddress: SYSTEM_PROGRAM as `${string}`,
            };

            const legacyInstruction = {
                data: Buffer.from([2]),
                keys: [],
                programId,
            };

            tx.add(kitInstruction, legacyInstruction);

            expect(tx.instructions).toHaveLength(2);
            expect(tx.instructions[0].data).toEqual(Buffer.from([1]));
            expect(tx.instructions[1].data).toEqual(Buffer.from([2]));
        });

        it('correctly maps Kit AccountRole values', () => {
            const tx = new Transaction();
            const address = SYSTEM_PROGRAM as `${string}`;

            const kitInstruction: Instruction = {
                accounts: [
                    { address, role: AccountRole.READONLY },
                    { address, role: AccountRole.WRITABLE },
                    { address, role: AccountRole.READONLY_SIGNER },
                    { address, role: AccountRole.WRITABLE_SIGNER },
                ],
                programAddress: address,
            };

            tx.add(kitInstruction);

            expect(tx.instructions[0].keys[0]).toMatchObject({ isSigner: false, isWritable: false });
            expect(tx.instructions[0].keys[1]).toMatchObject({ isSigner: false, isWritable: true });
            expect(tx.instructions[0].keys[2]).toMatchObject({ isSigner: true, isWritable: false });
            expect(tx.instructions[0].keys[3]).toMatchObject({ isSigner: true, isWritable: true });
        });

        it('handles Kit Instruction without data', () => {
            const tx = new Transaction();

            const kitInstruction: Instruction = {
                programAddress: SYSTEM_PROGRAM as `${string}`,
            };

            tx.add(kitInstruction);

            expect(tx.instructions[0].data).toEqual(Buffer.alloc(0));
        });

        it('handles Kit Instruction without accounts', () => {
            const tx = new Transaction();

            const kitInstruction: Instruction = {
                data: new Uint8Array([1, 2, 3]),
                programAddress: SYSTEM_PROGRAM as `${string}`,
            };

            tx.add(kitInstruction);

            expect(tx.instructions[0].keys).toEqual([]);
        });
    });

    describe('compileMessage', () => {
        it('throws without recentBlockhash', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction();
            tx.feePayer = keypair.publicKey;
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            expect(() => tx.compileMessage()).toThrow('Transaction recentBlockhash required');
        });

        it('throws without feePayer', () => {
            const tx = new Transaction({ blockhash: TEST_BLOCKHASH, lastValidBlockHeight: 1000 });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            expect(() => tx.compileMessage()).toThrow('Transaction fee payer required');
        });

        it('compiles message with feePayer and blockhash', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            const message = tx.compileMessage();

            expect(message).toBeInstanceOf(Message);
            expect(message.recentBlockhash).toBe(TEST_BLOCKHASH);
            expect(message.accountKeys[0].toBase58()).toBe(keypair.publicKey.toBase58());
        });
    });

    describe('sign and verify', () => {
        it('signs transaction with keypair', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            await tx.sign(keypair);

            expect(tx.signatures).toHaveLength(1);
            expect(tx.signatures[0].signature).not.toBeNull();
            expect(tx.signatures[0].publicKey.toBase58()).toBe(keypair.publicKey.toBase58());
        });

        it('verifies valid signatures', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            await tx.sign(keypair);
            const valid = await tx.verifySignatures();

            expect(valid).toBe(true);
        });

        it('returns false for missing signatures when requireAllSignatures=true', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [{ isSigner: true, isWritable: false, pubkey: keypair.publicKey }],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            // Compile but don't sign
            tx.compileMessage();
            // Initialize signatures array without signing
            tx.signatures = [{ publicKey: keypair.publicKey, signature: null }];

            const valid = await tx.verifySignatures(true);
            expect(valid).toBe(false);
        });

        it('returns true for missing signatures when requireAllSignatures=false', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            // Compile but don't sign
            tx.compileMessage();
            // Initialize signatures array without signing
            tx.signatures = [{ publicKey: keypair.publicKey, signature: null }];

            const valid = await tx.verifySignatures(false);
            expect(valid).toBe(true);
        });

        it('partialSign allows multiple signers', async () => {
            const keypair1 = await Keypair.generate();
            const keypair2 = await Keypair.generate();

            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair1.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [{ isSigner: true, isWritable: false, pubkey: keypair2.publicKey }],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            await tx.partialSign(keypair1);
            expect(
                tx.signatures.find(s => s.publicKey.toBase58() === keypair1.publicKey.toBase58())?.signature,
            ).not.toBeNull();

            await tx.partialSign(keypair2);
            expect(
                tx.signatures.find(s => s.publicKey.toBase58() === keypair2.publicKey.toBase58())?.signature,
            ).not.toBeNull();

            const valid = await tx.verifySignatures();
            expect(valid).toBe(true);
        });
    });

    describe('serialize and deserialize', () => {
        it('serializes and deserializes transaction', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                data: Buffer.from([1, 2, 3, 4]),
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            await tx.sign(keypair);
            const serialized = await tx.serialize();
            const deserialized = Transaction.from(serialized);

            expect(deserialized.recentBlockhash).toBe(TEST_BLOCKHASH);
            expect(deserialized.feePayer?.toBase58()).toBe(keypair.publicKey.toBase58());
            expect(deserialized.instructions).toHaveLength(1);
            expect(deserialized.instructions[0].data).toEqual(Buffer.from([1, 2, 3, 4]));
        });

        it('throws on serialize without signatures when requireAllSignatures=true', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            // Compile to set up signatures array but don't sign
            tx.compileMessage();
            tx.signatures = [{ publicKey: keypair.publicKey, signature: null }];

            await expect(tx.serialize({ requireAllSignatures: true })).rejects.toThrow();
        });

        it('serializes without signatures when requireAllSignatures=false', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            tx.compileMessage();
            tx.signatures = [{ publicKey: keypair.publicKey, signature: null }];

            const serialized = await tx.serialize({ requireAllSignatures: false, verifySignatures: false });
            expect(serialized).toBeInstanceOf(Buffer);
        });
    });

    describe('addSignature', () => {
        it('adds external signature', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            // Compile first to set up signatures
            tx.compileMessage();

            // Create a fake signature (64 bytes)
            const fakeSignature = Buffer.alloc(64, 1);
            tx.addSignature(keypair.publicKey, fakeSignature);

            expect(tx.signatures[0].signature).toEqual(fakeSignature);
        });
    });

    describe('signature getter', () => {
        it('returns null when no signatures', () => {
            const tx = new Transaction();
            expect(tx.signature).toBeNull();
        });

        it('returns first signature when present', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            await tx.sign(keypair);

            expect(tx.signature).not.toBeNull();
            expect(tx.signature?.length).toBe(64);
        });
    });

    describe('populate', () => {
        it('creates transaction from message', async () => {
            const keypair = await Keypair.generate();
            const originalTx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            originalTx.add({
                data: Buffer.from([5, 6, 7]),
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            const message = originalTx.compileMessage();
            const tx = Transaction.populate(message);

            expect(tx.recentBlockhash).toBe(TEST_BLOCKHASH);
            expect(tx.feePayer?.toBase58()).toBe(keypair.publicKey.toBase58());
            expect(tx.instructions).toHaveLength(1);
        });
    });

    describe('web3.js message serialization compatibility', () => {
        it('produces same serialized message as web3.js', async () => {
            // Create matching keypairs
            const web3Keypair = Web3Keypair.generate();
            const legacyKeypair = await Keypair.fromSecretKey(web3Keypair.secretKey);

            // Create web3.js transaction
            const web3Tx = new Web3Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: web3Keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            web3Tx.add({
                data: Buffer.from([1, 2, 3]),
                keys: [],
                programId: new Web3PublicKey(SYSTEM_PROGRAM),
            });

            // Create legacy transaction
            const legacyTx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: legacyKeypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            legacyTx.add({
                data: Buffer.from([1, 2, 3]),
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            // Compare serialized messages
            const web3Message = web3Tx.serializeMessage();
            const legacyMessage = legacyTx.serializeMessage();

            expect(Array.from(legacyMessage)).toEqual(Array.from(web3Message));
        });
    });
});

describe('VersionedTransaction', () => {
    describe('constructor', () => {
        it('creates with message', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            const message = tx.compileMessage();
            const versionedTx = new VersionedTransaction(message);

            expect(versionedTx.message).toBe(message);
            expect(versionedTx.signatures).toHaveLength(1);
            expect(versionedTx.signatures[0]).toHaveLength(64);
        });

        it('creates with message and signatures', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            const message = tx.compileMessage();
            const signature = new Uint8Array(64).fill(1);
            const versionedTx = new VersionedTransaction(message, [signature]);

            expect(versionedTx.signatures).toHaveLength(1);
            expect(versionedTx.signatures[0]).toEqual(signature);
        });
    });

    describe('version getter', () => {
        it('returns legacy for Message', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            const message = tx.compileMessage();
            const versionedTx = new VersionedTransaction(message);

            expect(versionedTx.version).toBe('legacy');
        });
    });

    describe('serialize and deserialize', () => {
        it('roundtrips through serialize/deserialize', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                data: Buffer.from([1, 2, 3]),
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            const message = tx.compileMessage();
            const versionedTx = new VersionedTransaction(message);

            await versionedTx.sign([keypair]);

            const serialized = versionedTx.serialize();
            const deserialized = VersionedTransaction.deserialize(serialized);

            expect(deserialized.message.recentBlockhash).toBe(TEST_BLOCKHASH);
            expect(Array.from(deserialized.signatures[0])).toEqual(Array.from(versionedTx.signatures[0]));
        });
    });

    describe('sign', () => {
        it('signs transaction with keypair', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            const message = tx.compileMessage();
            const versionedTx = new VersionedTransaction(message);

            // Initially empty signature
            expect(versionedTx.signatures[0].every(b => b === 0)).toBe(true);

            await versionedTx.sign([keypair]);

            // Now has real signature
            expect(versionedTx.signatures[0].some(b => b !== 0)).toBe(true);
        });

        it('throws for unknown signer', async () => {
            const keypair1 = await Keypair.generate();
            const keypair2 = await Keypair.generate();

            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair1.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            const message = tx.compileMessage();
            const versionedTx = new VersionedTransaction(message);

            await expect(versionedTx.sign([keypair2])).rejects.toThrow('Unknown signer');
        });
    });

    describe('addSignature', () => {
        it('adds external signature', async () => {
            const keypair = await Keypair.generate();
            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            const message = tx.compileMessage();
            const versionedTx = new VersionedTransaction(message);

            const signature = new Uint8Array(64).fill(42);
            versionedTx.addSignature(keypair.publicKey, signature);

            expect(versionedTx.signatures[0]).toEqual(signature);
        });

        it('throws for unknown signer', async () => {
            const keypair1 = await Keypair.generate();
            const keypair2 = await Keypair.generate();

            const tx = new Transaction({
                blockhash: TEST_BLOCKHASH,
                feePayer: keypair1.publicKey,
                lastValidBlockHeight: 1000,
            });
            tx.add({
                keys: [],
                programId: new PublicKey(SYSTEM_PROGRAM),
            });

            const message = tx.compileMessage();
            const versionedTx = new VersionedTransaction(message);

            const signature = new Uint8Array(64).fill(42);
            expect(() => versionedTx.addSignature(keypair2.publicKey, signature)).toThrow('Unknown signer');
        });
    });
});
