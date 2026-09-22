const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 3137,
  fetch(request) {
    const match = /^\/users\/(1|2)$/.exec(new URL(request.url).pathname)
    if (!match) return Response.json({ error: "User not found" }, { status: 404 })
    const id = Number(match[1])
    return Response.json({
      id,
      email: `user${id}@example.com`,
      roles: ["member"],
      active: id === 1,
    })
  },
})
console.log(`Example API: ${server.url}`)
