/** @type {import('postcss-load-config').Config} */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {
      // Use browserslist from .browserslistrc
      flexbox: 'no-2009'
    }
  }
};