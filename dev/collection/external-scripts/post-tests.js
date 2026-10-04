test("post has an identity and content", () => {
  const post = noodle.response.json()
  expect(post.id).toBeGreaterThan(0)
  expect(post.title).toBeTypeOf("string")
  expect(post.title).not.toBe("")
})

test("capture and external post values are available", () => {
  const post = noodle.response.json()
  expect(noodle.run.get("external_post_id")).toBe(post.id)
  expect(noodle.run.get("external_post_title")).toBe(post.title)
})

test("external pre scripts prepared the request", () => {
  expect(noodle.request.headers.get("X-Example")).toBe("external-scripts")
  expect(noodle.request.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/)
})

if (noodle.run.get("external_username") !== undefined) {
  test("external HTTP response reached the outgoing headers", () => {
    expect(noodle.request.headers.get("X-User-Name")).toBe(
      noodle.run.get("external_username"),
    )
  })
}
