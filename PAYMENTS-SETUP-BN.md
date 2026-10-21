# AUREVIX — নিরাপদ Payment Integration (বাংলা)

## কী যোগ করা হয়েছে
- SSLCOMMERZ Hosted Checkout-এর server-side sandbox/live mode switch
- প্রতি checkout-এ unique transaction ID এবং SQLite `payment_orders` audit record
- Success callback ও IPN-এ gateway-এর Order Validation API দিয়ে যাচাই
- Transaction ID, amount এবং currency মিললেই verified payment record তৈরি
- duplicate callback পুনরায় record তৈরি করতে পারে না
- job-এর owner/client access যাচাই এবং checkout endpoint rate limit
- Frontend-এ কাজের পাশে `পেমেন্ট / ফান্ড করুন` action (ক্লায়েন্টের নিজের open job)

## এখনো যা চালু নয়
- আন্তর্জাতিক গ্রাহকের পেমেন্ট সক্ষমতা gateway/merchant account approval এবং card acceptance-এর ওপর নির্ভরশীল। SSLCOMMERZ documentation-এ currency conversion/BDT settlement বর্ণনা আছে; এটি নিজে থেকে international multi-currency settlement বা worker payout সমাধান নয়।
- Worker-কে automatic payout, escrow/trust account, refund workflow, dispute resolution এবং platform commission accounting এখনো implement/approve হয়নি।
- Production launch-এর আগে আইনগত/ব্যবসায়িক যোগ্যতা, merchant KYC, tax, refund/chargeback policy ও payment provider contract নিশ্চিত করতে হবে।

## Render Environment variables
Render Dashboard → Web Service → Environment-এ যোগ করো:

- `APP_BASE_URL=https://YOUR-SERVICE.onrender.com` (তোমার আসল Render URL)
- `SSLCOMMERZ_MODE=sandbox`
- `SSLCOMMERZ_STORE_ID=...` (sandbox store ID)
- `SSLCOMMERZ_STORE_PASSWORD=...` (sandbox store password)
- `SESSION_SECRET` (কমপক্ষে 32 অক্ষরের random secret)
- `OWNER_EMAIL` এবং শক্তিশালী `OWNER_PASSWORD`

Secrets কখনো GitHub, frontend code, screenshot বা public chat-এ দেবে না। Sandbox credentials আগে ব্যবহার করবে; real customer-এর টাকা নেবে না।

## SSLCOMMERZ merchant setup
1. Official developer portal-এ sandbox account তৈরি করে test store credentials নাও: https://developer.sslcommerz.com/
2. Sandbox mode-এ checkout, fail, cancel, duplicate callback, timeout ও IPN পরীক্ষা করো।
3. Gateway dashboard-এ IPN URL সেট করো: `https://YOUR-SERVICE.onrender.com/api/payments/sslcommerz/ipn`
4. Order validation সফল, transaction ID/amount/currency মিলেছে এবং database-এ একবারই verified হয়েছে—এসব পরীক্ষা করো।
5. Merchant onboarding/KYC শেষ করে live credentials provider-এর কাছ থেকে পাওয়ার পরেই `SSLCOMMERZ_MODE=live` করো।
6. Live-এর আগে HTTPS domain, persistent disk/database backup, logs/alerts, privacy policy, terms, refund and dispute process, security review এবং low-value test transaction সম্পন্ন করো।

## International payments
প্রথমে SSLCOMMERZ-কে স্থানীয় checkout ও provider-approved international card acceptance-এর জন্য ব্যবহার করা যেতে পারে। International customer-এর card acceptance এবং settlement terms merchant-এর লিখিত approval দিয়ে নিশ্চিত করতে হবে। বাংলাদেশে নিবন্ধিত ব্যবসার জন্য Stripe/PayPal availability ধরে নিয়ে code করা হয়নি। অন্য provider (যেমন international merchant-of-record/marketplace payout provider) নিতে হলে eligibility, supported country, fees, currency, tax এবং payout API যাচাই করে আলাদা adapter implement করতে হবে।

## API
- `GET /api/payments/config` — configured/mode info; কোনো secret ফেরত দেয় না
- `POST /api/payments/checkout` — authenticated client/owner/admin; JSON: `{ "jobId": 1, "phone": "+8801...", "address": "Dhaka" }`
- `POST/GET /api/payments/sslcommerz/success`
- `POST/GET /api/payments/sslcommerz/fail`
- `POST/GET /api/payments/sslcommerz/cancel`
- `POST/GET /api/payments/sslcommerz/ipn`

## Deploy সতর্কতা
SQLite database যদি Render-এর ephemeral filesystem-এ থাকে, redeploy/restart-এ data হারাতে পারে। Production-এ persistent disk সঠিকভাবে mount করা অথবা managed PostgreSQL-এ migrate করতে হবে। Payment integration sandbox-এ test ও production security review না হওয়া পর্যন্ত live payments চালু কোরো না।
