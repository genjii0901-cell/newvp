# Vocab Print Pro mobile

This is the native iOS/Android app project. The existing Next.js website in the repository root is unchanged.

## What works now

- Search the live public wordbook catalog and view each book's details.
- Study Free books with flashcards, four-choice questions, and device text-to-speech.
- Sign in to an existing Supabase account, create an email account, view the current web plan, sign out, and request account deletion.
- Existing Personal/Teacher members can study their eligible books after server-side plan verification. The client does not set its own plan.

This is a development build, **not a store release**. Printing, one-off PDF purchases, subscriptions, Google/LINE sign-in, and My Wordbooks have not been ported yet. Do not submit the app or direct users to purchase digital goods on the website from inside the app until in-app billing and entitlement synchronization have been reviewed for both stores.

## Run locally

1. Copy `.env.example` to `.env.local`. Set the public Supabase URL and anon key used by the existing site. Do not put the service role or Stripe secret keys here.
2. Run `npm install` and `npm start` in this directory.
3. Open with Expo Go on a physical device. For iOS audio, disable silent mode.
4. Run `npm run typecheck`, `npx expo lint`, and `npx expo export --platform all` before publishing changes.

Expo Web is only a development preview. The live catalog endpoint does not currently grant cross-origin browser access, so catalog data must be checked in a native client.

## Before store submission

1. Confirm ownership of `com.vocabprint.mobile` in Apple Developer and Google Play Console, then connect the project to EAS. Do not replace an existing app ID without checking ownership.
2. Add platform billing for Personal and PDF products where required by [Apple's App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) and [Google Play's Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738). Verify receipts server-side and merge entitlements with the existing Stripe/web subscriptions. Do not trust client-side plan labels.
3. Complete native printing, My Wordbooks, account recovery, store privacy disclosures, branded screenshots, real-device tests, and cancellation/account deletion checks.
4. Set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_APP_URL` for EAS Preview/Production. Never add server secrets to the mobile bundle.
5. Produce signed builds with EAS, test in TestFlight and Google Play internal testing, then submit for review. Store publication requires the owner's developer accounts, agreements, certificates, and review approval.
