# Action Plan: Code Cleanup & TV Optimization

## Overview

This plan addresses code quality issues and TV-specific UX requirements for Madstr TV app.

---

## Issue #1: Remove Fullscreen Button from Main Page

**Status:** DONE ✓  
**Priority:** HIGH

### Action
1. DELETE both fullscreen toggle buttons from `src/App.tsx` (lines 475-539)
2. Fullscreen toggle remains ONLY in Settings modal

### Files
- `src/App.tsx` - removed lines 475-539

---

## Issue #2: Remove Dead Code

**Status:** DONE ✓  
**Priority:** HIGH

### Action
Deleted commented code from:
- `src/components/RelayStatus.tsx` - removed `getTextColor()` and `statusText`/`statusColor` commented blocks

### Files
- `src/components/RelayStatus.tsx`

---

## Issue #3: Settings Modal Remote Navigation

**Status:** DONE ✓  
**Priority:** HIGH (BUG)

### Problem
- User cannot navigate to Settings modal using TV remote

### Action
1. ✓ Added keyboard shortcut 'S' to open Settings modal
2. ✓ Added Escape/Backspace to close Settings modal
3. RelayStatus button already accessible via tab/Enter (focusable)
4. Settings has proper tabIndex and arrow key handlers

### Files
- `src/hooks/useKeyboardControls.ts` - added 'S' key, Escape
- `src/App.tsx` - passed onOpenSettings/onCloseSettings callbacks

### Verify on TV
- Arrow key navigation from main page to relay status button
- Press Enter on relay status button to open Settings
- Press 'S' to open Settings
- Press Escape/Backspace to close Settings

---

## Issue #4: Add Keypin for Settings Modal Access

**Status:** SKIPPED  
**Priority:** MEDIUM

### Reason
- PIN entry via TV remote D-pad is cumbersome
- Focus navigation is more important for TV UX
- Can add later if needed

### Alternative (Done Instead)
- Focus navigation fixed in SettingsModal
- 'S' key shortcut for keyboard users
- Escape/Backspace to close

---

## Issue #5: Video Controls in MediaPanel

**Status:** DONE ✓  
**Priority:** MEDIUM

### Verification
MediaPanel has:
- Time display (line 462) ✓
- Progress bar / seek (lines 467-473) ✓
- Playback speed selector (lines 486-504) ✓
- Play/pause, next/prev buttons ✓

### Files
- `src/components/MediaPanel.tsx` - verified

### Current State
- `VideoPlayer.tsx` has placeholder/no controls
- Controls exist in `MediaPanel.tsx` for other media types

### TV Remote Requirements
- Volume: Controlled by TV hardware remote (no on-screen control needed)
- Play/Pause: Handled by MediaPanel
- Seek/Next/Prev: Handled by MediaPanel via focus navigation
- Time/Progress: Display needed in MediaPanel

### Action
1. REMOVE any placeholder controls from `VideoPlayer.tsx`
2. VERIFY `MediaPanel.tsx` has:
   - Time display (current time / duration)
   - Progress indicator
   - Play/pause button
   - Seek forward/back buttons
   - Next/previous video buttons
3. REMOVE time display from VideoPlayer if present

### Files
- `src/components/VideoPlayer.tsx`
- `src/components/MediaPanel.tsx`

---

## Issue #6: Consistent Focus Rings

**Status:** TODO  
**Priority:** LOW

### Current State
Inconsistent focus ring colors across components:

| Component | Current Focus Color |
|-----------|--------------------|
| MediaPanel | `ring-yellow-400` |
| SettingsModal | `ring-purple-500` |
| VideoPlayer | `ring-yellow-400` |
| RelayStatus | `ring-yellow-400` |

### Requirement
Standardize focus ring to one color for visual consistency.

### Action
1. Standardize to `ring-purple-400` (matches brand purple theme)
2. Update ALL components to use `ring-purple-400`

### Files
- `src/components/MediaPanel.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/VideoPlayer.tsx`
- `src/components/RelayStatus.tsx`
- `src/components/ImageFeed.tsx`
- `src/App.tsx` (any buttons)

---

## Implementation Order

| Step | Task | Status |
|------|------|--------|
| 1 | Remove dead code | DONE |
| 2 | Remove fullscreen buttons | DONE |
| 3 | Settings modal D-pad navigation | DONE |
| 4 | Add 'S' key shortcut | DONE |
| 5 | Settings video controls verified | DONE |
| 6 | Standardize focus rings | PENDING |

---

## Verification Checklist

After implementing:

- [ ] No fullscreen buttons on main page
- [ ] Fullscreen button in Settings modal works
- [ ] No commented-out code in codebase
- [ ] Video controls in MediaPanel (not VideoPlayer)
- [ ] Time/progress display shows for videos
- [ ] All focus rings use `ring-purple-400`
- [ ] Build succeeds (`bun run build`)
- [ ] Lint passes (`bun run lint`)

---

## Notes

- TV-first UX: Settings only accessible via Settings modal
- Remote navigation: All controls via focus/arrow keys
- Volume: Handled by TV hardware, not app
- Brand consistency: Purple theme throughout
