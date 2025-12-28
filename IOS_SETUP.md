# iOS Development Setup Guide

## Step 1: Clean Everything and Fix Permissions

```bash
cd /Users/metinhakanokuyucu/rork-legal-meeting-assistant

# Kill any running Expo processes
pkill -f "expo"
pkill -f "react-native"

# Clean caches and derived data
rm -rf node_modules/.cache .expo ios/build
rm -rf ~/Library/Developer/Xcode/DerivedData
watchman watch-del-all 2>/dev/null || true

# Fix npm permissions (run this with sudo if needed)
npm cache clean --force
```

## Step 2: Install Dependencies and CocoaPods

```bash
# Install npm dependencies
npm install

# Install CocoaPods dependencies (required for iOS)
cd ios
pod install
cd ..
```

## Step 3: Set Up Your iOS Device

Make sure your physical iOS device is:
- Connected via USB
- Has "Developer Mode" enabled (Settings → Privacy & Security → Developer Mode)
- Is trusted on your Mac
- Has the same Apple ID as your developer account

## Step 4: Build and Run on Device

```bash
# Build and run on your connected iOS device
npx expo run:ios --device
```
