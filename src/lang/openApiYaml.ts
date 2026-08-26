import { DUMP_SCHEMA, dump, floatCoreTag, intCoreTag } from "js-yaml"
import { isRawJsonNumber } from "./formatJson"

const RAW_JSON_INT_RE = /^-?(?:0|[1-9]\d*)$/

const rawJsonIntTag = {
  ...intCoreTag,
  identify: (value: unknown) =>
    intCoreTag.identify(value) ||
    (isRawJsonNumber(value) && RAW_JSON_INT_RE.test(value.rawJSON)),
  represent: (value: unknown) =>
    isRawJsonNumber(value) ? value.rawJSON : intCoreTag.represent(value),
}

const rawJsonFloatTag = {
  ...floatCoreTag,
  identify: (value: unknown) =>
    floatCoreTag.identify(value) ||
    (isRawJsonNumber(value) && !RAW_JSON_INT_RE.test(value.rawJSON)),
  represent: (value: unknown) =>
    isRawJsonNumber(value) ? value.rawJSON : floatCoreTag.represent(value),
}

const openApiYamlSchema = DUMP_SCHEMA.withTags(rawJsonIntTag, rawJsonFloatTag)

export function serializeOpenApiYaml(document: object): string {
  return dump(document, { noRefs: true, schema: openApiYamlSchema })
}
