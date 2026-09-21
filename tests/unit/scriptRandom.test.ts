import { describe, expect, it } from "bun:test"
import {
  runRequestScript,
  SCRIPT_API_CONTRACT,
} from "../../src/preRequestScript"
import { RunScope } from "../../src/runScope"
import { redactScriptExecutionResult } from "../../src/executionResults"
import { createRandomHandlers } from "../../src/scriptRandom"

const request = {
  id: "random",
  name: "Random",
  method: "GET" as const,
  url: "http://localhost/random",
  headers: {},
  params: [],
  timeout: 0,
}
const response = {
  status: 200,
  statusText: "OK",
  timeMs: 1,
  headers: {},
  body: "{}",
}
const names =
  `uuid id nanoId number float boolean alphaNumeric abbreviation name firstName lastName namePrefix nameSuffix email exampleEmail username password phone phoneWithExtension address streetName city country countryCode latitude longitude ipv4 ipv6 macAddress url domainName domainSuffix domainWord userAgent protocol locale semver datePast dateFuture dateRecent weekday month timestamp isoTimestamp color hexColor word words noun verb ingVerb adjective phrase loremWord loremWords loremSentence loremSentences loremParagraph loremParagraphs loremText loremSlug loremLines companyName companySuffix businessPhrase businessAdjective businessBuzzword businessNoun catchPhrase catchPhraseAdjective catchPhraseDescriptor catchPhraseNoun jobTitle jobArea jobDescriptor jobType product productName productAdjective productMaterial department price bankAccount bankAccountName creditCardMask bic iban transactionType currencyCode currencyName currencySymbol bitcoinAddress databaseColumn databaseType databaseCollation databaseEngine fileName fileExtension fileType commonFileName commonFileExtension commonFileType filePath directoryPath mimeType avatarUrl imageUrl imageDataUri seed pick`.split(
    " ",
  )
const run = (
  source: string,
  scope = new RunScope(),
  phase: "pre" | "post" = "pre",
) =>
  runRequestScript(
    phase,
    source,
    request,
    undefined,
    scope,
    phase === "post" ? { response } : undefined,
  )

describe("script random API", () => {
  it("keeps interleaved host adapters independent when either sequence is reseeded", () => {
    const first = createRandomHandlers(
      (message) => new Error(message),
      () => {},
      "2026-01-01T00:00:00Z",
    )
    const second = createRandomHandlers(
      (message) => new Error(message),
      () => {},
      "2026-01-01T00:00:00Z",
    )
    first["random.seed"]!([42])
    second["random.seed"]!([7])
    expect(first["random.uuid"]!([])).toBe(
      "5fb9220d-9b0f-4d32-a248-6492457c3890",
    )
    expect(second["random.uuid"]!([])).toBe(
      "1c7bf881-47ac-4614-8e37-e09f38e28ca7",
    )
    first["random.seed"]!([42])
    expect(second["random.uuid"]!([])).toBe(
      "7575dc59-475a-457b-a6e2-b66a8601b8bf",
    )
    expect(first["random.uuid"]!([])).toBe(
      "5fb9220d-9b0f-4d32-a248-6492457c3890",
    )
  })

  it("exposes the complete frozen catalog and primitive formats in both phases", async () => {
    for (const phase of ["pre", "post"] as const) {
      const scope = new RunScope()
      const result = await run(
        `
        noodle.random.seed(42);
        const values = Object.fromEntries(Object.keys(noodle.random).filter(key => key !== "seed" && key !== "pick").map(key => [key, noodle.random[key]()]));
        noodle.run.set("values", values);
        noodle.run.set("surface", { names: Object.keys(noodle.random), frozen: Object.isFrozen(noodle.random), methodsFrozen: Object.values(noodle.random).every(Object.isFrozen), nullPrototype: Object.getPrototypeOf(noodle.random) === null });
      `,
        scope,
        phase,
      )
      expect(result.result.success).toBe(true)
      expect(scope.get("surface")).toEqual({
        names,
        frozen: true,
        methodsFrozen: true,
        nullPrototype: true,
      })
      const values = scope.get("values") as Record<string, unknown>
      for (const name of names.filter((n) => n !== "seed" && n !== "pick")) {
        expect(typeof values[name]).toBe(
          ["number", "float", "latitude", "longitude", "timestamp"].includes(
            name,
          )
            ? "number"
            : name === "boolean"
              ? "boolean"
              : "string",
        )
        if (typeof values[name] === "string") expect(values[name]).not.toBe("")
        if (typeof values[name] === "number")
          expect(Number.isFinite(values[name])).toBe(true)
      }
      expect(values.uuid).toMatch(
        /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
      )
      expect(values.id).toMatch(/^[a-zA-Z0-9]{12}$/)
      expect(values.nanoId).toMatch(/^[\w-]{21}$/)
      expect(values.password).toMatch(/^[a-zA-Z0-9]{15}$/)
      expect(values.alphaNumeric).toMatch(/^[a-zA-Z0-9]$/)
      expect(values.bankAccount).toMatch(/^\d{8}$/)
      expect(values.creditCardMask).toMatch(/^\*{4} \*{4} \*{4} \d{4}$/)
      expect(values.exampleEmail).toMatch(/@example\.(com|org|net)$/)
      expect(values.hexColor).toMatch(/^#[\da-f]{6}$/)
      expect(values.countryCode).toMatch(/^[A-Z]{2}$/)
      expect(values.locale).toMatch(/^[a-z]{2}$/)
      expect(values.phoneWithExtension).toMatch(/ ext\. \d{4}$/)
      expect(values.price).toMatch(/^\d+\.\d{2}$/)
      expect(values.latitude as number).toBeWithin(-90, 90)
      expect(values.longitude as number).toBeWithin(-180, 180)
      for (const name of [
        "datePast",
        "dateFuture",
        "dateRecent",
        "isoTimestamp",
      ])
        expect(new Date(values[name] as string).toISOString()).toBe(
          values[name] as string,
        )
      expect(new URL(values.imageUrl as string).pathname).toContain("640/480")
      expect(values.imageDataUri as string).toStartWith(
        "data:image/svg+xml;charset=UTF-8,",
      )
      expect(
        decodeURIComponent((values.imageDataUri as string).split(",")[1]!),
      ).toContain('width="640"')
      expect(result.secretValues).toContain(values.password as string)
      expect(result.secretValues).not.toContain(values.id as string)
    }
    expect(
      SCRIPT_API_CONTRACT.filter(
        (d) => d.global === "noodle" && d.member.startsWith("random."),
      ).map((d) => d.member.slice("random.".length)),
    ).toEqual(names)
    expect(
      SCRIPT_API_CONTRACT.filter(
        (d) =>
          d.global === "noodle" &&
          (d.member === "random" || d.member.startsWith("random.")),
      ).every((d) => d.phases.join() === "pre,post,tests"),
    ).toBe(true)
  })

  it("supports bounded options, exact counts, copied picks and clock timestamps", async () => {
    const scope = new RunScope()
    const before = Date.now()
    const execution = await run(
      `
      noodle.random.seed(0);
      const original = [{ nested: { value: 1 } }];
      const picked = noodle.random.pick(original); picked.nested.value = 2;
      noodle.run.set("options", {
        integer: noodle.random.number({min: -7, max: -7}), float: noodle.random.float({min: 3.25, max: 3.25, fractionDigits: 2}), price: noodle.random.price({min: 12, max: 12, fractionDigits: 3}),
        lengths: [noodle.random.id({length: 4096}), noodle.random.nanoId({length: 1}), noodle.random.password({length: 1}), noodle.random.alphaNumeric({length: 7}), noodle.random.bankAccount({length: 11})].map(value => value.length),
        words: noodle.random.words({count: 4}), loremWords: noodle.random.loremWords({count: 5}), sentence: noodle.random.loremSentence({count: 3}), sentences: noodle.random.loremSentences({count: 2}), paragraph: noodle.random.loremParagraph({count: 2}), paragraphs: noodle.random.loremParagraphs({count: 2}), lines: noodle.random.loremLines({count: 2}), slug: noodle.random.loremSlug({count: 4}),
        image: noodle.random.imageUrl({width: 128, height: 256}), svg: noodle.random.imageDataUri({width: 128, height: 256}),
        picked, original, null: noodle.random.pick([null]), boolean: noodle.random.pick([true]), timestamp: noodle.random.timestamp(), iso: noodle.random.isoTimestamp(), seed: typeof noodle.random.seed(4294967295)
      });
    `,
      scope,
    )
    expect(execution.result.success).toBe(true)
    const value = scope.get("options") as Record<
      | "words"
      | "loremWords"
      | "sentence"
      | "sentences"
      | "paragraph"
      | "paragraphs"
      | "lines"
      | "slug"
      | "image"
      | "svg"
      | "iso",
      string
    > & { timestamp: number }
    expect(value).toMatchObject({
      integer: -7,
      float: 3.25,
      price: "12.000",
      lengths: [4096, 1, 1, 7, 11],
      picked: { nested: { value: 2 } },
      original: [{ nested: { value: 1 } }],
      null: null,
      boolean: true,
      seed: "undefined",
    })
    expect(value.words.split(" ")).toHaveLength(4)
    expect(value.loremWords.split(" ")).toHaveLength(5)
    expect(value.sentence.split(" ")).toHaveLength(3)
    expect(value.sentences.match(/\./g)).toHaveLength(2)
    expect(value.paragraph.match(/\./g)).toHaveLength(2)
    expect(value.paragraphs.split("\n")).toHaveLength(2)
    expect(value.lines.split("\n")).toHaveLength(2)
    expect(value.slug.split("-")).toHaveLength(4)
    expect(new URL(value.image).pathname).toContain("128/256")
    expect(decodeURIComponent(value.svg.split(",")[1])).toContain(
      'height="256"',
    )
    expect(value.timestamp).toBeGreaterThanOrEqual(Math.floor(before / 1000))
    expect(value.timestamp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000))
    expect(Date.parse(value.iso)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(value.iso)).toBeLessThanOrEqual(Date.now())
  })

  it("accepts upper option boundaries and rejects unsafe picks and arguments across the catalog", async () => {
    const scope = new RunScope()
    const result = await run(
      `
      noodle.random.seed(4294967295);
      for (const name of ["id", "alphaNumeric", "nanoId", "password", "bankAccount"])
        if (noodle.random[name]({length: 4096}).length !== 4096) throw Error(name);
      for (const name of ["words", "loremWords", "loremSentence", "loremSentences", "loremParagraph", "loremParagraphs", "loremSlug", "loremLines"])
        if (!noodle.random[name]({count: 100})) throw Error(name);
      noodle.run.set("bounds", {
        integer: noodle.random.number({min: -9007199254740991, max: -9007199254740991}),
        float: noodle.random.float({min: 0, max: 0, fractionDigits: 15}),
        price: noodle.random.price({min: -7, max: -7, fractionDigits: 15}),
        past: noodle.random.datePast({years: 100, refDate: "2026-01-01T00:00:00Z"}),
        future: noodle.random.dateFuture({years: 100, refDate: "2026-01-01T00:00:00Z"}),
        recent: noodle.random.dateRecent({days: 36500, refDate: "2026-01-01T00:00:00Z"}),
        image: noodle.random.imageUrl({width: 4096, height: 1}),
        svg: noodle.random.imageDataUri({width: 1, height: 4096}),
        pick: noodle.random.pick(Array(1000).fill("same")),
      });
    `,
      scope,
    )
    expect(result.result.success).toBe(true)
    expect(scope.get("bounds")).toMatchObject({
      integer: -9007199254740991,
      float: 0,
      price: "-7.000000000000000",
      pick: "same",
    })
    const options = new Set([
      "number",
      "float",
      "id",
      "alphaNumeric",
      "nanoId",
      "password",
      "bankAccount",
      "words",
      "loremWords",
      "loremSentence",
      "loremSentences",
      "loremParagraph",
      "loremParagraphs",
      "loremSlug",
      "loremLines",
      "datePast",
      "dateFuture",
      "dateRecent",
      "price",
      "imageUrl",
      "imageDataUri",
      "seed",
      "pick",
    ])
    for (const name of names.filter((name) => !options.has(name)))
      expect((await run(`noodle.random.${name}({});`)).result.error?.name).toBe(
        "ScriptApiValidationError",
      )
    for (const source of [
      "const a=[]; a.push(a); noodle.random.pick(a);",
      "noodle.random.pick([,]);",
      "let a=0; for(let i=0;i<33;i++) a={value:a}; noodle.random.pick([a]);",
      "noodle.random.pick([new Date()]);",
      "noodle.random.pick([() => 1]);",
      "noodle.random.pick([1], 2);",
      "noodle.random.number(undefined);",
      "noodle.random.id({length: 1.5});",
      'noodle.random.datePast({refDate: "2026-01-01T00:00:00+25:00"});',
    ])
      expect((await run(source)).result.error?.name).toBe(
        "ScriptApiValidationError",
      )
  })

  it("reproduces sequences and fixed dates without sharing state between phases or invocations", async () => {
    const source = `noodle.random.seed(42); noodle.run.set("sequence", [noodle.random.uuid(), noodle.random.name(), noodle.random.number(), noodle.random.datePast({years: 2, refDate: "2026-01-01T00:00:00Z"}), noodle.random.dateFuture({refDate: "2026-01-01T00:00:00+00:00"}), noodle.random.dateRecent({days: 7, refDate: "2026-01-01T00:00:00Z"}), noodle.random.pick([1, 2, 3])]);`
    const scopes = Array.from({ length: 4 }, () => new RunScope())
    const results = await Promise.all(
      scopes.map((scope, index) =>
        run(source, scope, index % 2 ? "post" : "pre"),
      ),
    )
    expect(results.every((r) => r.result.success)).toBe(true)
    for (const scope of scopes)
      expect(scope.get("sequence")).toEqual(scopes[0]!.get("sequence"))
    const sequence = scopes[0]!.get("sequence") as (string | number)[]
    const ref = Date.parse("2026-01-01T00:00:00Z")
    expect(Date.parse(sequence[3] as string)).toBeLessThan(ref)
    expect(Date.parse(sequence[4] as string)).toBeGreaterThan(ref)
    expect(Date.parse(sequence[5] as string)).toBeWithin(
      ref - 7 * 86400000,
      ref,
    )
    const scope = new RunScope()
    expect(
      (
        await run(
          `noodle.random.seed(42); const first = noodle.random.uuid(); noodle.random.uuid(); noodle.random.seed(42); noodle.run.set("same", first === noodle.random.uuid());`,
          scope,
        )
      ).result.success,
    ).toBe(true)
    expect(scope.get("same")).toBe(true)
    const shared = new RunScope()
    await run(
      'noodle.random.seed(42); noodle.run.set("preId", noodle.random.uuid());',
      shared,
    )
    await run('noodle.run.set("postId", noodle.random.uuid());', shared, "post")
    expect(shared.get("postId")).not.toBe(shared.get("preId"))
  })

  it("rejects invalid or hostile arguments before committing changes and recovers", async () => {
    const invalid = [
      "number({min: 2, max: 1})",
      "number({min: 0.1})",
      "number({max: 9007199254740992})",
      "number({min: NaN})",
      "number({max: Infinity})",
      'number({min: "1"})',
      "number({unexpected: 1})",
      "number(null)",
      "number([])",
      "number({}, {})",
      "float({min: -1.7e308, max: 1.7e308})",
      "float({min: 0.1, max: 0.2, fractionDigits: 0})",
      "float({max: 1e308, fractionDigits: 15})",
      "price({max: 1e308})",
      "float({fractionDigits: 16})",
      "price({fractionDigits: -1})",
      ...["id", "alphaNumeric", "nanoId", "password", "bankAccount"].flatMap(
        (name) => [
          `${name}({length: 0})`,
          `${name}({length: 4097})`,
          `${name}({length: 1e9})`,
        ],
      ),
      ...[
        "words",
        "loremWords",
        "loremSentence",
        "loremSentences",
        "loremParagraph",
        "loremParagraphs",
        "loremSlug",
        "loremLines",
      ].flatMap((name) => [`${name}({count: 0})`, `${name}({count: 101})`]),
      "datePast({years: 101})",
      "dateFuture({years: 0})",
      "dateRecent({days: 36501})",
      'dateRecent({refDate: "2026-01-01"})',
      'datePast({refDate: "2026-02-31T00:00:00Z"})',
      'dateFuture({refDate: "2026-01-01T25:00:00Z"})',
      "imageUrl({width: 0})",
      "imageDataUri({height: 4097})",
      'imageUrl({category: "cats"})',
      "seed()",
      "seed(-1)",
      "seed(4294967296)",
      "seed(0.1)",
      "seed(1, 2)",
      "pick([])",
      "pick(Array(1001).fill(0))",
      'pick("value")',
      "pick([undefined])",
      "pick([NaN])",
      "pick([{constructor: 1}])",
      'pick([{ get secret() { return "value" } }])',
      'pick([{value: "x".repeat(300000)}])',
      "name({})",
      "uuid(1)",
    ]
    for (const expression of invalid) {
      const scope = new RunScope()
      const result = await run(
        `noodle.run.set("staged", true); noodle.random.${expression};`,
        scope,
      )
      expect(result.result.error?.name).toBe("ScriptApiValidationError")
      expect(scope.get("staged")).toBeUndefined()
    }
    expect(
      (await run('noodle.run.set("recovered", noodle.random.uuid());')).result
        .success,
    ).toBe(true)
  })

  it("redacts generated passwords after successful and failed phases while retaining public data", async () => {
    for (const phase of ["pre", "post"] as const)
      for (const fail of [false, true]) {
        const scope = new RunScope()
        const result = await run(
          `noodle.random.seed(42); const password = noodle.random.password(); const id = noodle.random.id(); noodle.run.set("password", password); console.log(password); console.log(id); ${fail ? "throw Error(password)" : ""}`,
          scope,
          phase,
        )
        expect(result.result.success).toBe(!fail)
        const redacted = redactScriptExecutionResult(
          result.result,
          result.secretValues,
        )
        expect(redacted.logs[0]?.message).toBe("[REDACTED]")
        expect(redacted.logs[1]?.message).not.toBe("[REDACTED]")
        if (fail) expect(redacted.error?.message).toBe("[REDACTED]")
        else expect(scope.isSecret("password")).toBe(true)
        expect(scope.get("password") !== undefined).toBe(!fail)
      }
  })
})
