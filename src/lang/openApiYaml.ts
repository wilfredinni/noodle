import yaml from "js-yaml"
import { isRawJsonNumber } from "./formatJson"

const RAW_JSON_INT_RE = /^-?(?:0|[1-9]\d*)$/

const rawJsonIntType = new yaml.Type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: () => false,
  predicate: (value: object) =>
    isRawJsonNumber(value) && RAW_JSON_INT_RE.test(value.rawJSON),
  represent: (value: object) => (value as { rawJSON: string }).rawJSON,
})

const rawJsonFloatType = new yaml.Type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: () => false,
  predicate: (value: object) =>
    isRawJsonNumber(value) && !RAW_JSON_INT_RE.test(value.rawJSON),
  represent: (value: object) => (value as { rawJSON: string }).rawJSON,
})

const openApiYamlSchema = yaml.DEFAULT_SCHEMA.extend({
  implicit: [rawJsonIntType, rawJsonFloatType],
})

export function serializeOpenApiYaml(document: object): string {
  return yaml.dump(document, { noRefs: true, schema: openApiYamlSchema })
}
