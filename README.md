# Selfsigned

This package aims to solve a specific use case: Create a directory (if it doesn't exist yet)
with self signed certificates and documentation on how to install them.

The idea is that you use this in your development script, which a developer is
expected to run whenever they want to work on your project.

For example, say you have the following `dev.js` file:

```js
#!/usr/bin/env -S deno run -A --no-lock

import { serveDir } from "jsr:@std/http/file-server";
import { setCwd } from "https://deno.land/x/chdir_anywhere@v0.0.3/mod.js";
import { getSelfSignedCert } from "jsr:@jespertheend/selfsigned";

setCwd();

const { cert, key } = await getSelfSignedCert({
	name: "My Cool Project",
});

Deno.serve({
	port: 8080,
	key,
	cert,
}, async (request, connInfo) => {
	return await serveDir(request, {
		quiet: true,
		showDirListing: true,
	});
});
```

Now a developer can run `./dev.js` and it will automatically spin up a https
server with self signed certificates. `getSelfSignedCert()` checks if the
directory already exists and returns the existing certificate if so.
