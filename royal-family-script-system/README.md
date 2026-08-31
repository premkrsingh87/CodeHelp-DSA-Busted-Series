# Royal Family Narration — Script System

Reverse-engineered from four full transcripts of a successful royal-affairs YouTube channel
(~170 minutes / ~25,000 words), then rebuilt as a reusable script generator.

## Files

| File | What it is |
|---|---|
| `ANALYSIS.md` | The teardown. Hook anatomy, trigger inventory, rhythm rules, loop ledgers, ending variants — all with verbatim evidence from the corpus. |
| `MASTER_PROMPT.json` | The generator. Paste into any capable LLM as the instruction block, send a title, get a full script. |

## How to use it

1. Paste the entire contents of `MASTER_PROMPT.json` into the model as the system prompt / first message.
2. Send one line:

```
TITLE: Princess Anne SHUTS DOWN Camilla At The Cenotaph — What She Did With The Wreath STUNNED Charles
```

Optional extras on their own lines:

```
RUNTIME: 40
ANGLE: revenge_debt_settled
PREVIOUS_VIDEO: William KICKS Camilla Out After Her Yacht Photos LEAK
ANCHOR_FACTS: Diana's Panorama interview, November 1995. Harry's memoir, January 2023.
```

If you only have a subject and no title:

```
TOPIC: Why Charles never gave Harry the Windsor titles everyone assumed he would
```

The model returns a pre-flight plan, the full script, a description-box source note, and a
self-audit against the 20 quality gates.

## What it reproduces

- **The 8-beat, 95-second front-load** — including the countable end-promise ("the last thirty
  seconds of this story are five words long"), which is the single strongest retention device
  in the format.
- **The Six-Stage Excavation** — artefact → wound → mechanism → witness → move → residue.
  Not the generic problem/insight/implication arc.
- **4–6 simultaneous open loops** on a scheduled ledger, including one that is never closed and
  is handed to the comments.
- **Bimodal sentence rhythm** — long accumulating chains that never carry the payload, landing on
  one-word paragraphs that always do.
- **The concession mechanic** — arguing against your own thesis unprompted, then converting the
  concession into a stronger claim. This is the format's most distinctive move and the reason
  an unverifiable narrative reads as rigorously sourced.
- **The empathy pivot** — humanising the antagonist at the 93% mark, just after the payoff.
- **The residue ending** — no summary, no challenge. A permanent condition, present tense,
  final sentence a body in a room or a small object.

## One note on the source material

The reference channel blends three kinds of material in one flat declarative voice: documented
record (the 1952 Declaration in Council, Diana's 1995 Mishcon note, Harry's memoir), contested
reporting, and reconstructed scenes with invented institutional detail. Tier three carries most
of the emotional weight.

The generator keeps all of it — the hedge grammar (`by every account`, `from what I understand`,
`palace insiders say`) is part of the voice, not a compromise to it — but makes the tiering
explicit rather than accidental, adds hard limits around living named people, and requires a
description-box source note. See `factual_integrity_layer` in the JSON. The concession beats it
enforces are simultaneously the best writing in the corpus and the thing that keeps the format
defensible.
