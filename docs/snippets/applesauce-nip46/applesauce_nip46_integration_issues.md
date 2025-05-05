# Applesauce NIP-46 Signer Integration Issues

This document tracks issues encountered while integrating the copied Applesauce NIP-46 signer code into the Zapsliggers project.

## `src/lib/applesauce-nip46/helpers.ts`

- **Unresolved Linter Errors (as of initial copy & fix attempts):**
  - `Line 27: Type '(value: T | PromiseLike<T>) => void' is not assignable to type '(value?: T | PromiseLike<T> | undefined) => void'. Types of parameters 'value' and 'value' are incompatible. Type 'T | PromiseLike<T> | undefined' is not assignable to type 'T | PromiseLike<T>'. Type 'undefined' is not assignable to type 'T | PromiseLike<T>'.`
  - `Line 28: Unused '@ts-expect-error' directive.`

These errors originate from the `createDefer` function's typing and likely require a deeper investigation into the type compatibility within the current project's TypeScript configuration or a refactor of the function itself.

## `src/lib/applesauce-nip46/simple-signer.ts`

- **Unresolved Linter Errors (as of initial copy & fix attempts):**
  - `Line 12: Cannot find name 'Buffer'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\`.` (Persisted after adding `import { Buffer } from 'buffer';`)
  - `Line 2: Cannot find module 'buffer' or its corresponding type declarations.` (Appeared after adding import)

This likely requires installing the `buffer` package (`npm install buffer` or `yarn add buffer`) and ensuring Node types (`@types/node`) are installed and recognized by the build process.

## `src/lib/applesauce-nip46/nostr-connect-signer.ts`

- **Unresolved Linter Errors (as of initial copy & fix attempts):**
  - `Line 2: Cannot find module 'nanoid' or its corresponding type declarations.` (Requires dependency: `npm install nanoid` or `yarn add nanoid`)
  - `Line 340: Deferred type mismatch (Deferred<ResponseResults[T]> vs Deferred<unknown>)` related to `createDefer` issues in `helpers.ts`.
  - `Line 18: Unexpected any in isErrorResponse type assertion (\`(response as any).error\`)` - Could be refined but acceptable for now.

These issues require installing the `nanoid` dependency and resolving the underlying `createDefer` type problems noted in `helpers.ts`.

## `src/hooks/useAuth.ts`

- **Unresolved Linter Error (as of wrapper creation):**
  - `Line 8: Cannot find module 'src/lib/applesauce-nip46/wrapper' or its corresponding type declarations.`

This error persists despite the file `src/lib/applesauce-nip46/wrapper.ts` existing. It likely indicates an issue with TypeScript module resolution caching or configuration (`tsconfig.json`). Restarting the TypeScript server/IDE or verifying `tsconfig.json` settings is recommended.

## `src/lib/applesauce-nip46/wrapper.ts`

- **Resolved Issue:** Type errors occurred when attempting to directly access `nip04` or `nip44` properties on an instance of `NostrConnectSignerWrapper` (e.g., `wrapper.nip44.decrypt(...)`).
- **Cause:** While the wrapper's internal `encrypt`/`decrypt` methods correctly delegated to the underlying `NostrConnectSigner`'s `nip04`/`nip44` methods, the wrapper class itself did not explicitly expose these `nip04` and `nip44` objects as public properties.
- **Resolution:** Added public getters for `nip04` and `nip44` to the `NostrConnectSignerWrapper` class, which return the corresponding objects from the internal `this.signer` instance. This makes the properties available on the wrapper's type signature and allows direct use.

```typescript
// Added to NostrConnectSignerWrapper class:

// Expose nip04 from underlying signer
public get nip04() {
    return this.signer?.nip04;
}

// Expose nip44 from underlying signer
public get nip44() {
    return this.signer?.nip44;
}
``` 