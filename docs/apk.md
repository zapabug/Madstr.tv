# Building the Android APK (Capacitor)

This document outlines the steps to build the Android APK for the TV app after updating the web assets.

## Prerequisites

1.  **Android SDK:** You need the Android SDK installed. The build process requires the SDK location to be configured.
2.  **Java Development Kit (JDK):** A compatible JDK (e.g., JDK 21) is required by Gradle.
3.  **Web Assets Built:** Ensure you have run the web build process (e.g., `bun run build`) first, so the latest web code is in the `dist/` directory.

## Steps

1.  **Sync Web Assets:**
    Copy the built web assets from `dist/` into the Android project.
    **(Run this command from the project root directory: `/home/jq/gitshit/tvapp`)**
    ```bash
    npx cap sync android
    ```

2.  **Set Environment Variables & Build:**
    You need to tell Gradle where to find the Android SDK and the correct Java version. You can do this by setting environment variables before running the build command.
    **(Run the entire command block below from the project root directory: `/home/jq/gitshit/tvapp`. It handles changing directories internally.)**

    *   **`/home/jq/gitshit/tvapp`**: Path to your project's root directory.
    *   **`ANDROID_HOME`**: Path to your Android SDK (e.g., `$HOME/Android/Sdk`).
    *   **`JAVA_HOME`**: Path to your JDK installation (e.g., `/usr/lib/jvm/java-21-openjdk-amd64`).

    Combine setting the variables with changing into the `android` directory, cleaning the previous build, and running the `assembleDebug` task:

    ```bash
    cd /home/jq/gitshit/tvapp && \
    export ANDROID_HOME=$HOME/Android/Sdk && \
    export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 && \
    cd android && \
    ./gradlew clean assembleDebug
    ```

    *   `cd /home/jq/gitshit/tvapp`: Ensures the command starts from the correct root directory.
    *   `export ANDROID_HOME=...`: Sets the SDK path for the current command.
    *   `export JAVA_HOME=...`: Sets the JDK path for the current command.
    *   `cd android`: Navigates into the native Android project directory.
    *   `./gradlew clean`: Removes previous build artifacts.
    *   `./gradlew assembleDebug`: Compiles the app and builds the debug APK.
    *   (Note: This command leaves you in the `android` directory after execution).

3.  **Locate the APK:**
    The generated debug APK file will typically be located at:
    `android/app/build/outputs/apk/debug/app-debug.apk`
    (Relative to the project root, this is `android/app/build/outputs/apk/debug/app-debug.apk`) 