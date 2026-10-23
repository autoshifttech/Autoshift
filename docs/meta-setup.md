# Meta setup for WhatsApp Embedded Signup

Do these once per environment (staging and production can use separate Meta apps).

## 1. Create the Meta app
1. In [developers.facebook.com](https://developers.facebook.com/apps), create an app of type **Business** and link your business portfolio.
2. Add the **WhatsApp** and **Facebook Login for Business** products.
3. **App settings → Basic:** copy the App ID (`META_APP_ID`, `VITE_META_APP_ID`) and App secret (`META_APP_SECRET`, backend only). Add your privacy-policy URL and app domain.

## 2. Create the Embedded Signup configuration
1. **Facebook Login for Business → Configurations → Create configuration.**
2. Choose **WhatsApp Embedded Signup** as the login variation and the permissions `whatsapp_business_management` and `whatsapp_business_messaging`.
3. Copy the configuration ID into `VITE_META_CONFIG_ID`.

## 3. Allow your domains
- **Facebook Login for Business → Settings:** add `https://app.<your-domain>` (and `https://localhost:5173` for local testing through a tunnel) to *Allowed domains for the JavaScript SDK*. Enable *Login with the JavaScript SDK*.
- The JS SDK only works on HTTPS pages.

## 4. Configure webhooks
1. **WhatsApp → Configuration → Webhook:**
   - Callback URL: `https://api.<your-domain>/webhooks/whatsapp`
   - Verify token: the value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
2. Subscribe to the **messages** and **account_update** fields.
3. The API subscribes each connected WABA to your app automatically (`POST /{waba_id}/subscribed_apps`).

Meta signs every delivery with `X-Hub-Signature-256` using the app secret. The API rejects unsigned or mis-signed requests.

## 5. Go live
- Until you complete business verification and the **Tech Provider** onboarding, and get Advanced Access for the two WhatsApp permissions, only businesses with a role on your app can complete signup.
- Use the Graph API version your app is pinned to in both `META_GRAPH_VERSION` and `VITE_META_GRAPH_VERSION`.

## Things to verify against current Meta docs before launch
Meta changes these flows regularly. These values were written from the documented flow and checked only against mocked responses, never a live Meta app:
- the `FB.login` `extras` keys (`setup`, `sessionInfoVersion: "3"`, and `featureType: "whatsapp_business_app_onboarding"` for coexistence),
- the `WA_EMBEDDED_SIGNUP` event names (`FINISH`, `FINISH_ONLY_WABA`, `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, `CANCEL`, `ERROR`),
- the phone-number fields requested in `backend/app/services/meta_graph.py` (`PHONE_NUMBER_FIELDS`),
- the `account_update` event names mapped in `backend/app/services/webhooks.py`.
