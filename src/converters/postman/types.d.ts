declare module "postman-collection" {
  interface Url {
    getRaw(): string
    toString(): string
    host?: string[]
    path?: string[]
    port?: string
    query: PropertyList<QueryParam>
    variables?: VariableList
  }

  interface QueryParam {
    key: string
    value: string
    disabled?: boolean
  }

  interface Header {
    key: string
    value: string
    disabled?: boolean
  }

  interface FormParam {
    key: string
    value: string
    type?: "text" | "file"
    disabled?: boolean
  }

  interface BodyMember {
    mode: string
    raw?: string
    urlencoded?: PropertyList<{ key: string; value: string; disabled?: boolean }>
    formdata?: PropertyList<FormParam>
    options?: { raw?: { language?: string } }
  }

  interface AuthMember {
    type: string
    members?: () => PropertyList<{ key: string; value: string; type: string }>
    bearer?: VariableList
    basic?: VariableList
    apiKey?: VariableList
    parameters?(): PropertyList<{ key: string; value: string; type: string }>
  }

  interface Request {
    method: string
    url: Url
    headers: PropertyList<Header>
    body?: BodyMember
    auth?: AuthMember
  }

  interface Variable {
    key: string
    value: string | null
    type: string
  }

  interface PropertyList<T> {
    count(): number
    all(): T[]
    each(fn: (item: T, index: number) => void): void
  }

  interface VariableList {
    all(): Variable[]
    each(fn: (variable: Variable, index: number) => void): void
  }

  interface Item {
    name: string
    request?: Request
    response?: unknown[]
    auth?: AuthMember
  }

  interface ItemGroup {
    name: string
    items: PropertyList<Item | ItemGroup>
    auth?: AuthMember
    description?: string
  }

  interface Collection {
    name: string
    info: { name: string; schema?: string; description?: string }
    items: PropertyList<Item | ItemGroup>
    variables: VariableList
    auth?: AuthMember
  }

  const Collection: {
    new (definition: Record<string, unknown>): Collection
  }

  export { Collection }
  export type {
    Url,
    QueryParam,
    Header,
    FormParam,
    BodyMember,
    AuthMember,
    Request,
    Variable,
    PropertyList,
    VariableList,
    Item,
    ItemGroup,
  }
}
