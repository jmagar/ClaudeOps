/** @type {import('postcss-load-config').Config} */
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {
      // Use browserslist from .browserslistrc
      flexbox: 'no-2009'
    }
  }
};