const esbuild = require('esbuild');

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
    external: [],
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
    },
    inject: ['./react-shim.js'],
  })
  .catch(() => process.exit(1));
