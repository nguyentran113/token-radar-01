[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/nguyentran113/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/nguyentran113/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar

**Which pre-token protocol is worth farming next — and what it would be worth if it launched a token.**

A token-launch radar: a Node 22 program (`main.ts`, standard library only) reads a sealed DefiLlama snapshot of 758 protocols and ranks the pre-token ones by an implied token value, then writes a static dashboard a reader can sort, filter and open protocol by protocol — each row carrying the steps to farm it, with what they cost and how long they take.

## The model — comps-2

No name is special-cased. The value is calibrated on the snapshot itself:

- **Comparables:** for every protocol whose token already trades, the market has priced it — multiple = market cap / TVL. The model takes the median multiple per category, shrunk in log space toward the global median (weight n / (n + 4)), so a category with two tokens barely moves the global prior and one with fifteen mostly speaks for itself. The 25th and 75th percentiles, shrunk the same way, bracket the implied value as an expected range.
- **Adjustments:** 7-day TVL growth (clamped −60%…+120%), how long the protocol has run with no token, and how many chains it runs on.
- **Coverage:** the 40-protocol watchlist is the floor, never the ceiling — the board carries 200 rows, the strongest pre-token protocols below the $50M floor included, ranked by implied value.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot>/snapshot.json
```

That writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` into `out/`. Serve `out/dashboard/` with any static file server (it reads `../data.js`, no network) — or open `out/dashboard/index.html` directly.

## Layout

- `main.ts` — the entrypoint: reads the snapshot, scores the board, copies the dashboard and screenshots, writes the dossier.
- `lib/model.ts` — the comps-2 model, the farm plans and the board checks.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the board, the live-token view, the detail drawer and the filters. Deep links: `#/` board, `#/detail/<slug>`, `#/filter?category=X&chain=Y`.
- `screenshots/` — the board, a detail view and a filtered view, captured from this dashboard.
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte.

Implied values are this radar's own claim from the snapshot's figures — a ranking of what a token *would* be worth if the protocol's record stayed as it is, never a prediction that a token will be issued, or when.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=am378nqn&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
