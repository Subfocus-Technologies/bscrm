"use client";

import Apps from "@carbon/icons-react/es/Apps";
import {
	AVATAR_TONES,
	Avatar,
	AvatarFallback,
	type AvatarTone,
} from "@crm/ui/components/avatar";
import { Icon } from "@crm/ui/components/icon";
import { businessInitials } from "./business-initials";
import type { Business } from "./use-businesses";

function businessTone(tone: number): AvatarTone {
	return AVATAR_TONES[Math.abs(tone) % AVATAR_TONES.length] ?? "neutral";
}

export function BusinessAvatar({
	business,
	selected = false,
}: {
	business: Business;
	selected?: boolean;
}) {
	return (
		<Avatar size="sm" tone={businessTone(business.tone)} selected={selected}>
			<AvatarFallback>{businessInitials(business.name)}</AvatarFallback>
		</Avatar>
	);
}

export function AllBusinessesAvatar({
	selected = false,
}: {
	selected?: boolean;
}) {
	return (
		<Avatar size="sm" tone="neutral" selected={selected}>
			<AvatarFallback>
				<Icon icon={Apps} className="size-3.5" />
			</AvatarFallback>
		</Avatar>
	);
}
