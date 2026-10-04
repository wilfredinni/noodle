noodle.run.set("external_steps", [
  ...noodle.run.get("external_steps"),
  "folder-post",
])
console.info("folder-post", noodle.response.status)
