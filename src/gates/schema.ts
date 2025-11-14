import Ajv2020 from "ajv/dist/2020.js";
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: false,
});
export function schemaGate(schema: object, data: unknown) {
  const validate = ajv.compile(schema);
  if (!validate(data))
    throw new Error(
      "SchemaGate failed: " + JSON.stringify(validate.errors, null, 2),
    );
}
