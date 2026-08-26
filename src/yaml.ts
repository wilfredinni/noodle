import { CORE_SCHEMA, load as parseYaml, mergeTag, timestampTag } from "js-yaml"

export { dump } from "js-yaml"

const schema = CORE_SCHEMA.withTags(timestampTag, mergeTag)

export function load(source: string): unknown {
  return parseYaml(source, { schema })
}
