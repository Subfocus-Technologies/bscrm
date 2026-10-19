"use client";

import { Button } from "@crm/ui/components/button";
import { cn } from "@crm/ui/lib/utils";
import { useState } from "react";

export function CollapsibleNotes({ body }: { body: string }) {
	const [open, setOpen] = useState(false);

	return (
		<div className="flex flex-col items-start gap-1">
			<p
				className={cn(
					"whitespace-pre-wrap text-pretty wrap-anywhere text-muted-foreground",
					!open && "line-clamp-4",
				)}
			>
				{body}
			</p>
			<Button variant="link" size="xs" onClick={() => setOpen(!open)}>
				{open ? "Show less" : "Show the full notes"}
			</Button>
		</div>
	);
}
