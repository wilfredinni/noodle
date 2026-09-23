const post = noodle.response.json()
if (noodle.run.get("external_post_id") !== post.id) {
  throw new Error("Expected the declarative capture before post")
}
noodle.run.set("external_post_title", post.title)
noodle.run.set("external_steps", [
  ...noodle.run.get("external_steps"),
  "request-post",
])
console.info("request-post", post.id)
