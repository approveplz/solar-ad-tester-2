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
}
