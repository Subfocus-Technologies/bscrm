"use client";

import Idea from "@carbon/icons-react/es/Idea";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Lessons = RouterOutputs["lessons"]["list"];
type Lesson = Lessons["items"][number];

const SCOPE_LABELS = { PERSONAL: "Just me", TEAM: "Everyone" } as const;

function isScope(value: string): value is Lesson["scope"] {
	return value === "PERSONAL" || value === "TEAM";
}

function TeachForm() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [text, setText] = useState("");
	const [scope, setScope] = useState<Lesson["scope"]>("PERSONAL");

	const add = useMutation(
		trpc.lessons.add.mutationOptions({
			onSuccess: async () => {
				setText("");
				await cache.lessons();
				toast.success("The agent follows this from now on.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<div className="flex flex-col gap-2 rounded-lg border p-4">
			<Textarea
				value={text}
				rows={2}
				aria-label="Teach the agent"
				placeholder="Teach the agent something, for example: BS means Bricksmart"
				onChange={(event) => setText(event.target.value)}
			/>
			<div className="flex flex-wrap items-center gap-2">
				<Select
					value={scope}
					onValueChange={(next) => {
						if (isScope(next)) setScope(next);
					}}
				>
					<SelectTrigger size="sm" aria-label="Who this applies to">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="PERSONAL">{SCOPE_LABELS.PERSONAL}</SelectItem>
						<SelectItem value="TEAM">{SCOPE_LABELS.TEAM}</SelectItem>
					</SelectContent>
				</Select>
				<Button
					size="sm"
					disabled={add.isPending || !text.trim()}
					onClick={() => add.mutate({ text, scope })}
				>
					{add.isPending ? <Spinner /> : null}
					Add lesson
				</Button>
			</div>
		</div>
	);
}

function LessonRow({ lesson }: { lesson: Lesson }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const remove = useMutation(
		trpc.lessons.remove.mutationOptions({
			onSuccess: () => cache.lessons(),
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<li className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 text-sm md:px-5">
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<p className="text-pretty">{lesson.text}</p>
				<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
					<Badge variant="outline">{SCOPE_LABELS[lesson.scope]}</Badge>
					<span>
						{lesson.origin === "LEARNED" ? "Learned from" : "Taught by"}{" "}
						{lesson.author ?? "a former colleague"}
					</span>
					<LocalRelativeTime date={lesson.createdAt} />
				</div>
			</div>
			<Button
				size="sm"
				variant="ghost"
				disabled={remove.isPending}
				onClick={() => remove.mutate({ id: lesson.id })}
			>
				{remove.isPending ? <Spinner /> : null}
				Remove
			</Button>
		</li>
	);
}

export function LessonsList({
	query,
}: {
	query: {
		data: Lessons | undefined;
		isPending: boolean;
		isError: boolean;
		error: { message: string } | null;
		refetch: () => unknown;
	};
}) {
	return (
		<div className="flex flex-col gap-4">
			<TeachForm />
			{query.isPending ? (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			) : query.isError || !query.data ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>The lessons did not load</EmptyTitle>
						<EmptyDescription>{query.error?.message}</EmptyDescription>
					</EmptyHeader>
					<Button variant="outline" onClick={() => void query.refetch()}>
						Try again
					</Button>
				</Empty>
			) : query.data.items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Icon icon={Idea} />
						</EmptyMedia>
						<EmptyTitle>Nothing learned yet</EmptyTitle>
						<EmptyDescription>
							When you change the agent's work, skip a step or ask it to try
							again, it writes down what to do better here.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<ul className="flex flex-col divide-y rounded-lg border">
					{query.data.items.map((lesson) => (
						<LessonRow key={lesson.id} lesson={lesson} />
					))}
				</ul>
			)}
		</div>
	);
}
