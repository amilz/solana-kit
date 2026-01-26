import { Address } from '@solana/addresses';
import { Instruction, isSignerRole, isWritableRole } from '@solana/instructions';
import {
    getCompiledTransactionMessageDecoder,
    getCompiledTransactionMessageEncoder,
} from '@solana/transaction-messages';

import { PublicKey } from './publickey';

/**
 * Account metadata used to define instructions.
 */
export type AccountMeta = {
    /** True if instruction requires a transaction signature */
    isSigner: boolean;
    /** True if the account data will be modified */
    isWritable: boolean;
    /** An account's public key */
    pubkey: PublicKey;
};

/**
 * Transaction instruction - a program call with accounts and data.
 */
export type TransactionInstruction = {
    /** Program input data */
    data: Buffer;
    /** Public keys of accounts to include */
    keys: AccountMeta[];
    /** Program to execute */
    programId: PublicKey;
};

/**
 * Input type that accepts both legacy TransactionInstruction and Kit Instruction.
 * This allows Codama-generated instructions to be used directly with the legacy API.
 */
export type InstructionInput = Instruction | TransactionInstruction;

/**
 * Type guard to check if an instruction is a Kit Instruction (has programAddress).
 */
function isKitInstruction(instruction: InstructionInput): instruction is Instruction {
    return 'programAddress' in instruction && typeof instruction.programAddress === 'string';
}

/**
 * Normalize an instruction input to the internal TransactionInstruction format.
 * Accepts both legacy TransactionInstruction and Kit Instruction types.
 */
function normalizeInstruction(instruction: InstructionInput): TransactionInstruction {
    if (isKitInstruction(instruction)) {
        // Convert Kit Instruction to TransactionInstruction
        const keys: AccountMeta[] = (instruction.accounts ?? []).map(account => {
            // Handle AccountLookupMeta (has lookupTableAddress) - these shouldn't appear
            // in legacy instructions but we handle them for completeness
            if ('lookupTableAddress' in account) {
                throw new Error('AccountLookupMeta is not supported in legacy TransactionInstruction');
            }
            return {
                isSigner: isSignerRole(account.role),
                isWritable: isWritableRole(account.role),
                pubkey: new PublicKey(account.address),
            };
        });

        return {
            data: instruction.data ? Buffer.from(instruction.data) : Buffer.alloc(0),
            keys,
            programId: new PublicKey(instruction.programAddress),
        };
    }

    // Already a TransactionInstruction - ensure data is a Buffer
    return {
        data: instruction.data instanceof Buffer ? instruction.data : Buffer.from(instruction.data ?? []),
        keys: instruction.keys,
        programId: instruction.programId,
    };
}

/**
 * Address lookup table account state.
 */
export type AddressLookupTableAccount = {
    /** Lookup table address */
    key: PublicKey;
    /** State containing the addresses */
    state: {
        addresses: PublicKey[];
    };
};

/**
 * Arguments for compiling a legacy message.
 */
export type CompileLegacyArgs = {
    /** Instructions to include (accepts both legacy and Kit instruction formats) */
    instructions: InstructionInput[];
    /** Fee payer for the transaction */
    payerKey: PublicKey;
    /** Recent blockhash */
    recentBlockhash: string;
};

/**
 * Arguments for compiling a v0 message.
 */
export type CompileV0Args = {
    /** Optional address lookup tables */
    addressLookupTableAccounts?: AddressLookupTableAccount[];
    /** Instructions to include (accepts both legacy and Kit instruction formats) */
    instructions: InstructionInput[];
    /** Fee payer for the transaction */
    payerKey: PublicKey;
    /** Recent blockhash */
    recentBlockhash: string;
};

/**
 * Message header, identifying signed and read-only accounts.
 */
export type MessageHeader = {
    /** Number of read-only signed accounts */
    numReadonlySignedAccounts: number;
    /** Number of read-only unsigned accounts */
    numReadonlyUnsignedAccounts: number;
    /** Number of signatures required for this message */
    numRequiredSignatures: number;
};

/**
 * Compiled instruction format for legacy messages.
 */
export type CompiledInstruction = {
    /** Indices into accountKeys for instruction accounts */
    accounts: number[];
    /** Base58-encoded instruction data */
    data: string;
    /** Index into accountKeys for the program */
    programIdIndex: number;
};

/**
 * Compiled instruction format for versioned messages.
 */
export type MessageCompiledInstruction = {
    /** Indices into accountKeys for instruction accounts */
    accountKeyIndexes: number[];
    /** Raw instruction data */
    data: Uint8Array;
    /** Index into accountKeys for the program */
    programIdIndex: number;
};

/**
 * Address table lookup for versioned messages.
 */
export type MessageAddressTableLookup = {
    /** Address of the lookup table */
    accountKey: PublicKey;
    /** Indices for readonly accounts */
    readonlyIndexes: number[];
    /** Indices for writable accounts */
    writableIndexes: number[];
};

/**
 * Constructor arguments for Message.
 */
export type MessageArgs = {
    accountKeys: PublicKey[] | string[];
    header: MessageHeader;
    instructions: CompiledInstruction[];
    recentBlockhash: string;
};

/**
 * Constructor arguments for MessageV0.
 */
export type MessageV0Args = {
    addressTableLookups: MessageAddressTableLookup[];
    compiledInstructions: MessageCompiledInstruction[];
    header: MessageHeader;
    recentBlockhash: string;
    staticAccountKeys: PublicKey[];
};

// Helper to convert web3.js header to Kit header
function toKitHeader(header: MessageHeader) {
    return {
        numReadonlyNonSignerAccounts: header.numReadonlyUnsignedAccounts,
        numReadonlySignerAccounts: header.numReadonlySignedAccounts,
        numSignerAccounts: header.numRequiredSignatures,
    };
}

// Helper to convert Kit header to web3.js header
function fromKitHeader(kitHeader: {
    numReadonlyNonSignerAccounts: number;
    numReadonlySignerAccounts: number;
    numSignerAccounts: number;
}): MessageHeader {
    return {
        numReadonlySignedAccounts: kitHeader.numReadonlySignerAccounts,
        numReadonlyUnsignedAccounts: kitHeader.numReadonlyNonSignerAccounts,
        numRequiredSignatures: kitHeader.numSignerAccounts,
    };
}

/**
 * Legacy transaction message format.
 */
export class Message {
    header: MessageHeader;
    accountKeys: PublicKey[];
    recentBlockhash: string;
    instructions: CompiledInstruction[];

    constructor(args: MessageArgs) {
        this.header = args.header;
        this.accountKeys = args.accountKeys.map(key => (key instanceof PublicKey ? key : new PublicKey(key)));
        this.recentBlockhash = args.recentBlockhash;
        this.instructions = args.instructions;
    }

    get version(): 'legacy' {
        return 'legacy';
    }

    get staticAccountKeys(): PublicKey[] {
        return this.accountKeys;
    }

    get compiledInstructions(): MessageCompiledInstruction[] {
        return this.instructions.map(ix => ({
            accountKeyIndexes: ix.accounts,
            // Decode base58 data to bytes
            data: new Uint8Array(Buffer.from(ix.data, 'base64')),

            programIdIndex: ix.programIdIndex,
        }));
    }

    get addressTableLookups(): MessageAddressTableLookup[] {
        return []; // Legacy messages don't have address table lookups
    }

    isAccountSigner(index: number): boolean {
        return index < this.header.numRequiredSignatures;
    }

    isAccountWritable(index: number): boolean {
        const numSigners = this.header.numRequiredSignatures;
        const numReadonlySigners = this.header.numReadonlySignedAccounts;
        const numReadonlyUnsigned = this.header.numReadonlyUnsignedAccounts;

        if (index < numSigners) {
            // Signer account - writable if not in readonly signer range
            const readonlySignerStart = numSigners - numReadonlySigners;
            return index < readonlySignerStart;
        } else {
            // Non-signer account - writable if not in readonly unsigned range
            const readonlyUnsignedStart = this.accountKeys.length - numReadonlyUnsigned;
            return index < readonlyUnsignedStart;
        }
    }

    /**
     * Serialize this message to a byte array.
     */
    serialize(): Buffer {
        const encoder = getCompiledTransactionMessageEncoder();

        // Convert to Kit compiled message format
        const compiledMessage = {
            header: toKitHeader(this.header),
            instructions: this.instructions.map(ix => ({
                accountIndices: ix.accounts,
                data: new Uint8Array(Buffer.from(ix.data, 'base64')),
                programAddressIndex: ix.programIdIndex,
            })),
            lifetimeToken: this.recentBlockhash,
            staticAccounts: this.accountKeys.map(key => key.toAddress()),
            version: 'legacy' as const,
        };

        const encoded = encoder.encode(compiledMessage);
        return Buffer.from(encoded);
    }

    /**
     * Deserialize a message from a byte array.
     */
    static from(buffer: Buffer | number[] | Uint8Array): Message {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const decoder = getCompiledTransactionMessageDecoder();

        const decoded = decoder.decode(bytes);

        const header = fromKitHeader(decoded.header);
        const accountKeys = decoded.staticAccounts.map((addr: Address) => PublicKey.fromAddress(addr));
        const recentBlockhash = decoded.lifetimeToken;
        const instructions: CompiledInstruction[] = decoded.instructions.map(ix => ({
            accounts: Array.from(ix.accountIndices ?? []),
            data: Buffer.from(ix.data ?? []).toString('base64'),
            programIdIndex: ix.programAddressIndex,
        }));

        return new Message({
            accountKeys,
            header,
            instructions,
            recentBlockhash,
        });
    }

    /**
     * Compile a legacy message from instructions.
     * Accepts both legacy TransactionInstruction and Kit Instruction formats.
     */
    static compile(args: CompileLegacyArgs): Message {
        const { payerKey, recentBlockhash } = args;

        // Normalize all instructions to TransactionInstruction format
        const instructions = args.instructions.map(normalizeInstruction);

        // Track accounts with their roles
        const accountMap = new Map<string, { isSigner: boolean; isWritable: boolean; pubkey: PublicKey }>();

        // Fee payer is always first, always signer, always writable
        accountMap.set(payerKey.toBase58(), {
            isSigner: true,
            isWritable: true,
            pubkey: payerKey,
        });

        // Process all instructions
        for (const ix of instructions) {
            // Add program ID (non-signer, non-writable)
            const programKey = ix.programId.toBase58();
            if (!accountMap.has(programKey)) {
                accountMap.set(programKey, {
                    isSigner: false,
                    isWritable: false,
                    pubkey: ix.programId,
                });
            }

            // Add instruction accounts
            for (const meta of ix.keys) {
                const key = meta.pubkey.toBase58();
                const existing = accountMap.get(key);
                if (existing) {
                    // Upgrade permissions if needed
                    existing.isSigner = existing.isSigner || meta.isSigner;
                    existing.isWritable = existing.isWritable || meta.isWritable;
                } else {
                    accountMap.set(key, {
                        isSigner: meta.isSigner,
                        isWritable: meta.isWritable,
                        pubkey: meta.pubkey,
                    });
                }
            }
        }

        // Sort accounts: writable signers, readonly signers, writable non-signers, readonly non-signers
        const accounts = Array.from(accountMap.values());
        const writableSigners = accounts.filter(a => a.isSigner && a.isWritable);
        const readonlySigners = accounts.filter(a => a.isSigner && !a.isWritable);
        const writableNonSigners = accounts.filter(a => !a.isSigner && a.isWritable);
        const readonlyNonSigners = accounts.filter(a => !a.isSigner && !a.isWritable);

        const orderedAccounts = [...writableSigners, ...readonlySigners, ...writableNonSigners, ...readonlyNonSigners];

        // Build account key to index map
        const keyIndexMap = new Map<string, number>();
        orderedAccounts.forEach((acc, idx) => {
            keyIndexMap.set(acc.pubkey.toBase58(), idx);
        });

        // Build header
        const header: MessageHeader = {
            numReadonlySignedAccounts: readonlySigners.length,
            numReadonlyUnsignedAccounts: readonlyNonSigners.length,
            numRequiredSignatures: writableSigners.length + readonlySigners.length,
        };

        // Compile instructions
        const compiledInstructions: CompiledInstruction[] = instructions.map(ix => ({
            accounts: ix.keys.map(meta => keyIndexMap.get(meta.pubkey.toBase58())!),
            data: ix.data.toString('base64'),
            programIdIndex: keyIndexMap.get(ix.programId.toBase58())!,
        }));

        return new Message({
            accountKeys: orderedAccounts.map(a => a.pubkey),
            header,
            instructions: compiledInstructions,
            recentBlockhash,
        });
    }
}

/**
 * Versioned transaction message format (v0).
 */
export class MessageV0 {
    header: MessageHeader;
    staticAccountKeys: PublicKey[];
    recentBlockhash: string;
    compiledInstructions: MessageCompiledInstruction[];
    addressTableLookups: MessageAddressTableLookup[];

    constructor(args: MessageV0Args) {
        this.header = args.header;
        this.staticAccountKeys = args.staticAccountKeys;
        this.recentBlockhash = args.recentBlockhash;
        this.compiledInstructions = args.compiledInstructions;
        this.addressTableLookups = args.addressTableLookups;
    }

    get version(): 0 {
        return 0;
    }

    get numAccountKeysFromLookups(): number {
        return this.addressTableLookups.reduce(
            (count, lookup) => count + lookup.writableIndexes.length + lookup.readonlyIndexes.length,
            0,
        );
    }

    isAccountSigner(index: number): boolean {
        return index < this.header.numRequiredSignatures;
    }

    isAccountWritable(index: number): boolean {
        const numSigners = this.header.numRequiredSignatures;
        const numReadonlySigners = this.header.numReadonlySignedAccounts;
        const numReadonlyUnsigned = this.header.numReadonlyUnsignedAccounts;
        const numStaticKeys = this.staticAccountKeys.length;

        if (index < numSigners) {
            const readonlySignerStart = numSigners - numReadonlySigners;
            return index < readonlySignerStart;
        } else if (index < numStaticKeys) {
            const readonlyUnsignedStart = numStaticKeys - numReadonlyUnsigned;
            return index < readonlyUnsignedStart;
        } else {
            // Account from lookup table
            const lookupIndex = index - numStaticKeys;
            let currentIndex = 0;
            for (const lookup of this.addressTableLookups) {
                if (lookupIndex < currentIndex + lookup.writableIndexes.length) {
                    return true; // Writable lookup
                }
                currentIndex += lookup.writableIndexes.length;
                if (lookupIndex < currentIndex + lookup.readonlyIndexes.length) {
                    return false; // Readonly lookup
                }
                currentIndex += lookup.readonlyIndexes.length;
            }
            return false;
        }
    }

    /**
     * Serialize this message to a byte array.
     */
    serialize(): Uint8Array {
        const encoder = getCompiledTransactionMessageEncoder();

        const compiledMessage = {
            addressTableLookups: this.addressTableLookups.map(lookup => ({
                lookupTableAddress: lookup.accountKey.toAddress(),
                readonlyIndexes: lookup.readonlyIndexes,
                writableIndexes: lookup.writableIndexes,
            })),
            header: toKitHeader(this.header),
            instructions: this.compiledInstructions.map(ix => ({
                accountIndices: ix.accountKeyIndexes,
                data: ix.data,
                programAddressIndex: ix.programIdIndex,
            })),
            lifetimeToken: this.recentBlockhash,
            staticAccounts: this.staticAccountKeys.map(key => key.toAddress()),
            version: 0 as const,
        };

        return new Uint8Array(encoder.encode(compiledMessage));
    }

    /**
     * Deserialize a versioned message from a byte array.
     */
    static deserialize(serializedMessage: Uint8Array): MessageV0 {
        const decoder = getCompiledTransactionMessageDecoder();
        const decoded = decoder.decode(serializedMessage);

        if (decoded.version === 'legacy') {
            throw new Error('Expected versioned message but got legacy');
        }

        const header = fromKitHeader(decoded.header);
        const staticAccountKeys = decoded.staticAccounts.map((addr: Address) => PublicKey.fromAddress(addr));
        const recentBlockhash = decoded.lifetimeToken;
        const compiledInstructions: MessageCompiledInstruction[] = decoded.instructions.map(ix => ({
            accountKeyIndexes: Array.from(ix.accountIndices ?? []),
            data: new Uint8Array(ix.data ?? []),
            programIdIndex: ix.programAddressIndex,
        }));

        const addressTableLookups: MessageAddressTableLookup[] = (decoded.addressTableLookups ?? []).map(lookup => ({
            accountKey: PublicKey.fromAddress(lookup.lookupTableAddress),
            readonlyIndexes: Array.from(lookup.readonlyIndexes),
            writableIndexes: Array.from(lookup.writableIndexes),
        }));

        return new MessageV0({
            addressTableLookups,
            compiledInstructions,
            header,
            recentBlockhash,
            staticAccountKeys,
        });
    }

    /**
     * Compile a v0 message from instructions.
     * Accepts both legacy TransactionInstruction and Kit Instruction formats.
     */
    static compile(args: CompileV0Args): MessageV0 {
        const { payerKey, recentBlockhash, addressLookupTableAccounts = [] } = args;

        // Normalize all instructions to TransactionInstruction format
        const instructions = args.instructions.map(normalizeInstruction);

        // Build lookup table index: address -> { tableKey, tableIndex }
        const lookupMap = new Map<string, { tableIndex: number; tableKey: PublicKey }>();
        for (const table of addressLookupTableAccounts) {
            table.state.addresses.forEach((addr, idx) => {
                const key = addr.toBase58();
                if (!lookupMap.has(key)) {
                    lookupMap.set(key, { tableIndex: idx, tableKey: table.key });
                }
            });
        }

        // Track accounts with their roles
        type AccountEntry = {
            fromLookup?: { tableIndex: number; tableKey: PublicKey };
            isSigner: boolean;
            isWritable: boolean;
            pubkey: PublicKey;
        };
        const accountMap = new Map<string, AccountEntry>();

        // Fee payer is always first, always signer, always writable (static)
        accountMap.set(payerKey.toBase58(), {
            isSigner: true,
            isWritable: true,
            pubkey: payerKey,
        });

        // Process all instructions
        for (const ix of instructions) {
            // Program IDs must be static (non-signer, non-writable)
            const programKey = ix.programId.toBase58();
            if (!accountMap.has(programKey)) {
                accountMap.set(programKey, {
                    isSigner: false,
                    isWritable: false,
                    pubkey: ix.programId,
                });
            }

            // Add instruction accounts
            for (const meta of ix.keys) {
                const key = meta.pubkey.toBase58();
                const existing = accountMap.get(key);

                if (existing) {
                    // Upgrade permissions if needed
                    existing.isSigner = existing.isSigner || meta.isSigner;
                    existing.isWritable = existing.isWritable || meta.isWritable;
                    // If becoming a signer, must be static
                    if (meta.isSigner && existing.fromLookup) {
                        delete existing.fromLookup;
                    }
                } else {
                    const lookupInfo = lookupMap.get(key);
                    // Signers must be static; non-signers can use lookup
                    const canUseLookup = !meta.isSigner && lookupInfo;
                    accountMap.set(key, {
                        fromLookup: canUseLookup ? lookupInfo : undefined,
                        isSigner: meta.isSigner,
                        isWritable: meta.isWritable,
                        pubkey: meta.pubkey,
                    });
                }
            }
        }

        // Separate static accounts from lookup accounts
        const accounts = Array.from(accountMap.values());
        const staticAccounts = accounts.filter(a => !a.fromLookup);
        const lookupAccounts = accounts.filter(a => a.fromLookup);

        // Sort static accounts: writable signers, readonly signers, writable non-signers, readonly non-signers
        const writableSigners = staticAccounts.filter(a => a.isSigner && a.isWritable);
        const readonlySigners = staticAccounts.filter(a => a.isSigner && !a.isWritable);
        const writableNonSigners = staticAccounts.filter(a => !a.isSigner && a.isWritable);
        const readonlyNonSigners = staticAccounts.filter(a => !a.isSigner && !a.isWritable);

        const orderedStaticAccounts = [
            ...writableSigners,
            ...readonlySigners,
            ...writableNonSigners,
            ...readonlyNonSigners,
        ];

        // Build account key to index map for static accounts
        const keyIndexMap = new Map<string, number>();
        orderedStaticAccounts.forEach((acc, idx) => {
            keyIndexMap.set(acc.pubkey.toBase58(), idx);
        });

        // Build address table lookups and extend keyIndexMap for lookup accounts
        const tableToLookup = new Map<
            string,
            { accounts: AccountEntry[]; readonlyIndexes: number[]; writableIndexes: number[] }
        >();

        for (const acc of lookupAccounts) {
            const tableKey = acc.fromLookup!.tableKey.toBase58();
            if (!tableToLookup.has(tableKey)) {
                tableToLookup.set(tableKey, { accounts: [], readonlyIndexes: [], writableIndexes: [] });
            }
            tableToLookup.get(tableKey)!.accounts.push(acc);
        }

        // Build lookup structures and assign indices
        let nextIndex = orderedStaticAccounts.length;
        const addressTableLookups: MessageAddressTableLookup[] = [];

        for (const [tableKeyStr, data] of tableToLookup) {
            const writableAccs = data.accounts.filter(a => a.isWritable);
            const readonlyAccs = data.accounts.filter(a => !a.isWritable);

            const writableIndexes: number[] = [];
            const readonlyIndexes: number[] = [];

            for (const acc of writableAccs) {
                keyIndexMap.set(acc.pubkey.toBase58(), nextIndex++);
                writableIndexes.push(acc.fromLookup!.tableIndex);
            }
            for (const acc of readonlyAccs) {
                keyIndexMap.set(acc.pubkey.toBase58(), nextIndex++);
                readonlyIndexes.push(acc.fromLookup!.tableIndex);
            }

            if (writableIndexes.length > 0 || readonlyIndexes.length > 0) {
                addressTableLookups.push({
                    accountKey: new PublicKey(tableKeyStr),
                    readonlyIndexes,
                    writableIndexes,
                });
            }
        }

        // Build header (only counts static accounts)
        const header: MessageHeader = {
            numReadonlySignedAccounts: readonlySigners.length,
            numReadonlyUnsignedAccounts: readonlyNonSigners.length,
            numRequiredSignatures: writableSigners.length + readonlySigners.length,
        };

        // Compile instructions
        const compiledInstructions: MessageCompiledInstruction[] = instructions.map(ix => ({
            accountKeyIndexes: ix.keys.map(meta => keyIndexMap.get(meta.pubkey.toBase58())!),
            data: Uint8Array.from(ix.data),
            programIdIndex: keyIndexMap.get(ix.programId.toBase58())!,
        }));

        return new MessageV0({
            addressTableLookups,
            compiledInstructions,
            header,
            recentBlockhash,
            staticAccountKeys: orderedStaticAccounts.map(a => a.pubkey),
        });
    }
}

/**
 * Union type for versioned messages.
 */
export type VersionedMessage = Message | MessageV0;

/**
 * Helper for deserializing versioned messages.
 */
export const VersionedMessage = {
    /**
     * Deserialize a message, automatically detecting the version.
     */
    deserialize(serializedMessage: Uint8Array): VersionedMessage {
        const version = this.deserializeMessageVersion(serializedMessage);
        if (version === 'legacy') {
            return Message.from(serializedMessage);
        }
        return MessageV0.deserialize(serializedMessage);
    },

    /**
     * Determine the version of a serialized message.
     */
    deserializeMessageVersion(serializedMessage: Uint8Array): number | 'legacy' {
        const prefix = serializedMessage[0];
        const maskedPrefix = prefix & 0x7f; // Clear the high bit

        // If high bit is set and masked value is valid version, it's versioned
        if (prefix !== maskedPrefix && maskedPrefix <= 0) {
            return maskedPrefix;
        }
        return 'legacy';
    },
};
