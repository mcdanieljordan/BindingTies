# FamilyOS on Android

The app is the same React build wrapped by Capacitor (`app/android`, app id `com.familyos.app`).

## Build and run
```bash
cd app
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
Needs JDK 17+ and the Android SDK (`android/local.properties` holds `sdk.dir`, not committed).

## Calendar files
`MainActivity` + `IcsIntentPlugin` accept `.ics` files opened from other apps (VIEW / SEND, content:// URIs) and
`src/lib/native.ts` hands the text to the import dialog.
Not yet verified end to end with a real email attachment.

## Before the Play Store
1. Create an upload keystore, add signing config, build a release bundle: `./gradlew bundleRelease`.
2. Google sign-in must use a native flow (Google blocks OAuth inside embedded WebViews).
3. Replace Web Push with Firebase Cloud Messaging + native local notifications for alarms/timers.
4. Play Console ($25 one-time): data-safety form, privacy policy URL (`/privacy.html`), account deletion in app,
   closed test with 12 testers for 14 days (personal accounts).
