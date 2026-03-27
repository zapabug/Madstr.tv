# AGENTS.md - Madstr TV Development Guide

## Project Overview

Madstr TV is a TV-optimized Nostr media viewer app with NIP-46 remote signer support using Amber Signer on mobile. It displays images, podcasts, and videos shared via the Nostr protocol. Built with React 19, TypeScript, and Vite.

## Build Commands

```bash
# Development
bun dev              # Start dev server with hot reload

# Production
bun run build        # Build for production (outputs to dist/)
bun run preview      # Preview production build on port 3000

# Linting
bun run lint         # Run ESLint on all files
```

## Code Style Guidelines

### TypeScript
- **Strict mode enabled** (`"strict": true` in tsconfig.json)
- No unused locals or parameters (`"noUnusedLocals": true`, `"noUnusedParameters": true`)
- Use explicit types; avoid `any` unless absolutely necessary
- Use `interface` for object shapes, `type` for unions/primitives
- No fallthrough cases in switch statements

### React
- Use functional components with hooks
- Use **named exports** for components (for React Refresh compatibility)
- Use `useCallback` for functions passed as props to prevent unnecessary re-renders
- Use `useRef` for values that persist across renders without triggering updates
- Always specify dependencies in useEffect/useCallback/useMemo

### Imports
- React imports: `import { useState, useEffect } from 'react'`
- Named imports from libraries: `import { NDKEvent } from '@nostr-dev-kit/ndk'`
- Default imports for utils: `import shuffleArray from './utils/shuffleArray'`
- Local imports use relative paths (`./`, `../`)
- Group imports: React → libraries → local

### Naming Conventions
- Components: PascalCase (`ImageFeed.tsx`, `MediaPanel.tsx`)
- Hooks: camelCase with `use` prefix (`useAuth.ts`, `useMediaNotes.ts`)
- Utils: camelCase (`shuffleArray.ts`, `mediaNoteCache.ts`)
- Constants: SCREAMING_SNAKE_CASE or camelCase depending on scope
- Interfaces: PascalCase with descriptive names (`UseAuthReturn`)

### Error Handling
- Use try/catch for async operations
- Log errors with context: `console.error("[component] Error description:", error)`
- Set user-facing error states in hooks (`setAuthError`, etc.)
- Never expose sensitive data in error messages or logs
- Handle `undefined` and `null` explicitly

### File Organization
- One component per file
- Co-locate related hooks and utils
- Keep components in `src/components/`, hooks in `src/hooks/`
- Types in `src/types/`, utils in `src/utils/`

## Project Structure

```
src/
├── App.tsx              # Root component - orchestrator
├── ndk.ts              # NDK singleton instance
├── constants.ts        # App constants (relays, pubkeys, etc.)
├── components/          # React components
│   ├── ImageFeed.tsx
│   ├── VideoPlayer.tsx
│   ├── MediaPanel.tsx
│   ├── SettingsModal.tsx
│   └── ...
├── hooks/               # Custom React hooks
│   ├── useAuth.ts
│   ├── useMediaNotes.ts
│   ├── useMediaAuthors.ts
│   ├── useNDKInit.ts
│   └── ...
├── utils/               # Utility functions
│   ├── idb.ts          # IndexedDB helpers
│   └── shuffleArray.ts
└── types/               # TypeScript type definitions
    └── nostr.ts
```

## Key Patterns

### NDK Singleton Pattern
```typescript
// src/ndk.ts exports singleton
// useNDKInit hook manages connection state
const { ndkInstance, isConnecting, connectionError } = useNDKInit();
const isNdkReady = !!ndkInstance && !isConnecting && !connectionError;
```

### Custom Hook Pattern
```typescript
interface UseHookProps {
  param1: string;
  ndk?: NDK;
}

export function useHook({ param1, ndk }: UseHookProps) {
  const [data, setData] = useState<Type>();
  
  useEffect(() => {
    if (!ndk) return;
    // setup logic
    return () => { /* cleanup */ };
  }, [ndk, param1]);
  
  return { data, isLoading: !data };
}
```

### IndexedDB (via idb library)
```typescript
import { idb } from '../utils/idb';

// Settings helpers
await idb.saveNsecToDb(nsec);
const nsec = await idb.loadNsecFromDb();

// Cache helpers
await idb.putMediaNote(note);
const note = await idb.getMediaNote(id);
await idb.clearMediaNotes();
```

### State Updates with Functional Form
```typescript
// Prefer functional updates for state that depends on previous state
setCount(prev => prev + 1);
setNotes(prev => [...prev, newNote]);
```

## NIP-46 / Remote Signing

- Use **NIP-44 encryption** (not deprecated NIP-04)
- Add **`[bunker]`** prefix to all NIP-46 connection logs for filtering
- Session persistence via IndexedDB
- Supported flows: QR code (Amber Signer), paste bunker URI, browser extension (NIP-07)
- Extension detection via `window.nostr`

## Media Kinds Reference

| Media Type | Nostr Kinds | Notes |
|------------|-------------|-------|
| Audio | 1, 1063, 31338 | Podcasts, music |
| Video | 1, 1063, 34235, 34236 | ≥2 min duration filter |
| Images | 1, 1063 | NIP-94 metadata |

## Cursor Tools Integration

This project uses Cursor tools for AI assistance:

```bash
# Web search via Perplexity
cursor-tools web "nostr relay comparison 2025"

# Repository context via Gemini
cursor-tools repo "explain authentication flow"

# Documentation generation
cursor-tools doc --output docs.md

# Browser automation
cursor-tools browser open https://localhost:5173
cursor-tools browser act "Click Login" --url=https://localhost:5173

# GitHub integration
cursor-tools github pr 123
cursor-tools github issue 456
```

## Known Issues / Technical Debt

- Bundle size warning: JS chunks >500kB (code splitting recommended)
- No test suite currently configured
- Some LSP errors in node_modules (NDK debug namespace) - ignore
- 9 React hooks exhaustive-deps warnings (intentional - to avoid unnecessary re-renders)

## Development Notes

- **TV-first UX**: Fullscreen mode, remote control navigation, large touch targets
- **Display modes**: Images = random carousel, Videos = sequential playback
- **Package manager**: Use `bun` (not npm/yarn/pnpm)
- **Branch**: `audio-debug` - all work happens here
- **Do NOT touch**: MediaPanel styling
- **When adding features**: Update docs/Planning.md

## Quick Reference

```typescript
// Generate nsec/npub pair
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';

const sk = generateSecretKey();
const pk = getPublicKey(sk);
const npub = nip19.npubEncode(pk);
const nsec = nip19.nsecEncode(sk);

// NIP-44 encryption
import { encrypt, decrypt, getConversationKey } from 'nostr-tools/nip44';
const key = getConversationKey(skBytes, pkHex);
const ciphertext = encrypt(plaintext, key);
```

## Documentation

- [Planning.md](./docs/Planning.md) - Feature planning and todo list
- [tv-app-architecture.md](./docs/tv-app-architecture.md) - Architecture documentation
- [NIP46_QR_FLOW.md](./NIP46_QR_FLOW.md) - NIP-46 implementation notes
