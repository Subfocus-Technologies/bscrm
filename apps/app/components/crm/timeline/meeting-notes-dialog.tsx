"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import {
	MEETING_NOTE_SOURCES,
	type MeetingNoteSource,
} from "@crm/validation/meeting-notes";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { TimelineAnchor } from "./timeline";

const SOURCE_LABEL = {
	GEMINI: "Gemini",
	CLUELY: "Cluely",
	OTHER: "Other",
} satisfies Record<MeetingNoteSource, string>;

type NotesMeeting = { calendarEventId: string; title: string | null };

function NotesForm({
	anchor,
	meeting,
	onDone,
}: {
	anchor: TimelineAnchor;
	meeting: NotesMeeting | null;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const titleId = useId();
	const notesId = useId();
	const [source, setSource] = useState<MeetingNoteSource>("GEMINI");
	const [title, setTitle] = useState(meeting?.title ?? "");
	const [notes, setNotes] = useState("");

	const save = useMutation(
		trpc.meetingNotes.import.mutationOptions({
			onSuccess: async () => {
				await cache.meetingNotes();
				toast.success(
					"Notes saved. The agent is turning them into to-dos and next steps.",
				);
				onDone();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const ready = notes.trim().length > 0 && !save.isPending;

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!ready) return;
		save.mutate({
			...anchor,
			source,
			title: title || undefined,
			notes,
			calendarEventId: meeting?.calendarEventId,
		});
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-4">
			<DialogHeader>
				<DialogTitle>Paste meeting notes</DialogTitle>
				<DialogDescription>
					Paste the summary from Gemini, Cluely or any note taker. The agent
					suggests to-dos and next steps; nothing becomes a task until you
					accept it.
				</DialogDescription>
			</DialogHeader>

			<ToggleGroup
				type="single"
				value={source}
				onValueChange={(next) => next && setSource(next as MeetingNoteSource)}
				size="sm"
				spacing={0}
				aria-label="Where the notes came from"
			>
				{MEETING_NOTE_SOURCES.map((option) => (
					<ToggleGroupItem key={option} value={option}>
						{SOURCE_LABEL[option]}
					</ToggleGroupItem>
				))}
			</ToggleGroup>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor={titleId}>Title</Label>
				<Input
					id={titleId}
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="Intro call with Knight Frank"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor={notesId}>Notes</Label>
				<Textarea
					id={notesId}
					autoFocus
					rows={12}
					value={notes}
					onChange={(event) => setNotes(event.target.value)}
					placeholder="Paste the notes here"
				/>
			</div>

			<DialogFooter>
				<Button type="button" variant="outline" onClick={onDone}>
					Cancel
				</Button>
				<Button type="submit" disabled={!ready}>
					{save.isPending ? <Spinner /> : null}
					Save and suggest next steps
				</Button>
			</DialogFooter>
		</form>
	);
}

export function MeetingNotesDialog({
	anchor,
	meeting = null,
	open,
	onOpenChange,
}: {
	anchor: TimelineAnchor;
	meeting?: NotesMeeting | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-(--container-sheet)">
				{open ? (
					<NotesForm
						anchor={anchor}
						meeting={meeting}
						onDone={() => onOpenChange(false)}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
