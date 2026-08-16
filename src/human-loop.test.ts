import assert from "node:assert/strict";
import { test } from "node:test";

import { pickBestFrame, sourcePathCandidates } from "./actions/human-loop";

test("selects and maps the newest in-app frame from Sentry issue-event entries", () => {
	const frame = pickBestFrame({
		entries: [{
			type: "exception",
			data: {
				values: [{
					stacktrace: {
						frames: [
							{ filename: "../../src/components/Game.tsx", lineNo: 274, inApp: true },
							{
								filename: "../../src/sentry-demo.ts",
								absPath: "https://example.test/src/sentry-demo.ts",
								lineNo: 46,
								inApp: true
							}
						]
					}
				}]
			}
		}]
	});
	assert.equal(frame?.lineno, 46);
	assert.deepEqual(sourcePathCandidates(frame!), ["src/sentry-demo.ts"]);
});

test("ignores anonymous frames and maps a deployment URL to a repository path", () => {
	assert.deepEqual(sourcePathCandidates({ filename: "<anonymous>", absPath: "<anonymous>" }), []);
	assert.deepEqual(
		sourcePathCandidates({ absPath: "https://app.example.test/src/app.tsx" }),
		["src/app.tsx"]
	);
});
