## Landing Gallery Timing (Uniform)

| Pair | Fade-out | Fade-in lead | Reveal delay (start move) | Slide duration | Dwell before next | After visible (approx) |
|------|----------|--------------|---------------------------|----------------|-------------------|------------------------|
| 1    | 500ms    | 200ms        | 1200ms                    | 1200ms         | 4000ms            | ~900ms                 |
| 2    | 500ms    | 200ms        | 1200ms                    | 1200ms         | 4000ms            | ~900ms                 |
| 3    | 500ms    | 200ms        | 1200ms                    | 1200ms         | 4000ms            | ~900ms                 |
| 4    | 500ms    | 200ms        | 1200ms                    | 1200ms         | 4000ms            | ~900ms                 |
| 5    | 500ms    | 200ms        | 1200ms                    | 1200ms         | 4000ms            | ~900ms                 |
| 6    | 500ms    | 200ms        | 1200ms                    | 1200ms         | 4000ms            | ~900ms                 |
| 7    | 500ms    | 200ms        | 1200ms                    | 1200ms         | 4000ms            | ~900ms                 |

**Fade-out**: Time to fade the current pair out before swapping images (500ms).

**Fade-in lead**: Delay after swap/reset before starting the fade-in (200ms).

**Reveal delay**: Wait time before triggering the slider move from 0% to 100% (1200ms). This is when the comparison begins sliding.

**Slide duration**: How long the slider move itself takes (1200ms, clip-path/handle transition).

**Dwell before next**: Time the pair stays on screen before the next pair starts (4000ms).

**After visible (approx)**: Estimated time the “after” view remains visible once the slider reaches 100%, calculated as dwell minus fade/lead/reveal/move (~900ms).

