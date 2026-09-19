// PostCSS config — enables Tailwind CSS v4 (used via `@import "tailwindcss"` in
// src/index.css). Without this file none of the utility classes compile and the
// UI renders unstyled.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
