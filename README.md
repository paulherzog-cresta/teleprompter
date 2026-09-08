# Teleprompter

**https://paulherzog-cresta.github.io/teleprompter/**

A phone teleprompter for reading role-play scripts during live demos. You scroll the script the
way you would scroll anything else, and a fixed reading line tells you where you are.

Sharing it with the team is sending them that link. Everyone builds their own library on their own
device; there is nothing to sign into and nothing shared between devices.

No server, no accounts, no third-party integrations. Scripts live in the browser's local storage
on whichever device you put them on, and nowhere else.

## Getting a script onto your phone

Author on the laptop, read on the phone. The layout switches on viewport width: wide screens get
the editor and **Send to phone**, narrow screens get **Scan**.

1. On the laptop, add the script — paste it, or drop a CSV/TSV straight onto the box.
2. Hit **Send to phone**. You get a QR code, cycling if the script needs more than one.
3. On the phone, hit **Scan** and point it at the laptop. There is nothing to tap on either side;
   hold steady and the codes come round. A 60-entry script is three codes, about five seconds.

**Copy link** next to the QR does the same job without a camera. The whole script rides in the
part of the URL after the `#`, which browsers never send to a server — so pasting that link into a
Slack DM is how you hand a script to a teammate, and how you skip the QR when a script is unusually
long.

Nothing about your reading position or text size travels. Those stay on the device they were set
on.

## Running it locally

```bash
npm install && npm run dev
```

The dev server serves the app at `http://localhost:5173/teleprompter/` — the `/teleprompter/` path
is there because GitHub Pages serves project sites from a subpath, and the dev server mirrors it.

```bash
npm run build
```

Type-checks and builds to `dist/`.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. It
derives the asset base path from the repo name, so nothing needs editing if you name the repo
something other than `teleprompter`.

To set it up:

1. Create a **public** repo. Pages on a private repo needs a paid plan, and nothing sensitive lives
   here — no script content, no secrets.
2. Push this directory to it.
3. In the repo, go to Settings → Pages and set **Source** to **GitHub Actions**.

```bash
git init && git add -A && git commit -m "Teleprompter: reader"
git branch -M main
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

The app is a PWA: on iOS, open the Pages URL in Safari and use Share → Add to Home Screen.

## Sheet format

Row 1 is a header row. Everything below it is data, in row order.

| Header | Meaning |
| --- | --- |
| `Direction` | Stage direction for that row. Aliases: `Directions`, `Stage Direction`, `Note`, `Notes` |
| `Section` | Reserved, ignored for now |
| anything else | A role. The header text becomes the role name in the picker |

Matching is case-insensitive. A role cell with text becomes a line; a direction cell with text
becomes a dimmed cue rendered *above* the line, since a direction is something you want before you
speak. Empty rows are skipped. A row with text in two role columns keeps both, left to right, and
warns.

Paste is tab or comma separated — the delimiter is detected from the header row. Quoted fields,
embedded line breaks, and `""` escapes all parse correctly, which matters because Google Sheets
quotes any cell containing a line break and demo dialogue is full of them.

Three things block an import, each with a message saying what was wrong: no header row, no role
columns, no data rows.

## Using the reader

| Gesture | Effect |
| --- | --- |
| Scroll | Read freely. Whichever entry sits on the reading line becomes the current one |
| Tap anywhere | Pull the next entry up to the reading line |
| Pinch out | Open the full-script overview |
| ☰ (top right) | Same overview, for when pinch does not take |

The reading line is a fixed point about 38% down the screen, marked by a small tick on the left
edge. Scrolling settles gently onto it rather than snapping hard, so you can read ahead without
losing your place. Tapping is still there for when you want to step a line at a time without
looking.

In the overview, tap any entry to jump there. On a keyboard: space or arrows to move, `o` for the
overview, `esc` to leave the reader.

Your lines are full brightness and largest. Other roles are dimmer and a step smaller with a role
label. Directions are dimmer still, italic, and smaller again. Text size is adjustable in Settings
and is remembered per device.

The reader holds a screen wake lock while it is open and re-acquires it whenever the app comes back
to the foreground, so the phone does not sleep mid-sentence.

## Known limits

- **No sync.** Editing a script on your laptop does not update your phone — you have to send it
  again. Re-sending the same script updates it in place and keeps your reading position, as long as
  the entry count has not changed; if it has, the position resets to the top and the app says so.
  Nothing tells you a copy is stale. That is the cost of having no server.
- **iOS storage partitioning.** A home-screen web app and Safari may not share `localStorage` on the
  same origin. If a script you added in Safari is missing from the installed app, that is why — pick
  one and stay in it.
- **Wake Lock** needs Safari 16.4 or later. Settings shows whether this browser supports it.
- **Pinch** needs `user-scalable=no` and can still be unreliable across iOS versions. The ☰ button
  in the reader's top corner does the same job.

## Layout

```
src/
  App.tsx                 screen stack, persistence, cursor updates
  types.ts                Entry, Script, Settings
  components/
    Library.tsx           saved scripts, progress, swipe or right-click to delete
    Editor.tsx            paste, live parse preview, role picker
    Reader.tsx            fixed reading position, gestures, wake lock
    Overview.tsx          full script, tap to jump
    Settings.tsx          text size, wake lock status, clear all
  lib/
    delimited.ts          delimiter detection and RFC 4180 parsing
    parseScript.ts        the sheet contract: headers, roles, directions, warnings
    toDelimited.ts        rebuilds a sheet from a script, for the edit screen
    handoff.ts            payload encoding, links, QR chunking and reassembly
    storage.ts            localStorage under teleprompter.v1.*
    useWakeLock.ts        acquire, release, re-acquire on visibilitychange
```

Two more screens sit alongside those: `Share.tsx` (the cycling QR and copy link) and `Scan.tsx`
(the camera and chunk assembly).
