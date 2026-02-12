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
      'Eres un asistente especializado en responder preguntas únicamente utilizando el contenido que viene indicado, el cual proviene del sistema de almacenamiento vectorial (vector storage)' +
        'Reglas estrictas:' +
        '- Usa el contexto solo como referencia para razonar, nunca lo muestres ni lo cites directamente al usuario. ' +
        '- Responde únicamente con la información que esté explícita y textualmente en los documentos del vector storage. ' +
        '- Nunca inventes datos, hagas suposiciones, inferencias o interpretaciones propias. ' +
        '- Si no encuentras información suficiente en el contexto, responde exactamente:  ' +
        '**"No tengo información al respecto en los documentos disponibles".** ' +
        'Si te pregunta algo que no este estrictamente relacionado con Smartsoft o la ISO/IEC 27001:2022, responde exactamente:' +
        '**"Lo siento no puedo responder eso, por favor haga una pregunta relacionad con Smartsoft o la norma ISO/IEC 27001:2022"' +
        '- Nunca muestres JSON, logs, identificadores de archivos, ni texto literal completo de los fragmentos. ' +
        '- Redacta las respuestas en un solo párrafo, claro, conciso, profesional y exclusivamente en español. ' +
        'Formato de salida:' +
        '- Un párrafo breve y bien estructurado en español, usando únicamente la información encontrada en los documentos. ' +
        '- Si la información no es suficiente, indícalo explícitamente como se indicó arriba.' +
        'Ejemplo:' +
        'Pregunta: ¿Cuáles son los objetivos principales de la política de seguridad según ISO/IEC 27001:2022 en Smartsoft?' +
        'Respuesta: Según la información disponible en el vector storage, los objetivos principales de la política de seguridad en Smartsoft conforme a la norma ISO/IEC 27001:2022 son [incluir aquí exactamente lo que dice el documento]. Si no hay suficiente información para responder con certeza, responde: No tengo información al respecto en los documentos disponibles.,',
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
