import { Badge } from "@crm/ui/components/badge";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";

export type ListedBusiness = {
	id: string;
	name: string;
};

export function BusinessesCell({
	businesses,
}: {
	businesses: ListedBusiness[];
}) {
	const [first, ...rest] = businesses;
	if (!first) return <EmptyCellValue />;

	return (
		<span className="flex min-w-0 items-center gap-1">
			<Badge variant="token">{first.name}</Badge>
			{rest.length > 0 ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<Badge variant="token">+{rest.length}</Badge>
					</TooltipTrigger>
					<TooltipContent>
						{rest.map((business) => business.name).join(", ")}
					</TooltipContent>
				</Tooltip>
			) : null}
		</span>
	);
}
