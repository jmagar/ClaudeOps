/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {
      // Use browserslist from .browserslistrc
      flexbox: 'no-2009'
    }
  }
};

export default config;