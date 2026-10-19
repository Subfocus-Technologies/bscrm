"use client";

import { cn } from "@crm/ui/lib/utils";
import { Avatar as AvatarPrimitive } from "radix-ui";
import type * as React from "react";

const AVATAR_TONES = [
	"chart-1",
	"chart-2",
	"chart-3",
	"chart-4",
	"chart-5",
] as const;

type AvatarTone = "neutral" | (typeof AVATAR_TONES)[number];

function Avatar({
	className,
	size = "default",
	tone,
	selected = false,
	...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
	size?: "default" | "xs" | "sm" | "lg";
	tone?: AvatarTone;
	selected?: boolean;
}) {
	return (
		<AvatarPrimitive.Root
			data-slot="avatar"
			data-size={size}
			data-tone={tone}
			data-selected={selected}
			className={cn(
				"group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 data-[size=xs]:size-5 dark:after:mix-blend-lighten",
				"data-[tone]:ring-2 data-[tone]:after:hidden data-[tone=neutral]:ring-muted-foreground/40 data-[tone=chart-1]:ring-chart-1 data-[tone=chart-2]:ring-chart-2 data-[tone=chart-3]:ring-chart-3 data-[tone=chart-4]:ring-chart-4 data-[tone=chart-5]:ring-chart-5 data-[selected=true]:ring-offset-2 data-[selected=true]:ring-offset-background",
				className,
			)}
			{...props}
		/>
	);
}

function AvatarImage({
	className,
	referrerPolicy = "no-referrer",
	...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
	return (
		<AvatarPrimitive.Image
			data-slot="avatar-image"
			referrerPolicy={referrerPolicy}
			className={cn(
				"aspect-square size-full rounded-full object-cover",
				className,
			)}
			{...props}
		/>
	);
}

function AvatarFallback({
	className,
	...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
	return (
		<AvatarPrimitive.Fallback
			data-slot="avatar-fallback"
			className={cn(
				"flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs group-data-[size=xs]/avatar:text-[10px] group-data-[selected=true]/avatar:font-semibold group-data-[selected=true]/avatar:text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="avatar-badge"
			className={cn(
				"absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
				"group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
				"group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
				"group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
				className,
			)}
			{...props}
		/>
	);
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="avatar-group"
			className={cn(
				"group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
				className,
			)}
			{...props}
		/>
	);
}

function AvatarGroupCount({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="avatar-group-count"
			className={cn(
				"relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
				className,
			)}
			{...props}
		/>
	);
}

export {
	AVATAR_TONES,
	type AvatarTone,
	Avatar,
	AvatarBadge,
	AvatarFallback,
	AvatarGroup,
	AvatarGroupCount,
	AvatarImage,
};
