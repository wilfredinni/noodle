# Noodle scripting API

<!-- Generated from SCRIPT_API_CONTRACT. Run bun run script:generate. -->

Methods and properties are phase-specific. `expect` members belong to the matcher returned by `expect(value)`. Cookies are available only with an enabled jar and outgoing cookies enabled. Request mutation is pre-only; test execution is read-only.

| API | Signature | Phases | Description |
| --- | --- | --- | --- |
| `noodle` | `noodle: Noodle` | pre, post, tests | Noodle scripting APIs. |
| `noodle.iteration` | `iteration: { index: number; count: number; data: object } \| null` | pre, post, tests | Read-only original dataset row and iteration position. |
| `noodle.runRequest` | `runRequest(id: string): Promise<ScriptResponse>` | pre, post | Run a saved request in the current collection. |
| `noodle.sendRequest` | `sendRequest(options: DirectRequest): Promise<ScriptResponse>` | pre, post | Send a literal HTTP request. |
| `noodle.random` | `noodle.random: Random` | pre, post, tests | Bounded English test-data generators. |
| `noodle.random.uuid` | `uuid(): string` | pre, post, tests | Generate a UUID v4 for test data. |
| `noodle.random.id` | `id(options?: { length?: number }): string` | pre, post, tests | Generate id test data. |
| `noodle.random.nanoId` | `nanoId(options?: { length?: number }): string` | pre, post, tests | Generate nano id test data. |
| `noodle.random.number` | `number(options?: { min?: number; max?: number }): number` | pre, post, tests | Generate an integer between min and max, inclusive (default 0 to 1000). |
| `noodle.random.float` | `float(options?: { min?: number; max?: number; fractionDigits?: number }): number` | pre, post, tests | Generate float test data. |
| `noodle.random.boolean` | `boolean(): boolean` | pre, post, tests | Generate boolean test data. |
| `noodle.random.alphaNumeric` | `alphaNumeric(options?: { length?: number }): string` | pre, post, tests | Generate alpha numeric test data. |
| `noodle.random.abbreviation` | `abbreviation(): string` | pre, post, tests | Generate abbreviation test data. |
| `noodle.random.name` | `name(): string` | pre, post, tests | Generate name test data. |
| `noodle.random.firstName` | `firstName(): string` | pre, post, tests | Generate first name test data. |
| `noodle.random.lastName` | `lastName(): string` | pre, post, tests | Generate last name test data. |
| `noodle.random.namePrefix` | `namePrefix(): string` | pre, post, tests | Generate name prefix test data. |
| `noodle.random.nameSuffix` | `nameSuffix(): string` | pre, post, tests | Generate name suffix test data. |
| `noodle.random.email` | `email(): string` | pre, post, tests | Generate email test data. |
| `noodle.random.exampleEmail` | `exampleEmail(): string` | pre, post, tests | Generate example email test data. |
| `noodle.random.username` | `username(): string` | pre, post, tests | Generate username test data. |
| `noodle.random.password` | `password(options?: { length?: number }): string` | pre, post, tests | Generate an alphanumeric test password (default 15 characters). Not cryptographically secure. |
| `noodle.random.phone` | `phone(): string` | pre, post, tests | Generate phone test data. |
| `noodle.random.phoneWithExtension` | `phoneWithExtension(): string` | pre, post, tests | Generate phone with extension test data. |
| `noodle.random.address` | `address(): string` | pre, post, tests | Generate address test data. |
| `noodle.random.streetName` | `streetName(): string` | pre, post, tests | Generate street name test data. |
| `noodle.random.city` | `city(): string` | pre, post, tests | Generate city test data. |
| `noodle.random.country` | `country(): string` | pre, post, tests | Generate country test data. |
| `noodle.random.countryCode` | `countryCode(): string` | pre, post, tests | Generate country code test data. |
| `noodle.random.latitude` | `latitude(): number` | pre, post, tests | Generate latitude test data. |
| `noodle.random.longitude` | `longitude(): number` | pre, post, tests | Generate longitude test data. |
| `noodle.random.ipv4` | `ipv4(): string` | pre, post, tests | Generate ipv4 test data. |
| `noodle.random.ipv6` | `ipv6(): string` | pre, post, tests | Generate ipv6 test data. |
| `noodle.random.macAddress` | `macAddress(): string` | pre, post, tests | Generate mac address test data. |
| `noodle.random.url` | `url(): string` | pre, post, tests | Generate url test data. |
| `noodle.random.domainName` | `domainName(): string` | pre, post, tests | Generate domain name test data. |
| `noodle.random.domainSuffix` | `domainSuffix(): string` | pre, post, tests | Generate domain suffix test data. |
| `noodle.random.domainWord` | `domainWord(): string` | pre, post, tests | Generate domain word test data. |
| `noodle.random.userAgent` | `userAgent(): string` | pre, post, tests | Generate user agent test data. |
| `noodle.random.protocol` | `protocol(): string` | pre, post, tests | Generate protocol test data. |
| `noodle.random.locale` | `locale(): string` | pre, post, tests | Generate locale test data. |
| `noodle.random.semver` | `semver(): string` | pre, post, tests | Generate semver test data. |
| `noodle.random.datePast` | `datePast(options?: { years?: number; refDate?: string }): string` | pre, post, tests | Generate date past test data. |
| `noodle.random.dateFuture` | `dateFuture(options?: { years?: number; refDate?: string }): string` | pre, post, tests | Generate date future test data. |
| `noodle.random.dateRecent` | `dateRecent(options?: { days?: number; refDate?: string }): string` | pre, post, tests | Generate date recent test data. |
| `noodle.random.weekday` | `weekday(): string` | pre, post, tests | Generate weekday test data. |
| `noodle.random.month` | `month(): string` | pre, post, tests | Generate month test data. |
| `noodle.random.timestamp` | `timestamp(): number` | pre, post, tests | Generate timestamp test data. |
| `noodle.random.isoTimestamp` | `isoTimestamp(): string` | pre, post, tests | Generate iso timestamp test data. |
| `noodle.random.color` | `color(): string` | pre, post, tests | Generate color test data. |
| `noodle.random.hexColor` | `hexColor(): string` | pre, post, tests | Generate hex color test data. |
| `noodle.random.word` | `word(): string` | pre, post, tests | Generate word test data. |
| `noodle.random.words` | `words(options?: { count?: number }): string` | pre, post, tests | Generate words test data. |
| `noodle.random.noun` | `noun(): string` | pre, post, tests | Generate noun test data. |
| `noodle.random.verb` | `verb(): string` | pre, post, tests | Generate verb test data. |
| `noodle.random.ingVerb` | `ingVerb(): string` | pre, post, tests | Generate ing verb test data. |
| `noodle.random.adjective` | `adjective(): string` | pre, post, tests | Generate adjective test data. |
| `noodle.random.phrase` | `phrase(): string` | pre, post, tests | Generate phrase test data. |
| `noodle.random.loremWord` | `loremWord(): string` | pre, post, tests | Generate lorem word test data. |
| `noodle.random.loremWords` | `loremWords(options?: { count?: number }): string` | pre, post, tests | Generate lorem words test data. |
| `noodle.random.loremSentence` | `loremSentence(options?: { count?: number }): string` | pre, post, tests | Generate lorem sentence test data. |
| `noodle.random.loremSentences` | `loremSentences(options?: { count?: number }): string` | pre, post, tests | Generate lorem sentences test data. |
| `noodle.random.loremParagraph` | `loremParagraph(options?: { count?: number }): string` | pre, post, tests | Generate lorem paragraph test data. |
| `noodle.random.loremParagraphs` | `loremParagraphs(options?: { count?: number }): string` | pre, post, tests | Generate lorem paragraphs test data. |
| `noodle.random.loremText` | `loremText(): string` | pre, post, tests | Generate lorem text test data. |
| `noodle.random.loremSlug` | `loremSlug(options?: { count?: number }): string` | pre, post, tests | Generate lorem slug test data. |
| `noodle.random.loremLines` | `loremLines(options?: { count?: number }): string` | pre, post, tests | Generate lorem lines test data. |
| `noodle.random.companyName` | `companyName(): string` | pre, post, tests | Generate company name test data. |
| `noodle.random.companySuffix` | `companySuffix(): string` | pre, post, tests | Generate company suffix test data. |
| `noodle.random.businessPhrase` | `businessPhrase(): string` | pre, post, tests | Generate business phrase test data. |
| `noodle.random.businessAdjective` | `businessAdjective(): string` | pre, post, tests | Generate business adjective test data. |
| `noodle.random.businessBuzzword` | `businessBuzzword(): string` | pre, post, tests | Generate business buzzword test data. |
| `noodle.random.businessNoun` | `businessNoun(): string` | pre, post, tests | Generate business noun test data. |
| `noodle.random.catchPhrase` | `catchPhrase(): string` | pre, post, tests | Generate catch phrase test data. |
| `noodle.random.catchPhraseAdjective` | `catchPhraseAdjective(): string` | pre, post, tests | Generate catch phrase adjective test data. |
| `noodle.random.catchPhraseDescriptor` | `catchPhraseDescriptor(): string` | pre, post, tests | Generate catch phrase descriptor test data. |
| `noodle.random.catchPhraseNoun` | `catchPhraseNoun(): string` | pre, post, tests | Generate catch phrase noun test data. |
| `noodle.random.jobTitle` | `jobTitle(): string` | pre, post, tests | Generate job title test data. |
| `noodle.random.jobArea` | `jobArea(): string` | pre, post, tests | Generate job area test data. |
| `noodle.random.jobDescriptor` | `jobDescriptor(): string` | pre, post, tests | Generate job descriptor test data. |
| `noodle.random.jobType` | `jobType(): string` | pre, post, tests | Generate job type test data. |
| `noodle.random.product` | `product(): string` | pre, post, tests | Generate product test data. |
| `noodle.random.productName` | `productName(): string` | pre, post, tests | Generate product name test data. |
| `noodle.random.productAdjective` | `productAdjective(): string` | pre, post, tests | Generate product adjective test data. |
| `noodle.random.productMaterial` | `productMaterial(): string` | pre, post, tests | Generate product material test data. |
| `noodle.random.department` | `department(): string` | pre, post, tests | Generate department test data. |
| `noodle.random.price` | `price(options?: { min?: number; max?: number; fractionDigits?: number }): string` | pre, post, tests | Generate price test data. |
| `noodle.random.bankAccount` | `bankAccount(options?: { length?: number }): string` | pre, post, tests | Generate bank account test data. |
| `noodle.random.bankAccountName` | `bankAccountName(): string` | pre, post, tests | Generate bank account name test data. |
| `noodle.random.creditCardMask` | `creditCardMask(): string` | pre, post, tests | Generate credit card mask test data. |
| `noodle.random.bic` | `bic(): string` | pre, post, tests | Generate bic test data. |
| `noodle.random.iban` | `iban(): string` | pre, post, tests | Generate iban test data. |
| `noodle.random.transactionType` | `transactionType(): string` | pre, post, tests | Generate transaction type test data. |
| `noodle.random.currencyCode` | `currencyCode(): string` | pre, post, tests | Generate currency code test data. |
| `noodle.random.currencyName` | `currencyName(): string` | pre, post, tests | Generate currency name test data. |
| `noodle.random.currencySymbol` | `currencySymbol(): string` | pre, post, tests | Generate currency symbol test data. |
| `noodle.random.bitcoinAddress` | `bitcoinAddress(): string` | pre, post, tests | Generate bitcoin address test data. |
| `noodle.random.databaseColumn` | `databaseColumn(): string` | pre, post, tests | Generate database column test data. |
| `noodle.random.databaseType` | `databaseType(): string` | pre, post, tests | Generate database type test data. |
| `noodle.random.databaseCollation` | `databaseCollation(): string` | pre, post, tests | Generate database collation test data. |
| `noodle.random.databaseEngine` | `databaseEngine(): string` | pre, post, tests | Generate database engine test data. |
| `noodle.random.fileName` | `fileName(): string` | pre, post, tests | Generate file name test data. |
| `noodle.random.fileExtension` | `fileExtension(): string` | pre, post, tests | Generate file extension test data. |
| `noodle.random.fileType` | `fileType(): string` | pre, post, tests | Generate file type test data. |
| `noodle.random.commonFileName` | `commonFileName(): string` | pre, post, tests | Generate common file name test data. |
| `noodle.random.commonFileExtension` | `commonFileExtension(): string` | pre, post, tests | Generate common file extension test data. |
| `noodle.random.commonFileType` | `commonFileType(): string` | pre, post, tests | Generate common file type test data. |
| `noodle.random.filePath` | `filePath(): string` | pre, post, tests | Generate file path test data. |
| `noodle.random.directoryPath` | `directoryPath(): string` | pre, post, tests | Generate directory path test data. |
| `noodle.random.mimeType` | `mimeType(): string` | pre, post, tests | Generate mime type test data. |
| `noodle.random.avatarUrl` | `avatarUrl(): string` | pre, post, tests | Generate avatar url test data. |
| `noodle.random.imageUrl` | `imageUrl(options?: { width?: number; height?: number }): string` | pre, post, tests | Generate image url test data. |
| `noodle.random.imageDataUri` | `imageDataUri(options?: { width?: number; height?: number }): string` | pre, post, tests | Generate image data uri test data. |
| `noodle.random.seed` | `seed(value: number): void` | pre, post, tests | Reset this script's test-data sequence. |
| `noodle.random.pick` | `pick(values: JsonValue[]): JsonValue` | pre, post, tests | Choose a copied JSON value from a non-empty array. |
| `noodle.time` | `noodle.time: Time` | pre, post, tests | Date and elapsed-time helpers. |
| `noodle.time.now` | `now(): number` | pre, post, tests | Current Unix milliseconds. |
| `noodle.time.unix` | `unix(value?: number \| string): number` | pre, post, tests | Unix seconds, rounded down; defaults to now. |
| `noodle.time.fromUnix` | `fromUnix(seconds: number): number` | pre, post, tests | Convert Unix seconds to milliseconds. |
| `noodle.time.parse` | `parse(text: string): number` | pre, post, tests | Parse an ISO date or timezone-bearing timestamp. |
| `noodle.time.iso` | `iso(value?: number \| string): string` | pre, post, tests | UTC ISO timestamp; defaults to now. |
| `noodle.time.format` | `format(value: number \| string, pattern: string, options?: { timeZone?: string }): string` | pre, post, tests | Format a timestamp in UTC or a named IANA timezone. |
| `noodle.time.add` | `add(value: number \| string, amount: number, unit: string): number` | pre, post, tests | Add an elapsed duration, returning milliseconds. |
| `noodle.time.subtract` | `subtract(value: number \| string, amount: number, unit: string): number` | pre, post, tests | Subtract an elapsed duration, returning milliseconds. |
| `noodle.time.diff` | `diff(a: number \| string, b: number \| string, unit?: string): number` | pre, post, tests | Signed elapsed difference a - b; defaults to milliseconds. |
| `noodle.request` | `noodle.request: Request` | pre, post, tests | Prepared request. |
| `noodle.request.url` | `string` | pre, post, tests | Request URL. Writable in: pre. |
| `noodle.request.method` | `Method` | pre, post, tests | HTTP method. Writable in: pre. |
| `noodle.request.headers` | `Headers` | pre, post, tests | Request headers. |
| `noodle.request.headers.get` | `get(name: string): string \| null` | pre, post, tests | Read the first matching header. |
| `noodle.request.headers.has` | `has(name: string): boolean` | pre, post, tests | Test for a matching header. |
| `noodle.request.headers.set` | `set(name: string, value: string): void` | pre | Set one header. |
| `noodle.request.headers.delete` | `delete(name: string): void` | pre | Delete matching headers. |
| `noodle.request.params` | `Params` | pre, post, tests | Enabled query parameters. |
| `noodle.request.params.get` | `get(name: string): string \| null` | pre, post, tests | Read the first enabled parameter. |
| `noodle.request.params.getAll` | `getAll(name: string): string[]` | pre, post, tests | Read enabled parameters. |
| `noodle.request.params.set` | `set(name: string, value: string): void` | pre | Replace enabled parameters. |
| `noodle.request.params.append` | `append(name: string, value: string): void` | pre | Append an enabled parameter. |
| `noodle.request.params.delete` | `delete(name: string): void` | pre | Delete enabled parameters. |
| `noodle.request.body` | `Body` | pre, post, tests | Request body. |
| `noodle.request.body.text` | `text(): string \| null` | pre, post, tests | Read a textual body. |
| `noodle.request.body.json` | `json(): JsonValue` | pre, post, tests | Parse a textual body as JSON. |
| `noodle.request.body.setText` | `setText(value: string): void` | pre | Replace the body with text. |
| `noodle.request.body.setJson` | `setJson(value: JsonValue): void` | pre | Replace the body with compact JSON. |
| `noodle.request.body.clear` | `clear(): void` | pre | Clear the body. |
| `noodle.request.auth` | `Auth` | pre, post, tests | Request authentication. |
| `noodle.request.auth.clear` | `clear(): void` | pre | Clear authentication. |
| `noodle.request.auth.setBearer` | `setBearer(token: string): void` | pre | Set bearer authentication. |
| `noodle.request.auth.setBasic` | `setBasic(username: string, password: string): void` | pre | Set basic authentication. |
| `noodle.request.auth.setApiKey` | `setApiKey(key: string, value: string, placement: "header" \| "query"):  void` | pre | Set API-key authentication. |
| `noodle.env` | `noodle.env: Environment` | pre, post, tests | Selected environment. |
| `noodle.env.get` | `get(name: string): string \| undefined` | pre, post, tests | Read an environment value. |
| `noodle.run` | `noodle.run: RunScope` | pre, post, tests | Current collection run scope. |
| `noodle.run.get` | `get(name: string): JsonValue \| undefined` | pre, post, tests | Read a run value. |
| `noodle.run.set` | `set(name: string, value: JsonValue, options?: { persist: "environment" \| "secret" }): void` | pre, post | Set a run value after success, optionally persisting its snapshot. |
| `noodle.run.unset` | `unset(name: string, options?: { persist: "environment" \| "secret" }): void` | pre, post | Remove a run value after success, optionally deleting its stored value. |
| `noodle.crypto` | `noodle.crypto: Crypto` | pre, post, tests | Bounded cryptographic helpers. |
| `noodle.crypto.sha256` | `sha256(value: string, encoding: Encoding): string` | pre, post, tests | Hash a UTF-8 string. |
| `noodle.crypto.hmacSha256` | `hmacSha256(secret: string, value: string, encoding: Encoding): string` | pre, post, tests | Authenticate a UTF-8 string. |
| `noodle.crypto.randomBytes` | `randomBytes(size: number, encoding: Encoding): string` | pre, post, tests | Generate bounded random bytes. |
| `console` | `console: Console` | pre, post, tests | Bounded captured logging. |
| `console.log` | `log(...values: unknown[]): void` | pre, post, tests | Capture a log message. |
| `console.info` | `info(...values: unknown[]): void` | pre, post, tests | Capture an info message. |
| `console.warn` | `warn(...values: unknown[]): void` | pre, post, tests | Capture a warning message. |
| `console.error` | `error(...values: unknown[]): void` | pre, post, tests | Capture an error message. |
| `noodle.response` | `noodle.response: Response` | post, tests | Completed HTTP response. |
| `noodle.response.status` | `number` | post, tests | Response metadata. |
| `noodle.response.statusText` | `string` | post, tests | Response metadata. |
| `noodle.response.timeMs` | `number` | post, tests | Response metadata. |
| `noodle.response.headers` | `Headers` | post, tests | Response headers. |
| `noodle.response.headers.get` | `get(name: string): string \| null` | post, tests | Read a case-insensitive header. |
| `noodle.response.headers.has` | `has(name: string): boolean` | post, tests | Test a case-insensitive header. |
| `noodle.response.text` | `text(): string` | post, tests | Read bounded response text. |
| `noodle.response.json` | `json(): JsonValue` | post, tests | Parse and cache response JSON in the sandbox. |
| `noodle.cookies` | `noodle.cookies: Cookies` | post, tests | URL-scoped cookie transaction when enabled. |
| `noodle.cookies.get` | `get(name: string): string \| null` | post, tests | Read the first applicable cookie. |
| `noodle.cookies.set` | `set(input: CookieInput): void` | post | Stage a host-only cookie. |
| `noodle.cookies.delete` | `delete(name: string): void` | post | Stage deletion of all applicable same-name cookies. |
| `test` | `test(name: string, callback: () => unknown): void \| Promise<void>` | tests | Run a named test and await its returned Promise. |
| `expect` | `expect(actual: unknown): Matchers` | tests | Assert against a sandbox value. |
| `expect.not` | `Matchers` | tests | Negate the matcher. |
| `expect.toBe` | `toBe(expected?: unknown): void` | tests | Synchronous value assertion. |
| `expect.toEqual` | `toEqual(expected?: unknown): void` | tests | Synchronous value assertion. |
| `expect.toBeTruthy` | `toBeTruthy(expected?: unknown): void` | tests | Synchronous value assertion. |
| `expect.toBeFalsy` | `toBeFalsy(expected?: unknown): void` | tests | Synchronous value assertion. |
| `expect.toBeDefined` | `toBeDefined(expected?: unknown): void` | tests | Synchronous value assertion. |
| `expect.toBeNull` | `toBeNull(expected?: unknown): void` | tests | Synchronous value assertion. |
| `expect.toContain` | `toContain(expected?: unknown): void` | tests | Synchronous value assertion. |
| `expect.toMatch` | `toMatch(expected: string \| RegExp): void` | tests | Synchronous value assertion. |
| `expect.toBeGreaterThan` | `toBeGreaterThan(expected: number): void` | tests | Synchronous value assertion. |
| `expect.toBeGreaterThanOrEqual` | `toBeGreaterThanOrEqual(expected: number): void` | tests | Synchronous value assertion. |
| `expect.toBeLessThan` | `toBeLessThan(expected: number): void` | tests | Synchronous value assertion. |
| `expect.toBeLessThanOrEqual` | `toBeLessThanOrEqual(expected: number): void` | tests | Synchronous value assertion. |
| `expect.toMatchSchema` | `toMatchSchema(expected: boolean \| Record<string, JsonValue>): void` | tests | Synchronous value assertion. |
| `expect.toHaveProperty` | `toHaveProperty(key: string, expected?: unknown): void` | tests | Synchronous value assertion. |
| `expect.toHaveLength` | `toHaveLength(expected: number): void` | tests | Synchronous value assertion. |
| `expect.toBeTypeOf` | `toBeTypeOf(expected: "undefined" \| "object" \| "boolean" \| "number" \| "bigint" \| "string" \| "symbol" \| "function"): void` | tests | Synchronous value assertion. |
| `expect.toMatchObject` | `toMatchObject(expected: Record<string, JsonValue>): void` | tests | Synchronous value assertion. |

## Fixed runtime limits

| Limit | Value |
| --- | --- |
| `deadlineMs` | 500 |
| `wallTimeMs` | 30000 |
| `requestCalls` | 10 |
| `requestDepth` | 4 |
| `runtimeMemoryBytes` | 33554432 |
| `stackBytes` | 524288 |
| `sourceBytes` | 262144 |
| `consoleEntries` | 100 |
| `consoleBytes` | 65536 |
| `randomBytes` | 4096 |
| `bridgeValueBytes` | 262144 |
| `bridgeJsonDepth` | 32 |
| `consoleDepth` | 4 |
| `responseBodyBytes` | 5242880 |
| `persistenceKeys` | 100 |
| `persistenceBytes` | 262144 |

These limits apply to each invocation unless the lifecycle shares a smaller remaining budget. Only one child request may be outstanding per script. See [sandbox and lifecycle rules](../schema.md#inline-request-scripts) and [examples](examples.md).
