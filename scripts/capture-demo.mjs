import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "demo", "frames");
const electronExe = path.join(root, "node_modules", "electron", "dist", "electron.exe");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDebugPort(port, tries = 60) {
	for (let i = 0; i < tries; i += 1) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (response.ok) {
				return await response.json();
			}
		} catch {
			// Electron not ready yet.
		}
		await delay(500);
	}
	throw new Error("Electron remote debugging did not start.");
}

async function shot(page, name, caption) {
	const target = path.join(outDir, name);
	await page.screenshot({ path: target, type: "png" });
	fs.writeFileSync(path.join(outDir, `${name}.txt`), caption, "utf8");
}

async function main() {
	fs.mkdirSync(outDir, { recursive: true });
	const port = 9333;
	const child = spawn(electronExe, ["."], {
		cwd: root,
		env: {
			...process.env,
			DEMO_MODE: "1",
			ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
		},
		stdio: "ignore",
		windowsHide: false
	});
	const version = await waitForDebugPort(port);
	const browser = await puppeteer.connect({
		browserWSEndpoint: version.webSocketDebuggerUrl,
		defaultViewport: { width: 1180, height: 860 }
	});
	const page = (await browser.pages())[0] || (await browser.newPage());
	await page.waitForSelector("#tpa", { timeout: 15000 });
	await page.evaluate(() => {
		document.getElementById("tpa").value = "611521";
		document.getElementById("mdmClientId").value = "d86faa30-2a20-4850-b041-bc167bb5abd9";
		document.getElementById("mdmClientSecret").value = "demo-only-not-a-real-secret";
	});
	await shot(page, "01-company-filled.png", "Step 1 — Enter the company number (TPA) and MDM client credentials from Console.");
	await page.click("#checkAccount");
	await delay(1200);
	await shot(page, "02-company-verified.png", "Check in MDM — account facts appear when the company is already in MDM.");
	await page.click('.stepper li[data-step="tid"] button');
	await delay(500);
	await shot(page, "03-account-tid.png", "Step 2 — Account TID: when TID is missing, copy messages for MDM or Team Cotton. When TID is set, continue to People.");
	await page.click('.stepper li[data-step="people"] button');
	await delay(400);
	await page.evaluate(() => {
		document.getElementById("person").value = "ed001ae3-dbb6-4a07-a595-4fe3b0d13490";
	});
	await shot(page, "04-people-ready.png", "Step 3 — People: look up one user by email or Trimble Identity id.");
	await page.click("#checkPeople");
	await delay(800);
	await shot(page, "05-people-result.png", "The app shows whether they are on this company and their relation.");
	await page.click('.stepper li[data-step="subscription"] button');
	await delay(500);
	await page.evaluate(() => {
		document.getElementById("lemCredentials").value = "ZGVtby1sZW0tY3JlZGVudGlhbHM=";
		document.getElementById("lemCredentials").dispatchEvent(new Event("change", { bubbles: true }));
	});
	await delay(1000);
	await shot(page, "06-subscription.png", "Step 4 — Subscription: LEM credentials, license status, and optional sign-in check.");
	await browser.close();
	child.kill();
	console.log(`Captured frames in ${outDir}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});