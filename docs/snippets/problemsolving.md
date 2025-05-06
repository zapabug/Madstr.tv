# Applesauce Codebase Investigation Request

## 1. Goal / Objective

*(Describe the overall problem you are trying to solve or the feature you are trying to implement that requires information from the `applesauce` codebase. What is the end goal?)*

Example: "Determine how to correctly subscribe to timeline events using `applesauce-react` hooks."

## 2. Context / Background

*(Provide any relevant context. What have you tried already? What related information do you already have? Are there specific errors you are encountering? Reference other files like `Planning.md` or issue summaries if applicable.)*

Example: "Currently using `Hooks.useStoreQuery` in `MessageBoard.tsx` but getting type errors. I previously established that `QueryStoreProvider` is set up correctly in `main.tsx`."

## 3. Specific Information Needed

*(List the precise questions you need answered. Be specific.)*

Example:
*   "What is the exact signature of the `TimelineQuery` function in `applesauce-core`?"
*   "How should the `Filter[]` be passed to `Hooks.useStoreQuery` when using `TimelineQuery`?"
*   "What is the structure of the return value from `Hooks.useStoreQuery(TimelineQuery, ...)`?"
*   "Is there a specific hook or helper for parsing profile data within event content?"

## 4. Starting Points / Search Areas

*(Suggest specific files, directories, package names (`applesauce-core`, `applesauce-react`, `applesauce-signers`), or keywords within the `applesauce` repository where I should start looking.)*

Example:
*   "Start in `packages/core/src/queries/timeline.ts`."
*   "Look at hooks exported from `packages/react/src/hooks/index.ts`."
*   "Search for usages of `ProfileContent` type."

## 5. Desired Output Format

*(How would you like the information presented? E.g., function signatures, type definitions, code snippets, list of exports, explanation in plain text.)*

Example: "Provide the function signature for the hook, a code snippet showing its usage for timeline filters, and the type definition for the return value."

--- 