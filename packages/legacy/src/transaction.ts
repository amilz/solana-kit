import type { Address } from '@solana/addresses';
import { getBase58Decoder, getBase58Encoder } from '@solana/codecs';
import { type Instruction, isSignerRole, isWritableRole } from '@solana/instructions';
import { type SignatureBytes, signBytes, verifySignature } from '@solana/keys';
import {
    getTransactionDecoder,
    getTransactionEncoder,
    type SignaturesMap as KitSignaturesMap,
    type Transaction as KitTransaction,
    type TransactionMessageBytes,
} from '@solana/transactions';

import { Keypair, type Signer } from './keypair';
import {
    type AccountMeta,
    type InstructionInput,
    Message,
    type TransactionInstruction,
    VersionedMessage,
} from './message';
import { PublicKey } from './publickey';

// Re-export types from message for convenience
export type { AccountMeta, InstructionInput, TransactionInstruction };

/**
 * Pair of signature and corresponding public key.
 */
export type SignaturePubkeyPair = {
    publicKey: PublicKey;
    signature: Buffer | null;
};

/**
 * Nonce information for durable transactions.
 */
export type NonceInformation = {
    /** The current blockhash stored in the nonce */
    nonce: string;
    /** AdvanceNonceAccount Instruction */
    nonceInstruction: TransactionInstruction;
};

/**
 * Configuration for serializing transactions.
 */
export type SerializeConfig = {
    /** Require all transaction signatures be present (default: true) */
    requireAllSignatures?: boolean;
    /** Verify provided signatures (default: true) */
    verifySignatures?: boolean;
};

/**
 * Constructor options for blockhash-based transactions.
 */
export type TransactionBlockhashCtor = {
    blockhash: string;
    feePayer?: PublicKey | null;
    lastValidBlockHeight: number;
    signatures?: SignaturePubkeyPair[];
};

/**
 * Constructor options for nonce-based transactions.
 */
export type TransactionNonceCtor = {
    feePayer?: PublicKey | null;
    minContextSlot: number;
    nonceInfo: NonceInformation;
    signatures?: SignaturePubkeyPair[];
};

/**
 * Legacy constructor fields (deprecated).
 */
export type TransactionCtorFields = {
    feePayer?: PublicKey | null;
    nonceInfo?: NonceInformation | null;
    recentBlockhash?: string;
    signatures?: SignaturePubkeyPair[];
};

type TransactionCtor = TransactionBlockhashCtor | TransactionCtorFields | TransactionNonceCtor;

const SIGNATURE_LENGTH = 64;

/**
 * Legacy Transaction class.
 */
export class Transaction {
    signatures: SignaturePubkeyPair[] = [];
    feePayer?: PublicKey;
    instructions: TransactionInstruction[] = [];
    recentBlockhash?: string;
    lastValidBlockHeight?: number;
    nonceInfo?: NonceInformation;
    minNonceContextSlot?: number;

    constructor(opts?: TransactionCtor) {
        if (opts) {
            if ('blockhash' in opts && opts.blockhash) {
                this.recentBlockhash = opts.blockhash;
                this.lastValidBlockHeight = opts.lastValidBlockHeight;
            } else if ('nonceInfo' in opts && opts.nonceInfo) {
                this.nonceInfo = opts.nonceInfo;
                this.recentBlockhash = opts.nonceInfo.nonce;
                if ('minContextSlot' in opts) {
                    this.minNonceContextSlot = opts.minContextSlot;
                }
            } else if ('recentBlockhash' in opts) {
                this.recentBlockhash = opts.recentBlockhash;
            }

            if (opts.feePayer) {
                this.feePayer = opts.feePayer;
            }
            if (opts.signatures) {
                this.signatures = opts.signatures;
            }
        }
    }

    /**
     * The first (payer) Transaction signature.
     */
    get signature(): Buffer | null {
        if (this.signatures.length > 0 && this.signatures[0].signature) {
            return this.signatures[0].signature;
        }
        return null;
    }

    /**
     * Add one or more instructions to this Transaction.
     * Accepts legacy TransactionInstruction, Kit Instruction, or another Transaction.
     */
    add(
        ...items: Array<
            | Instruction
            | Transaction
            | TransactionInstruction
            | { data?: Buffer; keys: AccountMeta[]; programId: PublicKey }
        >
    ): Transaction {
        for (const item of items) {
            if (item instanceof Transaction) {
                this.instructions.push(...item.instructions);
            } else if ('programAddress' in item && typeof item.programAddress === 'string') {
                // Kit Instruction - convert to TransactionInstruction
                const keys: AccountMeta[] = (item.accounts ?? []).map(account => {
                    if ('lookupTableAddress' in account) {
                        throw new Error('AccountLookupMeta is not supported in legacy Transaction');
                    }
                    return {
                        isSigner: isSignerRole(account.role),
                        isWritable: isWritableRole(account.role),
                        pubkey: new PublicKey(account.address),
                    };
                });
                const ix: TransactionInstruction = {
                    data: item.data ? Buffer.from(item.data) : Buffer.alloc(0),
                    keys,
                    programId: new PublicKey(item.programAddress),
                };
                this.instructions.push(ix);
            } else {
                // Legacy TransactionInstruction or compatible object
                const legacyItem = item as TransactionInstruction | { data?: Buffer; keys: AccountMeta[]; programId: PublicKey };
                const ix: TransactionInstruction = {
                    data: legacyItem.data ?? Buffer.alloc(0),
                    keys: legacyItem.keys,
                    programId: legacyItem.programId,
                };
                this.instructions.push(ix);
            }
        }
        return this;
    }

    /**
     * Compile transaction data into a Message.
     */
    compileMessage(): Message {
        if (!this.recentBlockhash) {
            throw new Error('Transaction recentBlockhash required');
        }

        const feePayer = this.feePayer ?? this.signatures[0]?.publicKey;
        if (!feePayer) {
            throw new Error('Transaction fee payer required');
        }

        // If using nonce, prepend the nonce instruction
        let instructions = this.instructions;
        if (this.nonceInfo) {
            instructions = [this.nonceInfo.nonceInstruction, ...this.instructions];
        }

        return Message.compile({
            instructions,
            payerKey: feePayer,
            recentBlockhash: this.recentBlockhash,
        });
    }

    /**
     * Get a buffer of the Transaction data that need to be covered by signatures.
     */
    serializeMessage(): Buffer {
        return this.compileMessage().serialize();
    }

    /**
     * Sign the Transaction with the specified signers.
     *
     * NOTE: Unlike web3.js, this is async because Kit uses WebCrypto.
     *
     * @param signers - Array of Keypair or Signer objects
     */
    async sign(...signers: Array<Keypair | Signer>): Promise<void> {
        await this.partialSign(...signers);
    }

    /**
     * Partially sign a transaction with the specified accounts.
     *
     * NOTE: Unlike web3.js, this is async because Kit uses WebCrypto.
     *
     * @param signers - Array of Keypair or Signer objects
     */
    async partialSign(...signers: Array<Keypair | Signer>): Promise<void> {
        const message = this.compileMessage();
        const messageBytes = message.serialize();

        // Initialize signatures array if needed
        if (this.signatures.length === 0) {
            const numSigners = message.header.numRequiredSignatures;
            for (let i = 0; i < numSigners; i++) {
                this.signatures.push({
                    publicKey: message.accountKeys[i],
                    signature: null,
                });
            }
        }

        // Sign with each signer
        for (const signer of signers) {
            const pubkey = signer instanceof Keypair ? signer.publicKey : signer.publicKey;
            const signerKey = pubkey.toBase58();
            const sigIdx = this.signatures.findIndex(s => s.publicKey.toBase58() === signerKey);

            if (sigIdx === -1) {
                throw new Error(`Unknown signer: ${signerKey}`);
            }

            // Get the CryptoKeyPair for signing
            let signature: Uint8Array;
            if (signer instanceof Keypair) {
                const cryptoKeyPair = signer.toCryptoKeyPair();
                signature = await signBytes(cryptoKeyPair.privateKey, messageBytes);
            } else {
                // Legacy Signer with secretKey - need to create a keypair
                const keypair = await Keypair.fromSecretKey(signer.secretKey);
                const cryptoKeyPair = keypair.toCryptoKeyPair();
                signature = await signBytes(cryptoKeyPair.privateKey, messageBytes);
            }

            this.signatures[sigIdx].signature = Buffer.from(signature);
        }
    }

    /**
     * Add an externally created signature to a transaction.
     */
    addSignature(pubkey: PublicKey, signature: Buffer): void {
        const sigIdx = this.signatures.findIndex(s => s.publicKey.equals(pubkey));
        if (sigIdx === -1) {
            // Add new signature slot
            this.signatures.push({ publicKey: pubkey, signature });
        } else {
            this.signatures[sigIdx].signature = signature;
        }
    }

    /**
     * Verify signatures of a Transaction.
     *
     * NOTE: Unlike web3.js, this is async because Kit uses WebCrypto.
     */
    async verifySignatures(requireAllSignatures: boolean = true): Promise<boolean> {
        const message = this.serializeMessage();

        for (const { signature, publicKey } of this.signatures) {
            if (signature === null) {
                if (requireAllSignatures) {
                    return false;
                }
                continue;
            }

            // Import public key for verification
            const publicKeyBytes = publicKey.toBytes();
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                new Uint8Array(publicKeyBytes),
                { name: 'Ed25519' },
                true,
                ['verify'],
            );

            const valid = await verifySignature(cryptoKey, new Uint8Array(signature) as SignatureBytes, message);
            if (!valid) {
                return false;
            }
        }

        return true;
    }

    /**
     * Serialize the Transaction in the wire format.
     *
     * NOTE: Unlike web3.js, this is async when verifySignatures is true (default).
     * Use serialize({ verifySignatures: false }) for sync behavior.
     */
    async serialize(config?: SerializeConfig): Promise<Buffer> {
        const requireAllSignatures = config?.requireAllSignatures ?? true;
        const shouldVerify = config?.verifySignatures ?? true;

        const messageBytes = this.serializeMessage();

        if (shouldVerify && !(await this.verifySignatures(requireAllSignatures))) {
            throw new Error('Signature verification failed');
        }

        // Check all required signatures are present
        if (requireAllSignatures) {
            for (const { signature } of this.signatures) {
                if (signature === null) {
                    throw new Error('Missing signature');
                }
            }
        }

        // Convert to Kit Transaction type and use Kit's encoder
        const signaturesMap: KitSignaturesMap = {};
        for (const { publicKey, signature } of this.signatures) {
            const address = publicKey.toBase58() as Address;
            signaturesMap[address] = signature ? (new Uint8Array(signature) as SignatureBytes) : null;
        }

        const kitTransaction: KitTransaction = {
            messageBytes: messageBytes as unknown as TransactionMessageBytes,
            signatures: signaturesMap,
        };

        const encoder = getTransactionEncoder();
        return Buffer.from(encoder.encode(kitTransaction));
    }

    /**
     * Parse a wire transaction into a Transaction object.
     */
    static from(buffer: Buffer | number[] | Uint8Array): Transaction {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

        // Use Kit's decoder to parse the wire format
        const decoder = getTransactionDecoder();
        const kitTransaction = decoder.decode(bytes);

        // Parse the message from the raw bytes (convert ReadonlyUint8Array to Uint8Array)
        const message = Message.from(new Uint8Array(kitTransaction.messageBytes));

        // Convert Kit's SignaturesMap to base58 strings for populate()
        // The signatures map keys are addresses, values are SignatureBytes | null
        const signatureStrings: string[] = [];
        for (let i = 0; i < message.header.numRequiredSignatures; i++) {
            const address = message.accountKeys[i].toBase58() as Address;
            const sig = kitTransaction.signatures[address];
            if (sig) {
                signatureStrings.push(getBase58Decoder().decode(sig));
            } else {
                signatureStrings.push('');
            }
        }

        return Transaction.populate(message, signatureStrings);
    }

    /**
     * Populate Transaction object from message and signatures.
     */
    static populate(message: Message, signatures: string[] = []): Transaction {
        const tx = new Transaction();
        tx.recentBlockhash = message.recentBlockhash;

        // Set fee payer (first account key)
        if (message.accountKeys.length > 0) {
            tx.feePayer = message.accountKeys[0];
        }

        // Populate signatures
        const numSigners = message.header.numRequiredSignatures;
        for (let i = 0; i < numSigners; i++) {
            const sig = signatures[i];
            tx.signatures.push({
                publicKey: message.accountKeys[i],
                signature: sig ? Buffer.from(getBase58Encoder().encode(sig)) : null,
            });
        }

        // Decompile instructions from message
        for (const compiledIx of message.instructions) {
            const keys: AccountMeta[] = compiledIx.accounts.map(idx => ({
                isSigner: message.isAccountSigner(idx),
                isWritable: message.isAccountWritable(idx),
                pubkey: message.accountKeys[idx],
            }));

            tx.instructions.push({
                data: Buffer.from(compiledIx.data, 'base64'),
                keys,
                programId: message.accountKeys[compiledIx.programIdIndex],
            });
        }

        return tx;
    }
}

/**
 * Versioned Transaction class.
 */
export class VersionedTransaction {
    signatures: Uint8Array[];
    message: VersionedMessage;

    constructor(message: VersionedMessage, signatures?: Uint8Array[]) {
        this.message = message;

        if (signatures) {
            this.signatures = signatures;
        } else {
            // Initialize empty signatures
            const numSigners = message.header.numRequiredSignatures;
            this.signatures = new Array(numSigners).fill(null).map(() => new Uint8Array(SIGNATURE_LENGTH));
        }
    }

    /**
     * Get the transaction version.
     */
    get version(): 'legacy' | 0 {
        return this.message.version;
    }

    /**
     * Serialize the transaction to wire format.
     */
    serialize(): Uint8Array {
        const messageBytes = this.message.serialize();

        // Get static account keys for building signatures map
        const staticAccountKeys =
            this.message instanceof Message ? this.message.accountKeys : this.message.staticAccountKeys;

        // Convert to Kit's SignaturesMap
        const signaturesMap: KitSignaturesMap = {};
        for (let i = 0; i < this.signatures.length; i++) {
            const address = staticAccountKeys[i].toBase58() as Address;
            const sig = this.signatures[i];
            // Check if signature is all zeros (unset)
            const isZeroSig = sig.every(b => b === 0);
            signaturesMap[address] = isZeroSig ? null : (sig as SignatureBytes);
        }

        const kitTransaction: KitTransaction = {
            messageBytes: messageBytes as unknown as TransactionMessageBytes,
            signatures: signaturesMap,
        };

        const encoder = getTransactionEncoder();
        return new Uint8Array(encoder.encode(kitTransaction));
    }

    /**
     * Deserialize a transaction from wire format.
     */
    static deserialize(serializedTransaction: Uint8Array): VersionedTransaction {
        // Use Kit's decoder to parse the wire format
        const decoder = getTransactionDecoder();
        const kitTransaction = decoder.decode(serializedTransaction);

        // Parse the message from the raw bytes (convert ReadonlyUint8Array to Uint8Array)
        const message = VersionedMessage.deserialize(new Uint8Array(kitTransaction.messageBytes));

        // Get static account keys to extract signatures in order
        const staticAccountKeys = message instanceof Message ? message.accountKeys : message.staticAccountKeys;

        // Convert Kit's SignaturesMap back to ordered Uint8Array[]
        const signatures: Uint8Array[] = [];
        for (let i = 0; i < message.header.numRequiredSignatures; i++) {
            const address = staticAccountKeys[i].toBase58() as Address;
            const sig = kitTransaction.signatures[address];
            if (sig) {
                signatures.push(new Uint8Array(sig));
            } else {
                signatures.push(new Uint8Array(SIGNATURE_LENGTH));
            }
        }

        return new VersionedTransaction(message, signatures);
    }

    /**
     * Sign the transaction with the specified signers.
     *
     * NOTE: Unlike web3.js, this is async because Kit uses WebCrypto.
     */
    async sign(signers: Array<Keypair | Signer>): Promise<void> {
        const messageBytes = this.message instanceof Message ? this.message.serialize() : this.message.serialize();

        const staticAccountKeys =
            this.message instanceof Message ? this.message.accountKeys : this.message.staticAccountKeys;

        for (const signer of signers) {
            const pubkey = signer instanceof Keypair ? signer.publicKey : signer.publicKey;
            const signerKey = pubkey.toBase58();
            const sigIdx = staticAccountKeys.findIndex(k => k.toBase58() === signerKey);

            if (sigIdx === -1 || sigIdx >= this.signatures.length) {
                throw new Error(`Unknown signer: ${signerKey}`);
            }

            // Get the CryptoKeyPair for signing
            let signature: Uint8Array;
            if (signer instanceof Keypair) {
                const cryptoKeyPair = signer.toCryptoKeyPair();
                signature = await signBytes(cryptoKeyPair.privateKey, messageBytes);
            } else {
                // Legacy Signer with secretKey - need to create a keypair
                const keypair = await Keypair.fromSecretKey(signer.secretKey);
                const cryptoKeyPair = keypair.toCryptoKeyPair();
                signature = await signBytes(cryptoKeyPair.privateKey, messageBytes);
            }

            this.signatures[sigIdx] = signature;
        }
    }

    /**
     * Add an externally created signature.
     */
    addSignature(publicKey: PublicKey, signature: Uint8Array): void {
        const staticAccountKeys =
            this.message instanceof Message ? this.message.accountKeys : this.message.staticAccountKeys;

        const sigIdx = staticAccountKeys.findIndex(k => k.equals(publicKey));

        if (sigIdx === -1 || sigIdx >= this.signatures.length) {
            throw new Error(`Unknown signer: ${publicKey.toBase58()}`);
        }

        this.signatures[sigIdx] = signature;
    }
}
