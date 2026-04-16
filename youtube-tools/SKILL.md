---
name: youtube-tools
description: Fetch transcripts and create structured watching guides / summaries for YouTube videos. Use when the user asks to (1) get, fetch, extract, or download a transcript or captions from a YouTube video URL, or (2) summarize, create a watching guide, or produce a structured summary of a YouTube video. Trigger on youtube.com/watch, youtu.be, or youtube.com/shorts links.
---

# YouTube Video Tools

Fetch YouTube video transcripts and produce structured watching guides via the `defuddle` CLI (`npx defuddle` from the npm registry).

## Fetching Transcripts

```bash
npx defuddle parse <youtube-url> --markdown
```

Always use `--markdown` to get the transcript in readable Markdown format.

### Options

- `--lang <code>` — request a specific language (BCP 47, e.g. `en`, `ja`, `zh`).
- `-o <file>` — write output to a file instead of stdout.

### Notes

- Videos without captions will return no transcript.
- The output includes a link to the video, the video description, and timestamped transcript segments.

## Creating a Watching Guide

A watching guide is a structured summary that breaks a video into segments with summaries and highlighted quotes. Use this workflow when the user asks to summarize a video or create a watching guide.

### Workflow

1. **Fetch the transcript** using `npx defuddle parse <url> --markdown`.
2. **Analyze the transcript** — identify natural topic boundaries, key quotes, and timestamps.
3. **Produce the watching guide** in the Markdown format below.
4. **Save the output** to a file (default: `watching-guide.md`, or as the user specifies).

### Timestamp Links

Convert transcript timestamps (`MM:SS` or `HH:MM:SS`) to YouTube deep links:

```
https://www.youtube.com/watch?v=VIDEO_ID&t=TOTAL_SECONDSs
```

Example: `0:09:57` → `&t=597s` (9×60 + 57 = 597).

### Output Format

````markdown
# Watching guide — [Video Title]

*[Brief description, e.g. "Host interviews Guest"] · ~[duration] · [video link]*

---

### `00:00 – 02:00` [Segment Title]

[► 0:00](<video-link>&t=0s)

[2–4 sentence summary of this segment.]

**Highlights**

> *"Verbatim quote from the transcript."*
> [0:01:30](<video-link>&t=90s)

> *"Another notable quote."*
> [0:01:55](<video-link>&t=115s)

---

### `02:00 – 10:30` [Next Segment Title]

[► 2:00](<video-link>&t=120s)

[Summary paragraph.]

**Highlights**

> *"Key quote."*
> [0:05:12](<video-link>&t=312s)
````

### Guidelines

- Aim for 5–12 segments depending on video length.
- Each segment summary should be 2–4 sentences capturing the essence, not a transcript.
- Pick 1–3 of the most impactful or memorable quotes per segment as highlights.
- Use the exact wording from the transcript for quotes — do not paraphrase.
- Omit the **Highlights** section for a segment if there are no standout quotes.
- Timestamp links must point to the correct time in the video.
