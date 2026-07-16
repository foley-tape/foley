# Foley

**A lo-fi tape instrument that plays your coding agents.**
<sub>First deck: TAPE·ZERO · [中文说明](README.zh.md)</sub>

![Foley in eight seconds — the machine wakes from sleep, ink climbs into a storm, the record skips on a stuck loop, and the session ends with the tape slowing to rest](docs/assets/hero.gif)

Your agent works for minutes at a time. You get two options: stare at scrolling logs, or walk away and worry.

Foley is a third option — a small tape machine that plays your session as it happens. A needle for tension. A strip-chart recorder drawing the session's cardiogram in ox-blood ink. An amber lamp that breathes only when the agent is waiting for *you*.

Glance at it from across the room and you know which kind of day it is: smooth sailing, gathering weather, or *it needs me*.

## Quickstart

```bash
npx foley
```

Foley finds your most recent Claude Code session and plays it — the tape deck comes up in your browser, live on `http://127.0.0.1:4173`. No account, no telemetry, fully offline. The deck plays its own ambient bed by default; run `npx foley records fetch` to swap in the real factory music — an explicit, hash-verified download that is Foley's only product-initiated external network path.

Drive a past session from the terminal instead:

```bash
npx foley scan            # list recent Claude Code sessions
npx foley replay <tape>   # a past session → REPORT.md + curve.csv + moments.csv (analysis, not playback)
```

From source: `git clone https://github.com/foley-tape/foley && cd foley && npm install` (Node ≥ 23.6), then `npx foley`.

## What you're looking at

![The counter loupe — a carry caught mid-roll](docs/assets/still-5-loupe-macro.png)

- **TENSION (VU)** — the needle is driven by a real spring-damper model inside the engine. It overshoots, settles, and trembles when the session is unstable. The renderer adds no easing; every quiver you see is data.
- **RECORDER** — the session draws its own pressure trace. The paper *is* the timeline. Gaps in a resumed session leave visible splice marks — the tape is honest about its cuts.
- **ASK** — the amber lamp breathes only when the agent is waiting for your permission. It never cries wolf, and it never gets tired.
- **The green gem** — says one word: *settled*. Steady glow: the session is done. A single blink: one thing got resolved.
- **REELS** — speed is activity, wobble is uncertainty. When the agent steps on the same rake three times, the reel sticks and beats in place like a needle caught in a groove.
- **COUNTER** — a dark slit on the panel. Numbers live only under the loupe (hover). This face has no digits; that's a rule, not an oversight.

![Asleep — the deck at rest, one dim ember](docs/assets/still-6-asleep.png)

## Sound (early)

Two layers. **Foreground cues** mark the moments — a **pluck** for work, a **chord** for resolution, a **needle-skip** for a jam, and a few more — success high, failure low, so you hear a session's register without looking.

**Under them** runs a continuous lo-fi bed: a record supplies the music, the machine supplies the information, and *the tape itself ages* as tension rises — hiss thickens, wow deepens, highs dull — clearing again when the trouble passes. Rain stopping isn't a chime; it's the room going quiet. See the [sensory design whitepaper](docs/canon/TAPE0_WHITEPAPER_SENSES.md).

## Records

The music is real, and the rule is simple: **factory records must be human-made.** The first pressing is [HoliznaCC0](https://freemusicarchive.org/music/holiznacc0/)'s *Public Domain Lofi* — three tracks (*Saturation*, *Still Life*, *Warm Fuzz*), released CC0, human-made (Free Music Archive's own field reads "AI generated? No"). The machine ages them and skips the needle across them; it never wrote them.

Records ship via GitHub Releases, not the npm package — `npx foley records fetch` fetches them on explicit confirmation, verifying each by hash. Want a different shelf? The [record-hunting guide](docs/guide/records-guide.md) keeps human-made CC0 crates up front and any AI-generated ones clearly labelled in their own aisle.

## House rules

A few laws this machine lives by:

1. **No numbers on the face.** Instruments qualify; they don't quantify.
2. **Never fabricate direction.** Renderers may exaggerate amplitude, never invent movement. The engine computes evidence only.
3. **Wear is signal, not decoration.** Aging lives on the media (tape, paper) — the machine stays factory-new.
4. **Abandoned jams get no fanfare.** A jam broken by a real fix earns the chord; a jam that merely expires goes quietly.
5. **The machine may fast-forward; its voice to you never does.** At 8× replay the reels race, but the amber lamp still breathes at human speed.

## Privacy

Foley reads your Claude Code session logs locally; the conversation stays on your machine. By default, up to 80 characters of the first human utterance become that cassette's local title and are cached in `$FOLEY_HOME/cards/<session>/rack.json` (`~/.foley/cards/...` by default) for the local rack. Outside this local title, Foley **distills** the session into event skeletons — verbs, timings, sizes, hashed targets — without copying tool inputs or conversation text into the distilled tape. For failed steps, a default tape keeps a salted cluster hash of a best-effort-normalized error class; the `--raw` form keeps that normalized class as plaintext and may retain text its scrubber does not recognize.

Local opening titles are optional. Set `FOLEY_NO_LOCAL_TITLES=1` when starting Foley, or put `{"privacy":{"localTitles":false}}` in `$FOLEY_HOME/config.json` (`~/.foley/config.json` by default). The environment variable applies to that process; use the config file to cover every Foley process sharing the same home. Foley re-checks that file on rack metadata reads and writes; if the file exists but is invalid or unreadable, local titles fail closed and Foley warns instead of guessing. With titles off, new cards do not copy the opening line, cached opening titles are atomically removed before a successful rack response, and the rack falls back to the repository name plus the session's chapter seal. Re-enabling titles can rebuild them from the original local transcript while it still exists.

Foley's default distilled tape and its MP4/DUB export pipeline apply these specific **redaction and minimization** measures: distilled-tape timestamps become relative offsets, non-builtin tool names and error classes become salted hashes, and `sourceHash` becomes `redacted` (adversarially red-teamed, with a standing privacy gate in the test suite). Exported MP4 container creation/modification times are zeroed. Dub sidecars omit explicit `createdAt`/`liveEpoch` fields, but local DUB export filenames still contain the export date, and Film DUB metadata may embed those dated archive paths; DUB metadata also retains a stable opaque tape identifier (for an export started from a rack session card, `card:<session-id>`) and a content hash. This is not a promise of anonymity; inspect artifacts before sharing. The `--raw` switch additionally retains absolute times, plaintext tool names, the exact source hash, and a plaintext best-effort-normalized error class; it warns loudly, and you shouldn't share what it produces. **Zero telemetry, and the machine never reaches the network on its own**: its only product-initiated external network path is the optional, hash-verified factory-record download, and only after you run `npx foley records fetch` and confirm.

## Why "Foley"

In the 1930s, Jack Foley watched the picture and performed its sounds by hand — footsteps, rustles, weather — live, in sync, with physical objects. This machine does the same job for invisible labor: it watches your agent's session and performs its sounds in tape.

The whole build is on the record — every order, round archive, and audit, mapped in [docs/](docs/README.md).

## Status

- ✅ Engine sealed (`v<!--version-->0.1.0<!--/version-->`) — deterministic, calibrated on real session tapes, <!--test-count-->289<!--/test-count--> golden tests
- ✅ The deck — needle, recorder, lamps, reels, counter — live or replay
- ✅ Sound — foreground cues + an aging lo-fi bed over human-made CC0 records
- ✅ Trailer export — DUB a highlight strip to a local MP4 (WebCodecs, ~9× realtime)
- 🚧 Planned — multi-track (**AUTOREVERSE**) · hosted replays · more agent adapters · auto-tuning on your own tapes

## Honest limits

- **Claude Code only, for now.** The adapter layer is thin — one place understands the log format; more agents are planned, and PRs are welcome.
- **Export needs a Chromium browser.** Video/audio encoding rides WebCodecs; viewing works everywhere, the page degrades honestly where it can't encode.
- **Tension is calibrated on n=1.** The constants were tuned on the author's own session tapes; yours may feel different — auto-tuning on your own library is on the roadmap.
- **The CLI speaks Chinese, the deck is wordless.** The panel has no text by design; the command-line tool's own messages are currently Chinese only.

## License

MIT — see [LICENSE](LICENSE). The tape is yours. Bundled audio under the deck is third-party CC0; per-track provenance in [`sound/records/LICENSES.md`](sound/records/LICENSES.md).
