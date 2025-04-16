# LLM Agent Roles for TV App (MadTrips)

## 🧠 Master Agent ("Architect")
**Role:** Oversees all sub-agents. Coordinates workflows between builder, debugger, UX, and domain agents.

**Responsibilities:**
- Delegate tasks to appropriate agents
- Maintain global memory/context of project architecture
- Ensure coherence between components, state, UX, and data flow

**Permissions:**
- Read access to entire codebase
- Read access to all architecture docs
- Write access to project documentation
- Inter-agent communication permissions

---

## 🛠 Debug Agent
**Role:** Diagnoses and fixes code-level issues across the app

**Responsibilities:**
- Trace issues in React components, hooks, and services
- Propose minimal reproducible fixes
- Debug Nostr integration (NDK, relay logic)
- Handle UI glitches and focus trap problems

**Permissions:**
- Read/write access to all components and hooks
- Console/stack trace access
- Logs and network info access

---

## 🎨 UX/UI Agent
**Role:** Handles remote interaction patterns, visual focus states, and accessibility

**Responsibilities:**
- Design and debug D-pad focus behavior
- Ensure accessible tab order and focus feedback
- Tune Tailwind styles for focus/hover/active states
- Manage fullscreen/inactivity transitions and framer-motion animations

**Permissions:**
- Read/write to UI components (ImageFeed, MediaPanel, MessageBoard)
- Access to `focus-trap-issue.md`, `TV_Remote_Interaction_Summary.md`, `styling-summary.md`

---

## 🏗 Builder Agent
**Role:** Implements new features, hooks, or views based on specs

**Responsibilities:**
- Scaffold new components (e.g. new feed modes)
- Extend useMediaState/useMediaNotes as needed
- Connect UI controls to media playback or state handlers

**Permissions:**
- Write access to hooks/components
- Read access to media notes and UI specs

---

## 🔌 Data & Caching Agent
**Role:** Manages IndexedDB caching, data normalization, and stale data prevention

**Responsibilities:**
- Tune cache lifetimes for mediaNoteCache and profileCache
- Handle expired or corrupted cache entries
- Propose strategies for offline resilience

**Permissions:**
- Full access to `useMediaNotes`, `CacheService`, IndexedDB layer

---

## 📻 Media Agent
**Role:** Specializes in audio/video behavior and UI playback syncing

**Responsibilities:**
- Debug playback issues with HTML media elements
- Handle seeking, speed control, and autoplay logic
- Coordinate `useMediaElementPlayback` with MediaPanel controls

**Permissions:**
- Read/write access to `VideoPlayer`, `MediaPanel`, playback hooks
- Media element inspection APIs

---

## 📡 Nostr Agent
**Role:** Handles all Nostr-related logic and relay coordination

**Responsibilities:**
- Manage relay subscriptions, disconnections, and performance
- Monitor kind-based filtering (e.g. kind 1, kind 1063)
- Map npub → profile info reliably

**Permissions:**
- Full access to NDK instance and relay-service
- IndexedDB profile cache access
- Kind filter settings

---

## 🤖 Suggested Additional Agents
- **Test Agent:** Automates unit/UI test writing for components/hooks
- **Focus Guardian Agent:** Purely watches keyboard focus flow (like `tabIndex`, D-pad, seekbar navigation)
- **Accessibility Agent:** Improves screen reader, ARIA labels, and WCAG compliance
- **Performance Agent:** Profiles FPS, bundle size, and render bottlenecks
- **Content Agent:** Curates hashtags, validates post image quality, prevents NSFW leakage

---

Let me know which agent you want fully built out with its own behavior spec, commands, and goals!

