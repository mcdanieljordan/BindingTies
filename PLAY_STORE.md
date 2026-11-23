# BindingTies: Google Play checklist and listing

## 0. Back these up first (you cannot recreate them)
- `app/android/keystore/bindingties-upload.jks`
- `app/android/keystore.properties` (holds the passwords)
Copy both to a password manager or an encrypted drive. Both are gitignored on purpose. Play App Signing means Google holds the real signing key, so a lost upload key can be reset through Play support, but it is slow. Upload key SHA-256: `94:AC:7B:E4:85:7D:3C:E9:DB:6E:5B:C9:7D:1E:06:35:02:30:ED:DD:7F:AC:01:7C:3A:4B:81:3C:4A:E2:17:5E`

## 1. Your steps
1. Create a Play Console developer account (one-time $25, ID verification). Choose "Personal" unless you have a business.
2. Create app: name BindingTies, language English (US), App, Free.
3. Fill the sections below (copy and paste from this file).
4. Upload `release/BindingTies-1.0.0.aab` to **Testing > Closed testing**.
5. Personal accounts created after Nov 2023 must run a closed test with **at least 12 testers opted in for 14 days** before applying for production. Add testers by email list (family and friends with Gmail).
6. After the 14 days, apply for production access, then create a production release.

## 2. Store listing
- **App name:** BindingTies
- **Short description (80 max):** Family calendar, chores, routines, journals and emergency info in one place.
- **Category:** Parenting (alternative: Productivity)
- **Contact email:** mcdanieljordan@gmail.com
- **Privacy policy URL:** https://mcdanieljordan.github.io/BindingTies/privacy.html
- **Account deletion URL:** https://mcdanieljordan.github.io/BindingTies/delete-account.html

**Full description:**

The ties that bind: BindingTies keeps your whole family on the same page.

CALENDAR
Add events, share who is going and who is driving, and import .ics files or follow a calendar link (school, sports, church) so it stays up to date.

CHORES AND FAMILY TEAM
Assign chores, rotate turns daily or weekly, let kids check them off and parents approve. A friendly weekly leaderboard and shared family quests reward effort, not just winning.

PICTURE ROUTINES
Step-by-step routines with pictures for morning, after school and bedtime. One tap per step, printable for the fridge.

JOURNALS AND GOALS
Everyone gets a private journal by default. Add photos, video and voice notes, set plans and goals, share only what you choose, and print or save a PDF of any date range. Parents can see a young child's journal (under 15) with a clear notice; teens 15 and over keep full privacy. Optional PIN lock.

EMERGENCY CARD AND SITTER LINKS
Keep allergies, medicines, doctors and contacts ready. Send a babysitter a read-only link that expires on its own and can be turned off any time.

PRIVATE AND FAMILY-OWNED
Works offline and syncs between family members. No ads, no tracking. You can delete your account and data inside the app.

## 3. Graphics (in `release/store/`)
- App icon: `app-icon-512.png`
- Feature graphic: `feature-graphic-1024x500.png`
- Phone screenshots: `phone-1-today.png` … `phone-8-sitter.png` (all show sample family data)
- Tablet screenshots are optional; skip for now.

## 4. App content declarations
- **Privacy policy:** URL above.
- **Ads:** No ads.
- **App access:** Needs a login. Give reviewers a test account: create an email + password account with a sample family in the app and enter it under "App access". (Do not use your real family's account.)
- **Account deletion:** In-app: Settings > Sync > Delete my account. Web: URL above.
- **Content rating (IARC questionnaire):** Category "Utility/Reference/other". Answer No to violence, sexual content, language, controlled substances, gambling. "Users can interact / share user-generated content": Yes, only within a private family group (no public sharing). Location sharing: No. Expect Everyone/PEGI 3.
- **Target audience:** Choose **18 and over** (parents are the account holders; children use under a parent's setup). This avoids the Families Policy requirements. If you later want to market to children, that is a bigger review.
- **Government app / financial features / news:** No.
- **Health apps declaration:** It stores medication and allergy notes the family types in, but gives no medical advice or diagnosis. Declare as "not a health app" if the options are Medical device / Health research / Disease management; if asked about "health & fitness data", answer yes to storing user-entered medication info.

## 5. Data safety form
Data is encrypted in transit: **Yes**. Users can request deletion: **Yes** (in-app and web URL). Data is **not sold**. Nothing is shared with third parties for advertising. Supabase (hosting) and Firebase Cloud Messaging (notifications) act as service providers; mark as "processed on your behalf", not "shared".

| Data type | Collected | Purpose | Optional |
|---|---|---|---|
| Email address | Yes | Account management | Required to sync (app works locally without) |
| Name (family member names) | Yes | App functionality | Required |
| Photos and videos | Yes | App functionality (journal) | Optional |
| Voice or sound recordings | Yes | App functionality (journal voice notes) | Optional |
| Health info (medicines, allergies, conditions the user types) | Yes | App functionality | Optional |
| Other user-generated content (events, chores, journal text) | Yes | App functionality | Required |
| Device or other IDs (push token) | Yes | App functionality (reminders) | Optional |
| Location, contacts, financial, web history | No | | |

## 6. Permissions rationale
- INTERNET / network state: sync between family members.
- RECORD_AUDIO: optional journal voice notes; requested only when you tap record.
- POST_NOTIFICATIONS: reminders and chore alerts.

## 7. Updating later
Bump `versionCode` (and `versionName`) in `app/android/app/build.gradle`, then:
```bash
cd app && npm run build && npx cap sync android
cd android && find app/src -name "* [0-9]*" -delete && rm -rf app/build && ./gradlew bundleRelease
```
The signed file appears at `app/android/app/build/outputs/bundle/release/app-release.aab`.

## 8. Not verified on a real phone yet
Google sign-in, voice recording, PDF share sheet, opening .ics from email, and sitter/emergency pages. Test these during the closed test.
