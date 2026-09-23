noodle.request.headers.set("X-Request-Id", noodle.random.uuid())
noodle.run.set("external_steps", [
  ...noodle.run.get("external_steps"),
  "request-pre",
])
console.info("request-pre")
