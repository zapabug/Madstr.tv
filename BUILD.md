# Build Setup Instructions

This document outlines the necessary steps to set up the development environment for this project.

## Prerequisites

Before starting a new build or development session, ensure the following components are correctly configured:

1.  **MCP Server (mcp-code):**
    *   The `mcp-code` server needs to be running.
    *   The path to the `mcp-code` executable should be correctly configured. The currently configured path is: `/home/jq/gitshit/usigfapi/mcp-code`.
    *   The MCP configuration is typically managed in the global Cursor settings (often `~/.cursor/mcp.json`) and should point to the correct executable path. See the example structure in the replication steps below.
    *   **Note:** MCP is intended to facilitate certain Nostr development workflows (like managing keys, zaps, etc.), but integrating it effectively within the Cursor environment is currently proving difficult and may not be fully functional.

2.  **Cursor Configuration Files:**
    *   The `.cursor` directory within this project root is required. It contains specific rules or configurations needed for the project. Ensure this directory and its contents are present.
    *   The `cursor-tools.config.json` file in the project root is required. This file contains settings for LLM providers and models used by associated tooling.

3.  **Cursor-Tools Installation:**
    *   Cursor-tools (also known as vibe-tools in newer versions) needs to be installed globally:
      ```bash
      npm install -g cursor-tools
      # OR for the newer version:
      npm install -g vibe-tools
      ```
    *   Ensure `.cursorrules` file is present in the project root. This file contains instructions for using cursor-tools.
    *   For browser automation commands, Playwright is required:
      ```bash
      npm install -g playwright
      ```

## Environment Replication Steps

To replicate this development environment from scratch, follow these steps:

1.  **Clone the Repository:**
    ```bash
    # Replace <repository-url> with the actual URL
    git clone <repository-url>
    cd tvapp # Or the actual directory name
    ```

2.  **Install Dependencies:**
    ```bash
    bun install
    ```
    This will install all project dependencies, including:
    *   React & Vite build tools.
    *   TailwindCSS for styling.
    *   Key Nostr libraries:
        *   `@nostr-dev-kit/ndk`: Core Nostr Development Kit.
        *   `nostr-hooks`: React hooks for NDK.
        *   `nostr-tools`: Utilities for Nostr Improvement Proposals (NIPs).
        *   `react-qr-code`: For displaying QR codes.

3.  **Set up `mcp-code` Server:**
    *   Clone the `mcp-code` repository from its source (URL not provided here).
    *   Follow the instructions within the `mcp-code` repository to build the executable.
    *   **Important:** Note the *absolute path* to the built `mcp-code` executable. For the original setup, this path was `/home/jq/gitshit/usigfapi/mcp-code`. You will need to use the correct path for your system.

4.  **Configure MCP in Cursor:**
    *   Locate or create the Cursor MCP configuration file (often `~/.cursor/mcp.json`).
    *   Add or update the configuration for `mcp-code`, ensuring the `command` field points to the absolute path noted in the previous step (replace `<PATH_TO_MCP_CODE_BINARY>` with the actual path). The required structure is:
      ```json
      {
        "mcpServers": {
          "mcp-code": {
            "command": "<PATH_TO_MCP_CODE_BINARY>",
            "args": [
              "mcp"
            ],
            "alwaysAllow": [
              "find_snippets",
              "find_user",
              "list_usernames",
              "fetch_snippet_by_id",
              "publish-new-code-snippet",
              "wallet_balance",
              "deposit",
              "zap",
              "create_pubkey"
            ],
            "disabled": false
          }
        }
      }
      ```

5.  **Verify Project Configuration Files:**
    *   Ensure the `.cursor` directory and its contents exist in the project root.
    *   Ensure the `cursor-tools.config.json` file exists in the project root.
    (These files should be present after cloning the repository if they are committed to version control).

6.  **Run Development Server:**
    ```bash
    bun run dev
    ```

7.  **Install and Configure Cursor-Tools:**
    *   Install cursor-tools globally:
      ```bash
      npm install -g cursor-tools
      # OR
      npm install -g vibe-tools
      ```
    *   Verify the `.cursorrules` file exists in the project root.
    *   If using browser automation features, install Playwright:
      ```bash
      npm install -g playwright
      ```
    *   Optionally, create a `.cursor-tools.env` file for API keys (not committed to version control):
      ```
      OPENROUTER_API_KEY=your_api_key_here
      # Other API keys as needed
      ```

This should set up the environment to match the original configuration.

## Development Server

Once the prerequisites are met, you can start the development server using Bun:

```bash
bun run dev
```

**Note:** Recent updates to the project have resolved issues with profile image loading in the `MessageBoard` component. The application now successfully displays profile data and images for all authors, leveraging the streaming nature of Nostr data through subscriptions for Kind 0 (Metadata) events. Ensure your environment is up to date with the latest code changes to benefit from these improvements. 