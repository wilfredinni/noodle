// Generated from SCRIPT_API_CONTRACT. Run bun scripts/generate-script-api.ts.
// Reference this file from an external JavaScript editor; runtime phase checks remain authoritative.
declare namespace NoodleScript {
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "CONNECT" | "TRACE";
type Encoding = "hex" | "base64";
interface CookieInput { name: string; value: string; path?: string; expires?: string; secure?: boolean; httpOnly?: boolean; sameSite?: "strict" | "lax" | "none" }
interface DirectRequest { url: string; method?: Method; headers?: Record<string, string>; body?: string; timeout?: number }


interface ScriptResponse {
/** Response metadata. @phases post, tests */
readonly status: number;
/** Response metadata. @phases post, tests */
readonly statusText: string;
/** Response metadata. @phases post, tests */
readonly timeMs: number;
/** Response headers. @phases post, tests */
readonly headers: {
/** Read a case-insensitive header. @phases post, tests */
get(name: string): string | null;
/** Test a case-insensitive header. @phases post, tests */
has(name: string): boolean;
};
/** Read bounded response text. @phases post, tests */
text(): string;
/** Parse and cache response JSON in the sandbox. @phases post, tests */
json(): JsonValue;
readonly execution?: JsonValue;
}
interface Matchers {
/** Negate the matcher. @phases tests */
readonly not: Matchers;
/** Synchronous value assertion. @phases tests */
toBe(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toEqual(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toBeTruthy(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toBeFalsy(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toBeDefined(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toBeNull(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toContain(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toMatch(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toBeGreaterThan(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toBeGreaterThanOrEqual(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toBeLessThan(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toBeLessThanOrEqual(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toMatchSchema(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toHaveProperty(key: string, expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toHaveLength(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toBeTypeOf(expected?: unknown): void;
/** Synchronous value assertion. @phases tests */
toMatchObject(expected?: unknown): void;
}
interface Api {
/** Read-only original dataset row and iteration position. @phases pre, post, tests */
readonly iteration: { index: number; count: number; data: object } | null;
/** Run a saved request in the current collection. @phases pre, post */
runRequest(id: string): Promise<ScriptResponse>;
/** Send a literal HTTP request. @phases pre, post */
sendRequest(options: DirectRequest): Promise<ScriptResponse>;
/** Bounded English test-data generators. @phases pre, post, tests */
readonly random: {
/** Generate a UUID v4 for test data. @phases pre, post, tests */
uuid(): string;
/** Generate id test data. @phases pre, post, tests */
id(options?: { length?: number }): string;
/** Generate nano id test data. @phases pre, post, tests */
nanoId(options?: { length?: number }): string;
/** Generate an integer between min and max, inclusive (default 0 to 1000). @phases pre, post, tests */
number(options?: { min?: number; max?: number }): number;
/** Generate float test data. @phases pre, post, tests */
float(options?: { min?: number; max?: number; fractionDigits?: number }): number;
/** Generate boolean test data. @phases pre, post, tests */
boolean(): boolean;
/** Generate alpha numeric test data. @phases pre, post, tests */
alphaNumeric(options?: { length?: number }): string;
/** Generate abbreviation test data. @phases pre, post, tests */
abbreviation(): string;
/** Generate name test data. @phases pre, post, tests */
name(): string;
/** Generate first name test data. @phases pre, post, tests */
firstName(): string;
/** Generate last name test data. @phases pre, post, tests */
lastName(): string;
/** Generate name prefix test data. @phases pre, post, tests */
namePrefix(): string;
/** Generate name suffix test data. @phases pre, post, tests */
nameSuffix(): string;
/** Generate email test data. @phases pre, post, tests */
email(): string;
/** Generate example email test data. @phases pre, post, tests */
exampleEmail(): string;
/** Generate username test data. @phases pre, post, tests */
username(): string;
/** Generate an alphanumeric test password (default 15 characters). Not cryptographically secure. @phases pre, post, tests */
password(options?: { length?: number }): string;
/** Generate phone test data. @phases pre, post, tests */
phone(): string;
/** Generate phone with extension test data. @phases pre, post, tests */
phoneWithExtension(): string;
/** Generate address test data. @phases pre, post, tests */
address(): string;
/** Generate street name test data. @phases pre, post, tests */
streetName(): string;
/** Generate city test data. @phases pre, post, tests */
city(): string;
/** Generate country test data. @phases pre, post, tests */
country(): string;
/** Generate country code test data. @phases pre, post, tests */
countryCode(): string;
/** Generate latitude test data. @phases pre, post, tests */
latitude(): number;
/** Generate longitude test data. @phases pre, post, tests */
longitude(): number;
/** Generate ipv4 test data. @phases pre, post, tests */
ipv4(): string;
/** Generate ipv6 test data. @phases pre, post, tests */
ipv6(): string;
/** Generate mac address test data. @phases pre, post, tests */
macAddress(): string;
/** Generate url test data. @phases pre, post, tests */
url(): string;
/** Generate domain name test data. @phases pre, post, tests */
domainName(): string;
/** Generate domain suffix test data. @phases pre, post, tests */
domainSuffix(): string;
/** Generate domain word test data. @phases pre, post, tests */
domainWord(): string;
/** Generate user agent test data. @phases pre, post, tests */
userAgent(): string;
/** Generate protocol test data. @phases pre, post, tests */
protocol(): string;
/** Generate locale test data. @phases pre, post, tests */
locale(): string;
/** Generate semver test data. @phases pre, post, tests */
semver(): string;
/** Generate date past test data. @phases pre, post, tests */
datePast(options?: { years?: number; refDate?: string }): string;
/** Generate date future test data. @phases pre, post, tests */
dateFuture(options?: { years?: number; refDate?: string }): string;
/** Generate date recent test data. @phases pre, post, tests */
dateRecent(options?: { days?: number; refDate?: string }): string;
/** Generate weekday test data. @phases pre, post, tests */
weekday(): string;
/** Generate month test data. @phases pre, post, tests */
month(): string;
/** Generate timestamp test data. @phases pre, post, tests */
timestamp(): number;
/** Generate iso timestamp test data. @phases pre, post, tests */
isoTimestamp(): string;
/** Generate color test data. @phases pre, post, tests */
color(): string;
/** Generate hex color test data. @phases pre, post, tests */
hexColor(): string;
/** Generate word test data. @phases pre, post, tests */
word(): string;
/** Generate words test data. @phases pre, post, tests */
words(options?: { count?: number }): string;
/** Generate noun test data. @phases pre, post, tests */
noun(): string;
/** Generate verb test data. @phases pre, post, tests */
verb(): string;
/** Generate ing verb test data. @phases pre, post, tests */
ingVerb(): string;
/** Generate adjective test data. @phases pre, post, tests */
adjective(): string;
/** Generate phrase test data. @phases pre, post, tests */
phrase(): string;
/** Generate lorem word test data. @phases pre, post, tests */
loremWord(): string;
/** Generate lorem words test data. @phases pre, post, tests */
loremWords(options?: { count?: number }): string;
/** Generate lorem sentence test data. @phases pre, post, tests */
loremSentence(options?: { count?: number }): string;
/** Generate lorem sentences test data. @phases pre, post, tests */
loremSentences(options?: { count?: number }): string;
/** Generate lorem paragraph test data. @phases pre, post, tests */
loremParagraph(options?: { count?: number }): string;
/** Generate lorem paragraphs test data. @phases pre, post, tests */
loremParagraphs(options?: { count?: number }): string;
/** Generate lorem text test data. @phases pre, post, tests */
loremText(): string;
/** Generate lorem slug test data. @phases pre, post, tests */
loremSlug(options?: { count?: number }): string;
/** Generate lorem lines test data. @phases pre, post, tests */
loremLines(options?: { count?: number }): string;
/** Generate company name test data. @phases pre, post, tests */
companyName(): string;
/** Generate company suffix test data. @phases pre, post, tests */
companySuffix(): string;
/** Generate business phrase test data. @phases pre, post, tests */
businessPhrase(): string;
/** Generate business adjective test data. @phases pre, post, tests */
businessAdjective(): string;
/** Generate business buzzword test data. @phases pre, post, tests */
businessBuzzword(): string;
/** Generate business noun test data. @phases pre, post, tests */
businessNoun(): string;
/** Generate catch phrase test data. @phases pre, post, tests */
catchPhrase(): string;
/** Generate catch phrase adjective test data. @phases pre, post, tests */
catchPhraseAdjective(): string;
/** Generate catch phrase descriptor test data. @phases pre, post, tests */
catchPhraseDescriptor(): string;
/** Generate catch phrase noun test data. @phases pre, post, tests */
catchPhraseNoun(): string;
/** Generate job title test data. @phases pre, post, tests */
jobTitle(): string;
/** Generate job area test data. @phases pre, post, tests */
jobArea(): string;
/** Generate job descriptor test data. @phases pre, post, tests */
jobDescriptor(): string;
/** Generate job type test data. @phases pre, post, tests */
jobType(): string;
/** Generate product test data. @phases pre, post, tests */
product(): string;
/** Generate product name test data. @phases pre, post, tests */
productName(): string;
/** Generate product adjective test data. @phases pre, post, tests */
productAdjective(): string;
/** Generate product material test data. @phases pre, post, tests */
productMaterial(): string;
/** Generate department test data. @phases pre, post, tests */
department(): string;
/** Generate price test data. @phases pre, post, tests */
price(options?: { min?: number; max?: number; fractionDigits?: number }): string;
/** Generate bank account test data. @phases pre, post, tests */
bankAccount(options?: { length?: number }): string;
/** Generate bank account name test data. @phases pre, post, tests */
bankAccountName(): string;
/** Generate credit card mask test data. @phases pre, post, tests */
creditCardMask(): string;
/** Generate bic test data. @phases pre, post, tests */
bic(): string;
/** Generate iban test data. @phases pre, post, tests */
iban(): string;
/** Generate transaction type test data. @phases pre, post, tests */
transactionType(): string;
/** Generate currency code test data. @phases pre, post, tests */
currencyCode(): string;
/** Generate currency name test data. @phases pre, post, tests */
currencyName(): string;
/** Generate currency symbol test data. @phases pre, post, tests */
currencySymbol(): string;
/** Generate bitcoin address test data. @phases pre, post, tests */
bitcoinAddress(): string;
/** Generate database column test data. @phases pre, post, tests */
databaseColumn(): string;
/** Generate database type test data. @phases pre, post, tests */
databaseType(): string;
/** Generate database collation test data. @phases pre, post, tests */
databaseCollation(): string;
/** Generate database engine test data. @phases pre, post, tests */
databaseEngine(): string;
/** Generate file name test data. @phases pre, post, tests */
fileName(): string;
/** Generate file extension test data. @phases pre, post, tests */
fileExtension(): string;
/** Generate file type test data. @phases pre, post, tests */
fileType(): string;
/** Generate common file name test data. @phases pre, post, tests */
commonFileName(): string;
/** Generate common file extension test data. @phases pre, post, tests */
commonFileExtension(): string;
/** Generate common file type test data. @phases pre, post, tests */
commonFileType(): string;
/** Generate file path test data. @phases pre, post, tests */
filePath(): string;
/** Generate directory path test data. @phases pre, post, tests */
directoryPath(): string;
/** Generate mime type test data. @phases pre, post, tests */
mimeType(): string;
/** Generate avatar url test data. @phases pre, post, tests */
avatarUrl(): string;
/** Generate image url test data. @phases pre, post, tests */
imageUrl(options?: { width?: number; height?: number }): string;
/** Generate image data uri test data. @phases pre, post, tests */
imageDataUri(options?: { width?: number; height?: number }): string;
/** Reset this script's test-data sequence. @phases pre, post, tests */
seed(value: number): void;
/** Choose a copied JSON value from a non-empty array. @phases pre, post, tests */
pick(values: JsonValue[]): JsonValue;
};
/** Date and elapsed-time helpers. @phases pre, post, tests */
readonly time: {
/** Current Unix milliseconds. @phases pre, post, tests */
now(): number;
/** Unix seconds, rounded down; defaults to now. @phases pre, post, tests */
unix(value?: number | string): number;
/** Convert Unix seconds to milliseconds. @phases pre, post, tests */
fromUnix(seconds: number): number;
/** Parse an ISO date or timezone-bearing timestamp. @phases pre, post, tests */
parse(text: string): number;
/** UTC ISO timestamp; defaults to now. @phases pre, post, tests */
iso(value?: number | string): string;
/** Format a timestamp in UTC or a named IANA timezone. @phases pre, post, tests */
format(value: number | string, pattern: string, options?: { timeZone?: string }): string;
/** Add an elapsed duration, returning milliseconds. @phases pre, post, tests */
add(value: number | string, amount: number, unit: string): number;
/** Subtract an elapsed duration, returning milliseconds. @phases pre, post, tests */
subtract(value: number | string, amount: number, unit: string): number;
/** Signed elapsed difference a - b; defaults to milliseconds. @phases pre, post, tests */
diff(a: number | string, b: number | string, unit?: string): number;
};
/** Prepared request. @phases pre, post, tests */
readonly request: {
/** Request URL. @phases pre, post, tests */
url: string;
/** HTTP method. @phases pre, post, tests */
method: Method;
/** Request headers. @phases pre, post, tests */
readonly headers: {
/** Read the first matching header. @phases pre, post, tests */
get(name: string): string | null;
/** Test for a matching header. @phases pre, post, tests */
has(name: string): boolean;
/** Set one header. @phases pre */
set(name: string, value: string): void;
/** Delete matching headers. @phases pre */
delete(name: string): void;
};
/** Enabled query parameters. @phases pre, post, tests */
readonly params: {
/** Read the first enabled parameter. @phases pre, post, tests */
get(name: string): string | null;
/** Read enabled parameters. @phases pre, post, tests */
getAll(name: string): string[];
/** Replace enabled parameters. @phases pre */
set(name: string, value: string): void;
/** Append an enabled parameter. @phases pre */
append(name: string, value: string): void;
/** Delete enabled parameters. @phases pre */
delete(name: string): void;
};
/** Request body. @phases pre, post, tests */
readonly body: {
/** Read a textual body. @phases pre, post, tests */
text(): string | null;
/** Parse a textual body as JSON. @phases pre, post, tests */
json(): JsonValue;
/** Replace the body with text. @phases pre */
setText(value: string): void;
/** Replace the body with compact JSON. @phases pre */
setJson(value: JsonValue): void;
/** Clear the body. @phases pre */
clear(): void;
};
/** Request authentication. @phases pre, post, tests */
readonly auth: {
/** Clear authentication. @phases pre */
clear(): void;
/** Set bearer authentication. @phases pre */
setBearer(token: string): void;
/** Set basic authentication. @phases pre */
setBasic(username: string, password: string): void;
/** Set API-key authentication. @phases pre */
setApiKey(key: string, value: string, placement: "header" | "query"):  void;
};
};
/** Selected environment. @phases pre, post, tests */
readonly env: {
/** Read an environment value. @phases pre, post, tests */
get(name: string): string | undefined;
};
/** Current collection run scope. @phases pre, post, tests */
readonly run: {
/** Read a run value. @phases pre, post, tests */
get(name: string): JsonValue | undefined;
/** Set a run value after success, optionally persisting its snapshot. @phases pre, post */
set(name: string, value: JsonValue, options?: { persist: "environment" | "secret" }): void;
/** Remove a run value after success, optionally deleting its stored value. @phases pre, post */
unset(name: string, options?: { persist: "environment" | "secret" }): void;
};
/** Bounded cryptographic helpers. @phases pre, post, tests */
readonly crypto: {
/** Hash a UTF-8 string. @phases pre, post, tests */
sha256(value: string, encoding?: Encoding): string;
/** Authenticate a UTF-8 string. @phases pre, post, tests */
hmacSha256(secret: string, value: string, encoding?: Encoding): string;
/** Generate bounded random bytes. @phases pre, post, tests */
randomBytes(size: number, encoding?: Encoding): string;
};
/** Completed HTTP response. @phases post, tests */
readonly response: {
/** Response metadata. @phases post, tests */
readonly status: number;
/** Response metadata. @phases post, tests */
readonly statusText: string;
/** Response metadata. @phases post, tests */
readonly timeMs: number;
/** Response headers. @phases post, tests */
readonly headers: {
/** Read a case-insensitive header. @phases post, tests */
get(name: string): string | null;
/** Test a case-insensitive header. @phases post, tests */
has(name: string): boolean;
};
/** Read bounded response text. @phases post, tests */
text(): string;
/** Parse and cache response JSON in the sandbox. @phases post, tests */
json(): JsonValue;
};
/** URL-scoped cookie transaction when enabled. @phases post, tests */
readonly cookies: {
/** Read the first applicable cookie. @phases post, tests */
get(name: string): string | null;
/** Stage a host-only cookie. @phases post */
set(input: CookieInput): void;
/** Stage deletion of all applicable same-name cookies. @phases post */
delete(name: string): void;
};
}
interface Pre {
/** Read-only original dataset row and iteration position. @phases pre, post, tests */
readonly iteration: { index: number; count: number; data: object } | null;
/** Run a saved request in the current collection. @phases pre, post */
runRequest(id: string): Promise<ScriptResponse>;
/** Send a literal HTTP request. @phases pre, post */
sendRequest(options: DirectRequest): Promise<ScriptResponse>;
/** Bounded English test-data generators. @phases pre, post, tests */
readonly random: {
/** Generate a UUID v4 for test data. @phases pre, post, tests */
uuid(): string;
/** Generate id test data. @phases pre, post, tests */
id(options?: { length?: number }): string;
/** Generate nano id test data. @phases pre, post, tests */
nanoId(options?: { length?: number }): string;
/** Generate an integer between min and max, inclusive (default 0 to 1000). @phases pre, post, tests */
number(options?: { min?: number; max?: number }): number;
/** Generate float test data. @phases pre, post, tests */
float(options?: { min?: number; max?: number; fractionDigits?: number }): number;
/** Generate boolean test data. @phases pre, post, tests */
boolean(): boolean;
/** Generate alpha numeric test data. @phases pre, post, tests */
alphaNumeric(options?: { length?: number }): string;
/** Generate abbreviation test data. @phases pre, post, tests */
abbreviation(): string;
/** Generate name test data. @phases pre, post, tests */
name(): string;
/** Generate first name test data. @phases pre, post, tests */
firstName(): string;
/** Generate last name test data. @phases pre, post, tests */
lastName(): string;
/** Generate name prefix test data. @phases pre, post, tests */
namePrefix(): string;
/** Generate name suffix test data. @phases pre, post, tests */
nameSuffix(): string;
/** Generate email test data. @phases pre, post, tests */
email(): string;
/** Generate example email test data. @phases pre, post, tests */
exampleEmail(): string;
/** Generate username test data. @phases pre, post, tests */
username(): string;
/** Generate an alphanumeric test password (default 15 characters). Not cryptographically secure. @phases pre, post, tests */
password(options?: { length?: number }): string;
/** Generate phone test data. @phases pre, post, tests */
phone(): string;
/** Generate phone with extension test data. @phases pre, post, tests */
phoneWithExtension(): string;
/** Generate address test data. @phases pre, post, tests */
address(): string;
/** Generate street name test data. @phases pre, post, tests */
streetName(): string;
/** Generate city test data. @phases pre, post, tests */
city(): string;
/** Generate country test data. @phases pre, post, tests */
country(): string;
/** Generate country code test data. @phases pre, post, tests */
countryCode(): string;
/** Generate latitude test data. @phases pre, post, tests */
latitude(): number;
/** Generate longitude test data. @phases pre, post, tests */
longitude(): number;
/** Generate ipv4 test data. @phases pre, post, tests */
ipv4(): string;
/** Generate ipv6 test data. @phases pre, post, tests */
ipv6(): string;
/** Generate mac address test data. @phases pre, post, tests */
macAddress(): string;
/** Generate url test data. @phases pre, post, tests */
url(): string;
/** Generate domain name test data. @phases pre, post, tests */
domainName(): string;
/** Generate domain suffix test data. @phases pre, post, tests */
domainSuffix(): string;
/** Generate domain word test data. @phases pre, post, tests */
domainWord(): string;
/** Generate user agent test data. @phases pre, post, tests */
userAgent(): string;
/** Generate protocol test data. @phases pre, post, tests */
protocol(): string;
/** Generate locale test data. @phases pre, post, tests */
locale(): string;
/** Generate semver test data. @phases pre, post, tests */
semver(): string;
/** Generate date past test data. @phases pre, post, tests */
datePast(options?: { years?: number; refDate?: string }): string;
/** Generate date future test data. @phases pre, post, tests */
dateFuture(options?: { years?: number; refDate?: string }): string;
/** Generate date recent test data. @phases pre, post, tests */
dateRecent(options?: { days?: number; refDate?: string }): string;
/** Generate weekday test data. @phases pre, post, tests */
weekday(): string;
/** Generate month test data. @phases pre, post, tests */
month(): string;
/** Generate timestamp test data. @phases pre, post, tests */
timestamp(): number;
/** Generate iso timestamp test data. @phases pre, post, tests */
isoTimestamp(): string;
/** Generate color test data. @phases pre, post, tests */
color(): string;
/** Generate hex color test data. @phases pre, post, tests */
hexColor(): string;
/** Generate word test data. @phases pre, post, tests */
word(): string;
/** Generate words test data. @phases pre, post, tests */
words(options?: { count?: number }): string;
/** Generate noun test data. @phases pre, post, tests */
noun(): string;
/** Generate verb test data. @phases pre, post, tests */
verb(): string;
/** Generate ing verb test data. @phases pre, post, tests */
ingVerb(): string;
/** Generate adjective test data. @phases pre, post, tests */
adjective(): string;
/** Generate phrase test data. @phases pre, post, tests */
phrase(): string;
/** Generate lorem word test data. @phases pre, post, tests */
loremWord(): string;
/** Generate lorem words test data. @phases pre, post, tests */
loremWords(options?: { count?: number }): string;
/** Generate lorem sentence test data. @phases pre, post, tests */
loremSentence(options?: { count?: number }): string;
/** Generate lorem sentences test data. @phases pre, post, tests */
loremSentences(options?: { count?: number }): string;
/** Generate lorem paragraph test data. @phases pre, post, tests */
loremParagraph(options?: { count?: number }): string;
/** Generate lorem paragraphs test data. @phases pre, post, tests */
loremParagraphs(options?: { count?: number }): string;
/** Generate lorem text test data. @phases pre, post, tests */
loremText(): string;
/** Generate lorem slug test data. @phases pre, post, tests */
loremSlug(options?: { count?: number }): string;
/** Generate lorem lines test data. @phases pre, post, tests */
loremLines(options?: { count?: number }): string;
/** Generate company name test data. @phases pre, post, tests */
companyName(): string;
/** Generate company suffix test data. @phases pre, post, tests */
companySuffix(): string;
/** Generate business phrase test data. @phases pre, post, tests */
businessPhrase(): string;
/** Generate business adjective test data. @phases pre, post, tests */
businessAdjective(): string;
/** Generate business buzzword test data. @phases pre, post, tests */
businessBuzzword(): string;
/** Generate business noun test data. @phases pre, post, tests */
businessNoun(): string;
/** Generate catch phrase test data. @phases pre, post, tests */
catchPhrase(): string;
/** Generate catch phrase adjective test data. @phases pre, post, tests */
catchPhraseAdjective(): string;
/** Generate catch phrase descriptor test data. @phases pre, post, tests */
catchPhraseDescriptor(): string;
/** Generate catch phrase noun test data. @phases pre, post, tests */
catchPhraseNoun(): string;
/** Generate job title test data. @phases pre, post, tests */
jobTitle(): string;
/** Generate job area test data. @phases pre, post, tests */
jobArea(): string;
/** Generate job descriptor test data. @phases pre, post, tests */
jobDescriptor(): string;
/** Generate job type test data. @phases pre, post, tests */
jobType(): string;
/** Generate product test data. @phases pre, post, tests */
product(): string;
/** Generate product name test data. @phases pre, post, tests */
productName(): string;
/** Generate product adjective test data. @phases pre, post, tests */
productAdjective(): string;
/** Generate product material test data. @phases pre, post, tests */
productMaterial(): string;
/** Generate department test data. @phases pre, post, tests */
department(): string;
/** Generate price test data. @phases pre, post, tests */
price(options?: { min?: number; max?: number; fractionDigits?: number }): string;
/** Generate bank account test data. @phases pre, post, tests */
bankAccount(options?: { length?: number }): string;
/** Generate bank account name test data. @phases pre, post, tests */
bankAccountName(): string;
/** Generate credit card mask test data. @phases pre, post, tests */
creditCardMask(): string;
/** Generate bic test data. @phases pre, post, tests */
bic(): string;
/** Generate iban test data. @phases pre, post, tests */
iban(): string;
/** Generate transaction type test data. @phases pre, post, tests */
transactionType(): string;
/** Generate currency code test data. @phases pre, post, tests */
currencyCode(): string;
/** Generate currency name test data. @phases pre, post, tests */
currencyName(): string;
/** Generate currency symbol test data. @phases pre, post, tests */
currencySymbol(): string;
/** Generate bitcoin address test data. @phases pre, post, tests */
bitcoinAddress(): string;
/** Generate database column test data. @phases pre, post, tests */
databaseColumn(): string;
/** Generate database type test data. @phases pre, post, tests */
databaseType(): string;
/** Generate database collation test data. @phases pre, post, tests */
databaseCollation(): string;
/** Generate database engine test data. @phases pre, post, tests */
databaseEngine(): string;
/** Generate file name test data. @phases pre, post, tests */
fileName(): string;
/** Generate file extension test data. @phases pre, post, tests */
fileExtension(): string;
/** Generate file type test data. @phases pre, post, tests */
fileType(): string;
/** Generate common file name test data. @phases pre, post, tests */
commonFileName(): string;
/** Generate common file extension test data. @phases pre, post, tests */
commonFileExtension(): string;
/** Generate common file type test data. @phases pre, post, tests */
commonFileType(): string;
/** Generate file path test data. @phases pre, post, tests */
filePath(): string;
/** Generate directory path test data. @phases pre, post, tests */
directoryPath(): string;
/** Generate mime type test data. @phases pre, post, tests */
mimeType(): string;
/** Generate avatar url test data. @phases pre, post, tests */
avatarUrl(): string;
/** Generate image url test data. @phases pre, post, tests */
imageUrl(options?: { width?: number; height?: number }): string;
/** Generate image data uri test data. @phases pre, post, tests */
imageDataUri(options?: { width?: number; height?: number }): string;
/** Reset this script's test-data sequence. @phases pre, post, tests */
seed(value: number): void;
/** Choose a copied JSON value from a non-empty array. @phases pre, post, tests */
pick(values: JsonValue[]): JsonValue;
};
/** Date and elapsed-time helpers. @phases pre, post, tests */
readonly time: {
/** Current Unix milliseconds. @phases pre, post, tests */
now(): number;
/** Unix seconds, rounded down; defaults to now. @phases pre, post, tests */
unix(value?: number | string): number;
/** Convert Unix seconds to milliseconds. @phases pre, post, tests */
fromUnix(seconds: number): number;
/** Parse an ISO date or timezone-bearing timestamp. @phases pre, post, tests */
parse(text: string): number;
/** UTC ISO timestamp; defaults to now. @phases pre, post, tests */
iso(value?: number | string): string;
/** Format a timestamp in UTC or a named IANA timezone. @phases pre, post, tests */
format(value: number | string, pattern: string, options?: { timeZone?: string }): string;
/** Add an elapsed duration, returning milliseconds. @phases pre, post, tests */
add(value: number | string, amount: number, unit: string): number;
/** Subtract an elapsed duration, returning milliseconds. @phases pre, post, tests */
subtract(value: number | string, amount: number, unit: string): number;
/** Signed elapsed difference a - b; defaults to milliseconds. @phases pre, post, tests */
diff(a: number | string, b: number | string, unit?: string): number;
};
/** Prepared request. @phases pre, post, tests */
readonly request: {
/** Request URL. @phases pre, post, tests */
url: string;
/** HTTP method. @phases pre, post, tests */
method: Method;
/** Request headers. @phases pre, post, tests */
readonly headers: {
/** Read the first matching header. @phases pre, post, tests */
get(name: string): string | null;
/** Test for a matching header. @phases pre, post, tests */
has(name: string): boolean;
/** Set one header. @phases pre */
set(name: string, value: string): void;
/** Delete matching headers. @phases pre */
delete(name: string): void;
};
/** Enabled query parameters. @phases pre, post, tests */
readonly params: {
/** Read the first enabled parameter. @phases pre, post, tests */
get(name: string): string | null;
/** Read enabled parameters. @phases pre, post, tests */
getAll(name: string): string[];
/** Replace enabled parameters. @phases pre */
set(name: string, value: string): void;
/** Append an enabled parameter. @phases pre */
append(name: string, value: string): void;
/** Delete enabled parameters. @phases pre */
delete(name: string): void;
};
/** Request body. @phases pre, post, tests */
readonly body: {
/** Read a textual body. @phases pre, post, tests */
text(): string | null;
/** Parse a textual body as JSON. @phases pre, post, tests */
json(): JsonValue;
/** Replace the body with text. @phases pre */
setText(value: string): void;
/** Replace the body with compact JSON. @phases pre */
setJson(value: JsonValue): void;
/** Clear the body. @phases pre */
clear(): void;
};
/** Request authentication. @phases pre, post, tests */
readonly auth: {
/** Clear authentication. @phases pre */
clear(): void;
/** Set bearer authentication. @phases pre */
setBearer(token: string): void;
/** Set basic authentication. @phases pre */
setBasic(username: string, password: string): void;
/** Set API-key authentication. @phases pre */
setApiKey(key: string, value: string, placement: "header" | "query"):  void;
};
};
/** Selected environment. @phases pre, post, tests */
readonly env: {
/** Read an environment value. @phases pre, post, tests */
get(name: string): string | undefined;
};
/** Current collection run scope. @phases pre, post, tests */
readonly run: {
/** Read a run value. @phases pre, post, tests */
get(name: string): JsonValue | undefined;
/** Set a run value after success, optionally persisting its snapshot. @phases pre, post */
set(name: string, value: JsonValue, options?: { persist: "environment" | "secret" }): void;
/** Remove a run value after success, optionally deleting its stored value. @phases pre, post */
unset(name: string, options?: { persist: "environment" | "secret" }): void;
};
/** Bounded cryptographic helpers. @phases pre, post, tests */
readonly crypto: {
/** Hash a UTF-8 string. @phases pre, post, tests */
sha256(value: string, encoding?: Encoding): string;
/** Authenticate a UTF-8 string. @phases pre, post, tests */
hmacSha256(secret: string, value: string, encoding?: Encoding): string;
/** Generate bounded random bytes. @phases pre, post, tests */
randomBytes(size: number, encoding?: Encoding): string;
};
}
interface Post {
/** Read-only original dataset row and iteration position. @phases pre, post, tests */
readonly iteration: { index: number; count: number; data: object } | null;
/** Run a saved request in the current collection. @phases pre, post */
runRequest(id: string): Promise<ScriptResponse>;
/** Send a literal HTTP request. @phases pre, post */
sendRequest(options: DirectRequest): Promise<ScriptResponse>;
/** Bounded English test-data generators. @phases pre, post, tests */
readonly random: {
/** Generate a UUID v4 for test data. @phases pre, post, tests */
uuid(): string;
/** Generate id test data. @phases pre, post, tests */
id(options?: { length?: number }): string;
/** Generate nano id test data. @phases pre, post, tests */
nanoId(options?: { length?: number }): string;
/** Generate an integer between min and max, inclusive (default 0 to 1000). @phases pre, post, tests */
number(options?: { min?: number; max?: number }): number;
/** Generate float test data. @phases pre, post, tests */
float(options?: { min?: number; max?: number; fractionDigits?: number }): number;
/** Generate boolean test data. @phases pre, post, tests */
boolean(): boolean;
/** Generate alpha numeric test data. @phases pre, post, tests */
alphaNumeric(options?: { length?: number }): string;
/** Generate abbreviation test data. @phases pre, post, tests */
abbreviation(): string;
/** Generate name test data. @phases pre, post, tests */
name(): string;
/** Generate first name test data. @phases pre, post, tests */
firstName(): string;
/** Generate last name test data. @phases pre, post, tests */
lastName(): string;
/** Generate name prefix test data. @phases pre, post, tests */
namePrefix(): string;
/** Generate name suffix test data. @phases pre, post, tests */
nameSuffix(): string;
/** Generate email test data. @phases pre, post, tests */
email(): string;
/** Generate example email test data. @phases pre, post, tests */
exampleEmail(): string;
/** Generate username test data. @phases pre, post, tests */
username(): string;
/** Generate an alphanumeric test password (default 15 characters). Not cryptographically secure. @phases pre, post, tests */
password(options?: { length?: number }): string;
/** Generate phone test data. @phases pre, post, tests */
phone(): string;
/** Generate phone with extension test data. @phases pre, post, tests */
phoneWithExtension(): string;
/** Generate address test data. @phases pre, post, tests */
address(): string;
/** Generate street name test data. @phases pre, post, tests */
streetName(): string;
/** Generate city test data. @phases pre, post, tests */
city(): string;
/** Generate country test data. @phases pre, post, tests */
country(): string;
/** Generate country code test data. @phases pre, post, tests */
countryCode(): string;
/** Generate latitude test data. @phases pre, post, tests */
latitude(): number;
/** Generate longitude test data. @phases pre, post, tests */
longitude(): number;
/** Generate ipv4 test data. @phases pre, post, tests */
ipv4(): string;
/** Generate ipv6 test data. @phases pre, post, tests */
ipv6(): string;
/** Generate mac address test data. @phases pre, post, tests */
macAddress(): string;
/** Generate url test data. @phases pre, post, tests */
url(): string;
/** Generate domain name test data. @phases pre, post, tests */
domainName(): string;
/** Generate domain suffix test data. @phases pre, post, tests */
domainSuffix(): string;
/** Generate domain word test data. @phases pre, post, tests */
domainWord(): string;
/** Generate user agent test data. @phases pre, post, tests */
userAgent(): string;
/** Generate protocol test data. @phases pre, post, tests */
protocol(): string;
/** Generate locale test data. @phases pre, post, tests */
locale(): string;
/** Generate semver test data. @phases pre, post, tests */
semver(): string;
/** Generate date past test data. @phases pre, post, tests */
datePast(options?: { years?: number; refDate?: string }): string;
/** Generate date future test data. @phases pre, post, tests */
dateFuture(options?: { years?: number; refDate?: string }): string;
/** Generate date recent test data. @phases pre, post, tests */
dateRecent(options?: { days?: number; refDate?: string }): string;
/** Generate weekday test data. @phases pre, post, tests */
weekday(): string;
/** Generate month test data. @phases pre, post, tests */
month(): string;
/** Generate timestamp test data. @phases pre, post, tests */
timestamp(): number;
/** Generate iso timestamp test data. @phases pre, post, tests */
isoTimestamp(): string;
/** Generate color test data. @phases pre, post, tests */
color(): string;
/** Generate hex color test data. @phases pre, post, tests */
hexColor(): string;
/** Generate word test data. @phases pre, post, tests */
word(): string;
/** Generate words test data. @phases pre, post, tests */
words(options?: { count?: number }): string;
/** Generate noun test data. @phases pre, post, tests */
noun(): string;
/** Generate verb test data. @phases pre, post, tests */
verb(): string;
/** Generate ing verb test data. @phases pre, post, tests */
ingVerb(): string;
/** Generate adjective test data. @phases pre, post, tests */
adjective(): string;
/** Generate phrase test data. @phases pre, post, tests */
phrase(): string;
/** Generate lorem word test data. @phases pre, post, tests */
loremWord(): string;
/** Generate lorem words test data. @phases pre, post, tests */
loremWords(options?: { count?: number }): string;
/** Generate lorem sentence test data. @phases pre, post, tests */
loremSentence(options?: { count?: number }): string;
/** Generate lorem sentences test data. @phases pre, post, tests */
loremSentences(options?: { count?: number }): string;
/** Generate lorem paragraph test data. @phases pre, post, tests */
loremParagraph(options?: { count?: number }): string;
/** Generate lorem paragraphs test data. @phases pre, post, tests */
loremParagraphs(options?: { count?: number }): string;
/** Generate lorem text test data. @phases pre, post, tests */
loremText(): string;
/** Generate lorem slug test data. @phases pre, post, tests */
loremSlug(options?: { count?: number }): string;
/** Generate lorem lines test data. @phases pre, post, tests */
loremLines(options?: { count?: number }): string;
/** Generate company name test data. @phases pre, post, tests */
companyName(): string;
/** Generate company suffix test data. @phases pre, post, tests */
companySuffix(): string;
/** Generate business phrase test data. @phases pre, post, tests */
businessPhrase(): string;
/** Generate business adjective test data. @phases pre, post, tests */
businessAdjective(): string;
/** Generate business buzzword test data. @phases pre, post, tests */
businessBuzzword(): string;
/** Generate business noun test data. @phases pre, post, tests */
businessNoun(): string;
/** Generate catch phrase test data. @phases pre, post, tests */
catchPhrase(): string;
/** Generate catch phrase adjective test data. @phases pre, post, tests */
catchPhraseAdjective(): string;
/** Generate catch phrase descriptor test data. @phases pre, post, tests */
catchPhraseDescriptor(): string;
/** Generate catch phrase noun test data. @phases pre, post, tests */
catchPhraseNoun(): string;
/** Generate job title test data. @phases pre, post, tests */
jobTitle(): string;
/** Generate job area test data. @phases pre, post, tests */
jobArea(): string;
/** Generate job descriptor test data. @phases pre, post, tests */
jobDescriptor(): string;
/** Generate job type test data. @phases pre, post, tests */
jobType(): string;
/** Generate product test data. @phases pre, post, tests */
product(): string;
/** Generate product name test data. @phases pre, post, tests */
productName(): string;
/** Generate product adjective test data. @phases pre, post, tests */
productAdjective(): string;
/** Generate product material test data. @phases pre, post, tests */
productMaterial(): string;
/** Generate department test data. @phases pre, post, tests */
department(): string;
/** Generate price test data. @phases pre, post, tests */
price(options?: { min?: number; max?: number; fractionDigits?: number }): string;
/** Generate bank account test data. @phases pre, post, tests */
bankAccount(options?: { length?: number }): string;
/** Generate bank account name test data. @phases pre, post, tests */
bankAccountName(): string;
/** Generate credit card mask test data. @phases pre, post, tests */
creditCardMask(): string;
/** Generate bic test data. @phases pre, post, tests */
bic(): string;
/** Generate iban test data. @phases pre, post, tests */
iban(): string;
/** Generate transaction type test data. @phases pre, post, tests */
transactionType(): string;
/** Generate currency code test data. @phases pre, post, tests */
currencyCode(): string;
/** Generate currency name test data. @phases pre, post, tests */
currencyName(): string;
/** Generate currency symbol test data. @phases pre, post, tests */
currencySymbol(): string;
/** Generate bitcoin address test data. @phases pre, post, tests */
bitcoinAddress(): string;
/** Generate database column test data. @phases pre, post, tests */
databaseColumn(): string;
/** Generate database type test data. @phases pre, post, tests */
databaseType(): string;
/** Generate database collation test data. @phases pre, post, tests */
databaseCollation(): string;
/** Generate database engine test data. @phases pre, post, tests */
databaseEngine(): string;
/** Generate file name test data. @phases pre, post, tests */
fileName(): string;
/** Generate file extension test data. @phases pre, post, tests */
fileExtension(): string;
/** Generate file type test data. @phases pre, post, tests */
fileType(): string;
/** Generate common file name test data. @phases pre, post, tests */
commonFileName(): string;
/** Generate common file extension test data. @phases pre, post, tests */
commonFileExtension(): string;
/** Generate common file type test data. @phases pre, post, tests */
commonFileType(): string;
/** Generate file path test data. @phases pre, post, tests */
filePath(): string;
/** Generate directory path test data. @phases pre, post, tests */
directoryPath(): string;
/** Generate mime type test data. @phases pre, post, tests */
mimeType(): string;
/** Generate avatar url test data. @phases pre, post, tests */
avatarUrl(): string;
/** Generate image url test data. @phases pre, post, tests */
imageUrl(options?: { width?: number; height?: number }): string;
/** Generate image data uri test data. @phases pre, post, tests */
imageDataUri(options?: { width?: number; height?: number }): string;
/** Reset this script's test-data sequence. @phases pre, post, tests */
seed(value: number): void;
/** Choose a copied JSON value from a non-empty array. @phases pre, post, tests */
pick(values: JsonValue[]): JsonValue;
};
/** Date and elapsed-time helpers. @phases pre, post, tests */
readonly time: {
/** Current Unix milliseconds. @phases pre, post, tests */
now(): number;
/** Unix seconds, rounded down; defaults to now. @phases pre, post, tests */
unix(value?: number | string): number;
/** Convert Unix seconds to milliseconds. @phases pre, post, tests */
fromUnix(seconds: number): number;
/** Parse an ISO date or timezone-bearing timestamp. @phases pre, post, tests */
parse(text: string): number;
/** UTC ISO timestamp; defaults to now. @phases pre, post, tests */
iso(value?: number | string): string;
/** Format a timestamp in UTC or a named IANA timezone. @phases pre, post, tests */
format(value: number | string, pattern: string, options?: { timeZone?: string }): string;
/** Add an elapsed duration, returning milliseconds. @phases pre, post, tests */
add(value: number | string, amount: number, unit: string): number;
/** Subtract an elapsed duration, returning milliseconds. @phases pre, post, tests */
subtract(value: number | string, amount: number, unit: string): number;
/** Signed elapsed difference a - b; defaults to milliseconds. @phases pre, post, tests */
diff(a: number | string, b: number | string, unit?: string): number;
};
/** Prepared request. @phases pre, post, tests */
readonly request: {
/** Request URL. @phases pre, post, tests */
readonly url: string;
/** HTTP method. @phases pre, post, tests */
readonly method: Method;
/** Request headers. @phases pre, post, tests */
readonly headers: {
/** Read the first matching header. @phases pre, post, tests */
get(name: string): string | null;
/** Test for a matching header. @phases pre, post, tests */
has(name: string): boolean;
};
/** Enabled query parameters. @phases pre, post, tests */
readonly params: {
/** Read the first enabled parameter. @phases pre, post, tests */
get(name: string): string | null;
/** Read enabled parameters. @phases pre, post, tests */
getAll(name: string): string[];
};
/** Request body. @phases pre, post, tests */
readonly body: {
/** Read a textual body. @phases pre, post, tests */
text(): string | null;
/** Parse a textual body as JSON. @phases pre, post, tests */
json(): JsonValue;
};
/** Request authentication. @phases pre, post, tests */
readonly auth: {

};
};
/** Selected environment. @phases pre, post, tests */
readonly env: {
/** Read an environment value. @phases pre, post, tests */
get(name: string): string | undefined;
};
/** Current collection run scope. @phases pre, post, tests */
readonly run: {
/** Read a run value. @phases pre, post, tests */
get(name: string): JsonValue | undefined;
/** Set a run value after success, optionally persisting its snapshot. @phases pre, post */
set(name: string, value: JsonValue, options?: { persist: "environment" | "secret" }): void;
/** Remove a run value after success, optionally deleting its stored value. @phases pre, post */
unset(name: string, options?: { persist: "environment" | "secret" }): void;
};
/** Bounded cryptographic helpers. @phases pre, post, tests */
readonly crypto: {
/** Hash a UTF-8 string. @phases pre, post, tests */
sha256(value: string, encoding?: Encoding): string;
/** Authenticate a UTF-8 string. @phases pre, post, tests */
hmacSha256(secret: string, value: string, encoding?: Encoding): string;
/** Generate bounded random bytes. @phases pre, post, tests */
randomBytes(size: number, encoding?: Encoding): string;
};
/** Completed HTTP response. @phases post, tests */
readonly response: {
/** Response metadata. @phases post, tests */
readonly status: number;
/** Response metadata. @phases post, tests */
readonly statusText: string;
/** Response metadata. @phases post, tests */
readonly timeMs: number;
/** Response headers. @phases post, tests */
readonly headers: {
/** Read a case-insensitive header. @phases post, tests */
get(name: string): string | null;
/** Test a case-insensitive header. @phases post, tests */
has(name: string): boolean;
};
/** Read bounded response text. @phases post, tests */
text(): string;
/** Parse and cache response JSON in the sandbox. @phases post, tests */
json(): JsonValue;
};
/** URL-scoped cookie transaction when enabled. @phases post, tests */
readonly cookies: {
/** Read the first applicable cookie. @phases post, tests */
get(name: string): string | null;
/** Stage a host-only cookie. @phases post */
set(input: CookieInput): void;
/** Stage deletion of all applicable same-name cookies. @phases post */
delete(name: string): void;
};
}
interface Tests {
/** Read-only original dataset row and iteration position. @phases pre, post, tests */
readonly iteration: { index: number; count: number; data: object } | null;
/** Bounded English test-data generators. @phases pre, post, tests */
readonly random: {
/** Generate a UUID v4 for test data. @phases pre, post, tests */
uuid(): string;
/** Generate id test data. @phases pre, post, tests */
id(options?: { length?: number }): string;
/** Generate nano id test data. @phases pre, post, tests */
nanoId(options?: { length?: number }): string;
/** Generate an integer between min and max, inclusive (default 0 to 1000). @phases pre, post, tests */
number(options?: { min?: number; max?: number }): number;
/** Generate float test data. @phases pre, post, tests */
float(options?: { min?: number; max?: number; fractionDigits?: number }): number;
/** Generate boolean test data. @phases pre, post, tests */
boolean(): boolean;
/** Generate alpha numeric test data. @phases pre, post, tests */
alphaNumeric(options?: { length?: number }): string;
/** Generate abbreviation test data. @phases pre, post, tests */
abbreviation(): string;
/** Generate name test data. @phases pre, post, tests */
name(): string;
/** Generate first name test data. @phases pre, post, tests */
firstName(): string;
/** Generate last name test data. @phases pre, post, tests */
lastName(): string;
/** Generate name prefix test data. @phases pre, post, tests */
namePrefix(): string;
/** Generate name suffix test data. @phases pre, post, tests */
nameSuffix(): string;
/** Generate email test data. @phases pre, post, tests */
email(): string;
/** Generate example email test data. @phases pre, post, tests */
exampleEmail(): string;
/** Generate username test data. @phases pre, post, tests */
username(): string;
/** Generate an alphanumeric test password (default 15 characters). Not cryptographically secure. @phases pre, post, tests */
password(options?: { length?: number }): string;
/** Generate phone test data. @phases pre, post, tests */
phone(): string;
/** Generate phone with extension test data. @phases pre, post, tests */
phoneWithExtension(): string;
/** Generate address test data. @phases pre, post, tests */
address(): string;
/** Generate street name test data. @phases pre, post, tests */
streetName(): string;
/** Generate city test data. @phases pre, post, tests */
city(): string;
/** Generate country test data. @phases pre, post, tests */
country(): string;
/** Generate country code test data. @phases pre, post, tests */
countryCode(): string;
/** Generate latitude test data. @phases pre, post, tests */
latitude(): number;
/** Generate longitude test data. @phases pre, post, tests */
longitude(): number;
/** Generate ipv4 test data. @phases pre, post, tests */
ipv4(): string;
/** Generate ipv6 test data. @phases pre, post, tests */
ipv6(): string;
/** Generate mac address test data. @phases pre, post, tests */
macAddress(): string;
/** Generate url test data. @phases pre, post, tests */
url(): string;
/** Generate domain name test data. @phases pre, post, tests */
domainName(): string;
/** Generate domain suffix test data. @phases pre, post, tests */
domainSuffix(): string;
/** Generate domain word test data. @phases pre, post, tests */
domainWord(): string;
/** Generate user agent test data. @phases pre, post, tests */
userAgent(): string;
/** Generate protocol test data. @phases pre, post, tests */
protocol(): string;
/** Generate locale test data. @phases pre, post, tests */
locale(): string;
/** Generate semver test data. @phases pre, post, tests */
semver(): string;
/** Generate date past test data. @phases pre, post, tests */
datePast(options?: { years?: number; refDate?: string }): string;
/** Generate date future test data. @phases pre, post, tests */
dateFuture(options?: { years?: number; refDate?: string }): string;
/** Generate date recent test data. @phases pre, post, tests */
dateRecent(options?: { days?: number; refDate?: string }): string;
/** Generate weekday test data. @phases pre, post, tests */
weekday(): string;
/** Generate month test data. @phases pre, post, tests */
month(): string;
/** Generate timestamp test data. @phases pre, post, tests */
timestamp(): number;
/** Generate iso timestamp test data. @phases pre, post, tests */
isoTimestamp(): string;
/** Generate color test data. @phases pre, post, tests */
color(): string;
/** Generate hex color test data. @phases pre, post, tests */
hexColor(): string;
/** Generate word test data. @phases pre, post, tests */
word(): string;
/** Generate words test data. @phases pre, post, tests */
words(options?: { count?: number }): string;
/** Generate noun test data. @phases pre, post, tests */
noun(): string;
/** Generate verb test data. @phases pre, post, tests */
verb(): string;
/** Generate ing verb test data. @phases pre, post, tests */
ingVerb(): string;
/** Generate adjective test data. @phases pre, post, tests */
adjective(): string;
/** Generate phrase test data. @phases pre, post, tests */
phrase(): string;
/** Generate lorem word test data. @phases pre, post, tests */
loremWord(): string;
/** Generate lorem words test data. @phases pre, post, tests */
loremWords(options?: { count?: number }): string;
/** Generate lorem sentence test data. @phases pre, post, tests */
loremSentence(options?: { count?: number }): string;
/** Generate lorem sentences test data. @phases pre, post, tests */
loremSentences(options?: { count?: number }): string;
/** Generate lorem paragraph test data. @phases pre, post, tests */
loremParagraph(options?: { count?: number }): string;
/** Generate lorem paragraphs test data. @phases pre, post, tests */
loremParagraphs(options?: { count?: number }): string;
/** Generate lorem text test data. @phases pre, post, tests */
loremText(): string;
/** Generate lorem slug test data. @phases pre, post, tests */
loremSlug(options?: { count?: number }): string;
/** Generate lorem lines test data. @phases pre, post, tests */
loremLines(options?: { count?: number }): string;
/** Generate company name test data. @phases pre, post, tests */
companyName(): string;
/** Generate company suffix test data. @phases pre, post, tests */
companySuffix(): string;
/** Generate business phrase test data. @phases pre, post, tests */
businessPhrase(): string;
/** Generate business adjective test data. @phases pre, post, tests */
businessAdjective(): string;
/** Generate business buzzword test data. @phases pre, post, tests */
businessBuzzword(): string;
/** Generate business noun test data. @phases pre, post, tests */
businessNoun(): string;
/** Generate catch phrase test data. @phases pre, post, tests */
catchPhrase(): string;
/** Generate catch phrase adjective test data. @phases pre, post, tests */
catchPhraseAdjective(): string;
/** Generate catch phrase descriptor test data. @phases pre, post, tests */
catchPhraseDescriptor(): string;
/** Generate catch phrase noun test data. @phases pre, post, tests */
catchPhraseNoun(): string;
/** Generate job title test data. @phases pre, post, tests */
jobTitle(): string;
/** Generate job area test data. @phases pre, post, tests */
jobArea(): string;
/** Generate job descriptor test data. @phases pre, post, tests */
jobDescriptor(): string;
/** Generate job type test data. @phases pre, post, tests */
jobType(): string;
/** Generate product test data. @phases pre, post, tests */
product(): string;
/** Generate product name test data. @phases pre, post, tests */
productName(): string;
/** Generate product adjective test data. @phases pre, post, tests */
productAdjective(): string;
/** Generate product material test data. @phases pre, post, tests */
productMaterial(): string;
/** Generate department test data. @phases pre, post, tests */
department(): string;
/** Generate price test data. @phases pre, post, tests */
price(options?: { min?: number; max?: number; fractionDigits?: number }): string;
/** Generate bank account test data. @phases pre, post, tests */
bankAccount(options?: { length?: number }): string;
/** Generate bank account name test data. @phases pre, post, tests */
bankAccountName(): string;
/** Generate credit card mask test data. @phases pre, post, tests */
creditCardMask(): string;
/** Generate bic test data. @phases pre, post, tests */
bic(): string;
/** Generate iban test data. @phases pre, post, tests */
iban(): string;
/** Generate transaction type test data. @phases pre, post, tests */
transactionType(): string;
/** Generate currency code test data. @phases pre, post, tests */
currencyCode(): string;
/** Generate currency name test data. @phases pre, post, tests */
currencyName(): string;
/** Generate currency symbol test data. @phases pre, post, tests */
currencySymbol(): string;
/** Generate bitcoin address test data. @phases pre, post, tests */
bitcoinAddress(): string;
/** Generate database column test data. @phases pre, post, tests */
databaseColumn(): string;
/** Generate database type test data. @phases pre, post, tests */
databaseType(): string;
/** Generate database collation test data. @phases pre, post, tests */
databaseCollation(): string;
/** Generate database engine test data. @phases pre, post, tests */
databaseEngine(): string;
/** Generate file name test data. @phases pre, post, tests */
fileName(): string;
/** Generate file extension test data. @phases pre, post, tests */
fileExtension(): string;
/** Generate file type test data. @phases pre, post, tests */
fileType(): string;
/** Generate common file name test data. @phases pre, post, tests */
commonFileName(): string;
/** Generate common file extension test data. @phases pre, post, tests */
commonFileExtension(): string;
/** Generate common file type test data. @phases pre, post, tests */
commonFileType(): string;
/** Generate file path test data. @phases pre, post, tests */
filePath(): string;
/** Generate directory path test data. @phases pre, post, tests */
directoryPath(): string;
/** Generate mime type test data. @phases pre, post, tests */
mimeType(): string;
/** Generate avatar url test data. @phases pre, post, tests */
avatarUrl(): string;
/** Generate image url test data. @phases pre, post, tests */
imageUrl(options?: { width?: number; height?: number }): string;
/** Generate image data uri test data. @phases pre, post, tests */
imageDataUri(options?: { width?: number; height?: number }): string;
/** Reset this script's test-data sequence. @phases pre, post, tests */
seed(value: number): void;
/** Choose a copied JSON value from a non-empty array. @phases pre, post, tests */
pick(values: JsonValue[]): JsonValue;
};
/** Date and elapsed-time helpers. @phases pre, post, tests */
readonly time: {
/** Current Unix milliseconds. @phases pre, post, tests */
now(): number;
/** Unix seconds, rounded down; defaults to now. @phases pre, post, tests */
unix(value?: number | string): number;
/** Convert Unix seconds to milliseconds. @phases pre, post, tests */
fromUnix(seconds: number): number;
/** Parse an ISO date or timezone-bearing timestamp. @phases pre, post, tests */
parse(text: string): number;
/** UTC ISO timestamp; defaults to now. @phases pre, post, tests */
iso(value?: number | string): string;
/** Format a timestamp in UTC or a named IANA timezone. @phases pre, post, tests */
format(value: number | string, pattern: string, options?: { timeZone?: string }): string;
/** Add an elapsed duration, returning milliseconds. @phases pre, post, tests */
add(value: number | string, amount: number, unit: string): number;
/** Subtract an elapsed duration, returning milliseconds. @phases pre, post, tests */
subtract(value: number | string, amount: number, unit: string): number;
/** Signed elapsed difference a - b; defaults to milliseconds. @phases pre, post, tests */
diff(a: number | string, b: number | string, unit?: string): number;
};
/** Prepared request. @phases pre, post, tests */
readonly request: {
/** Request URL. @phases pre, post, tests */
readonly url: string;
/** HTTP method. @phases pre, post, tests */
readonly method: Method;
/** Request headers. @phases pre, post, tests */
readonly headers: {
/** Read the first matching header. @phases pre, post, tests */
get(name: string): string | null;
/** Test for a matching header. @phases pre, post, tests */
has(name: string): boolean;
};
/** Enabled query parameters. @phases pre, post, tests */
readonly params: {
/** Read the first enabled parameter. @phases pre, post, tests */
get(name: string): string | null;
/** Read enabled parameters. @phases pre, post, tests */
getAll(name: string): string[];
};
/** Request body. @phases pre, post, tests */
readonly body: {
/** Read a textual body. @phases pre, post, tests */
text(): string | null;
/** Parse a textual body as JSON. @phases pre, post, tests */
json(): JsonValue;
};
/** Request authentication. @phases pre, post, tests */
readonly auth: {

};
};
/** Selected environment. @phases pre, post, tests */
readonly env: {
/** Read an environment value. @phases pre, post, tests */
get(name: string): string | undefined;
};
/** Current collection run scope. @phases pre, post, tests */
readonly run: {
/** Read a run value. @phases pre, post, tests */
get(name: string): JsonValue | undefined;
};
/** Bounded cryptographic helpers. @phases pre, post, tests */
readonly crypto: {
/** Hash a UTF-8 string. @phases pre, post, tests */
sha256(value: string, encoding?: Encoding): string;
/** Authenticate a UTF-8 string. @phases pre, post, tests */
hmacSha256(secret: string, value: string, encoding?: Encoding): string;
/** Generate bounded random bytes. @phases pre, post, tests */
randomBytes(size: number, encoding?: Encoding): string;
};
/** Completed HTTP response. @phases post, tests */
readonly response: {
/** Response metadata. @phases post, tests */
readonly status: number;
/** Response metadata. @phases post, tests */
readonly statusText: string;
/** Response metadata. @phases post, tests */
readonly timeMs: number;
/** Response headers. @phases post, tests */
readonly headers: {
/** Read a case-insensitive header. @phases post, tests */
get(name: string): string | null;
/** Test a case-insensitive header. @phases post, tests */
has(name: string): boolean;
};
/** Read bounded response text. @phases post, tests */
text(): string;
/** Parse and cache response JSON in the sandbox. @phases post, tests */
json(): JsonValue;
};
/** URL-scoped cookie transaction when enabled. @phases post, tests */
readonly cookies: {
/** Read the first applicable cookie. @phases post, tests */
get(name: string): string | null;
};
}
}
declare const noodle: NoodleScript.Api;
interface Console {
/** Capture a log message. @phases pre, post, tests */
log(...values: unknown[]): void;
/** Capture an info message. @phases pre, post, tests */
info(...values: unknown[]): void;
/** Capture a warning message. @phases pre, post, tests */
warn(...values: unknown[]): void;
/** Capture an error message. @phases pre, post, tests */
error(...values: unknown[]): void;
}
declare var console: Console;
/** Run a named test and await its returned Promise. Tests phase only. */
declare function test(name: string, callback: () => unknown): void | Promise<void>;
/** Assert against a sandbox value. Tests phase only. */
declare function expect(actual: unknown): NoodleScript.Matchers;
