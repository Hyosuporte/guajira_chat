import { tool } from 'ai';
import { z } from 'zod';
import OpenAI from 'openai';
/* eslint-disable @typescript-eslint/no-explicit-any */
const Openai = new OpenAI();

const fileSearchTool = tool({
  description:
    'Busca SIEMPRE en los documentos cargados cuando el usuario pregunte sobre Smartsoft y usarlos para redactar una respuesta',

  inputSchema: z.object({
    query: z.string(),
  }),

  execute: async ({ query }) => {
    const response = await Openai.vectorStores.search(
      process.env.VECTOR_STORE_ID!,
      { query, max_num_results: 3 },
    );

    const snippets = response.data
      .map((doc: any) => doc.content?.[0].text.trim() || '')
      .join('\n');

    return snippets;
  },
});

const fileSearchToolGua = tool({
  description:
    'Busca SIEMPRE en los documentos cargados cuando el usuario pregunte sobre Grupo guajira y usarlos para redactar una respuesta',

  inputSchema: z.object({
    query: z.string(),
  }),

  execute: async ({ query }) => {
    const response = await Openai.vectorStores.search(
      process.env.VECTOR_STORE_ID_GUA!,
      { query, max_num_results: 3 },
    );

    const snippets = response.data
      .map((doc: any) => doc.content?.[0].text.trim() || '')
      .join('\n');

    return snippets;
  },
});

const testFile = async () => {
  const listFIles = await Openai.vectorStores.files.delete(
    'file-ECESeWNHCG6TUgqBegk8BJ',
    { vector_store_id: 'vs_6893d029f25c81918cede3a3d1606564' },
  );
  console.log('Lista de archivos', listFIles);
};

export { fileSearchTool, fileSearchToolGua };
