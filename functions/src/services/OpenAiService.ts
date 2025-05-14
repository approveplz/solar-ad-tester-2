import OpenAI from 'openai';

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
        `;

        const messages = [
            {
                role: 'system',
                content:
                    'You are a helpful assistant that generates voiceover scripts for ads.',
            },
            { role: 'user', content: userPrompt },
        ];
        return this.getChatCompletionAsJson(messages, jsonSchema);
    }

    private async getChatCompletionAsJson<T>(
        messages: any[],
        schema?: Record<string, string>
    ): Promise<T> {
        // If schema is provided, add it to the system message
        if (schema) {
            const schemaStr = JSON.stringify(schema, null, 2);
            const systemMsg = messages.find((msg) => msg.role === 'system');

            if (systemMsg) {
                systemMsg.content += `\n\nRespond with a JSON object using the following schema:\n${schemaStr}`;
            } else {
                messages.unshift({
                    role: 'system',
                    content: `Respond with a JSON object using the following schema:\n${schemaStr}`,
                });
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
