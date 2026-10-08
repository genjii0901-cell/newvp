# Vocab Print Pro mobile

This is the native iOS/Android app project. The existing Next.js website in the repository root is unchanged.

## What works now

- Search the live public wordbook catalog and view each book's details.
- Study all public books for free with flashcards, four-choice questions, device text-to-speech, and sharing.
- Sign in to an existing Supabase account, create an email account, view the current web plan, sign out, and request account deletion.
- Printing and CSV export are paid features. The server checks the existing Web subscription or a store purchase before use; the client does not set its own plan.

This is a development build, **not a store release**. Native printing, CSV export and RevenueCat purchase UI have been added but cannot be used end-to-end until store products, RevenueCat, EAS keys and real-device testing are complete. PDF material sales are deferred. Google/LINE sign-in and My Wordbooks have not been ported yet. Do not submit the app or direct users to purchase digital goods on the website from inside the app until in-app billing and entitlement synchronization have been reviewed for both stores.

## Run locally

1. Copy `.env.example` to `.env.local`. Set the public Supabase URL and anon key used by the existing site. Do not put the service role or Stripe secret keys here.
2. Run `npm install` and `npm start` in this directory.
3. Use an EAS development build for purchase testing; Expo Go cannot exercise real in-app purchases. For iOS audio, disable silent mode.
4. Run `npm run typecheck`, `npx expo lint`, and `npx expo export --platform all` before publishing changes.

Expo Web is only a development preview. The live catalog endpoint does not currently grant cross-origin browser access, so catalog data must be checked in a native client.

## Before store submission

1. Confirm ownership of `com.vocabprint.mobile` in Apple Developer and Google Play Console, then connect the project to EAS. Do not replace an existing app ID without checking ownership.
2. Create the `personal` RevenueCat entitlement, attach App Store and Play monthly products, and set a current offering. Add public RevenueCat keys to EAS and `REVENUECAT_SECRET_API_KEY` only to the Next.js server. Do not trust client-side plan labels. Review [Apple's App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) and [Google Play's Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738).
3. Complete native printing, My Wordbooks, account recovery, store privacy disclosures, branded screenshots, real-device tests, and cancellation/account deletion checks.
4. Set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_APP_URL` for EAS Preview/Production. Never add server secrets to the mobile bundle.
5. Produce signed builds with EAS, test in TestFlight and Google Play internal testing, then submit for review. Store publication requires the owner's developer accounts, agreements, certificates, and review approval.
