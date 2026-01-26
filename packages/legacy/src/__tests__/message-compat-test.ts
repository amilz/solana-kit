// import { Message as Web3Message, MessageV0 as Web3MessageV0, PublicKey as Web3PublicKey } from '@solana/web3.js';
import { AccountRole, type Instruction } from '@solana/instructions';

import type { TransactionInstruction } from '../message';
import { Message, MessageV0, VersionedMessage } from '../message';
import { PublicKey } from '../publickey';

// Test data
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const RANDOM_ADDRESS_1 = 'DcESq8KFcdTdpjWtr2DoGcvu5McM3VJoBetgM1X1vVct';
const RANDOM_ADDRESS_2 = '8YFhbKjrEEJKTvD5jXzL3kD9KJRs4rFNQSe2cqKkKzdg';

// A mock recent blockhash
const MOCK_BLOCKHASH = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k';

describe('Message compatibility with @solana/web3.js', () => {
    describe('constructor', () => {
        it('creates legacy message with correct properties', () => {
            const message = new Message({
                accountKeys: [RANDOM_ADDRESS_1, SYSTEM_PROGRAM],
                header: {
                    numReadonlySignedAccounts: 0,
                    numReadonlyUnsignedAccounts: 1,
                    numRequiredSignatures: 1,
                },
                instructions: [
                    {
                        accounts: [0],
                        data: Buffer.from([0, 0, 0, 0]).toString('base64'),
                        programIdIndex: 1,
                    },
                ],
                recentBlockhash: MOCK_BLOCKHASH,
            });

            expect(message.version).toBe('legacy');
            expect(message.header.numRequiredSignatures).toBe(1);
            expect(message.accountKeys).toHaveLength(2);
            expect(message.accountKeys[0].toBase58()).toBe(RANDOM_ADDRESS_1);
            expect(message.recentBlockhash).toBe(MOCK_BLOCKHASH);
        });
    });

    describe('isAccountSigner', () => {
        it('correctly identifies signers', () => {
            const message = new Message({
                accountKeys: [RANDOM_ADDRESS_1, RANDOM_ADDRESS_2, SYSTEM_PROGRAM],
                header: {
                    numReadonlySignedAccounts: 0,
                    numReadonlyUnsignedAccounts: 1,
                    numRequiredSignatures: 2,
                },
                instructions: [],
                recentBlockhash: MOCK_BLOCKHASH,
            });

            expect(message.isAccountSigner(0)).toBe(true);
            expect(message.isAccountSigner(1)).toBe(true);
            expect(message.isAccountSigner(2)).toBe(false);
        });
    });

    describe('isAccountWritable', () => {
        it('correctly identifies writable accounts', () => {
            const message = new Message({
                accountKeys: [RANDOM_ADDRESS_1, RANDOM_ADDRESS_2, TOKEN_PROGRAM, SYSTEM_PROGRAM],
                header: {
                    numReadonlySignedAccounts: 1,
                    numReadonlyUnsignedAccounts: 1,
                    numRequiredSignatures: 2,
                },
                instructions: [],
                recentBlockhash: MOCK_BLOCKHASH,
            });

            // First signer is writable
            expect(message.isAccountWritable(0)).toBe(true);
            // Second signer is readonly (last of 2 signers, and numReadonlySignedAccounts=1)
            expect(message.isAccountWritable(1)).toBe(false);
            // First non-signer is writable
            expect(message.isAccountWritable(2)).toBe(true);
            // Last account is readonly (numReadonlyUnsignedAccounts=1)
            expect(message.isAccountWritable(3)).toBe(false);
        });
    });

    describe('serialize/deserialize roundtrip', () => {
        it('roundtrips legacy message', () => {
            const original = new Message({
                accountKeys: [RANDOM_ADDRESS_1, SYSTEM_PROGRAM],
                header: {
                    numReadonlySignedAccounts: 0,
                    numReadonlyUnsignedAccounts: 1,
                    numRequiredSignatures: 1,
                },
                instructions: [
                    {
                        accounts: [0],
                        data: Buffer.from([0, 0, 0, 0]).toString('base64'),
                        programIdIndex: 1,
                    },
                ],
                recentBlockhash: MOCK_BLOCKHASH,
            });

            const serialized = original.serialize();
            const restored = Message.from(serialized);

            expect(restored.version).toBe('legacy');
            expect(restored.header).toEqual(original.header);
            expect(restored.accountKeys.map(k => k.toBase58())).toEqual(original.accountKeys.map(k => k.toBase58()));
            expect(restored.recentBlockhash).toBe(original.recentBlockhash);
            expect(restored.instructions).toEqual(original.instructions);
        });
    });
});

describe('MessageV0 compatibility with @solana/web3.js', () => {
    describe('constructor', () => {
        it('creates v0 message with correct properties', () => {
            const message = new MessageV0({
                addressTableLookups: [],
                compiledInstructions: [
                    {
                        accountKeyIndexes: [0],
                        data: new Uint8Array([0, 0, 0, 0]),
                        programIdIndex: 1,
                    },
                ],
                header: {
                    numReadonlySignedAccounts: 0,
                    numReadonlyUnsignedAccounts: 1,
                    numRequiredSignatures: 1,
                },
                recentBlockhash: MOCK_BLOCKHASH,
                staticAccountKeys: [new PublicKey(RANDOM_ADDRESS_1), new PublicKey(SYSTEM_PROGRAM)],
            });

            expect(message.version).toBe(0);
            expect(message.header.numRequiredSignatures).toBe(1);
            expect(message.staticAccountKeys).toHaveLength(2);
            expect(message.recentBlockhash).toBe(MOCK_BLOCKHASH);
        });
    });

    describe('numAccountKeysFromLookups', () => {
        it('returns 0 when no lookups', () => {
            const message = new MessageV0({
                addressTableLookups: [],
                compiledInstructions: [],
                header: {
                    numReadonlySignedAccounts: 0,
                    numReadonlyUnsignedAccounts: 0,
                    numRequiredSignatures: 1,
                },
                recentBlockhash: MOCK_BLOCKHASH,
                staticAccountKeys: [new PublicKey(RANDOM_ADDRESS_1)],
            });

            expect(message.numAccountKeysFromLookups).toBe(0);
        });

        it('counts lookup accounts correctly', () => {
            const message = new MessageV0({
                addressTableLookups: [
                    {
                        accountKey: new PublicKey(TOKEN_PROGRAM),
                        readonlyIndexes: [2],
                        writableIndexes: [0, 1],
                    },
                ],
                compiledInstructions: [],
                header: {
                    numReadonlySignedAccounts: 0,
                    numReadonlyUnsignedAccounts: 0,
                    numRequiredSignatures: 1,
                },
                recentBlockhash: MOCK_BLOCKHASH,
                staticAccountKeys: [new PublicKey(RANDOM_ADDRESS_1)],
            });

            expect(message.numAccountKeysFromLookups).toBe(3);
        });
    });

    describe('serialize/deserialize roundtrip', () => {
        it('roundtrips v0 message without lookups', () => {
            const original = new MessageV0({
                addressTableLookups: [],
                compiledInstructions: [
                    {
                        accountKeyIndexes: [0],
                        data: new Uint8Array([0, 0, 0, 0]),
                        programIdIndex: 1,
                    },
                ],
                header: {
                    numReadonlySignedAccounts: 0,
                    numReadonlyUnsignedAccounts: 1,
                    numRequiredSignatures: 1,
                },
                recentBlockhash: MOCK_BLOCKHASH,
                staticAccountKeys: [new PublicKey(RANDOM_ADDRESS_1), new PublicKey(SYSTEM_PROGRAM)],
            });

            const serialized = original.serialize();
            const restored = MessageV0.deserialize(serialized);

            expect(restored.version).toBe(0);
            expect(restored.header).toEqual(original.header);
            expect(restored.staticAccountKeys.map(k => k.toBase58())).toEqual(
                original.staticAccountKeys.map(k => k.toBase58()),
            );
            expect(restored.recentBlockhash).toBe(original.recentBlockhash);
        });

        it('roundtrips v0 message with lookups', () => {
            const original = new MessageV0({
                addressTableLookups: [
                    {
                        accountKey: new PublicKey(TOKEN_PROGRAM),
                        readonlyIndexes: [2, 3],
                        writableIndexes: [0, 1],
                    },
                ],
                compiledInstructions: [],
                header: {
                    numReadonlySignedAccounts: 0,
                    numReadonlyUnsignedAccounts: 1,
                    numRequiredSignatures: 1,
                },
                recentBlockhash: MOCK_BLOCKHASH,
                staticAccountKeys: [new PublicKey(RANDOM_ADDRESS_1), new PublicKey(SYSTEM_PROGRAM)],
            });

            const serialized = original.serialize();
            const restored = MessageV0.deserialize(serialized);

            expect(restored.addressTableLookups).toHaveLength(1);
            expect(restored.addressTableLookups[0].accountKey.toBase58()).toBe(TOKEN_PROGRAM);
            expect(restored.addressTableLookups[0].writableIndexes).toEqual([0, 1]);
            expect(restored.addressTableLookups[0].readonlyIndexes).toEqual([2, 3]);
        });
    });
});

describe('VersionedMessage', () => {
    describe('deserializeMessageVersion', () => {
        it('detects legacy message version', () => {
            const message = new Message({
                accountKeys: [RANDOM_ADDRESS_1, SYSTEM_PROGRAM],
                header: {
                    numReadonlySignedAccounts: 0,
                    numReadonlyUnsignedAccounts: 1,
                    numRequiredSignatures: 1,
                },
                instructions: [],
                recentBlockhash: MOCK_BLOCKHASH,
            });

            const serialized = message.serialize();
            expect(VersionedMessage.deserializeMessageVersion(serialized)).toBe('legacy');
        });

        it('detects v0 message version', () => {
            const message = new MessageV0({
                addressTableLookups: [],
                compiledInstructions: [],
                header: {
                    numReadonlySignedAccounts: 0,
                    numReadonlyUnsignedAccounts: 1,
                    numRequiredSignatures: 1,
                },
                recentBlockhash: MOCK_BLOCKHASH,
                staticAccountKeys: [new PublicKey(RANDOM_ADDRESS_1), new PublicKey(SYSTEM_PROGRAM)],
            });

            const serialized = message.serialize();
            expect(VersionedMessage.deserializeMessageVersion(serialized)).toBe(0);
        });
    });

    describe('deserialize', () => {
        it('deserializes legacy message', () => {
            const original = new Message({
                accountKeys: [RANDOM_ADDRESS_1, SYSTEM_PROGRAM],
                header: {
                    numReadonlySignedAccounts: 0,
                    numReadonlyUnsignedAccounts: 1,
                    numRequiredSignatures: 1,
                },
                instructions: [],
                recentBlockhash: MOCK_BLOCKHASH,
            });

            const serialized = original.serialize();
            const restored = VersionedMessage.deserialize(serialized);

            expect(restored.version).toBe('legacy');
            expect(restored).toBeInstanceOf(Message);
        });

        it('deserializes v0 message', () => {
            const original = new MessageV0({
                addressTableLookups: [],
                compiledInstructions: [],
                header: {
                    numReadonlySignedAccounts: 0,
                    numReadonlyUnsignedAccounts: 1,
                    numRequiredSignatures: 1,
                },
                recentBlockhash: MOCK_BLOCKHASH,
                staticAccountKeys: [new PublicKey(RANDOM_ADDRESS_1), new PublicKey(SYSTEM_PROGRAM)],
            });

            const serialized = original.serialize();
            const restored = VersionedMessage.deserialize(serialized);

            expect(restored.version).toBe(0);
            expect(restored).toBeInstanceOf(MessageV0);
        });
    });
});

describe('Message.compile', () => {
    it('compiles a simple transfer instruction', () => {
        const payer = new PublicKey(RANDOM_ADDRESS_1);
        const recipient = new PublicKey(RANDOM_ADDRESS_2);
        const programId = new PublicKey(SYSTEM_PROGRAM);

        const instruction: TransactionInstruction = {
            data: Buffer.from([2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]), // transfer 1 lamport
            keys: [
                { isSigner: true, isWritable: true, pubkey: payer },
                { isSigner: false, isWritable: true, pubkey: recipient },
            ],
            programId,
        };

        const message = Message.compile({
            instructions: [instruction],
            payerKey: payer,
            recentBlockhash: MOCK_BLOCKHASH,
        });

        expect(message.version).toBe('legacy');
        expect(message.header.numRequiredSignatures).toBe(1);
        expect(message.header.numReadonlySignedAccounts).toBe(0);
        expect(message.header.numReadonlyUnsignedAccounts).toBe(1); // program ID

        // Payer should be first
        expect(message.accountKeys[0].toBase58()).toBe(payer.toBase58());

        // Check instruction was compiled correctly
        expect(message.instructions).toHaveLength(1);
        expect(message.instructions[0].programIdIndex).toBe(message.accountKeys.findIndex(k => k.equals(programId)));
    });

    it('deduplicates accounts across instructions', () => {
        const payer = new PublicKey(RANDOM_ADDRESS_1);
        const programId = new PublicKey(SYSTEM_PROGRAM);

        const instruction1: TransactionInstruction = {
            data: Buffer.alloc(0),
            keys: [{ isSigner: true, isWritable: true, pubkey: payer }],
            programId,
        };

        const instruction2: TransactionInstruction = {
            data: Buffer.alloc(0),
            keys: [{ isSigner: true, isWritable: true, pubkey: payer }],
            programId,
        };

        const message = Message.compile({
            instructions: [instruction1, instruction2],
            payerKey: payer,
            recentBlockhash: MOCK_BLOCKHASH,
        });

        // Should only have payer + program (deduplicated)
        expect(message.accountKeys).toHaveLength(2);
    });

    it('orders accounts correctly: writable signers, readonly signers, writable non-signers, readonly non-signers', () => {
        const payer = new PublicKey(RANDOM_ADDRESS_1);
        const readonlySigner = new PublicKey(RANDOM_ADDRESS_2);
        const writableNonSigner = new PublicKey(TOKEN_PROGRAM);
        const programId = new PublicKey(SYSTEM_PROGRAM);

        const instruction: TransactionInstruction = {
            data: Buffer.alloc(0),
            keys: [
                { isSigner: false, isWritable: true, pubkey: writableNonSigner },
                { isSigner: true, isWritable: false, pubkey: readonlySigner },
            ],
            programId,
        };

        const message = Message.compile({
            instructions: [instruction],
            payerKey: payer,
            recentBlockhash: MOCK_BLOCKHASH,
        });

        // Order: writable signer (payer), readonly signer, writable non-signer, readonly non-signer (program)
        expect(message.accountKeys[0].toBase58()).toBe(payer.toBase58());
        expect(message.accountKeys[1].toBase58()).toBe(readonlySigner.toBase58());
        expect(message.accountKeys[2].toBase58()).toBe(writableNonSigner.toBase58());
        expect(message.accountKeys[3].toBase58()).toBe(programId.toBase58());

        expect(message.header.numRequiredSignatures).toBe(2); // payer + readonlySigner
        expect(message.header.numReadonlySignedAccounts).toBe(1); // readonlySigner
        expect(message.header.numReadonlyUnsignedAccounts).toBe(1); // programId
    });

    it('roundtrips through serialize/deserialize', () => {
        const payer = new PublicKey(RANDOM_ADDRESS_1);
        const programId = new PublicKey(SYSTEM_PROGRAM);

        const instruction: TransactionInstruction = {
            data: Buffer.from([1, 2, 3, 4]),
            keys: [{ isSigner: true, isWritable: true, pubkey: payer }],
            programId,
        };

        const original = Message.compile({
            instructions: [instruction],
            payerKey: payer,
            recentBlockhash: MOCK_BLOCKHASH,
        });

        const serialized = original.serialize();
        const restored = Message.from(serialized);

        expect(restored.header).toEqual(original.header);
        expect(restored.accountKeys.map(k => k.toBase58())).toEqual(original.accountKeys.map(k => k.toBase58()));
        expect(restored.recentBlockhash).toBe(original.recentBlockhash);
    });
});

describe('MessageV0.compile', () => {
    it('compiles a simple v0 message without lookups', () => {
        const payer = new PublicKey(RANDOM_ADDRESS_1);
        const programId = new PublicKey(SYSTEM_PROGRAM);

        const instruction: TransactionInstruction = {
            data: Buffer.from([1, 2, 3]),
            keys: [{ isSigner: true, isWritable: true, pubkey: payer }],
            programId,
        };

        const message = MessageV0.compile({
            instructions: [instruction],
            payerKey: payer,
            recentBlockhash: MOCK_BLOCKHASH,
        });

        expect(message.version).toBe(0);
        expect(message.staticAccountKeys[0].toBase58()).toBe(payer.toBase58());
        expect(message.addressTableLookups).toHaveLength(0);
    });

    it('uses lookup tables for non-signer accounts', () => {
        const payer = new PublicKey(RANDOM_ADDRESS_1);
        const lookupAccount = new PublicKey(RANDOM_ADDRESS_2);
        const programId = new PublicKey(SYSTEM_PROGRAM);
        const lookupTableKey = new PublicKey(TOKEN_PROGRAM);

        const instruction: TransactionInstruction = {
            data: Buffer.alloc(0),
            keys: [
                { isSigner: true, isWritable: true, pubkey: payer },
                { isSigner: false, isWritable: true, pubkey: lookupAccount },
            ],
            programId,
        };

        const message = MessageV0.compile({
            addressLookupTableAccounts: [
                {
                    key: lookupTableKey,
                    state: {
                        addresses: [lookupAccount],
                    },
                },
            ],
            instructions: [instruction],
            payerKey: payer,
            recentBlockhash: MOCK_BLOCKHASH,
        });

        expect(message.version).toBe(0);
        // lookupAccount should NOT be in static keys
        expect(message.staticAccountKeys.map(k => k.toBase58())).not.toContain(lookupAccount.toBase58());
        // Should have a lookup
        expect(message.addressTableLookups).toHaveLength(1);
        expect(message.addressTableLookups[0].accountKey.toBase58()).toBe(lookupTableKey.toBase58());
        expect(message.addressTableLookups[0].writableIndexes).toContain(0); // index 0 in lookup table
    });

    it('keeps signers as static accounts even if in lookup table', () => {
        const payer = new PublicKey(RANDOM_ADDRESS_1);
        const signerInTable = new PublicKey(RANDOM_ADDRESS_2);
        const programId = new PublicKey(SYSTEM_PROGRAM);
        const lookupTableKey = new PublicKey(TOKEN_PROGRAM);

        const instruction: TransactionInstruction = {
            data: Buffer.alloc(0),
            keys: [
                { isSigner: true, isWritable: true, pubkey: payer },
                { isSigner: true, isWritable: false, pubkey: signerInTable }, // Signer!
            ],
            programId,
        };

        const message = MessageV0.compile({
            addressLookupTableAccounts: [
                {
                    key: lookupTableKey,
                    state: {
                        addresses: [signerInTable],
                    },
                },
            ],
            instructions: [instruction],
            payerKey: payer,
            recentBlockhash: MOCK_BLOCKHASH,
        });

        // Signer must be in static keys, not lookup
        expect(message.staticAccountKeys.map(k => k.toBase58())).toContain(signerInTable.toBase58());
        // No lookups used since the only lookup candidate was a signer
        expect(message.addressTableLookups).toHaveLength(0);
    });

    it('roundtrips through serialize/deserialize', () => {
        const payer = new PublicKey(RANDOM_ADDRESS_1);
        const lookupAccount = new PublicKey(RANDOM_ADDRESS_2);
        const programId = new PublicKey(SYSTEM_PROGRAM);
        const lookupTableKey = new PublicKey(TOKEN_PROGRAM);

        const instruction: TransactionInstruction = {
            data: Buffer.from([5, 6, 7]),
            keys: [
                { isSigner: true, isWritable: true, pubkey: payer },
                { isSigner: false, isWritable: false, pubkey: lookupAccount },
            ],
            programId,
        };

        const original = MessageV0.compile({
            addressLookupTableAccounts: [
                {
                    key: lookupTableKey,
                    state: {
                        addresses: [lookupAccount],
                    },
                },
            ],
            instructions: [instruction],
            payerKey: payer,
            recentBlockhash: MOCK_BLOCKHASH,
        });

        const serialized = original.serialize();
        const restored = MessageV0.deserialize(serialized);

        expect(restored.header).toEqual(original.header);
        expect(restored.staticAccountKeys.map(k => k.toBase58())).toEqual(
            original.staticAccountKeys.map(k => k.toBase58()),
        );
        expect(restored.addressTableLookups).toHaveLength(original.addressTableLookups.length);
    });
});

describe('Kit Instruction support', () => {
    describe('Message.compile with Kit Instruction', () => {
        it('compiles a Kit Instruction', () => {
            const payer = new PublicKey(RANDOM_ADDRESS_1);
            const recipient = new PublicKey(RANDOM_ADDRESS_2);

            // Create a Kit-style Instruction (like Codama generates)
            const kitInstruction: Instruction = {
                accounts: [
                    { address: RANDOM_ADDRESS_1 as `${string}`, role: AccountRole.WRITABLE_SIGNER },
                    { address: RANDOM_ADDRESS_2 as `${string}`, role: AccountRole.WRITABLE },
                ],
                data: new Uint8Array([2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
                programAddress: SYSTEM_PROGRAM as `${string}`,
            };

            const message = Message.compile({
                instructions: [kitInstruction],
                payerKey: payer,
                recentBlockhash: MOCK_BLOCKHASH,
            });

            expect(message.version).toBe('legacy');
            expect(message.header.numRequiredSignatures).toBe(1);
            expect(message.accountKeys[0].toBase58()).toBe(payer.toBase58());
            expect(message.instructions).toHaveLength(1);
        });

        it('compiles mixed Kit and legacy instructions', () => {
            const payer = new PublicKey(RANDOM_ADDRESS_1);

            const kitInstruction: Instruction = {
                accounts: [{ address: RANDOM_ADDRESS_1 as `${string}`, role: AccountRole.WRITABLE_SIGNER }],
                data: new Uint8Array([1]),
                programAddress: SYSTEM_PROGRAM as `${string}`,
            };

            const legacyInstruction: TransactionInstruction = {
                data: Buffer.from([2]),
                keys: [{ isSigner: true, isWritable: true, pubkey: payer }],
                programId: new PublicKey(SYSTEM_PROGRAM),
            };

            const message = Message.compile({
                instructions: [kitInstruction, legacyInstruction],
                payerKey: payer,
                recentBlockhash: MOCK_BLOCKHASH,
            });

            expect(message.instructions).toHaveLength(2);
        });

        it('correctly maps AccountRole to isSigner/isWritable', () => {
            const payer = new PublicKey(RANDOM_ADDRESS_1);
            const readonlySigner = RANDOM_ADDRESS_2;
            const writable = TOKEN_PROGRAM;

            const kitInstruction: Instruction = {
                accounts: [
                    { address: readonlySigner as `${string}`, role: AccountRole.READONLY_SIGNER },
                    { address: writable as `${string}`, role: AccountRole.WRITABLE },
                ],
                programAddress: SYSTEM_PROGRAM as `${string}`,
            };

            const message = Message.compile({
                instructions: [kitInstruction],
                payerKey: payer,
                recentBlockhash: MOCK_BLOCKHASH,
            });

            // payer (writable signer), readonly signer, writable non-signer, program (readonly non-signer)
            expect(message.header.numRequiredSignatures).toBe(2); // payer + readonlySigner
            expect(message.header.numReadonlySignedAccounts).toBe(1); // readonlySigner
        });

        it('handles Kit Instruction without data', () => {
            const payer = new PublicKey(RANDOM_ADDRESS_1);

            const kitInstruction: Instruction = {
                accounts: [{ address: RANDOM_ADDRESS_1 as `${string}`, role: AccountRole.WRITABLE_SIGNER }],
                // No data field
                programAddress: SYSTEM_PROGRAM as `${string}`,
            };

            const message = Message.compile({
                instructions: [kitInstruction],
                payerKey: payer,
                recentBlockhash: MOCK_BLOCKHASH,
            });

            expect(message.instructions).toHaveLength(1);
            // Data should be empty
            expect(message.instructions[0].data).toBe(Buffer.alloc(0).toString('base64'));
        });

        it('handles Kit Instruction without accounts', () => {
            const payer = new PublicKey(RANDOM_ADDRESS_1);

            const kitInstruction: Instruction = {
                // No accounts field
                data: new Uint8Array([1, 2, 3]),
                programAddress: SYSTEM_PROGRAM as `${string}`,
            };

            const message = Message.compile({
                instructions: [kitInstruction],
                payerKey: payer,
                recentBlockhash: MOCK_BLOCKHASH,
            });

            expect(message.instructions).toHaveLength(1);
            expect(message.instructions[0].accounts).toEqual([]);
        });
    });

    describe('MessageV0.compile with Kit Instruction', () => {
        it('compiles a Kit Instruction to v0 message', () => {
            const payer = new PublicKey(RANDOM_ADDRESS_1);

            const kitInstruction: Instruction = {
                accounts: [{ address: RANDOM_ADDRESS_1 as `${string}`, role: AccountRole.WRITABLE_SIGNER }],
                data: new Uint8Array([1, 2, 3]),
                programAddress: SYSTEM_PROGRAM as `${string}`,
            };

            const message = MessageV0.compile({
                instructions: [kitInstruction],
                payerKey: payer,
                recentBlockhash: MOCK_BLOCKHASH,
            });

            expect(message.version).toBe(0);
            expect(message.staticAccountKeys[0].toBase58()).toBe(payer.toBase58());
        });

        it('uses lookup tables with Kit Instructions', () => {
            const payer = new PublicKey(RANDOM_ADDRESS_1);
            const lookupAccount = new PublicKey(RANDOM_ADDRESS_2);
            const lookupTableKey = new PublicKey(TOKEN_PROGRAM);

            const kitInstruction: Instruction = {
                accounts: [
                    { address: RANDOM_ADDRESS_1 as `${string}`, role: AccountRole.WRITABLE_SIGNER },
                    { address: RANDOM_ADDRESS_2 as `${string}`, role: AccountRole.WRITABLE },
                ],
                programAddress: SYSTEM_PROGRAM as `${string}`,
            };

            const message = MessageV0.compile({
                addressLookupTableAccounts: [
                    {
                        key: lookupTableKey,
                        state: { addresses: [lookupAccount] },
                    },
                ],
                instructions: [kitInstruction],
                payerKey: payer,
                recentBlockhash: MOCK_BLOCKHASH,
            });

            expect(message.addressTableLookups).toHaveLength(1);
            expect(message.staticAccountKeys.map(k => k.toBase58())).not.toContain(lookupAccount.toBase58());
        });
    });
});
