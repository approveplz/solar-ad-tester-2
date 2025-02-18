import dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';

import fs from 'fs';
import {
    getScrapedAdsFirestoreAll,
    getScrapedAdFirestore,
} from '../firestoreCloud.js';

export class OpenAiService {
    private openai: OpenAI;
    private embeddingCache: {
        videoIdentifier: string;
        description: string;
        vector: number[];
    }[] = [];

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

    public cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dotProduct = 0.0;
        let normA = 0.0;
        let normB = 0.0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] ** 2;
            normB += vecB[i] ** 2;
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    public async buildEmbeddingCache(): Promise<void> {
        console.log('building embeddings cache');

        const scrapedAdDataFirestore = await getScrapedAdsFirestoreAll();
        const descriptions =
            scrapedAdDataFirestore.map((ad) => ({
                videoIdentifier: ad.videoIdentifier,
                videoDescription: ad.description,
            })) || [];

        for (const { videoIdentifier, videoDescription } of descriptions) {
            const vector = await this.getEmbedding(videoDescription);
            this.embeddingCache.push({
                videoIdentifier,
                description: videoDescription,
                vector,
            });
        }
        this.saveEmbeddingCacheToFile('./embeddings.json');

        console.log('done building embeddings cache');
    }

    public async saveEmbeddingCacheToFile(filePath: string): Promise<void> {
        try {
            await fs.writeFileSync(
                filePath,
                JSON.stringify(this.embeddingCache, null, 2)
            );
            console.log(`Embedding cache saved to ${filePath}`);
        } catch (error) {
            console.error('Error saving embedding cache: ', error);
        }
    }

    public async findMostSimilar(text: string): Promise<{
        bestMatch: string | null;
        bestScore: number;
        videoIdentifier: string;
        newVector: number[];
    }> {
        const newVector = await this.getEmbedding(text);
        let bestScore = -Infinity;
        let bestMatch: string | null = null;
        let videoIdentifier = '';

        for (const item of this.embeddingCache) {
            const score = this.cosineSimilarity(newVector, item.vector);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = item.description;
                videoIdentifier = item.videoIdentifier;
            }
        }

        return { bestMatch, bestScore, videoIdentifier, newVector };
    }
}
