# @solana/legacy vs @solana/web3.js Differences

This document tracks intentional differences between `@solana/legacy` and the original `@solana/web3.js` library.

## Sync Methods Not Supported

The following synchronous methods throw errors and require using their async equivalents:

| Method | Replacement |
|--------|-------------|
| `PublicKey.createWithSeedSync()` | `PublicKey.createWithSeed()` |
| `PublicKey.createProgramAddressSync()` | `PublicKey.createProgramAddress()` |
| `PublicKey.findProgramAddressSync()` | `PublicKey.findProgramAddress()` |

**Reason:** Kit uses WebCrypto for all cryptographic operations, which is async-only. The original web3.js used synchronous implementations (tweetnacl, js-sha256) that are slower and less secure.

**Migration:** Replace sync calls with `await`:
```ts
// Before
const [pda, bump] = PublicKey.findProgramAddressSync(seeds, programId);

// After
const [pda, bump] = await PublicKey.findProgramAddress(seeds, programId);
```

## Return Types

| Method | web3.js | @solana/legacy |
|--------|---------|----------------|
| `PublicKey.toBuffer()` | `Buffer` | `Uint8Array` |
| `PublicKey.toBytes()` | `Uint8Array` | `Uint8Array` |

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

| Method | Description |
|--------|-------------|
| `publicKey.toAddress()` | Returns Kit `Address` type |
| `PublicKey.fromAddress(addr)` | Creates PublicKey from Kit `Address` |

## Planned Differences

### Keypair (Phase 2)
- `Keypair.generate()` will be async (WebCrypto key generation)
- `Keypair.fromSecretKey()` may require async initialization for signing

### Connection (Phase 5)
- All RPC methods return the same types, but internally use Kit's `Rpc`
- Subscription callbacks unchanged, but internally use Kit's async iterables
