noodle.run.set("external_steps", ["folder-pre"])
noodle.run.unset("external_username")
noodle.request.headers.set("X-Example", "external-scripts")
console.info("folder-pre")
