"use client";

import Draggable from "@carbon/icons-react/es/Draggable";
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode, useId } from "react";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";

export function SortableList({
	ids,
	onReorder,
	children,
}: {
	ids: string[];
	onReorder: (ids: string[]) => void;
	children: ReactNode;
}) {
	const id = useId();
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const onDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const from = ids.indexOf(String(active.id));
		const to = ids.indexOf(String(over.id));
		if (from === -1 || to === -1) return;

		onReorder(arrayMove(ids, from, to));
	};

	return (
		<DndContext
			id={id}
			sensors={sensors}
			collisionDetection={closestCenter}
			modifiers={[restrictToVerticalAxis, restrictToParentElement]}
			onDragEnd={onDragEnd}
		>
			<SortableContext items={ids} strategy={verticalListSortingStrategy}>
				{children}
			</SortableContext>
		</DndContext>
	);
}

export function SortableItem({
	id,
	label,
	grip = "handle",
	className,
	children,
}: {
	id: string;
	label: string;
	grip?: "handle" | "item";
	className?: string;
	children: ReactNode;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id });

	const style = { transform: CSS.Transform.toString(transform), transition };

	if (grip === "item") {
		return (
			<div
				ref={setNodeRef}
				style={style}
				className={cn(isDragging && "relative z-10", className)}
				{...listeners}
			>
				{children}
			</div>
		);
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"flex items-center gap-2.5",
				isDragging && "relative z-10 bg-background",
				className,
			)}
		>
			<Button
				ref={setActivatorNodeRef}
				type="button"
				variant="ghost"
				size="icon-xs"
				className="cursor-grab text-muted-foreground"
				{...attributes}
				{...listeners}
			>
				<Icon icon={Draggable} />
				<span className="sr-only">Reorder {label}</span>
			</Button>
			{children}
		</div>
	);
}
