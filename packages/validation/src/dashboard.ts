export const REPORT_PERIODS = ["7d", "30d", "90d"] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const DEFAULT_REPORT_PERIOD: ReportPeriod = "30d";

export const REPORT_PERIOD_DAYS = {
	"7d": 7,
	"30d": 30,
	"90d": 90,
} as const satisfies Record<ReportPeriod, number>;
