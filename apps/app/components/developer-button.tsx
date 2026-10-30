"use client";

import Code from "@carbon/icons-react/es/Code";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { useQuery } from "@tanstack/react-query";
import { developerLink } from "@/lib/developer-link";
import { useTRPC } from "@/lib/trpc/client";

const LABEL = "Developer";

export function DeveloperButton() {
	const trpc = useTRPC();
	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const folder = workspace.data?.developerFolder;

	if (!folder) return null;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="mt-auto text-muted-foreground"
					onClick={() => {
						window.location.href = developerLink(folder, window.location.href);
					}}
				>
					<Icon icon={Code} />
					<span className="sr-only">{LABEL}</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="right">{LABEL}</TooltipContent>
		</Tooltip>
	);
}
