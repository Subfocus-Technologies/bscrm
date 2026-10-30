"use client";

import { Button } from "@crm/ui/components/button";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useTRPC } from "@/lib/trpc/client";

const LOOKUP = { debounceMs: 400, minLength: 2 } as const;

export function EmailAddressField({
	label,
	value,
	personName,
	placeholder,
	onChange,
}: {
	label: string;
	value: string;
	personName: string;
	placeholder?: string;
	onChange: (next: string) => void;
}) {
	const trpc = useTRPC();
	const id = useId();
	const touched = useRef(false);
	const wanted = value.includes("@") ? "" : value.trim() || personName.trim();
	const [search, setSearch] = useState(wanted);

	useEffect(() => {
		const timer = setTimeout(() => setSearch(wanted), LOOKUP.debounceMs);
		return () => clearTimeout(timer);
	}, [wanted]);

	const looking = wanted.length >= LOOKUP.minLength && wanted === search;
	const found = useQuery({
		...trpc.google.findAddresses.queryOptions({ query: search }),
		enabled: looking,
	});
	const people = looking ? (found.data ?? []) : [];
	const onlyMatch =
		!touched.current && !value && people.length === 1 ? people[0] : null;

	useEffect(() => {
		if (onlyMatch) onChange(onlyMatch.email);
	}, [onlyMatch, onChange]);

	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				value={value}
				placeholder={placeholder}
				onChange={(event) => {
					touched.current = true;
					onChange(event.target.value);
				}}
			/>
			{looking && found.isPending ? (
				<p className="text-muted-foreground text-xs">
					Looking in your Gmail and contacts.
				</p>
			) : null}
			{looking && !found.isPending && people.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					Nothing found for {wanted}. Type the address.
				</p>
			) : null}
			{people.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{people.map((person) => (
						<Button
							key={person.email}
							type="button"
							size="sm"
							variant="outline"
							className="max-w-full"
							onClick={() => {
								touched.current = true;
								onChange(person.email);
							}}
						>
							<span className="truncate">
								{person.name ? `${person.name}, ` : ""}
								{person.email}
							</span>
						</Button>
					))}
				</div>
			) : null}
		</Field>
	);
}
