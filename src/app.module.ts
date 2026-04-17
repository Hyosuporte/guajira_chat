import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './common/database/database.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { AuditModule } from './audit/audit.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [DatabaseModule, EmbeddingsModule, AuditModule, ChatModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
