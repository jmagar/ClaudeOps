/** @type {import('postcss-load-config').Config} */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {
      // Use browserslist from .browserslistrc
      flexbox: 'no-2009'
    }
  }
};