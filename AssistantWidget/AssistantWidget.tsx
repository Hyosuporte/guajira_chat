/* import { AssistantModal } from '@/components/assistant-modal'; */
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import { useChatRuntime } from '@assistant-ui/react-ai-sdk';

type AssistantWidgetProps = {
  apiUrl?: string;
};

export default function AssistantWidget({ apiUrl }: AssistantWidgetProps) {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: apiUrl,
    }),
  });
  if (!apiUrl) return null;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* <AssistantModal /> */}
    </AssistantRuntimeProvider>
  );
}
