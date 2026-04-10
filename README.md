# Kids Reading Tracker

Mobile-friendly book tracker for Alex and Hannah.

## Deploy to Vercel

1. Create a new GitHub repo, push these files
2. Go to vercel.com → New Project → import the repo
3. Add environment variable: `ANTHROPIC_API_KEY` = your Anthropic API key
4. Deploy

That's it. The app will be live at your Vercel URL.

## How it works

- Enter a book title and tap "Look Up Page Count" — the server calls Claude to find author + pages
- If lookup fails, just type the pages manually (always works)
- Pick Alex or Hannah, hit Save
- Running totals shown on home screen
- Data stored in browser localStorage on your phone

## Files

- `pages/index.js` — the whole app (one file)
- `pages/api/lookup.js` — server-side book lookup (calls Anthropic API)
- `package.json` — dependencies

## Getting your Anthropic API key

Go to console.anthropic.com → API Keys → Create Key
