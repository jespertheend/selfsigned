#!/usr/bin/env -S deno run --allow-run=openssl --allow-read --allow-write

import * as fs from "jsr:@std/fs@1.0.4";
import * as stdPath from "jsr:@std/path@1.0.6";
import { parseArgs } from "jsr:@std/cli@1.0.6";

/**
 * Options used for the `getSelfSignedCert()` call.
 */
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
	 * By default 'localhost', '127.0.0.1', '0.0.0.0' and '<network name>.local' are added as alt names.
	 */
	extraAltNames?: string[];
	/**
	 * Extra set of options that are used when generating documentation.
	 */
	docs?: GetSelfSignedCertDocumentationOptions;
};

/**
 * Extra set of options that are used when generating documentation.
 */
export type GetSelfSignedCertDocumentationOptions = {
	/**
	 * Where you plan on hosting your https server. For example: 'https://localhost:8080'.
	 */
	projectUrl?: string;
};

/**
 * Either the certificates that were generated just now or the certificates that were generated in an earlier call.
 */
export type SelfSignedCertResult = {
	key: string;
	cert: string;
	keyFile: string;
	certFile: string;
	outDir: string;
};

/**
 * Creates a directory with generated self signed certificates and documentation on how to install these certificates.
 */
export async function getSelfSignedCert(options: GetSelfSignedCertOptions): Promise<SelfSignedCertResult | null> {
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
		projectUrl = "",
	} = docs;
	const keyFile = stdPath.resolve(outDir, "selfsigned.key");
	const certFile = stdPath.resolve(outDir, "selfsigned.crt");
	if (!await fs.exists(outDir, { isDirectory: true })) {
		await fs.ensureDir(outDir);

		await Deno.writeTextFile(stdPath.resolve(outDir, ".gitignore"), "**");
		if (Deno.build.os == "darwin") {
			const networkNameCommand = new Deno.Command("scutil", {
				args: ["--get", "LocalHostName"],
			});
			const networkNameOutput = await networkNameCommand.output();
			let networkName: string | null = null;
			if (!networkNameOutput.success) {
				console.warn("Failed to get network name of this device. No 'DNS:<network name>.local' alt name will be added to the certificate.");
			} else {
				const decoder = new TextDecoder();
				networkName = decoder.decode(networkNameOutput.stdout).trim().toLowerCase();
			}

			const altNames = [
				"DNS:localhost",
				"IP:127.0.0.1",
				"IP:0.0.0.0",
				...extraAltNames,
			];
			if (networkName) {
				altNames.push(`DNS:${networkName}.local`);
			}
			const openSslCommand = new Deno.Command("openssl", {
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
			const { success, code } = await openSslCommand.output();
			if (!success) {
				throw new Error("openssl exited with status code " + code);
			}

			let httpsPort = "\\<https port of your application>";
			if (projectUrl) {
				let url;
				try {
					url = new URL(projectUrl);
				} catch {
					// Ignore
				}
				if (url) {
					httpsPort = url.port;
				}
			}

			let networkNameIosText;
			let networkNameIosText2 = "";
			if (networkName) {
				const url = `https://${networkName}.local:${httpsPort}`;
				networkNameIosText = `'DNS:${networkName}.local' has been added to the certificate. You should be able to visit ${url} in Safari after these steps.`;
				networkNameIosText2 = `\n- Visit ${url} in Safari`;
			} else {
				networkNameIosText =
					"We were not able to determine the network name of this device. You may still try to add the certificate but these steps will likely not work. To work around this, add 'IP:<local device ip>' to `extraAltNames` of the `getSelfSignedCert()` call, delete this directory and retry running the application.";
			}

			await Deno.writeTextFile(
				stdPath.resolve(outDir, "readme.md"),
				`# Self Signed Certs

These files are used for hosting a local https server. You may visit ${projectUrl || "https pages"}
in your browser directly, but you will probably get a security warning. You can
dismiss the warning but this will likely still disable some browser features.
To fix this, you have to make your browser trust the certificate.

# Windows 10

Chromium based browsers will look at root certificates of Windows to determine whether a certificate is valid.
To add selfsigned.crt to your trusted root certificates:
	- Double click selfsigned.crt
	- Click **Install Certificate**
	- Select **Local Machine** and click **Next**
	- Accept the admin prompt from windows
	- Select **Place all certificates in the following store** and click **Browse**
	- Select **Trusted Root Certification Authorities** and click **Ok**
	- Click **Next**
	- Click **Finish**
	- If you have already visited the page, you may need to restart your browser.

Firefox doesn't automatically trust system certificates unfortunately.
But so far it seems like dismissing the security warning on ${projectUrl || "https pages"}
adds a security exception which is remembered even after restarting the browser.

# macOS

Chromium based browsers and Safari will look at root certificates of macOS to determine whether a certificate is valid.
To add selfsigned.crt to your keychain:
	- Double click selfsigned.crt to add it to the macOS keychain
	- Open Keychain Access and find '${name}' under **System Keychains** -> **System** -> **Certifcates** (tab)
	- Double click '${name}' and open the **trust** section
	- Set **Secure Sockets Layer (SSL)** to **always trust**
	- Make sure to close the window and enter your password for the changes to take effect
	- If you have already visited the page, you may need to restart your browser.

Firefox doesn't automatically trust system certificates unfortunately.
But so far it seems like dismissing the security warning on ${projectUrl || "https pages"}
adds a security exception which is remembered even after restarting the browser.

# iOS

${networkNameIosText}

- AirDrop the 'selfsigned.crt' file to your iOS device
- Open the Settings app
- On the main page in the Settings app, you should see a **Profile Downloaded** button
- Tap **Install** in the top right corner
- Enter your passcode
- Tap **Install** again
- Tap **Install** again
- In the Settings app, go to **General** -> **About** -> **Certificate Trust Settings** (all the way at the bottom of the page)
- Toggle '${name}' to enable full trust
- Tap **Continue**${networkNameIosText2}

To remove the certificate, go to to **Settings** -> **General** -> **VPN & Device Management** -> **${name}** -> **Remove Profile**.
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
