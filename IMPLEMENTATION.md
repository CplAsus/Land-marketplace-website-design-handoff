# ทรายทองพัฒนา — ตลาดที่ดินปทุมธานี (implementation)

Real implementation of the Claude Design handoff in `project/`. Built as a
static site (plain HTML/CSS/JS — no build step, host anywhere).

## Files
- `index.html` — page shell (fonts, root, script)
- `styles.css` — design system + hover/responsive rules
- `app.js` — the whole app: state, data, rendering, and interactions
- `assets/logo.png` — brand logo (SAI THONG PHATTHANA)

## Run
Any static server, e.g.:

```bash
python3 -m http.server 8000    # then open http://localhost:8000
```

Opening `index.html` directly over `file://` also works, except the owner
admin form's *file upload* preview and localStorage may be restricted by the
browser — a local server avoids that.

## What's included
Matches where the design conversation landed — **two pages**:

- **หน้าแรก** — hero + 5-field search bar, ที่ดินแนะนำ cards, trust section,
  customer reviews.
- **รายละเอียด** — image gallery + lightbox, drone/video slot, full specs,
  highlights, utilities, OpenStreetMap embed, nearby places, sticky contact
  card (โทร / เฟซบุ๊ก / บันทึกไว้), related listings.

Interactive: save (favorites, counted), compare (floating bar + modal),
image lightbox with prev/next, video modal.

## Owner admin mode
Bottom switcher → **🔒 จัดการ** → password **`123456`**. Add / edit / delete
listings and customer reviews (with photo URL or file upload); live
price-per-ไร่ / per-ตร.ว. calculation; map coordinates. Data persists to
`localStorage`.

> ⚠️ **Demo auth only.** The password is checked in client-side JS and data
> lives in the visitor's browser (`localStorage`) — it is not shared between
> devices and provides **no real security**. For production, move listings/
> reviews to a backend with server-side authentication.

## Content / media notes
Listing photos use Unsplash stock URLs; the map, phone number
(097-428-7891) and Facebook link (`facebook.com/saithongptn`) are the
placeholders from the design. All are trivial to swap — listing data lives in
`defaults()` / `defaultReviews()` in `app.js`, or edit live via admin mode.
