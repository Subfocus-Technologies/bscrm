"use client";

import Download from "@carbon/icons-react/es/Download";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardPanel,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { INVESTORS } from "@crm/validation/investors";
import { useMutation } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	type ColumnMapping,
	guessMapping,
	IMPORT_FIELDS,
	prepareRows,
	type SheetCell,
	sheetCell,
} from "@/lib/investor-import";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { InvestorSection } from "./investors-search-params";

const NOT_IN_SHEET = "none";
const PREVIEW_ROWS = 5;

type Column = { label: string; value: string };

type Sheet = { fileName: string; headers: string[]; rows: SheetCell[][] };

function columnsOf(headers: readonly string[]): Column[] {
	return headers.map((label, position) => ({ label, value: String(position) }));
}

async function readSpreadsheet(file: File): Promise<Sheet> {
	const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";

	const table: SheetCell[][] = isCsv
		? await new Promise((resolve, reject) => {
				import("papaparse").then(({ default: Papa }) =>
					Papa.parse<string[]>(file, {
						skipEmptyLines: true,
						complete: (result) => resolve(result.data),
						error: (error) => reject(error),
					}),
				);
			})
		: await import("read-excel-file/browser").then(async ({ readSheet }) =>
				(await readSheet(file)).map((row) =>
					row.map((cell) => sheetCell.parse(cell)),
				),
			);

	const [headerRow = [], ...rows] = table;
	return {
		fileName: file.name,
		headers: headerRow.map((cell, index) =>
			cell === null || cell === undefined || String(cell).trim() === ""
				? `Column ${index + 1}`
				: String(cell).trim(),
		),
		rows,
	};
}

function downloadTemplate() {
	const header = IMPORT_FIELDS.map((field) => field.label).join(",");
	const example =
		"Jane Smith,Angel,London Angels,https://example.com,https://www.linkedin.com/in/example,,London,Pre-Seed; Seed,PropTech; AI,10000,50000,Backs UK proptech founders,";
	const blob = new Blob([`${header}\n${example}\n`], { type: "text/csv" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "investors-template.csv";
	link.click();
	URL.revokeObjectURL(url);
}

function MappingRow({
	field,
	columns,
	value,
	onChange,
}: {
	field: (typeof IMPORT_FIELDS)[number];
	columns: Column[];
	value: number | undefined;
	onChange: (index: number | undefined) => void;
}) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>
				{field.label}
				{"required" in field ? " (needed)" : ""}
			</Label>
			<Select
				value={value === undefined ? NOT_IN_SHEET : String(value)}
				onValueChange={(next) =>
					onChange(next === NOT_IN_SHEET ? undefined : Number(next))
				}
			>
				<SelectTrigger id={id}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NOT_IN_SHEET}>Not in the sheet</SelectItem>
					{columns.map((column) => (
						<SelectItem key={column.value} value={column.value}>
							{column.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function InvestorImport({
	onNavigate,
}: {
	onNavigate: (section: InvestorSection) => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const fileId = useId();
	const labelId = useId();
	const [sheet, setSheet] = useState<Sheet | null>(null);
	const [mapping, setMapping] = useState<ColumnMapping>({});
	const [label, setLabel] = useState("");
	const [reading, setReading] = useState(false);

	const prepared = useMemo(
		() => (sheet ? prepareRows(sheet.rows, mapping) : null),
		[sheet, mapping],
	);

	const save = useMutation(
		trpc.investors.import.mutationOptions({
			onSuccess: async (result) => {
				await cache.investors();
				toast.success(
					`Added ${result.created} investor${result.created === 1 ? "" : "s"}${result.duplicates > 0 ? `, skipped ${result.duplicates} already there` : ""}. The agent is scoring them.`,
				);
				setSheet(null);
				onNavigate("pipeline");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const choose = async (file: File | undefined) => {
		if (!file) return;
		if (file.size > INVESTORS.import.maxFileBytes) {
			toast.error("That file is too big. Split it into files under 5 MB.");
			return;
		}

		setReading(true);
		try {
			const read = await readSpreadsheet(file);
			setSheet(read);
			setMapping(guessMapping(read.headers));
			setLabel(read.fileName.replace(/\.(xlsx|csv)$/i, ""));
		} catch (error) {
			toast.error(
				error instanceof Error
					? `Could not read that file: ${error.message}`
					: "Could not read that file.",
			);
		} finally {
			setReading(false);
		}
	};

	const rows = prepared?.rows ?? [];
	const columns = useMemo(() => columnsOf(sheet?.headers ?? []), [sheet]);
	const preview = rows.slice(0, PREVIEW_ROWS).map((row, line) => ({
		...row,
		line: `line-${line + 2}`,
	}));
	const tooMany = rows.length > INVESTORS.import.maxRows;

	return (
		<div className="flex flex-col gap-4 pb-8">
			<Card>
				<CardHeader>
					<CardTitle>Upload investors from a spreadsheet</CardTitle>
					<CardDescription>
						An Excel (.xlsx) or CSV file with one investor per row and the
						column names in the first row. The agent scores each new investor
						against your profile; anyone already in the pipeline is skipped.
					</CardDescription>
				</CardHeader>
				<CardPanel size="content">
					<div className="flex flex-wrap items-center gap-3 p-5 md:p-6">
						<Label htmlFor={fileId} className="sr-only">
							Spreadsheet
						</Label>
						<Input
							id={fileId}
							type="file"
							accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
							disabled={reading || save.isPending}
							onChange={(event) => void choose(event.target.files?.[0])}
							className="w-full sm:w-auto"
						/>
						{reading ? <Spinner /> : null}
						<Button variant="outline" size="sm" onClick={downloadTemplate}>
							<Icon icon={Download} data-icon="inline-start" />
							Download a template
						</Button>
					</div>
				</CardPanel>
			</Card>

			{sheet ? (
				<Card>
					<CardHeader>
						<CardTitle>Check the columns</CardTitle>
						<CardDescription>
							{sheet.fileName}: {sheet.rows.length} rows. Match each field to a
							column. Only the name is needed.
						</CardDescription>
					</CardHeader>
					<CardPanel size="content">
						<div className="flex flex-col gap-5 p-5 md:p-6">
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								{IMPORT_FIELDS.map((field) => (
									<MappingRow
										key={field.key}
										field={field}
										columns={columns}
										value={mapping[field.key]}
										onChange={(index) =>
											setMapping((current) => {
												const next = { ...current };
												if (index === undefined) delete next[field.key];
												else next[field.key] = index;
												return next;
											})
										}
									/>
								))}
							</div>

							<div className="flex flex-col gap-1.5">
								<span className="font-medium text-sm">Preview</span>
								{rows.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										No rows have a name yet. Pick the column that holds the
										investor's name.
									</p>
								) : (
									<ul className="flex flex-col divide-y rounded-lg border text-xs">
										{preview.map((row) => (
											<li
												key={row.line}
												className="flex flex-wrap gap-x-3 px-3 py-2"
											>
												<span className="font-medium">{row.name}</span>
												<span className="text-muted-foreground">
													{[
														row.firm,
														row.location,
														row.email,
														row.sectors.join(", "),
													]
														.filter(Boolean)
														.join(" · ")}
												</span>
											</li>
										))}
									</ul>
								)}
								<span className="text-muted-foreground text-xs">
									{rows.length} investors ready
									{prepared && prepared.skipped > 0
										? `, ${prepared.skipped} rows without a name skipped`
										: ""}
									.
									{tooMany
										? ` One upload takes up to ${INVESTORS.import.maxRows}; split the file.`
										: ""}
								</span>
							</div>

							<div className="flex flex-wrap items-end gap-3">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={labelId}>Name this list</Label>
									<Input
										id={labelId}
										value={label}
										onChange={(event) => setLabel(event.target.value)}
										placeholder="Jenna shortlist"
										className="w-full sm:w-64"
									/>
								</div>
								<Button
									disabled={
										rows.length === 0 ||
										tooMany ||
										!label.trim() ||
										save.isPending
									}
									onClick={() => save.mutate({ label: label.trim(), rows })}
								>
									{save.isPending ? <Spinner /> : null}
									Import {rows.length} investors
								</Button>
							</div>
						</div>
					</CardPanel>
				</Card>
			) : null}
		</div>
	);
}
