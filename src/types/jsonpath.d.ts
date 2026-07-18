declare module "jsonpath" {
  const jsonpath: {
    query: (value: unknown, expression: string) => unknown[]
  }

  export default jsonpath
}
