declare module "*.wasm" {
  const path: string
  export default path
}

declare module "*.scm" {
  const path: string
  export default path
}

declare module "*.md" {
  const text: string
  export default text
}
