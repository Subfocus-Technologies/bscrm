"use client";

import { Combobox, type ComboboxOption } from "@crm/ui/components/combobox";
import { useSearchInput } from "@crm/ui/hooks/use-search-input";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc/client";

export type PickedRecord = { kind: "contact" | "company"; id: string };

const KIND_LABEL = {
	contact: "Contact",
	company: "Company",
} satisfies Record<PickedRecord["kind"], string>;

const MIN_SEARCH_LENGTH = 2;

function encode(record: PickedRecord): string {
	return `${record.kind}:${record.id}`;
}

function decode(value: string): PickedRecord | null {
	const [kind, id] = value.split(":");
	if (!id || (kind !== "contact" && kind !== "company")) return null;
	return { kind, id };
}

export function RecordPicker({
	value,
	onValueChange,
	placeholder = "Choose a contact or company",
	disabled,
	className,
}: {
	value: PickedRecord | null;
	onValueChange: (value: PickedRecord | null) => void;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
}) {
	const trpc = useTRPC();
	const [query, setQuery] = useState("");
	const [text, setText] = useSearchInput(query, setQuery);
	const [chosen, setChosen] = useState<ComboboxOption | null>(null);

	const search = useQuery({
		...trpc.search.quick.queryOptions({ q: query }),
		placeholderData: (previous) => previous,
	});

	const options: ComboboxOption[] = (search.data?.hits ?? []).flatMap((hit) =>
		hit.kind === "contact" || hit.kind === "company"
			? [
					{
						value: encode({ kind: hit.kind, id: hit.id }),
						label: hit.label,
						hint: [KIND_LABEL[hit.kind], hit.detail]
							.filter(Boolean)
							.join(" · "),
					},
				]
			: [],
	);

	const current = value ? encode(value) : "";
	const stale = search.isFetching || text.trim() !== query.trim();
	const empty =
		text.trim().length < MIN_SEARCH_LENGTH
			? "Type a name, email or domain."
			: search.isFetching
				? "Searching…"
				: "No contact or company matches.";

	return (
		<Combobox
			value={current}
			onValueChange={(next) => {
				setChosen(options.find((option) => option.value === next) ?? null);
				onValueChange(decode(next));
			}}
			options={options}
			selectedOption={chosen?.value === current ? chosen : undefined}
			disabled={disabled}
			placeholder={placeholder}
			searchPlaceholder="Search contacts and companies…"
			empty={empty}
			search={text}
			onSearchChange={setText}
			stale={stale}
			className={className}
		/>
	);
}
