"xml" @keyword

[ "version" "encoding" "standalone" ] @property
(EncName) @string
(VersionNum) @number
[ "yes" "no" ] @boolean

(PI) @embedded
(PI (PITarget) @keyword)

(EntityRef) @constant
(CharRef) @constant
(PEReference) @constant

[ "PUBLIC" "SYSTEM" ] @keyword
(PubidLiteral) @string
(SystemLiteral (URI) @markup.link)

(doctypedecl "DOCTYPE" @keyword)
(doctypedecl (Name) @type)

(STag (Name) @tag)
(ETag (Name) @tag)
(EmptyElemTag (Name) @tag)

(Attribute (Name) @attribute)
(Attribute (AttValue) @string)

[
 "<?" "?>"
 "<!" "]]>"
 "<" ">"
 "</" "/>"
] @punctuation.delimiter

[ "(" ")" "[" "]" ] @punctuation.bracket
[ "\"" "'" ] @punctuation.delimiter
[ "," "|" "=" ] @operator

(CharData) @markup
(CDSect (CDStart) @markup.heading (CData) @markup.raw "]]>" @markup.heading)
(Comment) @comment
(ERROR) @error
