"use client";

import { Button } from "@crm/ui/components/button";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const LOOKUP = { debounceMs: 400, minLength: 2 } as const;

const GMAIL_NOT_SEARCHED = {
	"not-connected":
		"Your Gmail is not connected, so this searched contacts only.",
	"needs-reconnect":
		"Your Gmail needs reconnecting, so this searched contacts only.",
	failed: "Gmail did not respond, so this searched contacts only.",
} satisfies Record<
	Exclude<RouterOutputs["google"]["findAddresses"]["gmail"], "searched">,
	string
>;

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
	const workspaceUrl = useWorkspaceUrl();
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
	const result = looking ? found.data : undefined;
	const people = result?.people ?? [];
	const gmail = result?.gmail;
	const onlyMatch =
		!touched.current && !value && gmail === "searched" && people.length === 1
			? people[0]
			: null;

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
			{looking && found.isError ? (
				<div className="flex flex-col items-start gap-2">
					<p className="text-muted-foreground text-xs">
						The search did not work. Type the address, or try again.
					</p>
					<Button
						type="button"
						size="xs"
						variant="outline"
						onClick={() => void found.refetch()}
					>
						Try again
					</Button>
				</div>
			) : null}
			{gmail === "searched" && people.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					Nothing found for {wanted}. Type the address.
				</p>
			) : null}
			{gmail && gmail !== "searched" ? (
				<div className="flex flex-col items-start gap-2">
					<p className="text-muted-foreground text-xs">
						{GMAIL_NOT_SEARCHED[gmail]}
					</p>
					{gmail === "failed" ? (
						<Button
							type="button"
							size="xs"
							variant="outline"
							onClick={() => void found.refetch()}
						>
							Try again
						</Button>
					) : (
						<Button asChild size="xs" variant="outline">
							<Link href={workspaceUrl("/settings/connections")}>
								Open Connections
							</Link>
						</Button>
					)}
				</div>
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
