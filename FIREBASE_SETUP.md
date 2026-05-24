# Firebase Setup Instructions

## 1. Create Firestore Database

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your `nikkishakes-cbe23` project
3. Click **Firestore Database** in the left menu
4. Click **Create Database**
5. Choose **Start in production mode**
6. Select region: `us-central1` (or closest to you)
7. Click **Create**

## 2. Set Security Rules

Once Firestore is created:

1. Go to **Firestore Database** → **Rules** tab
2. Replace the rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /shakes/{document=**} {
      // Everyone can read all shakes
      allow read: if true;
      
      // Only authenticated users can write/update/delete
      allow write: if request.auth != null;
    }
  }
}
```

3. Click **Publish**

## 3. Enable Authentication (Required for Writes)

Because rules require `request.auth != null`, enable Firebase Auth anonymous sign-in:

1. Go to **Authentication** → **Sign-in method**
2. Enable **Anonymous** provider
3. Click **Save**

## 4. Verify Setup

Your app should now:
- ✅ Load shakes from Firestore in real-time
- ✅ Auto-seed with sample data on first load
- ✅ Show updates to all connected users instantly
- ✅ Only allow authenticated users to add/edit/delete shakes
- ✅ Allow everyone to view rankings

## Troubleshooting

**Issue: "No collection found"**
- The app will auto-create the `shakes` collection and seed it on first load

**Issue: "Permission denied"**
- Make sure security rules are published
- Make sure Anonymous auth is enabled in Firebase Authentication
- Make sure you're authenticated when trying to add/edit

**Issue: Data not syncing in real-time**
- Check browser console for errors (F12)
- Verify Firestore is enabled and accessible
