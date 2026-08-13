import type { SentryIssue } from "./sentry-api";

/**
 * Orders issues by "pain": first by userCount (desc), then by total count (desc),
 * and finally by recency (lastSeen desc). Missing fields are treated as 0/oldest.
 * The sort is stable for equal keys to preserve incoming order.
 */
export function sortIssuesByPain(issues: SentryIssue[]): SentryIssue[] {
	return [...issues].sort((a, b) => {
		const aUsers = a.userCount ?? 0;
		const bUsers = b.userCount ?? 0;
		if (aUsers !== bUsers) return bUsers - aUsers;

		const aCount = a.count ?? 0;
		const bCount = b.count ?? 0;
		if (aCount !== bCount) return bCount - aCount;

		const aTime = a.lastSeen ? Date.parse(a.lastSeen) || 0 : 0;
		const bTime = b.lastSeen ? Date.parse(b.lastSeen) || 0 : 0;
		return bTime - aTime;
	});
}

