const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 3137,
  fetch(request) {
    const id = Number(new URL(request.url).pathname.split("/").pop())
    return Response.json({ id, email: `user${id}@example.com`, roles: ["member"] })
  },
})
console.log(`Example API: ${server.url}`)
