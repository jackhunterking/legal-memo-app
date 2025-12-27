# TestFlight Submission Guide for Legal Memo

This comprehensive guide walks you through the entire process of building, uploading, and distributing your Legal Memo app via TestFlight.

## Table of Contents

1. [Pre-Submission Checklist](#pre-submission-checklist)
2. [Apple Developer Portal Setup](#apple-developer-portal-setup)
3. [App Store Connect Setup](#app-store-connect-setup)
4. [Environment Configuration](#environment-configuration)
5. [Building the App](#building-the-app)
6. [Uploading to TestFlight](#uploading-to-testflight)
7. [Managing TestFlight](#managing-testflight)
8. [Submitting Updates](#submitting-updates)
9. [Common Issues and Solutions](#common-issues-and-solutions)
10. [Version Management](#version-management)

---

## App Configuration Summary

| Setting | Value |
|---------|-------|
| **Bundle Identifier** | `app.uselegalmemo.ios` |
| **Team ID** | `6G65A4B7Y5` |
| **App Name** | Legal Memo |
| **URL Scheme** | `legalmemo` |
| **Associated Domain** | `use.legalmemo.app` |

---

## Pre-Submission Checklist

Before building for TestFlight, verify the following:

### Code Configuration

- [x] Bundle Identifier: `app.uselegalmemo.ios`
- [x] Team ID: `6G65A4B7Y5`
- [x] `CODE_SIGN_IDENTITY` is set to `iPhone Distribution` for Release builds
- [x] URL scheme is set to `legalmemo`
- [x] Associated Domains configured for `use.legalmemo.app`

### Apple Developer Portal

- [ ] App ID created with Bundle ID: `app.uselegalmemo.ios`
- [ ] Associated Domains capability enabled

### App Store Connect

- [ ] App created with Bundle ID: `app.uselegalmemo.ios`
- [ ] App name: Legal Memo

### Environment Variables

- [ ] Production Supabase URL and Anon Key configured
- [ ] Polar checkout URL and Product Price ID configured

---

## Apple Developer Portal Setup

### Step 1: Sign In

1. Go to [Apple Developer Portal](https://developer.apple.com/account)
2. Sign in with your Apple ID
3. Click **Certificates, Identifiers & Profiles**

### Step 2: Create or Edit App ID (Identifier)

Since you already have `app.uselegalmemo.ios`, you need to configure it:

1. In the left sidebar, click **Identifiers**
2. Find and click on **"XC app uselegalmemo ios"** (or similar name)
3. In **Capabilities**, ensure these are enabled:
   - ✅ **Associated Domains**
4. Click **Save**

If creating new:
1. Click the **+** button
2. Select **App IDs** → Continue → **App** → Continue
3. Fill in:
   - Description: `Legal Memo iOS App`
   - Bundle ID: `Explicit` → `app.uselegalmemo.ios`
4. Enable **Associated Domains**
5. Click **Continue** → **Register**

---

## App Store Connect Setup

### Step 1: Sign In

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Sign in with your Apple ID

### Step 2: Create New App

1. Click **My Apps** → **+** → **New App**
2. Fill in:

   | Field | Value |
   |-------|-------|
   | Platforms | ✅ iOS |
   | Name | `Legal Memo` |
   | Primary Language | English (U.S.) |
   | Bundle ID | Select `app.uselegalmemo.ios` from dropdown |
   | SKU | `legalmemo-ios-001` |
   | User Access | Full Access |

3. Click **Create**

---

## Environment Configuration

### Step 1: Create Production Environment File

Your app needs environment variables for Supabase and Polar. Create a `.env.production` file:

```bash
# In your project root, create .env.production with:

EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key_here
EXPO_PUBLIC_POLAR_CHECKOUT_URL=https://checkout.polar.sh/your-checkout-url
EXPO_PUBLIC_POLAR_PRODUCT_PRICE_ID=your_price_id_here
EXPO_PUBLIC_SHARE_VIEWER_URL=https://share-viewer.vercel.app
```

### Step 2: Configure Associated Domains (Server-Side)

Your server at `use.legalmemo.app` needs to host the Apple App Site Association file.

**File location**: `https://use.legalmemo.app/.well-known/apple-app-site-association`

**File content**:
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "6G65A4B7Y5.app.uselegalmemo.ios",
        "paths": ["*"]
      }
    ]
  }
}
```

**Requirements**:
- Served with `Content-Type: application/json`
- Accessible over HTTPS without redirects
- No file extension (not `.json`)

---

## Building the App

### Step 1: Clean Previous Builds

```bash
cd /Users/metinhakanokuyucu/rork-legal-meeting-assistant

# Remove old build artifacts
rm -rf ios/build
rm -rf ios/Pods
rm -rf ios/Podfile.lock
```

### Step 2: Install Dependencies

```bash
# Install npm packages
npm install

# Regenerate iOS project with latest config
npx expo prebuild --platform ios --clean
```

### Step 3: Install CocoaPods

```bash
cd ios
pod install --repo-update
cd ..
```

### Step 4: Open in Xcode

```bash
open ios/LegalMemo.xcworkspace
```

**⚠️ Important**: Always open `.xcworkspace`, NOT `.xcodeproj`!

### Step 5: Verify Signing in Xcode

1. In Xcode, select **LegalMemo** project in the left navigator
2. Select **LegalMemo** under TARGETS
3. Go to **Signing & Capabilities** tab
4. Verify these settings:

   | Setting | Value |
   |---------|-------|
   | Automatically manage signing | ✅ Checked |
   | Team | Your Apple Developer Team |
   | Bundle Identifier | `app.uselegalmemo.ios` |

5. Check that these capabilities are listed:
   - Associated Domains (showing `applinks:use.legalmemo.app`)
   - Background Modes (with Audio enabled)

### Step 6: Select Build Destination

1. In the Xcode toolbar, click the device selector
2. Select **Any iOS Device (arm64)**

### Step 7: Archive the App

1. From menu: **Product** → **Archive**
2. Wait for build to complete (5-15 minutes)
3. When done, the **Organizer** window opens automatically

Option 1: Archive for TestFlight (For Distribution)

In Xcode, select the build scheme:

Top toolbar: Click the scheme selector next to the device dropdown
Make sure it says "LegalMemo" and "Release" (not Debug)
If it says Debug, click Edit Scheme → Run → Build Configuration → Change to "Release"
Select the correct destination:
Click the device selector in the toolbar
Choose "Any iOS Device (arm64)" (not a simulator or specific device)

Archive the app:
Go to menu: Product → Archive (NOT "Run")
This will create a production build for TestFlight
Option 2: Test Locally in Release Mode (Optional)
If you want to test the actual production version on your device before uploading:
Change build scheme to Release:
Click scheme selector → Edit Scheme
Under Run → Build Configuration → Select "Release"
Click Close
Select your connected device in the device selector
Product → Run (▶️ button)
This will install the production version on your device for testing.
The key difference:
Debug/Development mode = Shows that development server screen
Release/Archive mode = Production app ready for TestFlight
Once you archive it correctly (Option 1), you'll get the Organizer window where you can upload to TestFlight!

---

## Uploading to TestFlight

### Using Xcode (Recommended)

1. In **Organizer** window (Window → Organizer if not visible)
2. Select your latest archive (LegalMemo, today's date)
3. Click **Distribute App** button
4. Select **App Store Connect** → Click **Next**
5. Select **Upload** → Click **Next**
6. Options screen - leave defaults:
   - ✅ Upload your app's symbols
   - ✅ Manage Version and Build Number
7. Click **Next**
8. Wait for Xcode to prepare and sign the app
9. Review summary → Click **Upload**
10. Wait for upload to complete
11. You'll see "App was successfully uploaded" when done

### Alternative: Using Transporter App

1. In Organizer, click **Distribute App**
2. Select **Custom** → **App Store Connect** → **Export**
3. Save the `.ipa` file
4. Download **Transporter** from Mac App Store
5. Open Transporter, sign in with Apple ID
6. Drag the `.ipa` file into Transporter
7. Click **Deliver**

---

## Managing TestFlight

### Accessing Your Build

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click **My Apps** → Select **Legal Memo**
3. Click **TestFlight** tab

### Build Processing

After upload:
- Status shows **Processing** (5-30 minutes typically)
- You'll receive an email when processing completes
- Status changes to **Ready to Submit** (or shows issues)

### Adding Test Information

Before distributing to testers:

1. Click on your build version
2. Fill in **Test Information**:

   | Field | Suggested Value |
   |-------|-----------------|
   | What to Test | "Please test the recording feature, meeting summaries, and contact management. Report any crashes or issues." |
   | Beta App Description | "Legal Memo helps you record, transcribe, and summarize meetings with AI-powered intelligence." |
   | Feedback Email | your-email@example.com |

### Internal Testing (Your Team)

Internal testers are App Store Connect users on your team:

1. Go to **TestFlight** → **Internal Testing** section
2. Click **+** next to "Internal Testing"
3. Create a group: `Development Team`
4. Add team members by selecting them
5. Click **Create**
6. Build is immediately available to internal testers

### External Testing (Beta Users)

External testers require Apple's Beta App Review:

1. Go to **TestFlight** → **External Testing**
2. Click **+** to create a group (e.g., `Beta Testers`)
3. Click **Add Testers**:
   - **By email**: Enter email addresses
   - **Public link**: Generate a shareable link
4. Click **Submit for Beta App Review**
5. Wait 24-48 hours for review
6. Once approved, testers receive email invitations

### Public Link (Easy Distribution)

1. In External Testing group, enable **Public Link**
2. Set tester limit (up to 10,000)
3. Copy and share the link
4. Anyone with link can join TestFlight

---

## Submitting Updates

### Version vs Build Numbers

| Type | Example | When to Increment |
|------|---------|-------------------|
| Version (CFBundleShortVersionString) | `1.0.0` | Major features, public releases |
| Build (CFBundleVersion) | `1`, `2`, `3` | Every TestFlight upload |

### Update Workflow

1. Make your code changes
2. **Increment build number** (required for each upload)
3. Clean and rebuild:
   ```bash
   rm -rf ios/build
   cd ios && pod install && cd ..
   open ios/LegalMemo.xcworkspace
   ```
4. Archive in Xcode (**Product** → **Archive**)
5. Upload to App Store Connect
6. Existing testers are automatically notified

### Incrementing Build Number

**Option 1: In Xcode**
1. Select project → Target → General tab
2. Increment the **Build** field (e.g., `1` → `2`)

**Option 2: In app.json**
```json
{
  "expo": {
    "version": "1.0.0",
    "ios": {
      "buildNumber": "2"
    }
  }
}
```
Then run: `npx expo prebuild --platform ios`

---

## Common Issues and Solutions

### "No signing certificate found"

**Solution**:
1. Xcode → Preferences → Accounts
2. Select Apple ID → Manage Certificates
3. Click **+** → **Apple Distribution**

### "App ID not found" or "Bundle ID not registered"

**Solution**:
1. Verify Bundle ID is exactly `app.uselegalmemo.ios`
2. Check App ID exists in Apple Developer Portal
3. Run: `npx expo prebuild --platform ios --clean`

### Build Processing Stuck

- Wait up to 24 hours
- Try uploading again with incremented build number
- Contact Apple Developer Support if still stuck

### "Invalid Binary" Error

Check email from Apple for specifics. Common causes:
- Missing privacy descriptions in Info.plist
- Invalid entitlements
- Missing app icons

### Pod Install Fails

```bash
cd ios
rm -rf Pods Podfile.lock
pod cache clean --all
pod install --repo-update
```

---

## Version Management

### Semantic Versioning

| Change | Version | Example |
|--------|---------|---------|
| Bug fixes | Patch | 1.0.0 → 1.0.1 |
| New features | Minor | 1.0.1 → 1.1.0 |
| Breaking changes | Major | 1.1.0 → 2.0.0 |

### Build Number Strategy

Use sequential numbers: `1`, `2`, `3`, `4`...

Each TestFlight upload needs a unique, higher build number.

---

## Quick Command Reference

```bash
# Full clean build
cd /Users/metinhakanokuyucu/rork-legal-meeting-assistant
rm -rf ios/build ios/Pods ios/Podfile.lock
npm install
npx expo prebuild --platform ios --clean
cd ios && pod install --repo-update && cd ..
open ios/LegalMemo.xcworkspace

# Quick rebuild (after code changes)
rm -rf ios/build
cd ios && pod install && cd ..
open ios/LegalMemo.xcworkspace

# Check current version
grep -A1 "CFBundleVersion" ios/LegalMemo/Info.plist
```

---

## Summary: First-Time Setup Steps

1. ✅ **Apple Developer Portal**: Ensure App ID `app.uselegalmemo.ios` has Associated Domains enabled
2. ✅ **App Store Connect**: Create app with Bundle ID `app.uselegalmemo.ios`
3. ✅ **Server**: Host apple-app-site-association file at `use.legalmemo.app`
4. ✅ **Local**: Create `.env.production` with your values
5. ✅ **Build**: Run clean build commands
6. ✅ **Xcode**: Archive and Upload
7. ✅ **App Store Connect**: Add testers in TestFlight

---

## Support Resources

- [Apple Developer Documentation](https://developer.apple.com/documentation/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [TestFlight Documentation](https://developer.apple.com/testflight/)
- [Expo Documentation](https://docs.expo.dev/)
