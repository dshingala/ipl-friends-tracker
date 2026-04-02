# 🏏 IPL Friends Tracker — Complete Setup Guide
### Zero cost. Fully automated. WhatsApp updates after every match.

---

## How it works

```
Every evening after IPL match ends
        ↓
App fetches scores from Cricbuzz (free)
        ↓
Calculates runs for each friend's IPL players
        ↓
Sends WhatsApp message to everyone automatically
        ↓
Live dashboard always shows current standings
```

---

## STEP 1 — Set up WhatsApp (CallMeBot) — 5 minutes

Each friend who wants to **receive** the daily update must do this **once**:

1. Open WhatsApp on your phone
2. Add this number as a contact: **+34 644 59 86 51** (name it "CallMeBot")
3. Send this exact message to that number:
   ```
   I allow callmebot to send me messages
   ```
4. Within 2 minutes, you'll receive a reply like:
   ```
   API Activated for your phone. Your APIKEY is: abc123
   ```
5. **Save that API key** — you'll need it below

> ✅ This is completely free. CallMeBot is a free service used by thousands of developers.

---

## STEP 2 — Get the code on your computer — 5 minutes

### Option A: Download ZIP (easiest)
1. Go to your GitHub repository (after Step 3)
2. Click green **Code** button → **Download ZIP**
3. Extract the ZIP anywhere on your computer

### Option B: If you have Git installed
```bash
git clone https://github.com/YOUR_USERNAME/ipl-friends-tracker.git
cd ipl-friends-tracker
```

---

## STEP 3 — Put the code on GitHub (free) — 5 minutes

You need a **free GitHub account** to host the code.

1. Go to **https://github.com** → Sign up (free)
2. Click **New repository** (the + button top right)
3. Name it: `ipl-friends-tracker`
4. Keep it **Public** (required for free hosting)
5. Click **Create repository**

### Upload your files:
1. On the empty repo page, click **uploading an existing file**
2. Drag and drop ALL files from the `ipl-tracker` folder you received
3. Click **Commit changes**

---

## STEP 4 — Deploy to Render.com (free hosting) — 10 minutes

Render gives you a **free server** that runs 24/7.

1. Go to **https://render.com** → Sign up with your GitHub account (free)
2. Click **New** → **Web Service**
3. Connect your GitHub account if asked
4. Select your `ipl-friends-tracker` repository
5. Render will auto-detect the settings from `render.yaml`
6. Click **Create Web Service**

### Add your WhatsApp numbers:
On the Render dashboard, go to **Environment** tab and add:

| Key | Value |
|-----|-------|
| `WHATSAPP_RECIPIENTS` | `919876543210:abc123,919876543211:def456` |

**Format:** `CountryCode+PhoneNumber:YourAPIKey` comma separated  
**Example for India (+91):** `919876543210:abc123`

> Add as many friends as you want, comma separated. Each person needs their own API key from Step 1.

7. Click **Save Changes** → Render restarts automatically

---

## STEP 5 — Test it — 2 minutes

1. Render gives you a URL like: `https://ipl-friends-tracker.onrender.com`
2. Open that URL in your browser — you'll see the dashboard
3. Click **Refresh Scores** to fetch live IPL data (takes ~30 seconds)
4. Click **Send to WhatsApp** to test — everyone gets a message immediately

---

## STEP 6 — That's it! You're done 🎉

From now on, **every evening after the IPL match ends**, the app will:
- Automatically fetch the latest scores from Cricbuzz
- Update the leaderboard
- Send a WhatsApp message to everyone in your list

**No one needs to do anything manually.**

---

## Adding more friends later

Just ask them to do Step 1, then add their number to the `WHATSAPP_RECIPIENTS`
environment variable on Render (comma separated).

---

## Your live dashboard

Share this URL with your friends: `https://ipl-friends-tracker.onrender.com`

They can check the leaderboard anytime, even without WhatsApp.

---

## Troubleshooting

### WhatsApp message not received?
- Make sure the friend sent the activation message to +34 644 59 86 51
- Check the API key is correct (no spaces)
- Phone number must include country code (91 for India, not 0)

### Scores not updating?
- Click **Refresh Scores** manually from the dashboard
- Cricbuzz sometimes blocks scraping — the app retries automatically

### Render app is sleeping?
- Free tier on Render sleeps after 15 minutes of no traffic
- The cron job will wake it up automatically
- Or visit the dashboard URL to wake it

### Want to update player assignments?
- Edit `src/data.js` on GitHub
- Render will automatically redeploy within 2 minutes

---

## Cost breakdown

| Service | Cost |
|---------|------|
| GitHub | FREE |
| Render.com hosting | FREE |
| CallMeBot WhatsApp API | FREE |
| Cricbuzz score data | FREE |
| **Total** | **$0.00** |

---

## Files in this project

```
ipl-tracker/
├── src/
│   ├── server.js      ← Main app + web server + cron scheduler
│   ├── scraper.js     ← Fetches IPL scores from Cricbuzz
│   ├── calculator.js  ← Maps player rankings to friend scores
│   ├── whatsapp.js    ← Sends WhatsApp messages via CallMeBot
│   ├── db.js          ← Saves scores to a JSON file
│   └── data.js        ← Your group assignments & player lists
├── public/
│   └── index.html     ← Live dashboard website
├── .env.example       ← Template for your private settings
├── package.json       ← Node.js dependencies
├── render.yaml        ← Render.com deployment config
└── SETUP.md           ← This file
```
