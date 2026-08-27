import { DUMP_SCHEMA, dump, floatCoreTag, intCoreTag } from "js-yaml"
import { isRawJsonNumber } from "./formatJson"

const RAW_JSON_INT_RE = /^-?(?:0|[1-9]\d*)$/

const intDumpTag = DUMP_SCHEMA.tags.find(
  (tag) => tag.nodeKind === "scalar" && tag.tagName === intCoreTag.tagName,
)
const floatDumpTag = DUMP_SCHEMA.tags.find(
  (tag) => tag.nodeKind === "scalar" && tag.tagName === floatCoreTag.tagName,
)

if (intDumpTag?.nodeKind !== "scalar" || floatDumpTag?.nodeKind !== "scalar") {
  throw new Error("js-yaml DUMP_SCHEMA is missing numeric tags")
}

const rawJsonIntTag = {
  ...intDumpTag,
  identify: (value: unknown) =>
    intDumpTag.identify(value) ||
    (isRawJsonNumber(value) && RAW_JSON_INT_RE.test(value.rawJSON)),
  represent: (value: unknown) =>
    isRawJsonNumber(value) ? value.rawJSON : intDumpTag.represent(value),
}

const rawJsonFloatTag = {
  ...floatDumpTag,
  identify: (value: unknown) =>
    floatDumpTag.identify(value) ||
    (isRawJsonNumber(value) && !RAW_JSON_INT_RE.test(value.rawJSON)),
  represent: (value: unknown) =>
    isRawJsonNumber(value) ? value.rawJSON : floatDumpTag.represent(value),
}

const openApiYamlSchema = DUMP_SCHEMA.withTags(rawJsonIntTag, rawJsonFloatTag)

export function serializeOpenApiYaml(document: object): string {
  return dump(document, { noRefs: true, schema: openApiYamlSchema })
}
