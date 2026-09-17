import { randomBytes } from "node:crypto"
import { Faker, en, base } from "@faker-js/faker"
import type { JsonValue } from "./schema"

type Options = {
  min?: number
  max?: number
  fractionDigits?: number
  length?: number
  count?: number
  years?: number
  days?: number
  refDate?: string
  width?: number
  height?: number
}
type Parameters =
  | "none"
  | "range"
  | "float"
  | "price"
  | "length"
  | "count"
  | "years"
  | "days"
  | "image"
  | "seed"
  | "pick"
const OPTION_FIELDS = {
  none: [],
  range: ["min", "max"],
  float: ["min", "max", "fractionDigits"],
  price: ["min", "max", "fractionDigits"],
  length: ["length"],
  count: ["count"],
  years: ["years", "refDate"],
  days: ["days", "refDate"],
  image: ["width", "height"],
} as const

const generator = (
  name: string,
  generate: (
    faker: Faker,
    options: Options,
    args: unknown[],
  ) => JsonValue | undefined,
  parameters: Parameters = "none",
  returns = "string",
) =>
  Object.freeze({
    name,
    generate,
    parameters,
    signature: `${name}(${parameters === "seed" ? "value: number" : parameters === "pick" ? "values: JsonValue[]" : parameters === "none" ? "" : `options?: { ${OPTION_FIELDS[parameters].map((field) => `${field}?: ${field === "refDate" ? "string" : "number"}`).join("; ")} }`}): ${returns}`,
    description:
      name === "seed"
        ? "Reset this script's test-data sequence."
        : name === "pick"
          ? "Choose a copied JSON value from a non-empty array."
          : `Generate ${name.replace(/([A-Z])/g, " $1").toLowerCase()} test data.`,
  })

// Explicit handlers keep guest input from selecting arbitrary Faker properties.
export const RANDOM_GENERATORS = Object.freeze([
  generator("uuid", (f) => f.string.uuid()),
  generator("id", (f, o) => f.string.alphanumeric(o.length ?? 12), "length"),
  generator("nanoId", (f, o) => f.string.nanoid(o.length ?? 21), "length"),
  generator(
    "number",
    (f, o) => f.number.int({ min: o.min ?? 0, max: o.max ?? 1000 }),
    "range",
    "number",
  ),
  generator("float", (f, o) => f.number.float(o), "float", "number"),
  generator("boolean", (f) => f.datatype.boolean(), "none", "boolean"),
  generator(
    "alphaNumeric",
    (f, o) => f.string.alphanumeric(o.length ?? 1),
    "length",
  ),
  generator("abbreviation", (f) => f.hacker.abbreviation()),
  generator("name", (f) => f.person.fullName()),
  generator("firstName", (f) => f.person.firstName()),
  generator("lastName", (f) => f.person.lastName()),
  generator("namePrefix", (f) => f.person.prefix()),
  generator("nameSuffix", (f) => f.person.suffix()),
  generator("email", (f) => f.internet.email()),
  generator("exampleEmail", (f) => f.internet.exampleEmail()),
  generator("username", (f) => f.internet.username()),
  generator(
    "password",
    (f, o) => f.string.alphanumeric(o.length ?? 15),
    "length",
  ),
  generator("phone", (f) => f.phone.number({ style: "national" })),
  generator(
    "phoneWithExtension",
    (f) =>
      `${f.phone.number({ style: "national" })} ext. ${f.string.numeric(4)}`,
  ),
  generator("address", (f) => f.location.streetAddress()),
  generator("streetName", (f) => f.location.street()),
  generator("city", (f) => f.location.city()),
  generator("country", (f) => f.location.country()),
  generator("countryCode", (f) => f.location.countryCode()),
  generator("latitude", (f) => f.location.latitude(), "none", "number"),
  generator("longitude", (f) => f.location.longitude(), "none", "number"),
  generator("ipv4", (f) => f.internet.ipv4()),
  generator("ipv6", (f) => f.internet.ipv6()),
  generator("macAddress", (f) => f.internet.mac()),
  generator("url", (f) => f.internet.url()),
  generator("domainName", (f) => f.internet.domainName()),
  generator("domainSuffix", (f) => f.internet.domainSuffix()),
  generator("domainWord", (f) => f.internet.domainWord()),
  generator("userAgent", (f) => f.internet.userAgent()),
  generator("protocol", (f) => f.internet.protocol()),
  generator("locale", (f) => f.location.language().alpha2),
  generator("semver", (f) => f.system.semver()),
  generator("datePast", (f, o) => f.date.past(o).toISOString(), "years"),
  generator("dateFuture", (f, o) => f.date.future(o).toISOString(), "years"),
  generator("dateRecent", (f, o) => f.date.recent(o).toISOString(), "days"),
  generator("weekday", (f) => f.date.weekday()),
  generator("month", (f) => f.date.month()),
  generator("timestamp", () => Math.floor(Date.now() / 1000), "none", "number"),
  generator("isoTimestamp", () => new Date().toISOString()),
  generator("color", (f) => f.color.human()),
  generator("hexColor", (f) => f.color.rgb({ format: "hex", casing: "lower" })),
  generator("word", (f) => f.word.sample()),
  generator("words", (f, o) => f.word.words(o.count), "count"),
  generator("noun", (f) => f.hacker.noun()),
  generator("verb", (f) => f.hacker.verb()),
  generator("ingVerb", (f) => f.hacker.ingverb()),
  generator("adjective", (f) => f.hacker.adjective()),
  generator("phrase", (f) => f.hacker.phrase()),
  generator("loremWord", (f) => f.lorem.word()),
  generator("loremWords", (f, o) => f.lorem.words(o.count), "count"),
  generator("loremSentence", (f, o) => f.lorem.sentence(o.count), "count"),
  generator("loremSentences", (f, o) => f.lorem.sentences(o.count), "count"),
  generator("loremParagraph", (f, o) => f.lorem.paragraph(o.count), "count"),
  generator("loremParagraphs", (f, o) => f.lorem.paragraphs(o.count), "count"),
  generator("loremText", (f) => f.lorem.text()),
  generator("loremSlug", (f, o) => f.lorem.slug(o.count), "count"),
  generator("loremLines", (f, o) => f.lorem.lines(o.count), "count"),
  generator("companyName", (f) => f.company.name()),
  generator("companySuffix", (f) =>
    f.helpers.arrayElement(en.company!.legal_entity_type as readonly string[]),
  ),
  generator("businessPhrase", (f) => f.company.buzzPhrase()),
  generator("businessAdjective", (f) => f.company.buzzAdjective()),
  generator("businessBuzzword", (f) => f.company.buzzVerb()),
  generator("businessNoun", (f) => f.company.buzzNoun()),
  generator("catchPhrase", (f) => f.company.catchPhrase()),
  generator("catchPhraseAdjective", (f) => f.company.catchPhraseAdjective()),
  generator("catchPhraseDescriptor", (f) => f.company.catchPhraseDescriptor()),
  generator("catchPhraseNoun", (f) => f.company.catchPhraseNoun()),
  generator("jobTitle", (f) => f.person.jobTitle()),
  generator("jobArea", (f) => f.person.jobArea()),
  generator("jobDescriptor", (f) => f.person.jobDescriptor()),
  generator("jobType", (f) => f.person.jobType()),
  generator("product", (f) => f.commerce.product()),
  generator("productName", (f) => f.commerce.productName()),
  generator("productAdjective", (f) => f.commerce.productAdjective()),
  generator("productMaterial", (f) => f.commerce.productMaterial()),
  generator("department", (f) => f.commerce.department()),
  generator(
    "price",
    (f, o) =>
      f.finance.amount({
        min: o.min ?? 0,
        max: o.max ?? 1000,
        dec: o.fractionDigits ?? 2,
      }),
    "price",
  ),
  generator(
    "bankAccount",
    (f, o) => f.finance.accountNumber({ length: o.length ?? 8 }),
    "length",
  ),
  generator("bankAccountName", (f) => f.finance.accountName()),
  generator("creditCardMask", (f) => `**** **** **** ${f.string.numeric(4)}`),
  generator("bic", (f) => f.finance.bic()),
  generator("iban", (f) => f.finance.iban()),
  generator("transactionType", (f) => f.finance.transactionType()),
  generator("currencyCode", (f) => f.finance.currencyCode()),
  generator("currencyName", (f) => f.finance.currencyName()),
  generator("currencySymbol", (f) => f.finance.currencySymbol()),
  generator("bitcoinAddress", (f) => f.finance.bitcoinAddress()),
  generator("databaseColumn", (f) => f.database.column()),
  generator("databaseType", (f) => f.database.type()),
  generator("databaseCollation", (f) => f.database.collation()),
  generator("databaseEngine", (f) => f.database.engine()),
  generator("fileName", (f) => f.system.fileName()),
  generator("fileExtension", (f) => f.system.fileExt()),
  generator("fileType", (f) => f.system.fileType()),
  generator("commonFileName", (f) => f.system.commonFileName()),
  generator("commonFileExtension", (f) => f.system.commonFileExt()),
  generator("commonFileType", (f) => f.system.commonFileType()),
  generator("filePath", (f) => f.system.filePath()),
  generator("directoryPath", (f) => f.system.directoryPath()),
  generator("mimeType", (f) => f.system.mimeType()),
  generator("avatarUrl", (f) => f.image.avatar()),
  generator(
    "imageUrl",
    (f, o) => f.image.url({ width: o.width ?? 640, height: o.height ?? 480 }),
    "image",
  ),
  generator(
    "imageDataUri",
    (f, o) =>
      f.image.dataUri({
        width: o.width ?? 640,
        height: o.height ?? 480,
        type: "svg-uri",
      }),
    "image",
  ),
  generator(
    "seed",
    (f, _o, args) => {
      f.seed(args[0] as number)
    },
    "seed",
    "void",
  ),
  generator(
    "pick",
    (f, _o, args) => f.helpers.arrayElement(args[0] as JsonValue[]),
    "pick",
    "JsonValue",
  ),
])

export function createRandomHandlers(
  error: (message: string) => Error,
  rememberPassword: (value: string) => void,
  refDate: string,
): Record<string, (args: unknown[]) => JsonValue | undefined> {
  let faker: Faker | undefined
  return Object.fromEntries(
    RANDOM_GENERATORS.map((definition) => [
      `random.${definition.name}`,
      (args: unknown[]) => {
        const fail = (message: string): never => {
          throw error(`random.${definition.name}: ${message}`)
        }
        const options = validateArguments(
          definition.parameters,
          args,
          refDate,
          fail,
        )
        if (!faker) {
          faker = new Faker({ locale: [en, base] })
          faker.seed(randomBytes(4).readUInt32LE())
        }
        let value: JsonValue | undefined
        try {
          value = definition.generate(faker, options, args)
        } catch {
          // Faker errors may include inputs; publish only a stable validation error.
          return fail("cannot generate a value with these options")
        }
        if (definition.name === "password") rememberPassword(value as string)
        return value
      },
    ]),
  )
}

function validateArguments(
  parameters: Parameters,
  args: unknown[],
  refDate: string,
  fail: (message: string) => never,
): Options {
  if (parameters === "seed") {
    if (
      args.length !== 1 ||
      typeof args[0] !== "number" ||
      !Number.isInteger(args[0]) ||
      args[0] < 0 ||
      args[0] > 4294967295
    )
      fail("seed must be an integer from 0 through 4294967295")
    return {}
  }
  if (parameters === "pick") {
    if (
      args.length !== 1 ||
      !Array.isArray(args[0]) ||
      args[0].length < 1 ||
      args[0].length > 1000
    )
      fail("pick requires an array with 1 through 1000 JSON values")
    return {}
  }
  if (parameters === "none") {
    if (args.length) fail("does not accept arguments")
    return {}
  }
  if (args.length > 1) fail("accepts one optional options object")
  const options = args.length ? args[0] : {}
  if (options === null || typeof options !== "object" || Array.isArray(options))
    fail("options must be an object")
  const fields = OPTION_FIELDS[parameters] as readonly string[]
  for (const [key, value] of Object.entries(
    options as Record<string, unknown>,
  )) {
    if (!fields.includes(key)) fail("unknown option")
    if (key === "refDate") {
      if (!isIsoTimestamp(value))
        fail("refDate must be a valid ISO timestamp with a timezone")
      continue
    }
    if (typeof value !== "number" || !Number.isFinite(value))
      fail("options must contain finite numbers")
    if (key === "min" || key === "max") {
      if (parameters === "range" && !Number.isSafeInteger(value))
        fail("integer bounds must be safe integers")
      continue
    }
    const max =
      key === "fractionDigits"
        ? 15
        : key === "count" || key === "years"
          ? 100
          : key === "days"
            ? 36500
            : 4096
    const min = key === "fractionDigits" ? 0 : 1
    if (!Number.isInteger(value) || value < min || value > max)
      fail(`${key} must be an integer from ${min} through ${max}`)
  }
  const result = { ...options } as Options
  if (
    parameters === "range" ||
    parameters === "float" ||
    parameters === "price"
  ) {
    const min = result.min ?? 0
    const max = result.max ?? (parameters === "float" ? 1 : 1000)
    if (min > max || !Number.isFinite(max - min))
      fail("bounds must be ordered and their range must be finite")
    const digits =
      result.fractionDigits ?? (parameters === "price" ? 2 : undefined)
    if (digits !== undefined) {
      const scale = 10 ** digits
      const low = Math.ceil(min * scale)
      const high = Math.floor(max * scale)
      if (
        !Number.isFinite(low) ||
        !Number.isFinite(high) ||
        !Number.isFinite(high - low) ||
        low > high
      )
        fail("bounds must contain a finite value at the requested precision")
    }
  }
  if (parameters === "years" || parameters === "days")
    result.refDate ??= refDate
  return result
}

function isIsoTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    return false
  const date = value.slice(0, 10)
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
}
