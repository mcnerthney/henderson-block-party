# Neighborhood Who's Who

Small mobile-friendly web app for a block party directory.

## Features

- Take a photo in the app with retake support, or upload one
- Add your name, house/address, optional interests, and either a photo or a description
- Search by name, address, or interests
- Browse neighbor photos
- Share the page with a QR code guests can scan
- Show a separate fun-facts page for Henderson Block Party history and trivia
- Show a standalone printable block party flyer page
- Give organizers a passcode-protected admin page to remove bad photos, remove bad names, or delete profiles

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:3010`.

For guests on the same Wi-Fi, open the app from your computer using your local network IP address before making the QR code so phones can reach it too.

## Admin moderation

- Open `http://localhost:3010/admin`
- Default admin code: `dan`
- To change it, start the server with `ADMIN_CODE=your-code npm start`

## Data storage

- Profiles are stored in `data/neighbors.json`
- Uploaded images are stored in `public/uploads/`
