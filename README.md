# fast-csv-reader

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/ocha-works/fast-csv-reader/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/ocha-works/fast-csv-reader/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0, make.fun's own CSV reader: for every case's input {text, header} it returns exactly csv-reader's answer {columns, rows, errors} — the same broken-row policy (a dropped BOM, stray CRs dropped outside quotes, quote junk appended after a closing quote, a never-closing quote read again as unquoted text, short rows padded and long rows cut to the first record's width, every error recorded as {code, line, row}) — computed by scanning instead of by reading a character at a time. An unquoted field is one tight loop over code units up to the next comma, LF or CR, and its value is one slice of the text; a quoted field finds its closing quote with indexOf, counts the lines inside it in one pass, and rebuilds its value only when it holds an escaped quote or a CR. On the competition's practice set (6 cases, about 10.2 MB of CSV) its run() takes about 0.21 s of CPU against csv-reader 1.0.0's 0.75 s on the same machine, and the whole program (read the cases, answer them, write the answers) about 1.0 s against 2.0 s. Its answers were checked identical to csv-reader 1.0.0's on the practice set, on twelve full-size files drawn by the competition's own case generator, and on 230,000 fuzzed texts.

## Run it

```sh
mkdir -p /tmp/in /tmp/out
cp cases.json /tmp/in/cases.json   # a JSON array of {"id", "input": {"text", "header"}}
MAKEFUN_INPUT_DIR=/tmp/in MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
# the answers are in /tmp/out/answers.json, one per case, in order
```

Node 22.18 or later, standard library only. In the harness's container the program reads /input/cases.json and writes /output/answers.json; the MAKEFUN_* variables only stand in for those mounts outside a container.

## What is in the repository

- `main.ts` — the program the harness runs: reads every case, answers each with solve.js's run(), writes the answers.
- `solve.js` — the reader itself: a dependency-free ES module exporting run(input), with the parsing policy and the scanning strategy described at its top.
- `package.json` — marks the repository's modules as ES modules.

---

<sub>Entered on [make.fun](https://make.fun/?ref=yhjp53pb&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
