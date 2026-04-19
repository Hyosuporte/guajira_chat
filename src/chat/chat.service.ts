import { Injectable } from '@nestjs/common';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { DatabaseService } from 'src/common/database/database.service';
import { z } from 'zod';

@Injectable()
export class ChatService {
  constructor(private readonly db: DatabaseService) {}

  async processMessage(message: string) {
    const result = await generateText({
      model: openai('gpt-4o'),
      system: ``,
      prompt: message,
      tools: {
        runSQL: tool({
          description: 'Ejeuta consultas SQL SELET',
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            const res = await this.db.query(query);
            return res.rows;
          },
        }),
      },
    });
    return result.response;
  }
}
