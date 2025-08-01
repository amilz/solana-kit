/**
 * This package contains a polyfill that enables Ed25519 key manipulation in environments where it
 * is not yet implemented. It does so by proxying calls to `SubtleCrypto` instance methods to an
 * Ed25519 implementation in userspace.
 *
 * > [!WARNING]
 * > Because this package's implementation of Ed25519 key generation exists in userspace, it can't
 * > guarantee that the keys you generate with it are non-exportable. Untrusted code running in your
 * > JavaScript context may still be able to gain access to and/or exfiltrate secret key material.
 *
 * > [!NOTE]
 * > Native `CryptoKeys` can be stored in IndexedDB but the keys created by this polyfill can not.
 * > This is because, unlike native `CryptoKeys`, our polyfilled key objects can not implement the
 * > [structured clone algorithm](https://www.w3.org/TR/WebCryptoAPI/#cryptokey-interface-clone).
 *
 * ## Usage
 *
 * Environments that support Ed25519 (see https://github.com/WICG/webcrypto-secure-curves/issues/20)
 * do not require this polyfill.
 *
 * For all others, simply import this polyfill before use.
 *
 * ```ts
 * import { install } from '@solana/webcrypto-ed25519-polyfill';
 *
 * // Calling this will shim methods on `SubtleCrypto`, adding Ed25519 support.
 * install();
 *
 * // Now you can do this, in environments that do not otherwise support Ed25519.
 * const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign']);
 * const publicKeyBytes = await crypto.subtle.exportKey('raw', keyPair.publicKey);
 * const data = new Uint8Array([1, 2, 3]);
 * const signature = await crypto.subtle.sign({ name: 'Ed25519' }, keyPair.privateKey, data);
 * if (await crypto.subtle.verify({ name: 'Ed25519' }, keyPair.publicKey, signature, data)) {
 *     console.log('Data was signed using the private key associated with this public key');
 * } else {
 *     throw new Error('Signature verification error');
 * }
 * ```
 *
 * @packageDocumentation
 */
export * from './install';
