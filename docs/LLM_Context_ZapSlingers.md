# LLM Context Dump: ZapSlingers Project

**Date:** YYYY-MM-DD HH:MM

**Objective:** Provide a comprehensive context package for the ZapSlingers project, suitable for onboarding an LLM or developer.

**1. Project Goal & Core Concept:**

ZapSlingers is a 2-player, turn-based steampunk space artillery game. It features physics-based projectiles influenced by standard planets and unique **Sliggers** (special planets, typically placed at map edges, with distinct attraction/repulsion zones), rendered on an HTML Canvas. The game emphasizes a physics-grounded steampunk aesthetic, utilizes Nostr for matchmaking and basic gameplay communication, and is designed with a mobile-first approach.

**2. Planning & Decision Summary (See @<documentation/docs/Planning.md> for full history):**

*   **Origin:** Branched from the "Zapsliggers" concept.
*   **Initial Ideas:** Explored a viewer-interaction feature using Nostr zaps for a "streaming chaos" mode (Deferred to future enhancement).
*   **Theme Evolution:**
    *   Initial: Standard space artillery.
    *   Explored: Steampunk vs. Cyberpunk contrast.
    *   Explored: Steampunk Cosmic Pirates with whirlpools (Deemed too arcadey).
    *   **Final Theme:** Steampunk Contraptions vs. Space Physics (Planets & Sliggers).
*   **Key Mechanic Decisions:**
    *   **Sliggers (Formerly Gas Giants):** Implemented as single physics bodies with conditional attraction/repulsion logic based on distance from the core. Spawn randomly in designated edge zones, separate from standard planets in the central area. *(Physics logic implemented in `useMatterPhysics.ts`, Initialization logic implemented in `useGameInitialization.ts`). Tuning needed.*
    *   **Boundaries:** Destructive by default, with a configurable setting (`gameSettings.ts`) to enable bouncing for sandbox/future modes.
    *   **Abilities:** Final names chosen: `ZapSplits` (Splitter), `Magnetar` (Gravity/Magnetic), `Gyro` (Plastic). HP cost (25) and usage limits (3 total/1 per type per match) defined.
    *   **UX:** No intro pop-up, no tooltips. Added explicit end-of-round score display (e.g., "1 - 0").
    *   **Nostr Matchmaking:** Use `kind:4` DMs for challenge handshake (`ChallengeHandler`).
    *   **Nostr Gameplay Sync:** Basic sync for fire actions (`kind:30079` `GameActionEvent`) implemented in `useGameLogic`. Full state sync needed.
    *   **Wagering:** Exclusive Cashu token transfer via Agent/Bot.

**3. Final Low-Level Design (LLD):**

*   The **definitive LLD (LLD 1)** detailing the target state, features, tech stack, file structure, setup, and implementation notes is located in:
    *   @<documentation/docs/Build.md>
*   Key Hooks:
    *   `useGameLogic`: Manages overall game state, turns, rules, scoring, **and basic multiplayer sync (`kind:30079`)**.
    *   `useMatterPhysics`: Handles physics simulation, collisions, Sligger forces.
    *   `useGameInitialization`: Handles level generation (planets, Sliggers).
    *   `useAuth`: Handles Nostr authentication.
    *   `ChallengeHandler`: Component handling `kind:4` DM challenges.

**4. Essential Supporting Documentation Files (@<link> format):**

To provide full context, ensure the system processes the following links along with this summary and @<documentation/docs/Build.md>:

*   @<documentation/docs/Planning.md> : Complete history of the brainstorming and decision-making process.
*   @<documentation/docs/Gameplay.md> : Describes the original core game mechanics, rules, and systems.
*   @<documentation/docs/Gamemodes.md> : Outlines the different game modes/screens.
*   @<documentation/docs/layout.md> : **Crucial** for understanding the existing project structure, key components, and custom hooks.

**(Optional but potentially helpful):**

*   @<documentation/docs/useAuth.md> / @<documentation/docs/useNDKInit.md> : Detailed specifics of the Nostr authentication flow.
*   (Consider linking the actual code file `@<src/config/gameSettings.ts>` if your system supports linking code files)

**5. Instructions for LLM/Developer:**

1.  Start with this `LLM_Context_ZapSlingers.md` overview.
2.  Refer to @<documentation/docs/Build.md> for the detailed **target LLD**.
3.  Consult @<documentation/docs/Planning.md> to understand the rationale behind decisions.
4.  Use @<documentation/docs/layout.md> to understand the existing code structure and component responsibilities.
5.  Use @<documentation/docs/Gameplay.md> and @<documentation/docs/Gamemodes.md> for foundational rules and mode descriptions.
6.  Implement features according to the LLD, placing code within the structure outlined in @<documentation/docs/layout.md>. Modify hooks like `useMatterPhysics` (for **Sligger** attraction/repulsion) and `useGameInitialization` (for **Sligger** placement and labeling) as specified in the LLD and `solutions.md` plan.

---

**6. Recent Activity & Next Steps (YYYY-MM-DD HH:MM):**

*   **QR Scanner:** Replaced `react-qr-reader@3.0.0-beta-1` with `html5-qrcode@2.3.8` in `src/components/lobby/LobbyScreen.tsx` to resolve persistent camera track errors (`DOMException`) and infinite error callback loops on mobile. Improved error handling within the scanner modal.
*   **Dependencies & Config:**
    *   Corrected `package.json` name to `zapsliggers` (lowercase).
    *   Updated `vite.config.ts` to use port `4173` for dev and preview servers.
*   **Multiplayer Challenge Flow (Phase 1):**
    *   Identified issue: Game started prematurely for both players immediately upon acceptance DM exchange, without waiting for mutual readiness.
    *   Modified `src/components/ChallengeHandler.tsx`:
        *   Added `onWaitingForOpponent` prop.
        *   When the local user *accepts* an incoming challenge, `handleAcceptChallenge` now calls `onWaitingForOpponent` instead of `onChallengeAccepted`. This is intended to signal the parent (`App.tsx`) to enter a waiting state.
        *   Added handlers (`handleRejectChallenge`, `handleCancelSentChallenge`) and wired them to UI buttons.
        *   Fixed associated linter errors.
    *   **Current State:** The user who accepts a challenge now correctly signals the parent component to wait. However, the user who *sent* the original challenge still calls the original `onChallengeAccepted` immediately upon receiving the acceptance DM, leading to asymmetry.

**Next Steps (TODOs):**

1.  **Permissions Flow (`useAuth.ts` / NIP-46 logic):**
    *   Modify authentication flow to request minimal permissions initially (e.g., `get_public_key`).
    *   Implement logic to request necessary permissions (`nip04_encrypt`, `nip04_decrypt`, `sign_event:4`, `sign_event:30079`) *only when* the user explicitly enters the Multiplayer Lobby or initiates a multiplayer action (like sending a challenge).
2.  **Challenge Flow - Waiting Logic (`App.tsx` / State Manager):**
    *   Implement the `onWaitingForOpponent` function passed to `ChallengeHandler`. It should set a global state (e.g., `gameState = 'waiting'`, `matchDetails = { opponentPubkey, matchId }`).
    *   Modify the handler for the *original* `onChallengeAccepted` prop (called when the *opponent's* accept DM is received in `handleDMEvent`). This should *also* transition the original challenger into the 'waiting' state, storing the `matchDetails`. **Crucially, neither player should navigate to the `GameScreen` yet.**
    *   Create or modify UI elements to display this "Waiting for opponent..." state.
3.  **Challenge Flow - Player Ready (`useGameLogic.ts`, `App.tsx`):**
    *   In `useGameLogic.ts`, add a `useEffect` hook that runs when the component mounts in multiplayer mode. This effect should publish a `player_ready` event via Nostr (`kind: 30079`, `{"type": "player_ready", "matchId": matchId}`).
    *   In `App.tsx` (or wherever the 'waiting' state is managed), add a Nostr subscription listening for `kind: 30079` events tagged with the current `matchId`.
    *   When a `player_ready` event is received *from the opponent*, update the game state (e.g., `gameState = 'starting'`) and navigate both players (or at least the local player) to the `GameScreen`. (Ensure this only happens once the *opponent's* ready event is received).

--- 