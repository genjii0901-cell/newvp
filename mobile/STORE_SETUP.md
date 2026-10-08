# App Store / Google Play setup

The native app offers **free learning and sharing**. Printing and CSV export require Personal or Teacher. PDF material sales are deferred. Do not advertise in-app payment as live until both store purchase flows pass device testing.

1. Confirm the iOS bundle identifier and Android package in `app.json` belong to this app. Do not reuse an existing identifier by guesswork.
2. In App Store Connect and Google Play Console, create the app and one auto-renewing **monthly Personal** product for each store. Enter the actual price and any introductory offer in the stores. Verify displayed renewal terms and local consumer-law disclosures.
3. Create a RevenueCat project, connect both store apps and products, create a `personal` entitlement, and attach both products to one current offering with a monthly package. The app intentionally selects only the monthly package.
4. Put the **public platform SDK keys** in EAS as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`. Set Supabase public URL/anon key and `EXPO_PUBLIC_APP_URL` in EAS too. Never place a RevenueCat secret, Stripe secret, or Supabase service role in an Expo environment variable.
5. Put the **RevenueCat secret REST API key** in the Next.js/Vercel server as `REVENUECAT_SECRET_API_KEY` for Production and Preview. Redeploy after setting it. The server verifies the entitlement; the app does not grant itself access.
6. Create EAS development builds. Test new purchase, restoration, renewal, expiry, cancellation, sign-out, and the same account on both devices. Test existing Stripe subscribers too. An Expo Go session cannot validate real purchases.
7. On a real device, test Japanese A4 print output and CSV sharing. The initial app print layout has three modes and a 20-page cap; it does not yet have all Web layout controls or range selection. Review before store submission.
8. Complete privacy labels, subscription terms, screenshots, App Store/Play agreements and tax/banking setup. Submit to TestFlight and Play internal testing first, then review.

The Web plan display is Stripe-based. A store purchase is checked separately for app printing/CSV and appears as Personal in the mobile account view. Cross-platform entitlement display and account-management synchronization need a separate review before launch.
