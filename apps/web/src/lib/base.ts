// import.meta.env.BASE_URL is the literal `base` string from astro.config.mjs
// ('/scottish-tartan-finder', no trailing slash). Normalize once here so every
// internal link built as `${base}search` etc. joins correctly.
const raw = import.meta.env.BASE_URL;
export const base = raw.endsWith('/') ? raw : `${raw}/`;
