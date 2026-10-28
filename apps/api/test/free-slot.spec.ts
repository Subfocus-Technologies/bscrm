import { describe, expect, it } from "bun:test";
import { firstFreeSlot } from "../src/todos/free-slot";

const at = (iso: string) => new Date(iso);

describe("firstFreeSlot", () => {
	it("takes the next quarter hour inside working hours", () => {
		const slot = firstFreeSlot({
			busy: [],
			from: at("2026-10-28T10:07:00Z"),
			until: at("2026-11-11T00:00:00Z"),
		});

		expect(slot).toEqual({
			start: at("2026-10-28T10:15:00Z"),
			end: at("2026-10-28T10:45:00Z"),
		});
	});

	it("steps past meetings already in the diary", () => {
		const slot = firstFreeSlot({
			busy: [
				{ start: at("2026-10-28T10:00:00Z"), end: at("2026-10-28T11:30:00Z") },
				{ start: at("2026-10-28T11:45:00Z"), end: at("2026-10-28T12:00:00Z") },
			],
			from: at("2026-10-28T10:00:00Z"),
			until: at("2026-11-11T00:00:00Z"),
		});

		expect(slot?.start).toEqual(at("2026-10-28T12:00:00Z"));
	});

	it("moves an evening request to the next working morning, skipping the weekend", () => {
		const slot = firstFreeSlot({
			busy: [],
			from: at("2026-10-30T18:30:00Z"),
			until: at("2026-11-11T00:00:00Z"),
		});

		expect(slot?.start).toEqual(at("2026-11-02T09:00:00Z"));
	});

	it("follows UK summer time", () => {
		const slot = firstFreeSlot({
			busy: [],
			from: at("2026-10-23T05:00:00Z"),
			until: at("2026-11-11T00:00:00Z"),
		});

		expect(slot?.start).toEqual(at("2026-10-23T08:00:00Z"));
	});

	it("finds nothing when the diary is full until the deadline", () => {
		const slot = firstFreeSlot({
			busy: [
				{ start: at("2026-10-28T09:00:00Z"), end: at("2026-10-28T18:00:00Z") },
			],
			from: at("2026-10-28T09:00:00Z"),
			until: at("2026-10-28T23:00:00Z"),
		});

		expect(slot).toBeNull();
	});
});
