import {
	createLoader,
	parseAsInteger,
	parseAsStringLiteral,
} from "nuqs/server";
import { SEARCH_PARAM } from "@/lib/search-param-keys";

export const TODO_VIEWS = ["suggested", "mine", "done", "ignored"] as const;

export type TodoView = (typeof TODO_VIEWS)[number];

export const todosParsers = {
	[SEARCH_PARAM.todos.view]:
		parseAsStringLiteral(TODO_VIEWS).withDefault("suggested"),
	[SEARCH_PARAM.list.page]: parseAsInteger.withDefault(1),
};

export const loadTodosSearchParams = createLoader(todosParsers);
