import { describe, expect, it, spyOn } from "bun:test"
import * as os from "node:os"
import { resolve } from "node:path"
import { Collection as PmCollection } from "postman-collection"
import {
  exportPostman,
  exportPostmanEnvironment,
  toPostmanTpl,
} from "../../src/converters/postman"
import { mapCollection } from "../../src/converters/postman/map"
import { defaultOAuth1Auth, defaultOAuth2Auth } from "../../src/auth/defaults"
import type { Collection, Request } from "../../src/schema"

function request(
  id: string,
  name: string,
  extra: Partial<Request> = {},
): Request {
  return {
    id,
    name,
    method: "POST",
    url: "https://api.example.com/users/:user?inline=keep&replace=old#section",
    timeout: 1234,
    headers: {},
    params: [],
    ...extra,
  }
}

describe("Postman export", () => {
  it("exports OAuth configuration without cached OAuth 2 tokens", () => {
    const exported = exportPostman({
      id: "oauth",
      name: "OAuth",
      items: [
        {
          type: "request",
          data: request("oauth1", "OAuth 1", {
            auth: {
              ...defaultOAuth1Auth(),
              consumer_key: "$CONSUMER_KEY",
              consumer_secret: "$CONSUMER_SECRET",
              signature_method: "RSA-SHA256",
              private_key: "$PRIVATE_KEY",
              private_key_type: "file",
              placement: "query",
              include_body_hash: true,
            },
          }),
        },
        {
          type: "request",
          data: request("oauth2", "OAuth 2", {
            auth: {
              ...defaultOAuth2Auth(),
              grant_type: "client_credentials",
              access_token_url: "https://identity.example/token",
              client_id: "$CLIENT_ID",
              client_secret: "$CLIENT_SECRET",
              credentials_placement: "basic",
              token_placement: "query",
            },
          }),
        },
      ],
    })
    const items = exported.document.item as Record<string, unknown>[]
    expect((items[0]!.request as Record<string, unknown>).auth).toMatchObject({
      type: "oauth1",
      oauth1: expect.arrayContaining([
        { key: "consumerKey", value: "{{CONSUMER_KEY}}", type: "string" },
        { key: "signatureMethod", value: "RSA-SHA256", type: "string" },
        { key: "placement", value: "query", type: "string" },
      ]),
    })
    expect((items[1]!.request as Record<string, unknown>).auth).toMatchObject({
      type: "oauth2",
      oauth2: expect.arrayContaining([
        { key: "grant_type", value: "client_credentials", type: "string" },
        { key: "clientId", value: "{{CLIENT_ID}}", type: "string" },
        { key: "client_authentication", value: "header", type: "string" },
        { key: "addTokenTo", value: "queryParams", type: "string" },
      ]),
    })
    expect(JSON.stringify(exported.document)).not.toContain("access_token")
  })

  it("exports NTLM credentials in Postman format", () => {
    const exported = exportPostman({
      id: "ntlm",
      name: "NTLM",
      items: [
        {
          type: "request",
          data: request("ntlm", "NTLM", {
            auth: {
              type: "ntlm",
              username: "$NTLM_USERNAME",
              password: "$NTLM_PASSWORD",
              domain: "EXAMPLE",
              workstation: "NOODLE",
            },
          }),
        },
      ],
    })
    const item = (exported.document.item as Record<string, unknown>[])[0]!
    expect((item.request as Record<string, unknown>).auth).toEqual({
      type: "ntlm",
      ntlm: [
        { key: "username", value: "{{NTLM_USERNAME}}", type: "string" },
        { key: "password", value: "{{NTLM_PASSWORD}}", type: "string" },
        { key: "domain", value: "EXAMPLE", type: "string" },
        { key: "workstation", value: "NOODLE", type: "string" },
      ],
    })
  })

  it("converts Noodle and dynamic templates to Postman syntax", () => {
    expect(toPostmanTpl("$base/$$randomUUID/$user-id")).toBe(
      "{{base}}/{{$randomUUID}}/{{user}}-id",
    )
  })

  it("preserves scheme-less URL structure and encoded dollar literals", () => {
    const collection: Collection = {
      id: "urls",
      name: "URLs",
      items: [
        {
          type: "request",
          data: request("health", "Health", {
            method: "GET",
            url: "localhost:3000/health?literal=%24token&template=$token#frag",
          }),
        },
      ],
    }

    const exported = exportPostman(collection)
    const item = (exported.document.item as Record<string, unknown>[])[0]!
    const url = (item.request as Record<string, unknown>).url as Record<
      string,
      unknown
    >

    expect(url).toMatchObject({
      raw: "localhost:3000/health?literal=%24token&template={{token}}#frag",
      host: ["localhost"],
      port: "3000",
      path: ["health"],
      hash: "frag",
      query: [
        { key: "literal", value: "%24token", disabled: false },
        { key: "template", value: "{{token}}", disabled: false },
      ],
    })
    const roundTripItem = new PmCollection(exported.document).items.all()[0]!
    expect(
      "request" in roundTripItem
        ? roundTripItem.request?.url.toString()
        : undefined,
    ).toBe("localhost:3000/health?literal=%24token&template={{token}}#frag")
  })

  it("preserves nested folders, effective headers, URL parts, and inherited auth", () => {
    const collection: Collection = {
      id: "api",
      name: "API",
      items: [
        {
          type: "folder",
          data: {
            id: "admin",
            name: "Admin",
            path: "admin",
            overrides: {
              headers: {
                "X-Folder": { value: "$token", enabled: true },
                "X-Request": { value: "parent", enabled: true },
              },
              auth: { type: "bearer", token: "$token" },
            },
            children: [
              {
                type: "request",
                data: request("admin/list", "List", {
                  auth: { type: "inherit" },
                  headers: {
                    "X-Request": { value: "child", enabled: false },
                  },
                  params: [
                    { name: "replace", value: "$new", enabled: true },
                    { name: "repeat", value: "one", enabled: true },
                    { name: "repeat", value: "two", enabled: false },
                  ],
                  pathParams: [
                    { name: "user", value: "$userId", enabled: true },
                  ],
                  followRedirects: false,
                  maxRedirects: 2,
                }),
              },
            ],
          },
        },
      ],
    }

    const exported = exportPostman(collection)
    const folder = (exported.document.item as Record<string, unknown>[])[0]!
    const item = (folder.item as Record<string, unknown>[])[0]!
    const req = item.request as Record<string, unknown>
    const url = req.url as Record<string, unknown>

    expect(folder.auth).toEqual({
      type: "bearer",
      bearer: [{ key: "token", value: "{{token}}", type: "string" }],
    })
    expect(req.auth).toBeUndefined()
    expect(req.header).toEqual([
      { key: "X-Folder", value: "{{token}}", disabled: false },
      { key: "X-Request", value: "child", disabled: true },
    ])
    expect(url.raw).toBe(
      "https://api.example.com/users/:user?inline=keep&replace={{new}}&repeat=one#section",
    )
    expect(url.query).toEqual([
      { key: "inline", value: "keep", disabled: false },
      { key: "replace", value: "{{new}}", disabled: false },
      { key: "repeat", value: "one", disabled: false },
      { key: "repeat", value: "two", disabled: true },
    ])
    expect(url.variable).toEqual([{ key: "user", value: "{{userId}}" }])
    expect(item.protocolProfileBehavior).toEqual({
      followRedirects: false,
      maxRedirects: 2,
    })

    const roundTrip = mapCollection(new PmCollection(exported.document))
    const nested = roundTrip.collection.items[0]!
    expect(nested.type).toBe("folder")
    if (nested.type === "folder") {
      expect(nested.data.children[0]!.data).toMatchObject({
        auth: { type: "inherit" },
        followRedirects: false,
        maxRedirects: 2,
        params: [
          { name: "inline", value: "keep", enabled: true },
          { name: "replace", value: "$new", enabled: true },
          { name: "repeat", value: "one", enabled: true },
          { name: "repeat", value: "two", enabled: false },
        ],
        pathParams: [{ name: "user", value: "$userId", enabled: true }],
      })
    }
  })

  it("exports noauth for a nested folder override", () => {
    const collection: Collection = {
      id: "api",
      name: "API",
      items: [
        {
          type: "folder",
          data: {
            id: "parent",
            name: "Parent",
            path: "parent",
            overrides: { auth: { type: "bearer", token: "parent-token" } },
            children: [
              {
                type: "folder",
                data: {
                  id: "parent/child",
                  name: "Child",
                  path: "parent/child",
                  overrides: { auth: { type: "none" } },
                  children: [
                    {
                      type: "request",
                      data: request("parent/child/health", "Health", {
                        auth: { type: "inherit" },
                      }),
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    }

    const parent = (
      exportPostman(collection).document.item as Record<string, unknown>[]
    )[0]!
    const child = (parent.item as Record<string, unknown>[])[0]!
    const requestItem = (child.item as Record<string, unknown>[])[0]!

    expect(parent.auth).toEqual({
      type: "bearer",
      bearer: [{ key: "token", value: "parent-token", type: "string" }],
    })
    expect(child.auth).toEqual({ type: "noauth" })
    expect(
      (requestItem.request as Record<string, unknown>).auth,
    ).toBeUndefined()
  })

  it("exports every supported body and auth type", () => {
    const collection: Collection = {
      id: "bodies",
      name: "Bodies",
      items: [
        {
          type: "request",
          data: request("none", "None", {
            method: "GET",
            bodyType: "none",
            auth: { type: "none" },
          }),
        },
        {
          type: "request",
          data: request("json", "JSON", {
            body: '{"token":"$token"}',
            auth: { type: "basic", user: "$user", pass: "$pass" },
          }),
        },
        {
          type: "request",
          data: request("url", "URL", {
            bodyType: "urlencoded",
            formData: [
              { name: "active", value: "$value", enabled: true, type: "text" },
              { name: "disabled", value: "no", enabled: false, type: "text" },
            ],
          }),
        },
        {
          type: "request",
          data: request("multipart", "Multipart", {
            bodyType: "multipart",
            formData: [
              { name: "file", value: "$path", enabled: false, type: "file" },
            ],
          }),
        },
        {
          type: "request",
          data: request("binary", "Binary", {
            bodyType: "binary",
            filePath: "$path",
            auth: {
              type: "api_key",
              key: "$key",
              value: "$$randomUUID",
              placement: "query",
            },
          }),
        },
        {
          type: "request",
          data: request("aws", "AWS", {
            auth: {
              type: "aws_sigv4",
              access_key: "$AWS_ACCESS_KEY_ID",
              secret_key: "$AWS_SECRET_ACCESS_KEY",
              region: "us-east-1",
              service: "execute-api",
              session_token: "$AWS_SESSION_TOKEN",
            },
          }),
        },
      ],
    }

    const items = exportPostman(collection).document.item as Record<
      string,
      unknown
    >[]
    expect((items[0]!.request as Record<string, unknown>).body).toBeUndefined()
    expect((items[1]!.request as Record<string, unknown>).body).toEqual({
      mode: "raw",
      raw: '{"token":"{{token}}"}',
      options: { raw: { language: "json" } },
    })
    expect((items[2]!.request as Record<string, unknown>).body).toEqual({
      mode: "urlencoded",
      urlencoded: [
        { key: "active", disabled: false, type: "text", value: "{{value}}" },
        { key: "disabled", disabled: true, type: "text", value: "no" },
      ],
    })
    expect((items[3]!.request as Record<string, unknown>).body).toEqual({
      mode: "formdata",
      formdata: [
        { key: "file", disabled: true, type: "file", src: "{{path}}" },
      ],
    })
    expect((items[4]!.request as Record<string, unknown>).body).toEqual({
      mode: "file",
      file: { src: "{{path}}" },
    })
    expect((items[4]!.request as Record<string, unknown>).auth).toEqual({
      type: "apikey",
      apikey: [
        { key: "key", value: "{{key}}", type: "string" },
        { key: "value", value: "{{$randomUUID}}", type: "string" },
        { key: "in", value: "query", type: "string" },
      ],
    })
    expect((items[5]!.request as Record<string, unknown>).auth).toEqual({
      type: "awsv4",
      awsv4: [
        {
          key: "accessKey",
          value: "{{AWS_ACCESS_KEY_ID}}",
          type: "string",
        },
        {
          key: "secretKey",
          value: "{{AWS_SECRET_ACCESS_KEY}}",
          type: "string",
        },
        { key: "region", value: "us-east-1", type: "string" },
        { key: "service", value: "execute-api", type: "string" },
        { key: "addAuthDataToQuery", value: false, type: "boolean" },
        {
          key: "sessionToken",
          value: "{{AWS_SESSION_TOKEN}}",
          type: "string",
        },
      ],
    })
  })

  it("expands home-relative file paths without changing other values", () => {
    const collection: Collection = {
      id: "paths",
      name: "Paths",
      items: [
        {
          type: "request",
          data: request("multipart", "Multipart", {
            bodyType: "multipart",
            formData: [
              {
                name: "file",
                value: "@/Documents/upload.bin",
                enabled: true,
                type: "file",
              },
              {
                name: "text",
                value: "@/Documents/upload.bin",
                enabled: true,
                type: "text",
              },
              {
                name: "absolute",
                value: "/tmp/upload.bin",
                enabled: true,
                type: "file",
              },
              {
                name: "relative",
                value: "fixtures/upload.bin",
                enabled: true,
                type: "file",
              },
              {
                name: "variable",
                value: "$path",
                enabled: true,
                type: "file",
              },
            ],
          }),
        },
        {
          type: "request",
          data: request("binary", "Binary", {
            bodyType: "binary",
            filePath: "@/Documents/archive.bin",
          }),
        },
      ],
    }

    const items = exportPostman(collection).document.item as Record<
      string,
      unknown
    >[]
    expect((items[0]!.request as Record<string, unknown>).body).toEqual({
      mode: "formdata",
      formdata: [
        {
          key: "file",
          disabled: false,
          type: "file",
          src: resolve(os.homedir(), "Documents/upload.bin"),
        },
        {
          key: "text",
          disabled: false,
          type: "text",
          value: "@/Documents/upload.bin",
        },
        {
          key: "absolute",
          disabled: false,
          type: "file",
          src: "/tmp/upload.bin",
        },
        {
          key: "relative",
          disabled: false,
          type: "file",
          src: "fixtures/upload.bin",
        },
        {
          key: "variable",
          disabled: false,
          type: "file",
          src: "{{path}}",
        },
      ],
    })
    expect((items[1]!.request as Record<string, unknown>).body).toEqual({
      mode: "file",
      file: { src: resolve(os.homedir(), "Documents/archive.bin") },
    })
  })

  it("preserves dollar signs introduced by home expansion", () => {
    const homedirSpy = spyOn(os, "homedir").mockReturnValue("/tmp/noodle$home")
    try {
      const items = exportPostman({
        id: "home-path",
        name: "Home Path",
        items: [
          {
            type: "request",
            data: request("multipart", "Multipart", {
              bodyType: "multipart",
              formData: [
                {
                  name: "file",
                  value: "@/upload.bin",
                  enabled: true,
                  type: "file",
                },
              ],
            }),
          },
          {
            type: "request",
            data: request("binary", "Binary", {
              bodyType: "binary",
              filePath: "@/archive.bin",
            }),
          },
        ],
      }).document.item as Record<string, unknown>[]

      expect(
        items.map((item) => (item.request as Record<string, unknown>).body),
      ).toEqual([
        {
          mode: "formdata",
          formdata: [
            {
              key: "file",
              disabled: false,
              type: "file",
              src: "/tmp/noodle$home/upload.bin",
            },
          ],
        },
        {
          mode: "file",
          file: { src: "/tmp/noodle$home/archive.bin" },
        },
      ])
    } finally {
      homedirSpy.mockRestore()
    }
  })

  it("redacts and deterministically orders environment values", () => {
    expect(
      exportPostmanEnvironment({
        name: "production",
        color: "danger",
        vars: { TOKEN: "secret", BASE_URL: "https://api.example.com" },
        disabledVars: { OLD_TOKEN: "also-secret" },
      }),
    ).toEqual({
      name: "production",
      values: [
        { key: "BASE_URL", value: "", type: "default", enabled: true },
        { key: "OLD_TOKEN", value: "", type: "default", enabled: false },
        { key: "TOKEN", value: "", type: "default", enabled: true },
      ],
      _postman_variable_scope: "environment",
    })
  })

  it("marks declared environment secrets for Postman", () => {
    const exported = exportPostmanEnvironment({
      name: "production",
      vars: {},
      secretVars: { TOKEN: "missing" },
    }) as {
      values: { key: string; value: string; type: string; enabled: boolean }[]
    }
    expect(exported.values).toEqual([
      { key: "TOKEN", value: "", type: "secret", enabled: true },
    ])
  })
})
