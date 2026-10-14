## 15funs

A static GitHub Pages app for drawing screen-free, ~15-minute ideas without recent repeats. The interface is designed mobile-first: **draw, decide, complete**.

## Mobile interaction contract

- **Draw an idea** is the one primary action when no idea is selected. On mobile, the action stays within reach in a bottom dock, even after a long card or completion message.
- **✓ Complete** means the activity actually happened. It saves an entry in the local history, returns to the ready state, and makes **Draw next idea** immediately available in the same place.
- **↻ Another** rejects the current suggestion **without** recording it as completed. The picker avoids suggestions already drawn in the current cycle, even if they were rejected.
- **Filters** stays folded away unless needed. **More options** contains source management, history reset, and less-used settings.
- **Ideas** in the compact header opens the full list without spoiling the next random suggestion. The library has a search input; rows show only the name, category and duration. Picking returns focus to the activity.
- Each idea uses a **single duration/time display** in a compact, always-visible **Timer · 10:00 · Start** row, alongside optional **Tags**. No emoji, duplicate duration badge, or dropdown. The timer starts only when **Start** is pressed; **Reset** appears only after starting.

## Testing

Run the dependency-free interaction tests with `node tests/ux-smoke.mjs`. The tests cover drawing, redraw without completion, shuffle continuity, changed CSV content, completion persistence, unavailable alternatives, failed network refreshes, library search and focus restoration.

Before merging a visual change, check on iOS Safari and installed Home Screen mode: initial draw, long description, dock over safe area, filters, keyboard, portrait/landscape, Browse/Close, large text, and reduced motion. Automated logic tests do **not** replace these visual checks.

## The one thing to know: `data/ideas.csv` is the source of truth

To add, remove, or edit ideas on the site, edit **`data/ideas.csv`**. The app loads that CSV directly in the browser, with a cache-busting timestamp, so every press of **Draw** refreshes from the current CSV before choosing the next idea.

There is also a sample `data/ideas.json`, but it is **not the default source** and there is **no GitHub Action** that syncs CSV ↔ JSON or resets site items from a spreadsheet. Unless you intentionally paste a different source into the site’s **Data source** field, maintain only `data/ideas.csv`.

### Fastest way to repopulate the idea list

1. Open [`data/ideas.csv`](data/ideas.csv) in GitHub.
2. Click the pencil/edit button.
3. Add, remove, or replace rows. Keep the first header row intact.
4. Commit the change to the branch GitHub Pages uses.
5. Open the site and press **Draw**. The app fetches the latest CSV before drawing.

### Required and optional columns

The only required column is `title`. These columns are understood by the app:

| Column | Required? | What it does |
| --- | --- | --- |
| `title` | Yes | The idea name shown on the card. |
| `desc` | No | Instructions or details shown below the title. |
| `category` | No | A category used by the category filter. |
| `needs` | No | One or more needs separated by `|`, `;`, or `,`. |
| `duration` | No | Minutes used by the duration filter and timer. Defaults to 15. |
| `energy` | No | Free-text energy label for organizing rows. |
| `link` | No | Optional resource URL displayed with the idea. |
| `link_label` | No | Optional text for the resource link. |
| `id` | No | Stable ID for repeat history. If omitted, the app generates one from row content. |

### Spreadsheet workflow

If you prefer spreadsheet editing, use CSV as the import/export format:

1. Import `data/ideas.csv` into Google Sheets, Excel, Numbers, or another spreadsheet tool.
2. Edit rows there.
3. Export/download as CSV.
4. Replace `data/ideas.csv` in this repo with that exported CSV.

You can also publish a Google Sheet as CSV and paste that published CSV URL into the site’s **Data source** field. When using a URL source, the app still refreshes that URL before every draw.

## Repo structure

```text
/
index.html
style.css
app.js
/data
  ideas.csv   # default source of truth: edit this
  ideas.json  # optional example only; not synced automatically
```

## Enable GitHub Pages

Settings → Pages → Build from `main` branch (`/root`). Visit the Pages URL when it’s ready.

## Idea library without spoilers

- The full list lives behind **Ideas** in the top bar, so you can draw without seeing every idea first.
- When it’s open, use filters, pick buttons, or press Escape/Close to tuck it away again.
- Search is confined to the library; idea counts and recent-completion details appear inside the library rather than consuming space in the main draw view.

## Non-repeating logic

- Two knobs: **Avoid repeats (days)** and **Also avoid last N completed activities**.
- The app prioritizes items not seen in either window. If everything has been seen recently, it surfaces the least-recent ones next.
- History records **completed activities**, not every suggestion or rejected idea. It lives only on this device in `localStorage`. Reset via **Filters → More options → Reset history**, or by clearing site data.

## Using a different data source

- Open **Filters → More options**, paste any CSV or JSON URL into **Data source**, and press **Load**.
- For another GitHub repo, use the file’s raw URL.
- For Google Sheets, publish or export the sheet as CSV and use that CSV URL.
- Uploaded files are stored only in that browser’s `localStorage`; they do not update the repo.

## UI consolidation principles

- The activity is the primary content. The header holds only the site name and an **Ideas** escape hatch. No redundant heading over the activity or footer repeated in the main view.
- Completion notices use the existing live region without introducing a second visible announcement card. All controls remain keyboard- and touch-accessible.
- Optional categories and needs remain discoverable behind **Tags** in the same row as the timer. Library search matches titles, descriptions, categories, energy labels and needs without making every row verbose.

## Keyboard

- `Enter` or `Space` on the focused **Draw an idea** / **Draw next idea** button picks the next idea.
- Tab between buttons; everything is accessible.

## NVC-friendly tips

- Use the **needs** column to tag each idea with one or more values separated by `|`. Choose from: Love/Caring, Nurturing, Connection, Belonging, Support, Consideration, Need for all living things to flourish, Inclusion, Community, Safety, Contribution, Peer Respect, Respect, Autonomy, To be seen, Acknowledgement, Appreciation, Trust, Dependability, Honesty, Honor, Commitment, Clarity, Accountability, Causality, Fairness, Justice, Choice, Freedom, Reliability, Act Freely, Choose Freely, Understanding, Recognition, Non-judgmental Communication, Need to matter, Friendship, Space, Peace, Serenity, Do things at my own pace and in my own way, Calm, Participation, To be heard, Equality, Empowerment, Consistency, Genuineness, Mattering, Rest, Mutuality, Relaxation, Closeness, Authenticity, Self expression, Integrity, Empathy, Privacy, Order, Beauty, Control, Predictability, Accomplishment, Physical Fitness, Acceptance, Growth, Security.
- Before drawing, each person can say one need alive right now and set filters accordingly.
- After a pick, each can say: “one thing I enjoyed” + “one wish for next time.”
