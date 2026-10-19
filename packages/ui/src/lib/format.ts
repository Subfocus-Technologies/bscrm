export function formatCount(
	count: number,
	noun: string,
	plural = `${noun}s`,
): string {
	return `${count} ${count === 1 ? noun : plural}`;
}

const WELL_FORMED_CURRENCY_CODE = /^[A-Za-z]{3}$/;
const MONEY_LOCALE = "en-GB";
const percentFormat = new Intl.NumberFormat("en-US", {
	style: "percent",
	maximumFractionDigits: 0,
});

function displayCurrencyCode(currency: string): string {
	return WELL_FORMED_CURRENCY_CODE.test(currency)
		? currency.toUpperCase()
		: "GBP";
}

const currencyDigits = new Map<string, number>();

function fractionDigits(code: string): number {
	const cached = currencyDigits.get(code);
	if (cached !== undefined) return cached;

	const digits =
		new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: code,
		}).resolvedOptions().maximumFractionDigits ?? 2;

	currencyDigits.set(code, digits);
	return digits;
}

export function formatMoney(cents: number, currency = "gbp"): string {
	const code = displayCurrencyCode(currency);
	const whole = cents % 100 === 0;
	const digits = fractionDigits(code);

	return new Intl.NumberFormat(MONEY_LOCALE, {
		style: "currency",
		currency: code,
		minimumFractionDigits: whole ? 0 : Math.min(2, digits),
		maximumFractionDigits: whole ? 0 : digits,
	}).format(cents / 100);
}

const COMPACT_STEPS = [
	{ size: 1_000_000_000, suffix: "B" },
	{ size: 1_000_000, suffix: "M" },
	{ size: 1_000, suffix: "K" },
] as const;

function oneDecimal(value: number): number {
	return Math.round(value * 10) / 10;
}

function compactStep(amount: number) {
	const size = Math.abs(amount);
	const index = COMPACT_STEPS.findIndex((step) => size >= step.size);
	const step = COMPACT_STEPS[index];
	const larger = COMPACT_STEPS[index - 1];

	if (
		step &&
		larger &&
		oneDecimal(size / step.size) >= larger.size / step.size
	) {
		return larger;
	}

	return step;
}

function moneyFormat(currency: string, decimals: number): Intl.NumberFormat {
	return new Intl.NumberFormat(MONEY_LOCALE, {
		style: "currency",
		currency: displayCurrencyCode(currency),
		minimumFractionDigits: 0,
		maximumFractionDigits: decimals,
	});
}

export function formatMoneyCompact(cents: number, currency = "gbp"): string {
	const amount = cents / 100;
	const step = compactStep(amount);

	if (!step) {
		return moneyFormat(currency, cents % 100_000 === 0 ? 0 : 1).format(amount);
	}

	const scaled = oneDecimal(amount / step.size);
	const decimals = Number.isInteger(scaled) ? 0 : 1;

	return `${moneyFormat(currency, decimals).format(scaled)}${step.suffix}`;
}

export function formatPercent(rate: number): string {
	return percentFormat.format(rate);
}

const dayFormat = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
});

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

export function toDay(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDay(value: string | null | undefined): Date | undefined {
	if (!value) return undefined;
	const [year, month, day] = value.slice(0, 10).split("-").map(Number);
	if (!year || !month || !day) return undefined;
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatDay(value: string | null | undefined): string {
	const date = fromDay(value);
	return date ? dayFormat.format(date) : (value ?? "—");
}

export function initialsFromName(name: string | null | undefined): string {
	const parts = (name ?? "").split(/\s+/).filter(Boolean);
	const first = parts[0];
	if (!first) return "?";
	if (parts.length === 1) return first.slice(0, 2).toUpperCase();
	const last = parts[parts.length - 1] ?? first;
	return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}
