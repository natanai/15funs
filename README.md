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
- Optional columns (any casing): `desc, category, need, duration, energy, id`.
- If `id` is omitted, it’s auto-generated from the row contents.
- Duration is in minutes; used for filtering.
- Prefer spreadsheets? Click “View idea library → Open the spreadsheet-style CSV” on the site, or
  open `data/ideas.csv` directly and import it into your favourite sheet tool.

### 4) Idea library without spoilers
- The full list lives behind the “View idea library” button so you can draw without seeing every
  idea first.
- When it’s open, use filters, pick buttons, or press Escape/Close to tuck it away again.
- Counts stay visible near the button so you always know how many ideas you have loaded.

### 5) Track what you’ve done
- Open the idea library to see a “Recent history” column with timestamps for everything marked **Done**
  or **Skipped** on this device.
- Drawing a card logs it as “Drawn.” When you press **Mark Done** the entry flips to “Done” with the
  completion time. Use **Skip** to mark the current card as skipped before pulling another.
- Picking directly from the library works too—mark it done or skipped to add a timestamped entry.

### 6) Non-repeating logic
- Two knobs: “Avoid repeats for at least (days)” **and** “Also avoid last N picks”.
- The app prioritizes items not seen in either window. If everything has been seen recently,
  it will surface the least-recent ones next.
- History lives only on the device (localStorage). Reset via the button or by clearing site data.

### 7) Using a different data source
- Put a CSV/JSON anywhere (same repo is simplest) and paste its URL into “Data source”.
- For another repo, use the file’s `raw` URL.

### 8) Keyboard
- `Enter` on “Draw” picks the next idea.
- Tab between buttons; everything is accessible.

### 9) NVC-friendly tips
- Use the **need** column with values like: play, creativity, closeness, rest, learning, order, clarity.
- Before drawing, each person can say one need alive right now and set filters accordingly.
- After a pick, each can say: “one thing I enjoyed” + “one wish for next time.”

### 10) Giraffe hat extras
- Color-code idea slips by energy (blue = calm, yellow = play, green = order, red = move) to match
  the moment.
- Give each person two opt-out tokens—trade a draw that doesn’t meet your needs, no explanation
  required.
- After each draw, take 60 seconds for “one thing I enjoyed” + “one wish for next time” to keep the
  ritual playful and tuned to everyone.
