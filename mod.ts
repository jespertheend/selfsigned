#!/usr/bin/env -S deno run --allow-run=openssl --allow-read --allow-write

import * as fs from "jsr:@std/fs";
import * as stdPath from "jsr:@std/path";
import { parseArgs } from "jsr:@std/cli";

export type GetSelfSignedCertOptions = {
	/**
	 * Name that will be used for the certificate and in documentation.
	 * It is recommended to set this value to make it easier for the user to distingish certificates that have been
	 * generated for different projects.
	 */
	name?: string;
	/**
	 * Where the directory of self signed certs will be placed.
	 * This defaults to $cwd/selfSignedCerts/
	 */
	outDir?: string;
	/**
	 * How long the certificate will be valid. Defaults to one year.
	 */
	days?: number;
	/**
	 * An array of extra alt names which should be added to the certificate.
	 * For example: `["DNS:localhost.example.com", "IP:192.168.0.1"]`.
	 * By default 'localhost', '127.0.0.1' and '0.0.0.0' are added as alt names.
	 */
	extraAltNames?: string[];
	/**
	 * Extra set of options that are used when generating documentation.
	 */
	docs?: GetSelfSignedCertDocumentationOptions;
};

export type GetSelfSignedCertDocumentationOptions = {
	projectUrl?: string;
};

export async function getSelfSignedCert(options: GetSelfSignedCertOptions) {
	const outDir = stdPath.resolve(options.outDir || "selfSignedCerts");
	try {
		return await generateOutDirContents(outDir, options);
	} catch (e) {
		await Deno.remove(outDir, { recursive: true });
		throw e;
	}
}

async function generateOutDirContents(outDir: string, {
	name = "Self Signed Cert",
	days = 365,
	extraAltNames = [],
	docs = {},
}: GetSelfSignedCertOptions = {}) {
	const {
		projectUrl = "https://localhost:8080",
	} = docs;
	const keyFile = stdPath.resolve(outDir, "selfsigned.key");
	const certFile = stdPath.resolve(outDir, "selfsigned.crt");
	if (!await fs.exists(outDir, { isDirectory: true })) {
		await fs.ensureDir(outDir);

		await Deno.writeTextFile(stdPath.resolve(outDir, ".gitignore"), "**");
		if (Deno.build.os == "darwin") {
			const altNames = [
				"DNS:localhost",
				"IP:127.0.0.1",
				"IP:0.0.0.0",
				...extraAltNames,
			];
			const command = new Deno.Command("openssl", {
				args: [
					"req",
					"-newkey",
					"rsa:4096",
					"-x509",
					"-nodes",
					"-keyout",
					keyFile,
					"-new",
					"-out",
					certFile,
					"-subj",
					`/CN=${name}`,
					"-addext",
					"subjectAltName = " + altNames.join(","),
					"-sha256",
					"-days",
					String(days),
				],
				stdout: "inherit",
				stderr: "inherit",
			});
			const { success, code } = await command.output();
			if (!success) {
				throw new Error("openssl exited with status code " + code);
			}

			await Deno.writeTextFile(
				stdPath.resolve(outDir, "readme.md"),
				`# Self Signed Certs

These files are used for hosting a local https server. You may visit ${projectUrl}
in your browser directly, but you will probably get a security warning. You can
dismiss the warning but this will likely still disable some browser features.
To fix this, you have to make your browser trust the certificate.

# Chrome and Safari

On macOS you can do this by adding selfsigned.crt to your keychain:
	- Double click selfsigned.crt to add it to the macOS keychain
	- Open Keychain Access and find '${name}' under System Keychains -> System -> Certifcates (tab)
	- Double click '${name}' and open the 'trust' section
	- Set 'Secure Sockets Layer (SSL)' to 'always trust'
	- Make sure to close the window and enter your password for the changes to take effect
	- If you have already visited the page, you may need to restart your browser.

# Firefox

Firefox doesn't automatically trust system certificates unfortunately.
But so far it seems like dismissing the security warning on ${projectUrl}
adds a security exception which is remembered even after restarting the browser.
`,
			);
		} else {
			console.error("Creating self signed certificates is not supported on this platform.");
			return null;
		}
	}

	const key = await Deno.readTextFile(keyFile);
	const cert = await Deno.readTextFile(certFile);
	return {
		outDir,
		key,
		cert,
		keyFile,
		certFile,
	};
}

if (import.meta.main) {
	const args = parseArgs(Deno.args, {
		string: ["name", "outDir", "days"],
		alias: {
			name: "n",
			outDir: "o",
		},
	});
	const result = await getSelfSignedCert({
		name: args.name,
		outDir: args.outDir,
		days: args.days ? parseInt(args.days) : undefined,
	});
	if (result) {
		console.log("Files can be found at " + result.outDir);
	}
}
