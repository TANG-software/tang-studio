# TANG Studio

A browser video editor with **Auto Caption** — transcribe a clip, get every line in an editable list, fix any word the recogniser got wrong, export.

Built for people who need captions to be *correct*, not just present.

---

## Is this a static site or does it need a server?

**Both — and that distinction matters.**

| Part | Where it runs | Why |
|---|---|---|
| Editor, timeline, preview, caption editing | **Browser** (static) | No server needed. Host on Netlify, Vercel or Cloudflare Pages free |
| `POST /api/caption` | **Serverless function** | Keeps the transcription API key off the client |

**It cannot be purely static.** If the browser called the transcription API directly, your key would sit in the JavaScript for anyone to copy and spend. One small function is the minimum honest architecture.

The function is ~120 lines, runs on Netlify's free tier, and is the only server-side code in the project.

---

## API keys

**Required — exactly one:**

| Key | Service | Free tier | Used for |
|---|---|---|---|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) | Generous free tier | Whisper transcription |

Groq runs `whisper-large-v3-turbo`, which is fast and cheap enough that the free tier covers real use. Get a key, then in Netlify: **Site settings → Environment variables → `GROQ_API_KEY`**.

**Optional, for later:** `OPENAI_API_KEY` — only if you move video rendering to the server.

**No key is needed for:** media import, the timeline, caption editing, preview, or `.srt` export. Those are entirely client-side.

**Alternative providers** if you'd rather not use Groq — swap `callProvider()` in `netlify/functions/caption.js`:

- **OpenAI** `whisper-1` — best-known, slightly pricier
- **Deepgram** Nova — very fast, good diarisation
- **AssemblyAI** — strong accuracy, generous free tier

All four take the same shape of request, so the swap is about 10 lines.

---

## Running it

```bash
git clone https://github.com/TANG-software/tang-studio.git
cd tang-studio
cp .env.example .env          # add GROQ_API_KEY
npm i -g netlify-cli
netlify dev                   # serves the site and the function together
```

Open the URL it prints. Import a video, press **Auto Caption**.

> Opening `index.html` directly with `file://` will work for the editor but
> `/api/caption` will fail — the function needs the dev server.

---

## What works today

- **Import** — drag and drop, or the import button. Video, audio, images.
- **Media library** — thumbnails, duration, click to load into the preview.
- **Preview** — play/pause, live timecode, captions drawn over the video as it plays.
- **Timeline** — the clip as a block, draggable in/out trim handles, ruler, playhead.
- **Auto Caption** — one button. Transcribes the selected clip and returns timed segments.
- **Editable captions** — every line in a list with its timestamps. Click any line, fix any word, jump the playhead to it. Edits are live on the preview.
- **Export `.srt`** — a real subtitle file you can upload to YouTube, Premiere, DaVinci or Clipchamp.

## What is not built yet

Being straight about the gaps, because a video editor is a large product:

- **Video export with burned-in captions.** The button exists and tells you so. Doing this properly means `ffmpeg.wasm` in the browser or a render queue on the server — it is the single biggest remaining piece.
- **Multiple clips on the timeline.** Currently one clip at a time; the split button demonstrates the intent but does not yet give you two independent blocks.
- **Transitions, filters, text overlays, music tracks, stock library.** Clipchamp has years of these.
- **Project save/load.** Only the project name persists.
- **Word-level caption timing.** Segments are per-phrase, not per-word.

---

## On the UI

The layout follows the standard non-linear editor pattern that Clipchamp, Premiere, CapCut and DaVinci all share: **media library on the left, preview in the middle, properties on the right, timeline across the bottom.** That arrangement is a convention of the category, not one company's design.

What this project does *not* do is copy Clipchamp's branding, assets, icons, colours or exact component styling. Building a lookalike of a Microsoft product would be both a trademark problem and a lazy way to design. The goal is the same *familiarity* — someone who has used any editor should need no explanation — with its own visual identity.

If you want it to feel closer to a specific product, that is a design conversation about spacing, density and control placement, not a copy-paste job.

---

## Privacy

Clips you caption **are uploaded** to the transcription provider to be transcribed. That is unavoidable with any cloud recogniser, and it belongs in the privacy policy in plain words — not hidden.

If on-device transcription matters for your users, the route is `transformers.js` running Whisper in the browser. It works, it is private, and it is several times slower and heavier. That is a real trade-off to make deliberately, not to paper over with a button label.

---

## Licence

MIT.
