import { Injectable, OnModuleInit } from '@nestjs/common';
import { FlagEmbedding, EmbeddingModel } from 'fastembed';
import { DatabaseService } from '../common/database/database.service';

export interface ViewEmbedding {
  view_name: string;
  schema_name: string;
  metadata: Record<string, any>;
  similarity: number;
}

@Injectable()
export class EmbeddingsService implements OnModuleInit {
  private embeddingModel: FlagEmbedding;

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    this.embeddingModel = await FlagEmbedding.init({
      model: EmbeddingModel.BGESmallEN,
    });
  }

  async embedSentence(query: string): Promise<number[]> {
    let embedding: number[] | null = null;
    const generator = this.embeddingModel.embed([query]);
    for await (const batch of generator) {
      embedding = Array.from(batch[0]);
    }
    return embedding || [];
  }

  async search(userTextEmbedding: number[]): Promise<ViewEmbedding[]> {
    const query = `
      SELECT
        view_name,
        schema_name,
        metadata,
        embedding <-> $1 AS similarity
      FROM view_embeddings
      ORDER BY similarity
      LIMIT 3;
    `;

    const vectorString = `[${userTextEmbedding.join(',')}]`;
    const { rows } = await this.db.query(query, [vectorString]);
    return rows as ViewEmbedding[];
  }
}
