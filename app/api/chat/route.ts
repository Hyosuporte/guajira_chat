import { fileSearchTool } from '@/app/lib/ai/tools';
import { openai } from '@ai-sdk/openai';
import { frontendTools } from '@assistant-ui/react-ai-sdk';
import { streamText, UIMessage, convertToModelMessages, stepCountIs } from 'ai';
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(req: Request) {
  const {
    messages,
    system,
    tools,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: any;
  } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    system:
      system ||
      'Eres un asistente especializado en responder preguntas utilizando exclusivamente la información contenida en los documentos almacenados en el sistema de almacenamiento vectorial relacionados con el Manual de SICO.' +
        'Reglas obligatorias:' +
        '- Usa únicamente la información contenida en los documentos recuperados del sistema vectorial.' +
        '- Puedes reformular y organizar la información para que la respuesta sea clara, coherente y profesional, pero no agregues datos que no estén explícitamente en los documentos.' +
        '- No inventes información, no hagas suposiciones, interpretaciones externas ni completes información faltante.' +
        '- Analiza semánticamente el contexto recuperado antes de decidir que no existe información suficiente.' +
        '- Si después de revisar el contexto no encuentras información relacionada con la pregunta, responde exactamente:' +
        '**"No tengo información al respecto en los documentos disponible"' +
        '- Si la pregunta no está estrictamente relacionada con el Manual de SICO, responde exactamente:' +
        '**"Lo siento no puedo responder eso, por favor haga una pregunta relacionada con SICO y SICA"' +
        '- Nunca muestres fragmentos textuales completos del documento, identificadores internos, JSON, logs ni referencias técnicas del sistema.' +
        '- La respuesta debe estar redactada exclusivamente en español.' +
        'Formato de salida:' +
        '- Un párrafo breve y bien estructurado en español, usando únicamente la información encontrada en los documentos. ' +
        '- Si la información no es suficiente, indícalo explícitamente como se indicó arriba.',
    maxOutputTokens: 120,
    tools: {
      ...frontendTools(tools),
      file_search: fileSearchTool,
    },
    stopWhen: stepCountIs(5),
    messages: convertToModelMessages(messages),
  });

  console.log(result.toUIMessageStreamResponse);
  return result.toUIMessageStreamResponse();
}
