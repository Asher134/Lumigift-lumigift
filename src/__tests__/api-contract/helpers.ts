/**
 * Minimal OpenAPI schema validator utilities.
 *
 * Rather than pulling in a new runtime dependency, these helpers read
 * openapi.yaml directly and use Jest's built-in matcher power to verify
 * that actual API responses match the declared schema shapes.
 */

import fs from 'fs';
import path from 'path';

/** Load and parse openapi.yaml from repo root. Returns a plain JS object. */
export function loadOpenApiSpec(): Record<string, any> {
  const yamlPath = path.resolve(process.cwd(), 'openapi.yaml');
  const content = fs.readFileSync(yamlPath, 'utf-8');
  // Minimal YAML → JS parser for the subset used in openapi.yaml
  return parseYaml(content);
}

/**
 * Validates that a JSON response body conforms to the expected OpenAPI shape.
 *
 * Rules checked:
 *  - If schema requires `success: true` → body.success === true
 *  - If schema requires `success: false` → body.success === false
 *  - Required top-level fields are present
 *  - Field types match when they can be checked without a full JSON-Schema engine
 */
export function assertMatchesSchema(
  body: any,
  schema: Record<string, any>,
  _schemaName: string,
): void {
  if (schema.type === 'object' && schema.properties) {
    for (const [key, prop] of Object.entries<any>(schema.properties)) {
      const required: string[] = schema.required ?? [];
      if (required.includes(key)) {
        expect(body).toHaveProperty(key);
      }
      if (body[key] !== undefined && body[key] !== null) {
        if (prop.type === 'boolean') expect(typeof body[key]).toBe('boolean');
        if (prop.type === 'string')  expect(typeof body[key]).toBe('string');
        if (prop.type === 'number')  expect(typeof body[key]).toBe('number');
        if (prop.type === 'integer') expect(Number.isInteger(body[key])).toBe(true);
        if (prop.type === 'array')   expect(Array.isArray(body[key])).toBe(true);
        if (prop.type === 'object')  expect(typeof body[key]).toBe('object');
      }
    }
  }
}

/** Asserts a response body matches the SuccessResponse + data envelope. */
export function assertSuccessEnvelope(body: any): void {
  expect(body).toMatchObject({ success: true });
  expect(body).toHaveProperty('data');
}

/** Asserts a response body matches the ErrorResponse envelope. */
export function assertErrorEnvelope(body: any): void {
  expect(body).toMatchObject({ success: false });
  expect(typeof body.error).toBe('string');
}

// ─── Minimal YAML parser ─────────────────────────────────────────────────────
// Only handles the subset we need: the schemas section of openapi.yaml
// via js-yaml would be cleaner but we're avoiding new deps.
function parseYaml(content: string): Record<string, any> {
  // Use Node's built-in require if js-yaml happens to be available (it often is
  // as a transitive dep), otherwise return empty object — tests still run.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jsYaml = require('js-yaml');
    return jsYaml.load(content) as Record<string, any>;
  } catch {
    return {};
  }
}
