const webpack = require('webpack');

module.exports = (phase) => {
  return {
    experimental: {
      externalDir: true,
      serverComponentsExternalPackages: ['sharp']
    },
    allowedDevOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'],
    transpilePackages: ['@phoenix-zero/core'],
    distDir: '.next',
    async headers() {
      return [
        {
          source: '/phoenix-zero-embed.v1.js',
          headers: [
            { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
            { key: 'Access-Control-Allow-Origin', value: '*' }
          ]
        },
        {
          source: '/phoenix-zero-image-embed.v1.js',
          headers: [
            { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
            { key: 'Access-Control-Allow-Origin', value: '*' }
          ]
        },
        {
          source: '/phoenix-zero-live-embed.v1.js',
          headers: [
            { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
            { key: 'Access-Control-Allow-Origin', value: '*' }
          ]
        },
        {
          source: '/phoenix-zero-sdk.v1.js',
          headers: [
            { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
            { key: 'Access-Control-Allow-Origin', value: '*' }
          ]
        }
      ];
    },
    webpack: (config, { isServer }) => {
      if (isServer) {
        if (Array.isArray(config.externals)) {
          config.externals.push(({ request }, callback) => {
            if (request === 'sharp') return callback(null, 'commonjs sharp');
            return callback();
          });
        }
      }

      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        '@img/sharp-libvips-dev': false,
        '@img/sharp-libvips-dev/include': false,
        '@img/sharp-libvips-dev/cplusplus': false,
        '@img/sharp-wasm32': false,
        '@img/sharp-wasm32/versions': false
      };

      config.plugins = config.plugins || [];
      config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@img\// }));

      return config;
    }
  };
};
