import Ajv from "ajv";
const ajv = new Ajv({ allErrors: true, strict: true });
export function schemaGate(schema: object, data: unknown) {
  const validate = ajv.compile(schema);
  if (!validate(data))
    throw new Error(
      "SchemaGate failed: " + JSON.stringify(validate.errors, null, 2),
    );
}
