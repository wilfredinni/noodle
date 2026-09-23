const userResponse = await noodle.sendRequest({
  url: "https://jsonplaceholder.typicode.com/users/1",
  headers: { Accept: "application/json" },
})
const username = userResponse.json().username
noodle.run.set("external_username", username)

// Pre runs after substitution, so update the current request explicitly.
noodle.request.headers.set("X-User-Name", username)
noodle.request.headers.set("X-Request-Id", noodle.random.uuid())
noodle.run.set("external_steps", [
  ...noodle.run.get("external_steps"),
  "request-pre",
])
console.info("request-pre", "related user loaded")
