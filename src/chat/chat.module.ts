import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatToolsService } from './chat-tools.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { DatabaseModule } from '../common/database/database.module';

@Module({
  imports: [EmbeddingsModule, DatabaseModule],
  controllers: [ChatController],
  providers: [ChatService, ChatToolsService],
})
export class ChatModule {}
