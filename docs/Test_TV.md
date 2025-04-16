# Testing on Android TV

This file lists useful commands for testing and deploying the app on an Android TV device using ADB and Capacitor.

## 1. Connect to Device via ADB

Make sure ADB Debugging (Network) is enabled on the TV.

```bash
adb connect 192.168.1.75:5555
```

## 2. Run with Live Reload (Development)

This command builds the web assets implicitly, syncs them, and launches the app on the connected device with live reload enabled.

```bash
# Ensure ANDROID_HOME is set (adjust path if needed)
export ANDROID_HOME=$HOME/Android/Sdk && npx cap run android --live-reload
```
*(Note: You might need to select the target device from a list after running this.)*

## 3. Building a Debug APK

Follow these steps to generate an `app-debug.apk` file.

### Step 3a: Build Web Assets

```bash
bun run build
```

### Step 3b: Sync Web Assets to Android Project

```bash
npx cap sync android
```

### Step 3c: Clean and Assemble Debug APK

Set environment variables and run the Gradle build.

```bash
# Ensure paths for ANDROID_HOME and JAVA_HOME are correct
export ANDROID_HOME=$HOME/Android/Sdk && \
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 && \
cd android && \
./gradlew clean assembleDebug
```
*(The APK will be in `android/app/build/outputs/apk/debug/app-debug.apk`)*

## 4. ADB Troubleshooting Commands

### Restart ADB Server

Useful if the connection seems stuck or devices aren't listed correctly.

```bash
adb kill-server && adb start-server
```

### Check Connected Devices

```bash
adb devices
```

### Explicitly Disconnect Device

```bash
adb disconnect 192.168.1.75:5555
```

## 5. Clean Android Build Artifacts

Sometimes necessary if builds fail unexpectedly.

```bash
# Run from project root
cd android && ./gradlew clean && cd ..
``` 