import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Aplica solo al widget
        source: '/widget.js',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.ASSISTANT_BASE_URL || '',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
      {
        source: '/api/chat',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.ASSISTANT_BASE_URL || '',
          },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, User-Agent',
          },
        ],
      },
      {
        source: '/api/chat-gua',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.ASSISTANT_BASE_URL || '',
          },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
