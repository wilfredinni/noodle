export type CodeEditorValidator = (content: string) => string | null
export type ValidationListener = (error: string | null) => void

export class CodeEditorValidation {
  private _filetype: string
  private _validator?: CodeEditorValidator
  private _error: string | null = null
  private _listener?: ValidationListener

  constructor(
    filetype: string,
    validator?: CodeEditorValidator,
    listener?: ValidationListener,
  ) {
    this._filetype = filetype
    this._validator = validator
    this._listener = listener
  }

  get error(): string | null {
    return this._error
  }

  get validator(): CodeEditorValidator | undefined {
    return this._validator
  }

  get listener(): ValidationListener | undefined {
    return this._listener
  }

  setFiletype(filetype: string, content: string): void {
    this._filetype = filetype
    this.refresh(content)
  }

  setValidator(
    validator: CodeEditorValidator | undefined,
    content: string,
  ): void {
    this._validator = validator
    this.refresh(content)
  }

  setListener(listener: ValidationListener | undefined): void {
    if (listener === this._listener) return
    this._listener = listener
    listener?.(this._error)
  }

  refresh(content: string): void {
    const error = this.resolveError(content)
    if (error === this._error) return
    this._error = error
    this._listener?.(error)
  }

  private resolveError(content: string): string | null {
    if (this._validator) return this._validator(content)
    if (this._filetype !== "json" || content.trim() === "") return null
    try {
      JSON.parse(content)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
}
