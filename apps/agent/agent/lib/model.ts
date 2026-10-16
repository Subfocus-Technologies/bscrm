import { alibaba } from "@ai-sdk/alibaba";
import { db } from "@crm/db";
import { readAgentModel } from "@crm/db/settings";

export interface ModelSelection {
	model: string;
	modelContextWindowTokens: number;
}

export interface DirectModelSelection {
	model: ReturnType<typeof alibaba>;
	modelContextWindowTokens: number;
}

const QWEN_CONTEXT_WINDOW_TOKENS = 256_000;

export function directModel(): DirectModelSelection | null {
	if (!process.env.ALIBABA_API_KEY) return null;

	return {
		model: alibaba(process.env.QWEN_MODEL ?? "qwen3.6-plus"),
		modelContextWindowTokens: QWEN_CONTEXT_WINDOW_TOKENS,
	};
}

export async function selectedModel(): Promise<ModelSelection | null> {
	try {
		const setting = await readAgentModel(db);

		if (setting.isDefault) return null;

		return {
			model: setting.id,
			modelContextWindowTokens: setting.contextWindowTokens,
		};
	} catch (error) {
		console.error(
			`[agent] could not read the configured model, falling back: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return null;
	}
}
