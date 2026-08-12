import { describe, expect, it } from "bun:test"
import { signAwsRequest } from "../../src/requests/awsSigV4"

const auth = {
  type: "aws_sigv4" as const,
  access_key: "AKIDEXAMPLE",
  secret_key: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  service: "iam",
}

describe("AWS SigV4", () => {
  it("matches the AWS IAM ListUsers signature example", () => {
    const signed = signAwsRequest(
      "https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08",
      {
        method: "GET",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=utf-8",
        },
      },
      auth,
      new Date("2015-08-30T12:36:00Z"),
    )
    const headers = new Headers(signed.headers)

    expect(headers.get("x-amz-date")).toBe("20150830T123600Z")
    expect(headers.get("authorization")).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7",
    )
  })

  it("adds a temporary credential token and replaces stale signer headers", () => {
    const signed = signAwsRequest(
      "https://sts.us-east-1.amazonaws.com/",
      {
        method: "POST",
        headers: {
          Authorization: "stale",
          "X-Amz-Date": "20000101T000000Z",
          "X-Amz-Security-Token": "stale-token",
        },
        body: "Action=GetCallerIdentity&Version=2011-06-15",
      },
      { ...auth, service: "sts", session_token: "session-token" },
      new Date("2026-08-12T12:00:00Z"),
    )
    const headers = new Headers(signed.headers)

    expect(headers.get("x-amz-security-token")).toBe("session-token")
    expect(headers.get("authorization")).toContain(
      "Credential=AKIDEXAMPLE/20260812/us-east-1/sts/aws4_request",
    )
  })

  it("rejects incomplete credentials without exposing their values", () => {
    expect(() =>
      signAwsRequest(
        "https://example.com",
        { method: "GET" },
        { ...auth, secret_key: "" },
      ),
    ).toThrow("AWS SigV4 requires auth.secret_key")
  })
})
