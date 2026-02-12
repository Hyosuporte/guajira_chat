import { ToolCallContentPartComponent } from '@assistant-ui/react';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';

export const ToolFallback: ToolCallContentPartComponent = ({
  toolName,
  argsText,
  result,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const isFinished = result !== undefined;

  // Personaliza aquí los mensajes según el nombre de tu herramienta
  const getToolLabel = (name: string, finished: boolean) => {
    switch (name) {
      case 'sql_query': // Reemplaza con el nombre real de tu tool
        return finished
          ? 'Consulta SQL realizada'
          : 'Ejecutando consulta SQL...';
      case 'generate_excel':
        return finished ? 'Búsqueda completada' : 'Buscando información...';
      default:
        return finished
          ? `Herramienta usada: ${name}`
          : `Ejecutando: ${name}...`;
    }
  };

  return (
    <div className="mb-4 flex w-full flex-col gap-3 rounded-lg border py-3">
      <div className="flex items-center gap-2 px-4">
        {isFinished ? (
          <CheckIcon className="size-4 text-green-500" />
        ) : (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
        <p className="text-sm font-medium">
          {getToolLabel(toolName, isFinished)}
        </p>
        <div className="flex-grow" />
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronUpIcon className="size-4" />
          )}
        </Button>
      </div>
      {!isCollapsed && (
        <div className="flex flex-col gap-2 border-t pt-2 text-sm">
          <div className="px-4">
            <span className="font-semibold text-muted-foreground">
              Argumentos:
            </span>
            <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground/80">
              {argsText}
            </pre>
          </div>
          {result !== undefined && (
            <div className="border-t border-dashed px-4 pt-2">
              <span className="font-semibold text-muted-foreground">
                Resultado:
              </span>
              <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground/80">
                {typeof result === 'string'
                  ? result
                  : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
