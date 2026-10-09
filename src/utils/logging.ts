// Error logging that never prints the error object itself: Sequelize/pg errors
// carry the SQL, bind parameters and connection config, and body-parser errors
// carry the raw request body. Only a few fields are picked, then scrubbed.

const secretEnvNames = ['DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'YOUTH_POLICY_API_KEY'];

function secretValues() {
  const values = secretEnvNames.map((name) => process.env[name]);
  try {
    const password = new URL(process.env.DATABASE_URL ?? '').password;
    values.push(password, decodeURIComponent(password));
  } catch { /* not a URL: the whole value is still scrubbed */ }
  return values.filter((value): value is string => !!value && value.length >= 6);
}

export function redact(text: string) {
  let result = text;
  for (const secret of secretValues()) result = result.split(secret).join('[redacted]');
  return result
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/Bearer\s+[^\s"',]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[\w-]{8,}\.[\w-]+\.[\w-]+/g, '[redacted]');
}

function describe(error: unknown, withStack: boolean) {
  if (!(error instanceof Error)) return `non-Error thrown (${typeof error})`;
  const { name } = error;
  const source = error as Error & { code?: unknown; parent?: { code?: unknown }; body?: unknown; type?: unknown };
  const code = source.code ?? source.parent?.code;
  // A malformed JSON body's SyntaxError quotes the body; pg quotes rejected
  // values ("invalid input syntax for type uuid: \"...\"").
  let message = error.message;
  if ('body' in source) message = `request body rejected${typeof source.type === 'string' ? ` (${source.type})` : ''}`;
  else if (name.startsWith('Sequelize')) message = message.replace(/"[^"]*"/g, '"…"');
  let line = `${name}${typeof code === 'string' || typeof code === 'number' ? ` [${code}]` : ''}: ${message}`;
  // Only the frames: the stack's first line repeats the unfiltered message.
  if (withStack && error.stack) line += `\n${error.stack.split('\n').filter((frame) => /^\s+at /.test(frame)).join('\n')}`;
  return line;
}

export function logError(event: string, error: unknown, options: { context?: string; stack?: boolean } = {}) {
  console.error(redact(`${event}${options.context ? ` ${options.context}` : ''}: ${describe(error, options.stack ?? false)}`));
}
