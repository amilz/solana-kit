# @solana/legacy vs @solana/web3.js Differences

This document tracks intentional differences between `@solana/legacy` and the original `@solana/web3.js` library.

## Sync Methods Not Supported

The following synchronous methods throw errors and require using their async equivalents:

| Method                                 | Replacement                        |
| -------------------------------------- | ---------------------------------- |
| `PublicKey.createWithSeedSync()`       | `PublicKey.createWithSeed()`       |
| `PublicKey.createProgramAddressSync()` | `PublicKey.createProgramAddress()` |
| `PublicKey.findProgramAddressSync()`   | `PublicKey.findProgramAddress()`   |

**Reason:** Kit uses WebCrypto for all cryptographic operations, which is async-only. The original web3.js used synchronous implementations (tweetnacl, js-sha256) that are slower and less secure.

**Migration:** Replace sync calls with `await`:

```ts
// Before
const [pda, bump] = PublicKey.findProgramAddressSync(seeds, programId);

// After
const [pda, bump] = await PublicKey.findProgramAddress(seeds, programId);
```

## Return Types

| Method                 | web3.js      | @solana/legacy |
| ---------------------- | ------------ | -------------- |
| `PublicKey.toBuffer()` | `Buffer`     | `Uint8Array`   |
| `PublicKey.toBytes()`  | `Uint8Array` | `Uint8Array`   |

**Migration:** If you need a `Buffer`, wrap the result:

```ts
const buffer = Buffer.from(publicKey.toBuffer());
```

## Internal Representation

- **web3.js:** Uses `BN.js` internally (`_bn` property)
- **@solana/legacy:** Uses Kit's `Address` type internally

The `_bn` property is not exposed. If you were accessing it directly, use `toBytes()` instead.

## Additional Methods (Kit Interop)

These methods are new in `@solana/legacy` for Kit interoperability:

| Method                        | Description                          |
| ----------------------------- | ------------------------------------ |
| `publicKey.toAddress()`       | Returns Kit `Address` type           |
| `PublicKey.fromAddress(addr)` | Creates PublicKey from Kit `Address` |

## Keypair

### Async Factory Methods

All Keypair factory methods are now async:

| Method                    | web3.js | @solana/legacy |
| ------------------------- | ------- | -------------- |
| `Keypair.generate()`      | sync    | `async`        |
| `Keypair.fromSecretKey()` | sync    | `async`        |
| `Keypair.fromSeed()`      | sync    | `async`        |

**Migration:**

```ts
// Before
const keypair = Keypair.generate();

// After
const keypair = await Keypair.generate();
```

### secretKey Access

- `Keypair.generate()` creates non-extractable keypairs (secretKey throws)
- `Keypair.fromSecretKey()` and `Keypair.fromSeed()` create extractable keypairs

If you need `secretKey` access from a generated keypair, use:

```ts
const seed = crypto.getRandomValues(new Uint8Array(32));
const keypair = await Keypair.fromSeed(seed);
keypair.secretKey; // Works
```

### Kit Interop

New method for Kit integration:

```ts
const keypair = await Keypair.fromSecretKey(secretKey);
const signer = keypair.toSigner(); // Returns KeyPairSigner
```

## Planned Differences

### Connection (Phase 5)

- All RPC methods return the same types, but internally use Kit's `Rpc`
- Subscription callbacks unchanged, but internally use Kit's async iterables
