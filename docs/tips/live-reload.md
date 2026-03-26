# Wireless Live Reload Setup (Capacitor)

This document explains how to set up wireless live reload for the TV app using Capacitor and ADB (Android Debug Bridge). This allows you to see code changes on your TV in real-time without reinstalling the APK for every change.

## Prerequisites

1.  **Android SDK:** You need the Android SDK installed on your development machine.
2.  **ADB:** The Android Debug Bridge tool must be installed.
3.  **Wi-Fi Network:** Your development machine and the Android TV must be on the same Wi-Fi network.
4.  **Developer Options Enabled on TV:** You need to enable Developer Options and USB/Network Debugging on your Android TV.

## Steps

**1. Install ADB (if not already installed):**

*   Open a terminal on your development machine.
*   On Debian/Ubuntu-based systems (like Pop!_OS), run:
    ```bash
    sudo apt update && sudo apt install -y adb
    ```
*   Follow the prompts, entering your password if required.

**2. Enable ADB over Wi-Fi on Your TV:**

*   **Enable Developer Options:** Go to TV Settings -> About -> Find the "Build number" and tap it 7 times until you see a message saying "You are now a developer!".
*   **Enable Debugging:** Go back to Settings, find the new "Developer options" menu.
    *   Enable "USB debugging".
    *   Look for an option like "ADB over network", "Network debugging", or "Wireless debugging" and enable it. Note the IP address and port displayed (e.g., `192.168.1.75:5555`). If only an IP is shown, the default port is usually `5555`.
*   *(Alternative if "ADB over network" isn't directly available):*
    *   Connect the TV to your computer via a USB cable *once*.
    *   Open a terminal on your computer and run `adb devices` to ensure the TV is listed.
    *   Run `adb tcpip 5555`.
    *   Disconnect the USB cable. Note your TV's IP address from its network settings.

**3. Connect Your Computer to the TV via Wi-Fi ADB:**

*   Open a terminal on your development machine.
*   Run the connect command, replacing `<YOUR_TV_IP_ADDRESS>` and `<PORT>` with the values from your TV (use `5555` if no port was specified):
    ```bash
    adb connect <YOUR_TV_IP_ADDRESS>:<PORT>
    ```
    *Example:* `adb connect 192.168.1.75:5555`
*   **Authorize Connection:** Look at your TV screen. A prompt asking "Allow USB debugging?" should appear. Check the box for "Always allow from this computer" and select "OK" or "Allow".
*   **Verify Connection:** Run the connect command again or run `adb devices`. You should see your TV listed as connected (e.g., `192.168.1.75:5555 device`).

**4. Run Capacitor Live Reload:**

*   Navigate to your project's root directory (`/home/jq/gitshit/tvapp`) in the terminal.
*   **Set `ANDROID_HOME`:** You need to tell Capacitor where your Android SDK is. Replace `$HOME/Android/Sdk` if your path is different.
    ```bash
    export ANDROID_HOME=$HOME/Android/Sdk
    ```
*   **Run Live Reload:** Start the live reload process. This command will build and deploy the app to your connected TV and start a development server.
    ```bash
    npx cap run android --live-reload
    ```
*   **Select Target:** If prompted, use the arrow keys to select your connected TV (e.g., "Vestel Cosmos (192.168.1.75:5555)") and press Enter.
*   The command will run in the foreground, showing logs. The app should launch on your TV.

**5. Develop with Live Reload:**

*   Keep the terminal process running.
*   Make changes to your web code (files in the `src/` directory).
*   Save the changes.
*   The Capacitor CLI should detect the changes, rebuild the web assets, and automatically refresh the app running on your TV.

**6. Stopping Live Reload:**

*   Go back to the terminal where `npx cap run android --live-reload` is running.
*   Press `Ctrl+C` to stop the development server and the live reload process.

---

Now you have a guide for setting up wireless development for your TV app! 