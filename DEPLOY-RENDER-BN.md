# Render deploy checklist (বাংলা)

- Runtime: Node 20+
- Build command: `npm install`
- Start command: `npm start`
- Environment: `NODE_ENV=production`
- `SESSION_SECRET`: random unique string, কমপক্ষে 32 characters
- `OWNER_EMAIL`: তোমার Owner login email
- `OWNER_PASSWORD`: unique strong password, কমপক্ষে 14 characters
- SQLite `data/` folder-এর জন্য persistent disk mount করতে হবে; না হলে redeploy/restart-এ data হারাতে পারে। Render service-এর disk mount path যেন project-এর `data` directory-তে হয় এবং সেটি plan অনুযায়ী supported হয়।
- প্রথমবার deploy করার পরে one-time Owner Setup page-এ `.env`/environment-এর একই email/password দিয়ে owner তৈরি করো। Owner তৈরি হয়ে গেলে one-time setup বন্ধ হয়ে যাবে।
- Live payment gateway credentials যোগ করার আগে `PAYMENTS-SETUP-BN.md` সম্পূর্ণ অনুসরণ করো।
- Production launch-এর আগে HTTPS, backup/restore, email verification, password reset, CSRF protection, file upload scanning, terms/privacy/refund/dispute policy এবং security review সম্পন্ন করা বাকি।
