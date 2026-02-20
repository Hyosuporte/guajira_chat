const esbuild = require('esbuild');

// Este plugin intercepta todas las importaciones de CSS y las vacía
// para evitar errores de resolución en node_modules y que no se genere un archivo .css de salida
const ignoreCSSPlugin = {
  name: 'ignore-css',
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, (args) => {
      return { path: args.path, namespace: 'ignore-css-ns' };
    });

    build.onLoad({ filter: /.*/, namespace: 'ignore-css-ns' }, () => {
      return {
        contents: '',
        loader: 'js',
      };
    });
  },
};

esbuild
  .build({
    entryPoints: ['AssistantWidget/widget.tsx'],
    bundle: true,
    outfile: './public/widget.js',
    format: 'iife',
    globalName: 'AssistantModalWidget',
    minify: true,
    target: ['es2020'],
    platform: 'browser',
    plugins: [ignoreCSSPlugin],
    external: [],
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
    },
    inject: ['./react-shim.js'],
  })
  .catch(() => process.exit(1));
