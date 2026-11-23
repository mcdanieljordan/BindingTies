# BindingTies on Android

The app is the same React build wrapped by Capacitor (`app/android`, app id `com.bindingties.app`).

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

## Native Google sign-in and push (setup)
- Google sign-in opens the phone's browser and returns via `com.bindingties.app://auth`.
  Add that URL to Supabase → Authentication → URL Configuration → Redirect URLs.
- Push uses Firebase Cloud Messaging:
  1. Firebase console → add project → add Android app `com.bindingties.app` → download `google-services.json` into `app/android/app/`.
  2. Firebase → Project settings → Service accounts → generate a private key (JSON) and save it as the Supabase
     Edge Function secret `FCM_SERVICE_ACCOUNT` (paste the whole JSON).
  3. Redeploy `send-due` (it sends to FCM tokens stored as `fcm:<token>` in `push_subscriptions`).
