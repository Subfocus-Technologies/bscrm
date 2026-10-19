"use client";

import { useBusinessFocus } from "@/lib/business-focus";
import { useBusinesses } from "./use-businesses";

export function BusinessCrumb() {
	const focus = useBusinessFocus();
	const businesses = useBusinesses();
	const current = businesses.data?.find((business) => business.id === focus);

	return (
		<>
			<span aria-hidden className="text-muted-foreground text-sm">
				/
			</span>
			<span className="min-w-0 truncate text-muted-foreground text-sm">
				{current ? current.name : "All businesses"}
			</span>
		</>
	);
}
