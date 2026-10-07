// Tests exercise the real authentication boundary: a local .env may set
// DEV_AUTH_BYPASS=true for development, but no test may run with it.
process.env.DEV_AUTH_BYPASS = 'false';
