'use client';

import { Thread } from '@/components/assistant-ui/thread';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import {
  AssistantChatTransport,
  useChatRuntime,
} from '@assistant-ui/react-ai-sdk';

export default function Home() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: 'http://localhost:8080',
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <h2 className="text-2xl text-black">Corpo Guajira</h2>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
