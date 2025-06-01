import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export class OpenAiService {
    private openai: OpenAI;

    constructor(apiKey: string) {
        this.openai = new OpenAI({
            apiKey: apiKey,
        });
    }

    public async getEmbedding(text: string) {
        const response = await this.openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: text,
            encoding_format: 'float',
        });
        return response.data[0].embedding;
    }

    public async generateScript(
        idea: string,
        vertical: string,
        notes: string
    ): Promise<{ script: string }> {
        const jsonSchema = {
            script: 'The complete voiceover script',
        };

        const userPrompt = `
        Here is an idea for a roofing offer where homeowners can get a brand new roof from a new government program.
        Generate the dialog for the voiceover in JSON format. Strictly follow the schema.
        The voiceover will be read over a video of roofing b-roll.
        Do not include any formatting, including new lines, in the script.
        Please turn this idea into a medium length facebook ad video script:

        Idea: ${idea}

        Here are some additional notes:
        ${notes}
        `;

        return this.getChatCompletionAsJson<{ script: string }>(
            userPrompt,
            'You are a helpful assistant that generates voiceover scripts for ads.',
            jsonSchema
        );
    }

    public async generateScriptUpdate(
        originalScript: string,
        updateRequest: string
    ): Promise<{ script: string }> {
        const jsonSchema = {
            script: 'The updated voiceover script',
        };

        const userPrompt = `
        Here is the original script:
        ${originalScript}

        Here is the update request:
        ${updateRequest}

        Please generate an updated script that incorporates the update request.
        `;

        return this.getChatCompletionAsJson<{ script: string }>(
            userPrompt,
            'You are a helpful assistant that generates voiceover scripts for ads.',
            jsonSchema
        );
    }

    private async getChatCompletionAsJson<T>(
        userPrompt: string,
        systemPrompt: string,
        schema?: Record<string, string>
    ): Promise<T> {
        const messages: ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content: systemPrompt,
            },
            { role: 'user', content: userPrompt },
        ];

        // If schema is provided, add it to the system message
        if (schema) {
            const schemaStr = JSON.stringify(schema, null, 2);
            const systemMsg = messages.find((msg) => msg.role === 'system');
            if (systemMsg) {
                systemMsg.content += `\n\nRespond with a JSON object using the following schema:\n${schemaStr}`;
            }
        }

        const response = await this.openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0].message.content;
        return JSON.parse(content || '{}') as T;
    }
}
