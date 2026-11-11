// The large sizes of bench/parse.bench.mjs, each compared: the suite the bench-reading workflow's
// large-compare job runs, base against head, on a pull request.
//
//   pnpm build && pnpm exec cosyte-bench compare --suite bench/parse-large.compare.mjs \
//     --base <base checkout>/dist/index.mjs --head dist/index.mjs
//
// Its own file, named so the shared bench-compare job (every bench/*.bench.mjs) does not pick it
// up: these cases warm up on @cosyte/bench's large-case plan, and twelve rounds of them do not fit
// that job's budget beside the small sizes. Advisory, as every comparison is until a calibration
// on its runner class shows false alarms under 1%: docs-content/performance.md gives the rate.

import { parseSuite } from "./parse.bench.mjs";

export default parseSuite(true);
