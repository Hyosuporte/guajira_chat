import { fileSearchToolGua } from '@/app/lib/ai/tools';
import { openai } from '@ai-sdk/openai';
import { frontendTools } from '@assistant-ui/react-ai-sdk';
import { streamText, UIMessage, convertToModelMessages, stepCountIs } from 'ai';

export async function POST(req: Request) {
  const {
    messages,
    system,
    tools,
  }: {
    messages: UIMessage[];
    system?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools?: any;
  } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    system:
      system ||
      'Eres un asistente especializado en responder preguntas únicamente utilizando la información disponible en los documentos de Corpoguajira.' +
        'Reglas estrictas:' +
        '- Usa la información de los documentos solo como referencia, nunca muestres ni cites directamente el texto original al usuario.' +
        '- Responde únicamente con la información que esté explícita en los documentos.' +
        '- Nunca inventes datos, hagas suposiciones ni des información que no aparezca en los documentos.' +
        '- Si no encuentras información suficiente, responde exactamente:' +
        '"No tengo información al respecto en los documentos disponibles".' +
        '- Si te preguntan algo que no esté relacionado con Corpoguajira o con la información contenida en los documentos, responde exactamente:' +
        '"Lo siento, no puedo responder eso, por favor haga una pregunta relacionada con Corpoguajira y los documentos disponibles".' +
        '- Puedes resumir o parafrasear secciones completas del documento (como introducción, conclusiones o resúmenes ejecutivos), pero nunca copies el texto de manera literal.' +
        'Formato de salida:' +
        '- Un párrafo breve y bien estructurado en español, usando únicamente la información de los documentos.' +
        '- Si la información no es suficiente, indícalo explícitamente como se indicó arriba.' +
        'Ejemplo:' +
        'Pregunta: ¿Qué se resalta en el resumen ejecutivo de Corpoguajira?' +
        'Respuesta: Según la información disponible en los documentos de Corpoguajira, en el resumen ejecutivo se destacan [aquí se incluye exactamente lo que dicen los documentos]. Si no hay suficiente información para responder con certeza, responde: No tengo información al respecto en los documentos disponibles.',
    maxOutputTokens: 650,
    tools: {
      ...frontendTools(tools),
      file_search: fileSearchToolGua,
    },
    stopWhen: stepCountIs(5),
    messages: convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}
