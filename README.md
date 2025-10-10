## 15funs

A static web app you can host on GitHub Pages. It loads ideas from a CSV/JSON in the repo, shuffles with
“no recent repeats,” and keeps history in `localStorage`.

### 1) Repo structure
```
/
index.html
style.css
app.js
/data
ideas.csv   # edit me (or use ideas.json)
```

### 2) Enable GitHub Pages
Settings → Pages → Build from `main` branch (`/root`). Visit the Pages URL when it’s ready.

### 3) Add/maintain ideas
- Edit `data/ideas.csv` (easiest in GitHub’s web editor). Required column: `title`.
- Optional columns (any casing): `desc, category, needs, duration, energy, id`.
- If `id` is omitted, it’s auto-generated from the row contents.
- Duration is in minutes; used for filtering.
- Prefer spreadsheets? Click “View idea library → Open the spreadsheet-style CSV” on the site, or
  open `data/ideas.csv` directly and import it into your favourite sheet tool.

### 4) Idea library without spoilers
- The full list lives behind the “View idea library” button so you can draw without seeing every
  idea first.
- When it’s open, use filters, pick buttons, or press Escape/Close to tuck it away again.
- Counts stay visible near the button so you always know how many ideas you have loaded.

### 5) Non-repeating logic
- Two knobs: “Avoid repeats for at least (days)” **and** “Also avoid last N picks”.
- The app prioritizes items not seen in either window. If everything has been seen recently,
  it will surface the least-recent ones next.
- History lives only on the device (localStorage). Reset via the button or by clearing site data.

### 6) Using a different data source
- Put a CSV/JSON anywhere (same repo is simplest) and paste its URL into “Data source”.
- For another repo, use the file’s `raw` URL.

### 7) Keyboard
- `Enter` on “Draw” picks the next idea.
- Tab between buttons; everything is accessible.

### 8) NVC-friendly tips
- Use the **needs** column to tag each idea with one or more values separated by `|`. Choose from:
  Love/Caring, Nurturing, Connection, Belonging, Support, Consideration, Need for all living things to flourish,
  Inclusion, Community, Safety, Contribution, Peer Respect, Respect, Autonomy, To be seen, Acknowledgement,
  Appreciation, Trust, Dependability, Honesty, Honor, Commitment, Clarity, Accountability, Causality,
  Fairness, Justice, Choice, Freedom, Reliability, Act Freely, Choose Freely, Understanding, Recognition,
  Non-judgmental Communication, Need to matter, Friendship, Space, Peace, Serenity, Do things at my own pace
  and in my own way, Calm, Participation, To be heard, Equality, Empowerment, Consistency, Genuineness,
  Mattering, Rest, Mutuality, Relaxation, Closeness, Authenticity, Self expression, Integrity, Empathy,
  Privacy, Order, Beauty, Control, Predictability, Accomplishment, Physical Fitness, Acceptance, Growth, Security.
- Before drawing, each person can say one need alive right now and set filters accordingly.
- After a pick, each can say: “one thing I enjoyed” + “one wish for next time.”

### 9) Giraffe hat extras
- Color-code idea slips by energy (blue = calm, yellow = play, green = order, red = move) to match
  the moment.
- Give each person two opt-out tokens—trade a draw that doesn’t meet your needs, no explanation
  required.
- After each draw, take 60 seconds for “one thing I enjoyed” + “one wish for next time” to keep the
  ritual playful and tuned to everyone.
