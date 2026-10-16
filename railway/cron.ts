// Railway starts this every five minutes and it exits. It stands in for the
// crons in apps/api/vercel.json, which only Vercel reads.

const base = process.env.API_INTERNAL_URL;
const secret = process.env.CRON_SECRET;

if (!base || !secret) {
	console.error("[cron] API_INTERNAL_URL and CRON_SECRET must both be set.");
	process.exit(1);
}

// The daily jobs keep the UTC hours vercel.json gives them. Only the tick in
// the first five minutes of that hour runs one, so each fires once a day.
const DAILY = new Map([
	[4, "/internal/tracking/retention"],
	[5, "/internal/archive/prune"],
	[6, "/internal/sync/rates"],
	[7, "/internal/telemetry/rollup"],
]);

const now = new Date();
const paths = ["/internal/sync/mailboxes"];
const daily = DAILY.get(now.getUTCHours());
if (daily && now.getUTCMinutes() < 5) paths.push(daily);

let failed = false;

for (const path of paths) {
	try {
		const response = await fetch(new URL(path, base), {
			method: "POST",
			headers: { authorization: `Bearer ${secret}` },
		});
		console.log(`[cron] ${path} → ${response.status}`);
		if (!response.ok) failed = true;
	} catch (error) {
		console.error(`[cron] ${path} failed`, error);
		failed = true;
	}
}

process.exit(failed ? 1 : 0);
