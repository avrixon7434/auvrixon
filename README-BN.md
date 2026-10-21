# AUREVIX MVP — Fresh Starter

এটি AUREVIX-এর নতুন, ছোট ও সম্প্রসারণযোগ্য MVP starter। প্রথম ধাপে এটি **ম্যানেজড সার্ভিস** হিসেবে কাজ চালানোর জন্য তৈরি: ক্লায়েন্ট কাজ জমা দেয়, অপারেশন টিম কাজ পরিচালনা করে, কর্মী কাজ সম্পন্ন করে, অ্যাডমিন অর্ডার ও পেমেন্ট রেকর্ড পর্যবেক্ষণ করে।

## কী আছে
- বাংলা-প্রথম responsive dashboard
- Owner, Admin/Operations, Client ও Worker role
- নিরাপদ পাসওয়ার্ড হ্যাশিং, session cookie, Helmet security headers, login rate limiting
- SQLite ডেটাবেস; প্রথম চালুতে ডেটা `data/aurevix.sqlite`-এ থাকবে
- কাজ তৈরি, তালিকা, কাজের অবস্থা আপডেট
- Admin overview ও user/job তালিকা
- পেমেন্ট রেকর্ডের demo status; **এটি বাস্তব টাকা নেয় না বা ছাড়ে না**
- প্রথম Owner account তৈরি করার one-time setup flow

## চালানোর নিয়ম
1. Node.js 20 বা তার পরের LTS সংস্করণ ইনস্টল করুন।
2. এই ফোল্ডারে terminal খুলুন।
3. `npm install`
4. `.env.example` কপি করে `.env` বানান এবং `SESSION_SECRET`, `OWNER_EMAIL`, `OWNER_PASSWORD` বদলান।
5. `npm start`
6. ব্রাউজারে `http://localhost:3000` খুলুন।
7. প্রথম চালুতে Owner account setup স্ক্রিন আসবে।

## গুরুত্বপূর্ণ নিরাপত্তা সীমা
এই starter-টি **production-ready payment platform নয়**। বাস্তব পেমেন্ট চালুর আগে:
- বাংলাদেশে ব্যবসা ও marketplace মডেল অনুযায়ী payment gateway-এর লিখিত অনুমোদন নিন।
- gateway-এর server-side signature/webhook যাচাই, idempotency, refund/chargeback handling এবং daily reconciliation বাস্তবায়ন করুন।
- কর্মীর টাকা ধরে রাখা বা পরে ছাড়ার জন্য অনুমোদিত settlement/escrow ব্যবস্থা ও স্থানীয় আইনগত পরামর্শ নিন।
- HTTPS, managed database/backups, email verification, password reset, CSRF strategy, audit log hardening, privacy/terms/refund policies, monitoring এবং security review যোগ করুন।
- production-এর আগে dependency audit ও penetration/security test করান।

## এখনো যা demo/placeholder
- পেমেন্টের কোনো বাস্তব লেনদেন হয় না।
- email/SMS verification, password reset, payout provider, file upload, dispute workflow, external client acquisition integrations এখনো যুক্ত নয়।
- Client/Worker onboarding বর্তমানে basic; বাস্তব পরিচয় যাচাই ও payout verification আলাদা করে তৈরি করতে হবে।
- Owner account প্রথমবার তৈরি হওয়ার পর setup বন্ধ হয়ে যায়; `.env`-এ production secret কখনো প্রকাশ করবেন না।

## Deployment
Render/Fly.io/অন্যান্য hosting-এ deploy করার আগে persistent disk/database এবং environment variables ঠিকভাবে সেট করতে হবে। ephemeral filesystem-এ SQLite রাখলে redeploy-এ data হারাতে পারে। Production-এ managed PostgreSQL ব্যবহার করা উত্তম; deployment guide ও migrations যুক্ত না করা পর্যন্ত এই starter-কে local pilot-এর বাইরে ব্যবহার করবেন না।

## পেমেন্ট গেটওয়ে (Sandbox first)

বাংলাদেশ ও আন্তর্জাতিক গ্রাহকের জন্য SSLCOMMERZ Hosted Checkout-এর server-side integration scaffold যোগ করা হয়েছে। চালুর আগে `PAYMENTS-SETUP-BN.md` অনুসরণ করে Render Environment-এ sandbox credentials বসাও। International card acceptance merchant approval ও provider terms-এর ওপর নির্ভরশীল; worker payout/escrow স্বয়ংক্রিয় নয়। Live payment চালুর আগে merchant KYC, legal/policy review, persistent database, security test এবং refund/dispute workflow নিশ্চিত করতে হবে।
