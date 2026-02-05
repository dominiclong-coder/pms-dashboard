# PMS Claims Dashboard

Simple internal dashboard for viewing warranty and return claims from MyProductCares.

## Quick Start

```bash
# Install dependencies
npm install

# Set up your API token
cp .env.example .env.local
# Edit .env.local and add your NEXT_PUBLIC_API_TOKEN

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Features

- 📊 View warranty and return claims
- 🔍 Filter by product, SKU, reason, channel
- 📈 Charts for claims over time
- 🔄 Refresh button to fetch new claims

## Firestore Rules

For security, update your Firestore rules at:
https://console.firebase.google.com/project/pms-dashboard-62bc7/firestore/rules

**Simple rule (recommended for internal use):**

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;
      allow write: if request.time < timestamp.date(2027, 3, 7);
    }
  }
}
```

This allows:
- ✅ Public read (dashboard works)
- ✅ Writes until March 2027 (refresh button works)
- 🔒 Auto-locks in March 2027 (reminder to review)

## Deployment

Deploy to Vercel:

```bash
git push  # Vercel auto-deploys from main branch
```

Make sure to add `NEXT_PUBLIC_API_TOKEN` in Vercel environment variables.

## Data Sync

The dashboard loads data from Firebase and can refresh to get new claims. Data is synced by:
1. Initial load from Firebase (fast)
2. Refresh button fetches newest claims from API
3. Background scripts can be run to bulk sync data

---

**That's it!** Simple dashboard for internal use. 🎉
