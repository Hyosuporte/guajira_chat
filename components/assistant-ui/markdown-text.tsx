'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import '@assistant-ui/react-markdown/styles/dot.css';

import {
  CodeHeaderProps,
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import { FC, memo, useState } from 'react';
import { CheckIcon, CopyIcon, FileDown } from 'lucide-react';

import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button';
import { cn } from '@/lib/utils';

interface ExcelReport {
  type: 'excel_report';
  excelId: string;
  fileName: string;
  title: string;
  recordCount: number;
  preview: any[];
  columns: string[];
}

function parseExcelData(content: string): ExcelReport | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === 'excel_report' && parsed.excelId) {
      console.log('✅ Detectado como excel_report válido');
      return parsed;
    }
  } catch (e) {
    console.log('❌ No se pudo parsear como JSON directo', e);
  }
  return null;
}

// Componente para detectar y renderizar Excel
const ExcelReportCard: FC<{ content: ExcelReport }> = ({ content }) => {
  console.log('🎉 Excel data detectada:', {
    title: content.title,
    excelId: content.excelId,
    recordCount: content.recordCount,
    columns: content.columns?.length || 0,
  });

  const handleDownload = async () => {
    try {
      const response = await fetch(
        `http://localhost:8080/download-excel/${content.excelId}`,
      );
      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
        throw new Error(`Error al descargar: ${response.status}`);
      }

      const blob = await response.blob();
      console.log('📦 Blob recibido:', blob.size, 'bytes');

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = content.fileName;
      document.body.appendChild(a);
      a.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      console.log('✅ Descarga completada');
    } catch (error) {
      console.error('❌ Error descargando Excel:', error);
      alert(`Error al descargar el archivo: ${error}`);
    }
  };

  return (
    <div className="relative mb-4 rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{content.title}</h3>
        <TooltipIconButton tooltip="Download Excel" onClick={handleDownload}>
          <FileDown className="h-5 w-5" />
        </TooltipIconButton>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-400">
          <thead className="bg-gray-50">
            <tr>
              {content.columns.map((col) => (
                <th
                  key={col}
                  className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-black"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-400 bg-white">
            {content.preview.map((row, idx) => (
              <tr key={idx}>
                {content.columns.map((col) => (
                  <td
                    key={col}
                    className="whitespace-pre-line px-6 py-4 text-sm text-gray-900"
                  >
                    {row[col] !== null && row[col] !== undefined
                      ? String(row[col])
                      : '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TextWrapper: FC<{ children: string }> = ({ children }) => {
  const excelData = parseExcelData(children);

  if (excelData) {
    console.log('✅ [TextWrapper] Es un Excel, renderizando ExcelReportCard');
    return <ExcelReportCard content={excelData} />;
  }

  console.log('ℹ️ [TextWrapper] No es Excel, renderizando como texto normal');
  return <>{children}</>;
};

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-t-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
      <span className="lowercase [&>span]:text-xs">{language}</span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && <CopyIcon />}
        {isCopied && <CheckIcon />}
      </TooltipIconButton>
    </div>
  );
};

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number;
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = (value: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), copiedDuration);
    });
  };

  return { isCopied, copyToClipboard };
};

const defaultComponents = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        'mb-8 scroll-m-20 text-4xl font-extrabold tracking-tight last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        'mb-4 mt-8 scroll-m-20 text-3xl font-semibold tracking-tight first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        'mb-4 mt-6 scroll-m-20 text-2xl font-semibold tracking-tight first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        'mb-4 mt-6 scroll-m-20 text-xl font-semibold tracking-tight first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn(
        'my-4 text-lg font-semibold first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn('my-4 font-semibold first:mt-0 last:mb-0', className)}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p className={cn('mb-5 mt-5 leading-7 first:mt-0 last:mb-0', className)}>
      <TextWrapper>{props.children}</TextWrapper>
    </p>
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        'text-primary font-medium underline underline-offset-4',
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn('border-l-2 pl-6 italic', className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn('my-5 ml-6 list-disc [&>li]:mt-2', className)}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn('my-5 ml-6 list-decimal [&>li]:mt-2', className)}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn('my-5 border-b', className)} {...props} />
  ),
  table: ({ className, ...props }) => (
    <table
      className={cn(
        'my-5 w-full border-separate border-spacing-0 overflow-y-auto',
        className,
      )}
      {...props}
    />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        'bg-muted px-4 py-2 text-left font-bold first:rounded-tl-lg last:rounded-tr-lg [&[align=center]]:text-center [&[align=right]]:text-right',
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        'border-b border-l px-4 py-2 text-left last:border-r [&[align=center]]:text-center [&[align=right]]:text-right',
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(
        'm-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg',
        className,
      )}
      {...props}
    />
  ),
  sup: ({ className, ...props }) => (
    <sup
      className={cn('[&>a]:text-xs [&>a]:no-underline', className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        'overflow-x-auto rounded-b-lg bg-black p-4 text-white',
        className,
      )}
      {...props}
    />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();
    return (
      <code
        className={cn(
          !isCodeBlock && 'bg-muted rounded border font-semibold',
          className,
        )}
        {...props}
      />
    );
  },
  CodeHeader,
});

const MarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md"
      components={{
        ...defaultComponents,
      }}
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);
