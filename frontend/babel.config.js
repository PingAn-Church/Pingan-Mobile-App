module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // `@` resolves to the isolated e-learning TypeScript module.
      [
        'module-resolver',
        {
          alias: { '@': './src/learning' },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
      // reanimated's plugin must remain last.
      'react-native-reanimated/plugin',
    ],
  };
};
